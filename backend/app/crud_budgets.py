import calendar
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import List, Optional, Dict, Any, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from . import models, schemas, bcv_service
from .push_service import send_notification_to_user


SYSTEM_BUDGET_CATEGORIES = ["Gastos Fijos", "Deudas", "Ahorro"]


async def get_available_budget_categories(db: AsyncSession, user_id: UUID) -> List[str]:
    """
    Returns the list of categories available for budgeting:
    User categories + fixed categories ["Gastos Fijos", "Deudas", "Ahorro"].
    """
    res = await db.execute(
        select(models.Category.name).where(models.Category.user_id == user_id).order_by(models.Category.name.asc())
    )
    user_cats = res.scalars().all()
    seen = set()
    result = []
    
    # Add user categories
    for c in user_cats:
        c_clean = c.strip()
        if c_clean and c_clean not in seen:
            seen.add(c_clean)
            result.append(c_clean)
            
    # Add system categories if not already present
    for sc in SYSTEM_BUDGET_CATEGORIES:
        if sc not in seen:
            seen.add(sc)
            result.append(sc)
            
    return result


def _expense_amount_in_currency(exp: models.Expense, target_currency: str, rates: dict) -> Decimal:
    """
    Computes an expense's value in target_currency with strict adherence to Auditor Fix #1.
    """
    # 1. Short-circuit: if exp.currency == target_currency: return Decimal(str(exp.amount))
    if exp.currency == target_currency:
        return Decimal(str(exp.amount))

    # 2. For USD_BCV
    if target_currency == 'USD_BCV':
        if exp.amount_usd is not None:
            return Decimal(str(exp.amount_usd))
        return _convert_value_between_currencies(Decimal(str(exp.amount)), exp.currency, 'USD_BCV', rates)

    # 3. For EUR_BCV
    if target_currency == 'EUR_BCV':
        if exp.amount_eur is not None:
            return Decimal(str(exp.amount_eur))
        return _convert_value_between_currencies(Decimal(str(exp.amount)), exp.currency, 'EUR_BCV', rates)

    # 4. For BS
    if target_currency == 'BS':
        if exp.amount_bs is not None:
            return Decimal(str(exp.amount_bs))
        return _convert_value_between_currencies(Decimal(str(exp.amount)), exp.currency, 'BS', rates)

    # 5. For USDT or USD_CASH: USD_CASH tracks parallel/market value (NOT BCV amount_usd!)
    if target_currency in ('USDT', 'USD_CASH'):
        if exp.amount_usdt is not None:
            return Decimal(str(exp.amount_usdt))
        if exp.amount_bs is not None:
            candidates = [rates.get('usdt_bs'), rates.get('usd_bs'), rates.get('eur_bs')]
            valid = [Decimal(str(r)) for r in candidates if r is not None and Decimal(str(r)) > 0]
            if valid:
                max_rate = max(valid)
                return Decimal(str(exp.amount_bs)) / max_rate
        return _convert_value_between_currencies(Decimal(str(exp.amount)), exp.currency, target_currency, rates)

    return _convert_value_between_currencies(Decimal(str(exp.amount)), exp.currency, target_currency, rates)


