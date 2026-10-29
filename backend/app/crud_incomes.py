from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value
from sqlalchemy import func
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone, timedelta, date
import calendar
from decimal import Decimal
from . import models, schemas
from .push_service import resolve_notifications_for_entity


def _populate_income_template_info(inc: models.Income, template: Optional[models.EstimatedIncome] = None) -> models.Income:
    if template is not None:
        inc.estimated_income_id = template.id
        inc.estimated_income_name = template.name
    else:
        inc_check = inc.__dict__.get("income_check")
        if inc_check is not None:
            inc.estimated_income_id = getattr(inc_check, "income_id", None)
            loaded_tpl = inc_check.__dict__.get("income")
            if loaded_tpl is not None:
                inc.estimated_income_name = loaded_tpl.name
    return inc


async def _recalculate_or_delete_income_check(
    db: AsyncSession,
    db_check: models.IncomeCheck,
    template: Optional[models.EstimatedIncome] = None,
    delete_if_empty: bool = True,
    allow_mark_partial: bool = False
) -> Optional[models.IncomeCheck]:
    loaded_income = db_check.__dict__.get("income")
    if template is None and loaded_income is not None:
        template = loaded_income
    if template is None and db_check.income_id is not None:
        tpl_res = await db.execute(
            select(models.EstimatedIncome).filter(models.EstimatedIncome.id == db_check.income_id)
        )
        template = tpl_res.scalars().first()

    linked_res = await db.execute(
        select(models.Income)
        .filter(models.Income.income_check_id == db_check.id)
        .order_by(models.Income.date.asc(), models.Income.created_at.asc())
    )
    linked = linked_res.scalars().all()

    if not linked:
        if delete_if_empty:
            await db.delete(db_check)
            return None
        else:
            db_check.real_amount = Decimal("0")
            db_check.amount_usd = Decimal("0")
            db_check.amount_bs = Decimal("0")
            db_check.amount_eur = Decimal("0")
            db_check.amount_usdt = Decimal("0")
            return db_check

    total_usd = sum(Decimal(str(i.amount_usd or 0)) for i in linked)
    total_bs = sum(Decimal(str(i.amount_bs or 0)) for i in linked)
    total_eur = sum(Decimal(str(i.amount_eur or 0)) for i in linked)
    total_usdt = sum(Decimal(str(i.amount_usdt or 0)) for i in linked)

    db_check.amount_usd = total_usd
    db_check.amount_bs = total_bs
    db_check.amount_eur = total_eur
    db_check.amount_usdt = total_usdt

    if all(i.currency == linked[0].currency for i in linked):
        db_check.currency = linked[0].currency
        db_check.real_amount = sum(Decimal(str(i.amount or 0)) for i in linked)
    else:
        target_currency = (template.currency if template and template.currency else db_check.currency)
        db_check.currency = target_currency
        if target_currency in ("USD", "USD_BCV", "USD_CASH", "USD_PARALELO", "USD_PARALLEL"):
            db_check.real_amount = total_usd
        elif target_currency in ("BS", "VES"):
            db_check.real_amount = total_bs
        elif target_currency in ("EUR", "EUR_BCV"):
            db_check.real_amount = total_eur
        elif target_currency == "USDT":
            db_check.real_amount = total_usdt
        else:
            db_check.real_amount = total_usd if total_usd > 0 else total_bs

    db_check.payment_date = max((i.date for i in linked if i.date), default=date.today())
    db_check.rate_usd_bs = linked[-1].rate_usd_bs
    db_check.rate_eur_bs = linked[-1].rate_eur_bs
    db_check.rate_usdt_bs = linked[-1].rate_usdt_bs

    if template:
        t_curr = template.currency
        if db_check.currency == t_curr:
            cumulative = db_check.real_amount or Decimal("0")
        elif t_curr in ("USD", "USD_BCV", "USD_CASH", "USD_PARALELO", "USD_PARALLEL"):
            cumulative = db_check.amount_usd or Decimal("0")
        elif t_curr in ("BS", "VES"):
            cumulative = db_check.amount_bs or Decimal("0")
        elif t_curr in ("EUR", "EUR_BCV"):
            cumulative = db_check.amount_eur or Decimal("0")
        elif t_curr == "USDT":
            cumulative = db_check.amount_usdt or Decimal("0")
        else:
            cumulative = db_check.real_amount or Decimal("0")

        expected = Decimal(str(template.expected_amount or 0))
        if cumulative >= expected:
            db_check.is_partial = False
            db_check.pending_date = None
        elif allow_mark_partial and expected > Decimal("0") and cumulative < expected:
            db_check.is_partial = True

    return db_check