def _convert_value_between_currencies(amount: Decimal, from_currency: str, to_currency: str, rates: dict) -> Decimal:
    """
    Converts amount from from_currency to to_currency with zero-division protection,
    short-circuiting when from_currency == to_currency, and without equating USD_BCV and USD_CASH.
    """
    amount = Decimal(str(amount))
    if from_currency == to_currency:
        return amount

    # Extract rates safely, guarding against None or 0
    usd_bs = Decimal(str(rates.get("usd_bs"))) if rates.get("usd_bs") and Decimal(str(rates.get("usd_bs"))) > 0 else None
    eur_bs = Decimal(str(rates.get("eur_bs"))) if rates.get("eur_bs") and Decimal(str(rates.get("eur_bs"))) > 0 else None
    usdt_bs = Decimal(str(rates.get("usdt_bs"))) if rates.get("usdt_bs") and Decimal(str(rates.get("usdt_bs"))) > 0 else None

    # Step 1: Convert from_currency to BS
    amount_bs: Optional[Decimal] = None
    if from_currency == 'BS':
        amount_bs = amount
    elif from_currency == 'USD_BCV':
        if usd_bs:
            amount_bs = amount * usd_bs
    elif from_currency == 'EUR_BCV':
        if eur_bs:
            amount_bs = amount * eur_bs
    elif from_currency == 'USDT':
        if usdt_bs:
            amount_bs = amount * usdt_bs
    elif from_currency == 'USD_CASH':
        avail = [r for r in [usdt_bs, usd_bs, eur_bs] if r is not None and r > 0]
        if avail:
            amount_bs = amount * max(avail)
        elif usd_bs:
            amount_bs = amount * usd_bs

    if amount_bs is None:
        # Fallback if rate missing
        return amount

    # Step 2: Convert amount_bs to to_currency
    if to_currency == 'BS':
        return amount_bs
    elif to_currency == 'USD_BCV':
        if usd_bs and usd_bs > 0:
            return amount_bs / usd_bs
    elif to_currency == 'EUR_BCV':
        if eur_bs and eur_bs > 0:
            return amount_bs / eur_bs
    elif to_currency in ('USDT', 'USD_CASH'):
        avail = [r for r in [usdt_bs, usd_bs, eur_bs] if r is not None and r > 0]
        if avail:
            return amount_bs / max(avail)
        elif usd_bs and usd_bs > 0:
            return amount_bs / usd_bs

    return amount


async def _compute_effective_global_limit(
    budget: models.MonthlyBudget,
    rates: dict,
    db: AsyncSession
) -> Optional[Decimal]:
    """
    Computes effective global limit based on income_mode.
    When income.currency == budget.currency, short-circuits and returns Decimal(str(income.expected_amount))
    directly without requiring external rates.
    """
    if budget.income_mode == 'manual':
        if budget.manual_global_limit is not None:
            return Decimal(str(budget.manual_global_limit))
        return None

    elif budget.income_mode == 'single_income':
        if not budget.linked_income_id:
            return None
        # Use eager-loaded linked_income or query
        income = budget.linked_income
        if not income:
            res = await db.execute(
                select(models.EstimatedIncome).where(
                    models.EstimatedIncome.id == budget.linked_income_id,
                    models.EstimatedIncome.user_id == budget.user_id
                )
            )
            income = res.scalars().first()

        if not income:
            return None

        # Short-circuit if currencies match!
        if income.currency == budget.currency:
            return Decimal(str(income.expected_amount))

        return _convert_value_between_currencies(
            Decimal(str(income.expected_amount)),
            income.currency,
            budget.currency,
            rates
        )

    elif budget.income_mode == 'all_incomes':
        # Query active estimated incomes for this user
        res = await db.execute(
            select(models.EstimatedIncome).where(
                models.EstimatedIncome.user_id == budget.user_id,
                models.EstimatedIncome.is_active == True
            )
        )
        incomes = res.scalars().all()
        total = Decimal("0")
        for inc in incomes:
            if inc.currency == budget.currency:
                total += Decimal(str(inc.expected_amount))
            else:
                total += _convert_value_between_currencies(
                    Decimal(str(inc.expected_amount)),
                    inc.currency,
                    budget.currency,
                    rates
                )
        return total

    return None


async def get_or_clone_monthly_budget(
    db: AsyncSession,
    user_id: UUID,
    month_year: str
) -> Optional[models.MonthlyBudget]:
    """
    Retrieves the MonthlyBudget for (user_id, month_year).
    If it doesn't exist, auto-clones from the most recent prior month with is_confirmed=False.
    Sends start-of-month notification if month_year == current_month and notified_month_start == False.
    Enforces Auditor Fix #3 and Fix #4 (concurrency race handling + selectinload).
    """
    # 1. Check if budget already exists
    res = await db.execute(
        select(models.MonthlyBudget)
        .options(
            selectinload(models.MonthlyBudget.category_limits),
            selectinload(models.MonthlyBudget.linked_income)
        )
        .where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year == month_year
        )
    )
    budget = res.scalars().first()
    if budget:
        # Check start-of-month notification if applicable
        current_month = datetime.now(timezone.utc).strftime("%Y-%m")
        if month_year == current_month and not budget.notified_month_start and not budget.is_confirmed:
            budget.notified_month_start = True
            await send_notification_to_user(
                db=db,
                user_id=user_id,
                title="Presupuesto del mes",
                body=f"Revisa tu presupuesto de {month_year} y confirma o ajusta tus límites.",
                type="budgets",
                url="/herramientas/presupuestos"
            )
            await db.commit()
            # Re-query after commit to avoid MissingGreenlet
            res = await db.execute(
                select(models.MonthlyBudget)
                .options(
                    selectinload(models.MonthlyBudget.category_limits),
                    selectinload(models.MonthlyBudget.linked_income)
                )
                .where(models.MonthlyBudget.id == budget.id)
            )
            budget = res.scalars().first()
        return budget

    # 2. Find most recent prior month budget
    prior_res = await db.execute(
        select(models.MonthlyBudget)
        .options(selectinload(models.MonthlyBudget.category_limits))
        .where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year < month_year
        )
        .order_by(models.MonthlyBudget.month_year.desc())
    )
    prior_budget = prior_res.scalars().first()

    if not prior_budget:
        return None

    # 3. Auto-clone prior budget
    new_budget = models.MonthlyBudget(
        user_id=user_id,
        month_year=month_year,
        currency=prior_budget.currency,
        income_mode=prior_budget.income_mode,
        linked_income_id=prior_budget.linked_income_id,
        manual_global_limit=prior_budget.manual_global_limit,
        is_confirmed=False,
        notified_month_start=False,
        notified_global_80=False,
        notified_global_100=False,
    )
    
    # Clone category limits
    for cl in prior_budget.category_limits:
        new_cl = models.BudgetCategoryLimit(
            category_name=cl.category_name,
            limit_amount=cl.limit_amount,
            currency=cl.currency or prior_budget.currency or 'USD_BCV',
            notified_80=False,
            notified_100=False,
        )
        new_budget.category_limits.append(new_cl)

    # 4. Auditor Fix #3: Concurrency handling with try/except IntegrityError
    try:
        db.add(new_budget)
        await db.commit()
    except IntegrityError:
        await db.rollback()

    # Re-query with selectinload
    re_res = await db.execute(
        select(models.MonthlyBudget)
        .options(
            selectinload(models.MonthlyBudget.category_limits),
            selectinload(models.MonthlyBudget.linked_income)
        )
        .where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year == month_year
        )
    )
    cloned_budget = re_res.scalars().first()

    if cloned_budget:
        current_month = datetime.now(timezone.utc).strftime("%Y-%m")
        if month_year == current_month and not cloned_budget.notified_month_start:
            cloned_budget.notified_month_start = True
            await send_notification_to_user(
                db=db,
                user_id=user_id,
                title="Presupuesto del mes",
                body=f"Tu presupuesto para {month_year} se clonó del mes anterior. Revísalo y confirma tus límites.",
                type="budgets",
                url="/herramientas/presupuestos"
            )
            await db.commit()
            re_res = await db.execute(
                select(models.MonthlyBudget)
                .options(
                    selectinload(models.MonthlyBudget.category_limits),
                    selectinload(models.MonthlyBudget.linked_income)
                )
                .where(models.MonthlyBudget.id == cloned_budget.id)
            )
            cloned_budget = re_res.scalars().first()

    return cloned_budget


def _calc_traffic_light(spent_pct: float) -> schemas.BudgetTrafficLight:
    if spent_pct >= 100.0:
        return schemas.BudgetTrafficLight.red
    elif spent_pct >= 80.0:
        return schemas.BudgetTrafficLight.yellow
    return schemas.BudgetTrafficLight.green