async def create_estimated_income(db: AsyncSession, income: schemas.EstimatedIncomeCreate, user_id: UUID):
    data = income.model_dump()
    if not data.get("category"):
        data["category"] = "Otros ingresos"
    db_income = models.EstimatedIncome(**data, user_id=user_id)
    db.add(db_income)
    await db.commit()
    return await get_estimated_income(db, db_income.id, user_id)


async def get_estimated_incomes(db: AsyncSession, user_id: UUID, active_only: bool = False):
    from .crud import ensure_categories_and_debts_schema
    await ensure_categories_and_debts_schema()

    query = (
        select(models.EstimatedIncome)
        .options(selectinload(models.EstimatedIncome.checks))
        .filter(models.EstimatedIncome.user_id == user_id)
    )
    if active_only:
        query = query.filter(models.EstimatedIncome.is_active == True)
    
    query = query.order_by(models.EstimatedIncome.payment_day.asc().nullslast(), models.EstimatedIncome.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


async def get_estimated_income(db: AsyncSession, income_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.EstimatedIncome)
        .options(selectinload(models.EstimatedIncome.checks))
        .filter(models.EstimatedIncome.id == income_id, models.EstimatedIncome.user_id == user_id)
    )
    return result.scalars().first()


async def update_estimated_income(db: AsyncSession, income_id: UUID, income: schemas.EstimatedIncomeUpdate, user_id: UUID):
    db_income = await get_estimated_income(db, income_id, user_id)
    if not db_income:
        return None
    
    update_data = income.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_income, key, value)
    
    await db.commit()
    await db.refresh(db_income)
    return await get_estimated_income(db, income_id, user_id)


async def delete_estimated_income(db: AsyncSession, income_id: UUID, user_id: UUID, month_year: Optional[str] = None):
    db_income = await get_estimated_income(db, income_id, user_id)
    if not db_income:
        return False

    checks = db_income.checks or []
    if not month_year:
        month_year = datetime.now(timezone.utc).strftime("%Y-%m")

    year, month = map(int, month_year.split('-'))
    start_of_target_month = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    end_of_prev_month = start_of_target_month - timedelta(microseconds=1)

    prior_checks = [c for c in checks if c.month_year < month_year]
    checks_to_remove = [c for c in checks if c.month_year >= month_year]

    for c in checks_to_remove:
        await db.delete(c)

    if not prior_checks:
        await db.delete(db_income)
        await db.commit()
        return True
    else:
        db_income.is_active = False
        db_income.deactivated_at = end_of_prev_month
        await db.commit()
        return True


async def get_monthly_incomes(db: AsyncSession, user_id: UUID, month_year: str):
    """
    Get all estimated incomes for a specific month.
    Includes active incomes and inactive incomes that have a check for this month.
    """
    year, month = map(int, month_year.split('-'))
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    _, last_day = calendar.monthrange(year, month)
    end_date = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    query = (
        select(models.EstimatedIncome)
        .outerjoin(models.IncomeCheck, 
                   (models.IncomeCheck.income_id == models.EstimatedIncome.id) & 
                   (models.IncomeCheck.month_year == month_year))
        .filter(
            models.EstimatedIncome.user_id == user_id,
            models.EstimatedIncome.created_at <= end_date,
            (models.EstimatedIncome.deactivated_at == None) | (models.EstimatedIncome.deactivated_at >= start_date) | (models.IncomeCheck.id != None)
        )
    )
    
    query = query.order_by(models.EstimatedIncome.payment_day.asc().nullslast(), models.EstimatedIncome.created_at.desc())
    result = await db.execute(query)
    
    incomes = result.scalars().unique().all()
    
    checks_result = await db.execute(
        select(models.IncomeCheck)
        .filter(
            models.IncomeCheck.income_id.in_([inc.id for inc in incomes]) if incomes else False,
            models.IncomeCheck.month_year == month_year
        )
    )
    checks = checks_result.scalars().all()
    
    check_map = {}
    for check in checks:
        if check.income_id not in check_map:
            check_map[check.income_id] = []
        check_map[check.income_id].append(check)
        
    for inc in incomes:
        set_committed_value(inc, 'checks', check_map.get(inc.id, []))
        
    return incomes