async def get_monthly_budget_view(
    db: AsyncSession,
    user_id: UUID,
    month_year: str
) -> schemas.MonthlyBudgetResponse:
    """
    Computes full budget response for month_year, aggregating real expenses,
    category limits, progress percentages, traffic lights, and unbudgeted categories.
    """
    budget = await get_or_clone_monthly_budget(db, user_id, month_year)
    rates = await bcv_service.get_all_rates()

    target_currency = budget.currency if budget else 'USD_BCV'

    # Compute date range for month_year
    year, month = map(int, month_year.split('-'))
    _, last_day = calendar.monthrange(year, month)
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)

    # Fetch expenses in month_year
    exp_res = await db.execute(
        select(models.Expense).where(
            models.Expense.user_id == user_id,
            models.Expense.date >= start_date,
            models.Expense.date <= end_date
        )
    )
    expenses = exp_res.scalars().all()

    # Aggregate spent by category in all 4 currencies
    expenses_by_cat: Dict[str, List[models.Expense]] = {}
    total_spent_budget_curr = Decimal("0")
    total_spent_usd = Decimal("0")
    total_spent_bs = Decimal("0")
    total_spent_eur = Decimal("0")
    total_spent_usdt = Decimal("0")

    for exp in expenses:
        cat = exp.category or "Sin Categoría"
        expenses_by_cat.setdefault(cat, []).append(exp)

        amt_curr = _expense_amount_in_currency(exp, target_currency, rates)
        amt_usd = _expense_amount_in_currency(exp, 'USD_BCV', rates)
        amt_bs = _expense_amount_in_currency(exp, 'BS', rates)
        amt_eur = _expense_amount_in_currency(exp, 'EUR_BCV', rates)
        amt_usdt = _expense_amount_in_currency(exp, 'USDT', rates)

        total_spent_budget_curr += amt_curr
        total_spent_usd += amt_usd
        total_spent_bs += amt_bs
        total_spent_eur += amt_eur
        total_spent_usdt += amt_usdt

    # Process category limits
    configured_limits = budget.category_limits if budget else []
    configured_cat_names = set()
    category_summaries: List[schemas.BudgetCategorySummaryOut] = []

    allocated_budget_curr = Decimal("0")
    allocated_usd = Decimal("0")
    allocated_bs = Decimal("0")
    allocated_eur = Decimal("0")
    allocated_usdt = Decimal("0")

    for cl in configured_limits:
        configured_cat_names.add(cl.category_name)
        cl_curr = cl.currency or target_currency
        cat_exps = expenses_by_cat.get(cl.category_name, [])

        cat_spent_cl = sum((_expense_amount_in_currency(e, cl_curr, rates) for e in cat_exps), Decimal("0"))
        cat_spent_usd = sum((_expense_amount_in_currency(e, 'USD_BCV', rates) for e in cat_exps), Decimal("0"))
        cat_spent_bs = sum((_expense_amount_in_currency(e, 'BS', rates) for e in cat_exps), Decimal("0"))
        cat_spent_eur = sum((_expense_amount_in_currency(e, 'EUR_BCV', rates) for e in cat_exps), Decimal("0"))
        cat_spent_usdt = sum((_expense_amount_in_currency(e, 'USDT', rates) for e in cat_exps), Decimal("0"))

        limit_amt = Decimal(str(cl.limit_amount))
        limit_usd = _convert_value_between_currencies(limit_amt, cl_curr, 'USD_BCV', rates)
        limit_bs = _convert_value_between_currencies(limit_amt, cl_curr, 'BS', rates)
        limit_eur = _convert_value_between_currencies(limit_amt, cl_curr, 'EUR_BCV', rates)
        limit_usdt = _convert_value_between_currencies(limit_amt, cl_curr, 'USDT', rates)
        limit_curr = _convert_value_between_currencies(limit_amt, cl_curr, target_currency, rates)

        allocated_budget_curr += limit_curr
        allocated_usd += limit_usd
        allocated_bs += limit_bs
        allocated_eur += limit_eur
        allocated_usdt += limit_usdt

        pct = float((cat_spent_cl / limit_amt) * 100) if limit_amt > 0 else 0.0
        tl = _calc_traffic_light(pct)
        remaining = limit_amt - cat_spent_cl

        category_summaries.append(
            schemas.BudgetCategorySummaryOut(
                category_name=cl.category_name,
                limit_amount=round(limit_amt, 2),
                spent_amount=round(cat_spent_cl, 2),
                remaining_amount=round(remaining, 2),
                currency=cl_curr,
                spent_percentage=round(pct, 1),
                traffic_light=tl,
                spent_usd=round(cat_spent_usd, 2),
                spent_bs=round(cat_spent_bs, 2),
                spent_eur=round(cat_spent_eur, 2),
                spent_usdt=round(cat_spent_usdt, 2),
                limit_usd=round(limit_usd, 2),
                limit_bs=round(limit_bs, 2),
                limit_eur=round(limit_eur, 2),
                limit_usdt=round(limit_usdt, 2)
            )
        )

    # Sort category limits alphabetically
    category_summaries.sort(key=lambda x: x.category_name.lower())

    # Calculate unbudgeted expenses
    unbudgeted_spent_curr = Decimal("0")
    unbudgeted_spent_usd = Decimal("0")
    unbudgeted_spent_bs = Decimal("0")
    unbudgeted_spent_eur = Decimal("0")
    unbudgeted_spent_usdt = Decimal("0")
    unbudgeted_categories: List[str] = []

    for cat, exps in expenses_by_cat.items():
        if cat not in configured_cat_names and len(exps) > 0:
            unbudgeted_spent_curr += sum((_expense_amount_in_currency(e, target_currency, rates) for e in exps), Decimal("0"))
            unbudgeted_spent_usd += sum((_expense_amount_in_currency(e, 'USD_BCV', rates) for e in exps), Decimal("0"))
            unbudgeted_spent_bs += sum((_expense_amount_in_currency(e, 'BS', rates) for e in exps), Decimal("0"))
            unbudgeted_spent_eur += sum((_expense_amount_in_currency(e, 'EUR_BCV', rates) for e in exps), Decimal("0"))
            unbudgeted_spent_usdt += sum((_expense_amount_in_currency(e, 'USDT', rates) for e in exps), Decimal("0"))
            unbudgeted_categories.append(cat)

    unbudgeted_categories.sort()

    # Compute global limit & 4-currency equivalents
    effective_global_limit: Optional[Decimal] = None
    global_limit_usd: Optional[Decimal] = None
    global_limit_bs: Optional[Decimal] = None
    global_limit_eur: Optional[Decimal] = None
    global_limit_usdt: Optional[Decimal] = None
    global_pct = 0.0
    global_tl = schemas.BudgetTrafficLight.green

    if budget:
        effective_global_limit = await _compute_effective_global_limit(budget, rates, db)
        if effective_global_limit is not None:
            global_limit_usd = _convert_value_between_currencies(
                effective_global_limit, target_currency, 'USD_BCV', rates
            )
            global_limit_bs = _convert_value_between_currencies(
                effective_global_limit, target_currency, 'BS', rates
            )
            global_limit_eur = _convert_value_between_currencies(
                effective_global_limit, target_currency, 'EUR_BCV', rates
            )
            global_limit_usdt = _convert_value_between_currencies(
                effective_global_limit, target_currency, 'USDT', rates
            )
            if effective_global_limit > 0:
                global_pct = float((total_spent_budget_curr / effective_global_limit) * 100)
                global_tl = _calc_traffic_light(global_pct)

    return schemas.MonthlyBudgetResponse(
        id=budget.id if budget else None,
        month_year=month_year,
        currency=target_currency,
        income_mode=budget.income_mode if budget else schemas.BudgetIncomeMode.manual,
        linked_income_id=budget.linked_income_id if budget else None,
        manual_global_limit=budget.manual_global_limit if budget else None,
        effective_global_limit=effective_global_limit,
        global_limit_usd=round(global_limit_usd, 2) if global_limit_usd is not None else None,
        global_limit_bs=round(global_limit_bs, 2) if global_limit_bs is not None else None,
        global_limit_eur=round(global_limit_eur, 2) if global_limit_eur is not None else None,
        global_limit_usdt=round(global_limit_usdt, 2) if global_limit_usdt is not None else None,
        total_spent_budget_currency=round(total_spent_budget_curr, 2),
        total_spent_usd=round(total_spent_usd, 2),
        total_spent_bs=round(total_spent_bs, 2),
        total_spent_eur=round(total_spent_eur, 2),
        total_spent_usdt=round(total_spent_usdt, 2),
        global_spent_percentage=round(global_pct, 1),
        global_traffic_light=global_tl,
        is_confirmed=budget.is_confirmed if budget else False,
        allocated_budget_currency=round(allocated_budget_curr, 2),
        allocated_usd=round(allocated_usd, 2),
        allocated_bs=round(allocated_bs, 2),
        allocated_eur=round(allocated_eur, 2),
        allocated_usdt=round(allocated_usdt, 2),
        category_limits=category_summaries,
        unbudgeted_spent_budget_currency=round(unbudgeted_spent_curr, 2),
        unbudgeted_spent_usd=round(unbudgeted_spent_usd, 2),
        unbudgeted_spent_bs=round(unbudgeted_spent_bs, 2),
        unbudgeted_spent_eur=round(unbudgeted_spent_eur, 2),
        unbudgeted_spent_usdt=round(unbudgeted_spent_usdt, 2),
        unbudgeted_categories=unbudgeted_categories,
        exists=budget is not None
    )


async def upsert_monthly_budget(
    db: AsyncSession,
    user_id: UUID,
    month_year: str,
    payload: schemas.MonthlyBudgetUpsert
) -> schemas.MonthlyBudgetResponse:
    """
    Creates or updates the MonthlyBudget and its category limits.
    Enforces Auditor Fix #4 & Fix #5 (IDOR protection on linked_income_id).
    """
    # 1. Auditor Fix #5: IDOR Protection
    if payload.linked_income_id:
        inc_res = await db.execute(
            select(models.EstimatedIncome).filter(
                models.EstimatedIncome.id == payload.linked_income_id,
                models.EstimatedIncome.user_id == user_id
            )
        )
        if not inc_res.scalars().first():
            raise HTTPException(status_code=404, detail="Ingreso estimado no encontrado")

    # 2. Find existing budget
    res = await db.execute(
        select(models.MonthlyBudget)
        .options(
            selectinload(models.MonthlyBudget.category_limits),
            selectinload(models.MonthlyBudget.linked_income)
        )
        .where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year == month_year
        )
    )
    budget = res.scalars().first()

    curr_val = payload.currency.value if hasattr(payload.currency, "value") else str(payload.currency)
    mode_val = payload.income_mode.value if hasattr(payload.income_mode, "value") else str(payload.income_mode)

    is_new = budget is None
    if is_new:
        budget = models.MonthlyBudget(
            user_id=user_id,
            month_year=month_year,
            currency=curr_val,
            income_mode=mode_val,
            linked_income_id=payload.linked_income_id,
            manual_global_limit=payload.manual_global_limit,
            is_confirmed=True,
            notified_month_start=True
        )
        db.add(budget)
        await db.flush()
        existing_limits = {}
    else:
        budget.currency = curr_val
        budget.income_mode = mode_val
        budget.linked_income_id = payload.linked_income_id
        budget.manual_global_limit = payload.manual_global_limit
        budget.is_confirmed = True
        existing_limits = {cl.category_name: cl for cl in budget.category_limits}

    # 3. Synchronize category limits if provided
    if payload.category_limits is not None:
        new_limits_map = {item.category_name.strip(): item for item in payload.category_limits if item.category_name.strip()}

        # Update or remove existing
        for cat_name, cl in list(existing_limits.items()):
            if cat_name in new_limits_map:
                item = new_limits_map[cat_name]
                cl.limit_amount = item.limit_amount
                cl.currency = item.currency.value if hasattr(item.currency, "value") else str(item.currency)
            else:
                await db.delete(cl)

        # Add new ones
        for cat_name, item in new_limits_map.items():
            if cat_name not in existing_limits:
                new_cl = models.BudgetCategoryLimit(
                    budget_id=budget.id,
                    category_name=cat_name,
                    limit_amount=item.limit_amount,
                    currency=item.currency.value if hasattr(item.currency, "value") else str(item.currency)
                )
                db.add(new_cl)

    await db.commit()

    # Recompute threshold flags (e.g. if limit increased or currency changed, reset flags)
    await check_and_notify_budget_thresholds(
        db, user_id, date(int(month_year[:4]), int(month_year[5:7]), 1), allow_notify=False
    )

    # Re-query with selectinload to adhere to Auditor Fix #4
    return await get_monthly_budget_view(db, user_id, month_year)