async def check_income(db: AsyncSession, income_id: UUID, check: schemas.IncomeCheckCreate, user_id: UUID, extra_data: dict = None):
    db_est = await get_estimated_income(db, income_id, user_id)
    if not db_est:
        return None

    existing = await db.execute(
        select(models.IncomeCheck)
        .filter(
            models.IncomeCheck.income_id == income_id,
            models.IncomeCheck.month_year == check.month_year
        )
    )
    db_check = existing.scalars().first()

    if not db_check:
        db_check = models.IncomeCheck(
            income_id=income_id,
            month_year=check.month_year,
            real_amount=Decimal(str(check.real_amount)),
            currency=getattr(check.currency, "value", check.currency) or "BS",
            payment_date=check.payment_date or date.today(),
            is_partial=bool(check.is_partial),
            pending_date=check.pending_date if check.is_partial else None,
            notes=check.notes,
        )
        db.add(db_check)
    else:
        db_check.is_partial = bool(check.is_partial)
        db_check.pending_date = check.pending_date if check.is_partial else None
        db_check.notes = check.notes

    await db.flush()

    # Create linked Income row
    currency_val = getattr(check.currency, "value", check.currency) or "BS"
    desc = f"{db_est.name} ({check.notes.strip()})" if check.notes and check.notes.strip() else db_est.name
    cat = db_est.category or "Otros ingresos"

    clean_extra = {k: v for k, v in (extra_data or {}).items() if hasattr(models.Income, k)}
    db_income_entry = models.Income(
        user_id=user_id,
        amount=check.real_amount,
        currency=currency_val,
        date=check.payment_date or date.today(),
        category=cat,
        description=desc,
        income_check_id=db_check.id,
        **clean_extra
    )
    db.add(db_income_entry)
    await db.flush()

    await _recalculate_or_delete_income_check(
        db, db_check, template=db_est, delete_if_empty=False, allow_mark_partial=bool(check.is_partial)
    )
    if not db_check.is_partial:
        await resolve_notifications_for_entity(db, "estimated_income", income_id, user_id=user_id)
    await db.commit()
    await db.refresh(db_check)
    return db_check


async def uncheck_income(db: AsyncSession, income_id: UUID, month_year: str, user_id: UUID):
    db_est = await get_estimated_income(db, income_id, user_id)
    if not db_est:
        return False

    existing = await db.execute(
        select(models.IncomeCheck)
        .filter(
            models.IncomeCheck.income_id == income_id,
            models.IncomeCheck.month_year == month_year
        )
    )
    existing_check = existing.scalars().first()
    if not existing_check:
        return False

    linked_res = await db.execute(
        select(models.Income).filter(models.Income.income_check_id == existing_check.id)
    )
    for inc in linked_res.scalars().all():
        await db.delete(inc)

    await db.delete(existing_check)
    await db.commit()
    return True


# --- Real Incomes CRUD ---

async def create_income(
    db: AsyncSession,
    income: schemas.IncomeCreate,
    user_id: UUID,
    extra_data: dict = None
) -> Optional[models.Income]:
    est_id = None
    month_year = None
    is_partial = None
    pending_date = None

    if income.income_check_target:
        est_id = income.income_check_target.estimated_income_id
        month_year = income.income_check_target.month_year
        is_partial = income.income_check_target.is_partial
        pending_date = income.income_check_target.pending_date
    elif income.estimated_income_id and income.month_year:
        est_id = income.estimated_income_id
        month_year = income.month_year

    db_check = None
    db_est = None

    if est_id and month_year:
        db_est = await get_estimated_income(db, est_id, user_id)
        if not db_est:
            return None

        chk_res = await db.execute(
            select(models.IncomeCheck).filter(
                models.IncomeCheck.income_id == est_id,
                models.IncomeCheck.month_year == month_year
            )
        )
        db_check = chk_res.scalars().first()
        if not db_check:
            new_is_partial = True if is_partial is None else bool(is_partial)
            db_check = models.IncomeCheck(
                income_id=est_id,
                month_year=month_year,
                real_amount=Decimal(str(income.amount)),
                currency=getattr(income.currency, "value", income.currency) or "BS",
                payment_date=income.date or date.today(),
                is_partial=new_is_partial,
                pending_date=pending_date if (is_partial or is_partial is None) else None,
            )
            db.add(db_check)
            await db.flush()
        else:
            if is_partial is not None:
                db_check.is_partial = bool(is_partial)
                db_check.pending_date = pending_date if is_partial else None
                await db.flush()

    cat = income.category or (db_est.category if db_est else "Otros ingresos")
    if not cat or not cat.strip():
        cat = "Otros ingresos"

    clean_extra = {k: v for k, v in (extra_data or {}).items() if hasattr(models.Income, k)}
    db_income = models.Income(
        user_id=user_id,
        amount=income.amount,
        currency=getattr(income.currency, "value", income.currency),
        date=income.date or date.today(),
        category=cat,
        description=income.description,
        income_check_id=db_check.id if db_check else None,
        **clean_extra
    )
    db.add(db_income)
    await db.flush()

    if db_check:
        allow_mark = bool(is_partial is None)
        await _recalculate_or_delete_income_check(
            db, db_check, template=db_est, delete_if_empty=False, allow_mark_partial=allow_mark
        )
        if not db_check.is_partial:
            await resolve_notifications_for_entity(db, "estimated_income", est_id, user_id=user_id)

    await db.commit()
    loaded = await get_income(db, db_income.id, user_id)
    return loaded or _populate_income_template_info(db_income, template=db_est)