async def upsert_budget_category_limit(
    db: AsyncSession,
    user_id: UUID,
    month_year: str,
    item: schemas.BudgetCategoryLimitInput
) -> schemas.MonthlyBudgetResponse:
    """
    Adds or updates a single category limit for the specified month.
    Creates or auto-clones the budget if it doesn't exist yet.
    """
    budget = await get_or_clone_monthly_budget(db, user_id, month_year)
    is_new_budget = budget is None
    if is_new_budget:
        budget = models.MonthlyBudget(
            user_id=user_id,
            month_year=month_year,
            currency='USD_BCV',
            income_mode='manual',
            is_confirmed=True,
            notified_month_start=True
        )
        db.add(budget)
        await db.flush()
    else:
        budget.is_confirmed = True

    cat_name = item.category_name.strip()
    item_curr = item.currency.value if hasattr(item.currency, "value") else str(item.currency)

    # Check if category already has a limit
    existing_cl = None if is_new_budget else next((cl for cl in (budget.category_limits or []) if cl.category_name.lower() == cat_name.lower()), None)
    if existing_cl:
        existing_cl.limit_amount = item.limit_amount
        existing_cl.currency = item_curr
        existing_cl.notified_80 = False
        existing_cl.notified_100 = False
    else:
        new_cl = models.BudgetCategoryLimit(
            budget_id=budget.id,
            category_name=cat_name,
            limit_amount=item.limit_amount,
            currency=item_curr,
            notified_80=False,
            notified_100=False
        )
        db.add(new_cl)

    await db.commit()
    db.expire_all()

    # Recompute threshold flags
    await check_and_notify_budget_thresholds(
        db, user_id, date(int(month_year[:4]), int(month_year[5:7]), 1), allow_notify=False
    )

    return await get_monthly_budget_view(db, user_id, month_year)


async def delete_budget_category_limit(
    db: AsyncSession,
    user_id: UUID,
    month_year: str,
    category_name: str
) -> schemas.MonthlyBudgetResponse:
    """
    Deletes a single category limit for the specified month.
    """
    res = await db.execute(
        select(models.MonthlyBudget)
        .options(
            selectinload(models.MonthlyBudget.category_limits),
            selectinload(models.MonthlyBudget.linked_income)
        )
        .where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year == month_year
        )
    )
    budget = res.scalars().first()
    if not budget:
        return await get_monthly_budget_view(db, user_id, month_year)

    target_cat = category_name.strip().lower()
    cl_to_delete = next((cl for cl in budget.category_limits if cl.category_name.lower() == target_cat), None)
    if cl_to_delete:
        budget.category_limits.remove(cl_to_delete)
        await db.delete(cl_to_delete)
        await db.commit()
        db.expire_all()
        await check_and_notify_budget_thresholds(
            db, user_id, date(int(month_year[:4]), int(month_year[5:7]), 1), allow_notify=False
        )

    return await get_monthly_budget_view(db, user_id, month_year)


async def confirm_monthly_budget(
    db: AsyncSession,
    user_id: UUID,
    month_year: str
) -> schemas.MonthlyBudgetResponse:
    """
    Confirms an auto-cloned budget for month_year.
    """
    budget = await get_or_clone_monthly_budget(db, user_id, month_year)
    if not budget:
        # Create a default confirmed budget
        budget = models.MonthlyBudget(
            user_id=user_id,
            month_year=month_year,
            currency='USD_BCV',
            income_mode='manual',
            is_confirmed=True,
            notified_month_start=True
        )
        db.add(budget)
    else:
        budget.is_confirmed = True

    await db.commit()
    return await get_monthly_budget_view(db, user_id, month_year)