async def get_incomes(
    db: AsyncSession,
    user_id: UUID,
    skip: int = 0,
    limit: int = 200,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None
) -> List[models.Income]:
    query = (
        select(models.Income)
        .options(
            selectinload(models.Income.income_check).selectinload(models.IncomeCheck.income)
        )
        .filter(models.Income.user_id == user_id)
    )
    if date_from:
        query = query.filter(models.Income.date >= date_from)
    if date_to:
        query = query.filter(models.Income.date <= date_to)

    query = query.order_by(models.Income.date.desc(), models.Income.created_at.desc()).offset(skip).limit(limit)
    res = await db.execute(query)
    incomes = res.scalars().all()
    for inc in incomes:
        _populate_income_template_info(inc)
    return incomes


async def get_income(db: AsyncSession, entry_id: UUID, user_id: UUID) -> Optional[models.Income]:
    query = (
        select(models.Income)
        .options(
            selectinload(models.Income.income_check).selectinload(models.IncomeCheck.income)
        )
        .filter(models.Income.id == entry_id, models.Income.user_id == user_id)
    )
    res = await db.execute(query)
    db_income = res.scalars().first()
    if db_income:
        _populate_income_template_info(db_income)
    return db_income


async def update_income(
    db: AsyncSession,
    entry_id: UUID,
    income_update: schemas.IncomeUpdate,
    user_id: UUID,
    extra_data: dict = None
) -> Optional[models.Income]:
    db_income = await get_income(db, entry_id, user_id)
    if not db_income:
        return None

    data = income_update.model_dump(exclude_unset=True)
    if "manual_rate" in data:
        del data["manual_rate"]
    if "currency" in data and data["currency"] is not None:
        data["currency"] = getattr(data["currency"], "value", data["currency"])

    for k, v in data.items():
        setattr(db_income, k, v)

    if extra_data:
        clean_extra = {k: v for k, v in extra_data.items() if hasattr(models.Income, k)}
        for k, v in clean_extra.items():
            setattr(db_income, k, v)

    await db.flush()

    if db_income.income_check_id:
        chk_res = await db.execute(
            select(models.IncomeCheck)
            .options(selectinload(models.IncomeCheck.income))
            .filter(models.IncomeCheck.id == db_income.income_check_id)
        )
        db_check = chk_res.scalars().first()
        if db_check:
            template = db_check.__dict__.get("income")
            await _recalculate_or_delete_income_check(
                db, db_check, template=template, delete_if_empty=False, allow_mark_partial=True
            )

    await db.commit()
    return await get_income(db, entry_id, user_id)


async def delete_income(db: AsyncSession, entry_id: UUID, user_id: UUID) -> bool:
    res = await db.execute(
        select(models.Income).filter(models.Income.id == entry_id, models.Income.user_id == user_id)
    )
    db_income = res.scalars().first()
    if not db_income:
        return False

    check_id = db_income.income_check_id
    await db.delete(db_income)
    await db.flush()

    if check_id:
        chk_res = await db.execute(
            select(models.IncomeCheck)
            .options(selectinload(models.IncomeCheck.income))
            .filter(models.IncomeCheck.id == check_id)
        )
        db_check = chk_res.scalars().first()
        if db_check:
            template = db_check.__dict__.get("income")
            await _recalculate_or_delete_income_check(
                db, db_check, template=template, delete_if_empty=True, allow_mark_partial=True
            )

    await db.commit()
    return True