async def check_and_notify_budget_thresholds(
    db: AsyncSession,
    user_id: UUID,
    target_date: Any,
    allow_notify: bool = True
) -> None:
    """
    Checks threshold crossings (80% and 100%) for both global limit and category limits
    for the month corresponding to target_date.
    Adheres strictly to Auditor Fix #2:
    - Wraps everything in try ... except Exception as e: print("Budget threshold check error:", repr(e)).
    - If allow_notify=False, resets flags if usage dropped below 80%/100%, and commits.
    - When allow_notify=True, resets flags if dropped, sends notifications for newly crossed 80%/100%,
      and explicitly commits.
    """
    try:
        if not target_date:
            target_date = date.today()
        elif isinstance(target_date, str):
            target_date = date.fromisoformat(target_date[:10])
        elif isinstance(target_date, datetime):
            target_date = target_date.date()

        month_year = target_date.strftime("%Y-%m")

        # Query budget for this month
        res = await db.execute(
            select(models.MonthlyBudget)
            .options(
                selectinload(models.MonthlyBudget.category_limits),
                selectinload(models.MonthlyBudget.linked_income)
            )
            .where(
                models.MonthlyBudget.user_id == user_id,
                models.MonthlyBudget.month_year == month_year
            )
        )
        budget = res.scalars().first()
        if not budget:
            return

        rates = await bcv_service.get_all_rates()
        target_currency = budget.currency

        # Fetch expenses for the month
        year = target_date.year
        month = target_date.month
        _, last_day = calendar.monthrange(year, month)
        start_date = date(year, month, 1)
        end_date = date(year, month, last_day)

        exp_res = await db.execute(
            select(models.Expense).where(
                models.Expense.user_id == user_id,
                models.Expense.date >= start_date,
                models.Expense.date <= end_date
            )
        )
        expenses = exp_res.scalars().all()

        total_spent = Decimal("0")
        for exp in expenses:
            amt = _expense_amount_in_currency(exp, target_currency, rates)
            total_spent += amt

        # 1. Check category limits in each category's currency
        for cl in budget.category_limits:
            limit = Decimal(str(cl.limit_amount))
            if limit <= 0:
                continue
            cl_curr = cl.currency or target_currency
            spent = sum(
                (_expense_amount_in_currency(exp, cl_curr, rates)
                 for exp in expenses
                 if (exp.category or "Sin Categoría") == cl.category_name),
                Decimal("0")
            )
            pct = float((spent / limit) * 100)

            if pct < 80.0:
                # Reset flags if dropped
                if cl.notified_80 or cl.notified_100:
                    cl.notified_80 = False
                    cl.notified_100 = False
            elif 80.0 <= pct < 100.0:
                if cl.notified_100:
                    cl.notified_100 = False
                if not cl.notified_80 and allow_notify:
                    cl.notified_80 = True
                    await send_notification_to_user(
                        db=db,
                        user_id=user_id,
                        title=f"Alerta de presupuesto: {cl.category_name}",
                        body=f"Has alcanzado el {pct:.0f}% de tu presupuesto en {cl.category_name} ({spent:.2f} / {limit:.2f} {cl_curr}).",
                        type="budgets",
                        url="/herramientas/presupuestos"
                    )
            else: # pct >= 100.0
                if not cl.notified_100 and allow_notify:
                    cl.notified_100 = True
                    cl.notified_80 = True
                    await send_notification_to_user(
                        db=db,
                        user_id=user_id,
                        title=f"¡Presupuesto excedido en {cl.category_name}!",
                        body=f"Has superado el 100% de tu presupuesto en {cl.category_name} ({spent:.2f} / {limit:.2f} {cl_curr}).",
                        type="budgets",
                        url="/herramientas/presupuestos"
                    )

        # 2. Check global limit
        effective_global = await _compute_effective_global_limit(budget, rates, db)
        if effective_global is not None and effective_global > 0:
            global_pct = float((total_spent / effective_global) * 100)
            if global_pct < 80.0:
                if budget.notified_global_80 or budget.notified_global_100:
                    budget.notified_global_80 = False
                    budget.notified_global_100 = False
            elif 80.0 <= global_pct < 100.0:
                if budget.notified_global_100:
                    budget.notified_global_100 = False
                if not budget.notified_global_80 and allow_notify:
                    budget.notified_global_80 = True
                    await send_notification_to_user(
                        db=db,
                        user_id=user_id,
                        title="Alerta de presupuesto mensual",
                        body=f"Has alcanzado el {global_pct:.0f}% de tu presupuesto mensual total ({total_spent:.2f} / {effective_global:.2f} {target_currency}).",
                        type="budgets",
                        url="/herramientas/presupuestos"
                    )
            else: # global_pct >= 100.0
                if not budget.notified_global_100 and allow_notify:
                    budget.notified_global_100 = True
                    budget.notified_global_80 = True
                    await send_notification_to_user(
                        db=db,
                        user_id=user_id,
                        title="¡Presupuesto mensual excedido!",
                        body=f"Has superado el 100% de tu presupuesto mensual total ({total_spent:.2f} / {effective_global:.2f} {target_currency}).",
                        type="budgets",
                        url="/herramientas/presupuestos"
                    )

        # Explicitly commit changes to flags and notifications
        await db.commit()

    except Exception as e:
        await db.rollback()
        print("Budget threshold check error:", repr(e))
