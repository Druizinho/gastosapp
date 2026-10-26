from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from uuid import UUID, uuid4
from fastapi import HTTPException
from . import models, schemas, sharing, bcv_service
from decimal import Decimal
from datetime import datetime, timezone, timedelta
import calendar
from .push_service import send_notification_to_user


async def create_fixed_expense(db: AsyncSession, expense: schemas.FixedExpenseCreate, user_id: UUID, extra_data: dict = None):
    shared_with_ids = [tid for tid in (expense.shared_with_ids or []) if tid != user_id]
    admin_ids = expense.admin_ids or []

    data = expense.model_dump(exclude_unset=True, exclude={'shared_with', 'shared_with_ids', 'admin_ids'})
    if 'manual_rate' in data:
        del data['manual_rate']
    if extra_data:
        data.update(extra_data)

    db_expense = models.FixedExpense(**data, user_id=user_id)
    db.add(db_expense)
    await db.flush()

    if shared_with_ids:
        await sharing.assert_can_add(db, user_id, shared_with_ids)

        requester_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        requester_prof = requester_prof_res.scalars().first()
        req_name = requester_prof.display_name if requester_prof and requester_prof.display_name else "Alguien"

        share = await sharing.create_share(
            db=db,
            entity_type="fixed_expense",
            owner_id=user_id,
            owner_entity=db_expense,
            target_ids=shared_with_ids,
            admin_ids=admin_ids
        )

        await sharing.notify_members(
            db=db,
            share_id=share.id,
            exclude_user_id=user_id,
            title="Nuevo gasto fijo compartido",
            body=f"{req_name} compartió un gasto fijo contigo: {expense.name}",
            type="shared_fe_created",
            url="/herramientas/gastos-fijos"
        )

    await db.commit()
    _exp = db.expire_all()
    if hasattr(_exp, "__await__"):
        await _exp
    await db.refresh(db_expense)
    return await get_fixed_expense(db, db_expense.id, user_id)


async def get_fixed_expenses(db: AsyncSession, user_id: UUID, active_only: bool = False):
    query = (
        select(models.FixedExpense)
        .options(selectinload(models.FixedExpense.checks))
        .filter(
            or_(
                models.FixedExpense.user_id == user_id,
                models.FixedExpense.id.in_(sharing.shared_entity_ids_subquery(user_id, "fixed_expense"))
            )
        )
    )
    
    if active_only:
        query = query.filter(models.FixedExpense.is_active == True)
    
    query = query.order_by(models.FixedExpense.payment_day.asc().nullslast(), models.FixedExpense.created_at.desc())
    result = await db.execute(query)
    expenses = result.scalars().unique().all()
    await sharing.populate_share_meta(db, expenses, user_id, "fixed_expense")
    return expenses


async def get_fixed_expense(db: AsyncSession, expense_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.FixedExpense)
        .options(selectinload(models.FixedExpense.checks))
        .filter(
            models.FixedExpense.id == expense_id,
            or_(
                models.FixedExpense.user_id == user_id,
                models.FixedExpense.id.in_(sharing.shared_entity_ids_subquery(user_id, "fixed_expense"))
            )
        )
        .execution_options(populate_existing=True)
    )
    fe = result.scalars().first()
    if fe:
        await sharing.populate_share_meta(db, [fe], user_id, "fixed_expense")
    return fe


async def update_fixed_expense(db: AsyncSession, expense_id: UUID, expense: schemas.FixedExpenseUpdate, user_id: UUID, extra_data: dict = None):
    db_expense = await get_fixed_expense(db, expense_id, user_id)
    if not db_expense:
        return None
    
    update_data = expense.model_dump(exclude_unset=True)
    shared_with_ids = update_data.pop('shared_with_ids', None)
    admin_ids = update_data.pop('admin_ids', None)
    update_data.pop('shared_with', None)
    if 'manual_rate' in update_data:
        del update_data['manual_rate']
    if extra_data:
        update_data.update(extra_data)

    membership = await sharing.get_membership(db, expense_id, user_id)

    if membership:
        if isinstance(membership, (tuple, list)):
            share, member = membership
            mem_role = getattr(member, 'role', None)
            mem_share_id = getattr(share, 'id', getattr(member, 'share_id', None))
        else:
            share = getattr(membership, 'share', None)
            member = membership
            mem_role = getattr(membership, 'role', None)
            mem_share_id = getattr(membership, 'share_id', None)

        if 'category' in update_data:
            new_cat = update_data.pop('category')
            member.local_category = new_cat
            if db_expense.user_id == user_id:
                db_expense.category = new_cat

        changing_fields = {k: v for k, v in update_data.items() if getattr(db_expense, k, None) != v}
        if changing_fields:
            sharing.require_admin(member)
            for key, value in changing_fields.items():
                setattr(db_expense, key, value)
            await db.flush()

        if shared_with_ids is not None and (mem_role in ("owner", "admin") or (share and share.owner_id == user_id)):
            share_obj = (await db.get(models.Share, mem_share_id)) if mem_share_id else share
            if share_obj:
                await sharing.sync_share_members(db, share_obj, user_id, db_expense, shared_with_ids, admin_ids=admin_ids)
    else:
        for key, value in update_data.items():
            setattr(db_expense, key, value)
        await db.flush()

        if shared_with_ids:
            clean_targets = [tid for tid in shared_with_ids if tid != user_id]
            if clean_targets:
                await sharing.assert_can_add(db, user_id, clean_targets)
                share = await sharing.create_share(
                    db=db,
                    entity_type="fixed_expense",
                    owner_id=user_id,
                    owner_entity=db_expense,
                    target_ids=clean_targets,
                    admin_ids=admin_ids or []
                )

                user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
                user_prof = user_prof_res.scalars().first()
                user_name = user_prof.display_name if user_prof and user_prof.display_name else "Alguien"

                await sharing.notify_members(
                    db=db,
                    share_id=share.id,
                    exclude_user_id=user_id,
                    title="Nuevo gasto fijo compartido",
                    body=f"{user_name} compartió un gasto fijo contigo: {db_expense.name}",
                    type="shared_fe_created",
                    url="/herramientas/gastos-fijos"
                )
    
    await db.commit()
    _exp = db.expire_all()
    if hasattr(_exp, "__await__"):
        await _exp
    return await get_fixed_expense(db, expense_id, user_id)


async def delete_fixed_expense(db: AsyncSession, expense_id: UUID, user_id: UUID, month_year: Optional[str] = None):
    db_expense = await get_fixed_expense(db, expense_id, user_id)
    if not db_expense:
        return False

    membership = await sharing.get_membership(db, expense_id, user_id)
    if membership:
        share, member = membership
        if member.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Solo un administrador puede eliminar el gasto fijo compartido. Si deseas dejar de verlo, usa la opción 'Salir'."
            )

    checks = db_expense.checks or []
    if not month_year:
        month_year = datetime.now(timezone.utc).strftime("%Y-%m")

    year, month = map(int, month_year.split('-'))
    start_of_target_month = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    end_of_prev_month = start_of_target_month - timedelta(microseconds=1)

    prior_checks = [c for c in checks if c.month_year < month_year]
    checks_to_remove = [c for c in checks if c.month_year >= month_year]

    # Clean up local expense entries created by checks being removed in target/future months
    for c in checks_to_remove:
        if c.expense_id:
            exp_res = await db.execute(select(models.Expense).where(models.Expense.id == c.expense_id))
            exp = exp_res.scalars().first()
            if exp:
                await db.delete(exp)
        await db.delete(c)

    if not prior_checks:
        # Full deletion: no prior checks exist at all
        if membership:
            share, _ = membership
            user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
            user_prof = user_prof_res.scalars().first()
            user_name = user_prof.display_name if user_prof and user_prof.display_name else "Usuario"
            expense_name = db_expense.name

            await sharing.notify_members(
                db=db,
                share_id=share.id,
                exclude_user_id=user_id,
                title="Gasto fijo compartido eliminado",
                body=f"{user_name} eliminó el gasto fijo compartido '{expense_name}' para todos los integrantes",
                type="shared_fe_deleted",
                url="/herramientas/gastos-fijos"
            )

            await db.delete(db_expense)
            await db.delete(share)
        else:
            await db.delete(db_expense)

        await db.commit()
        return True
    else:
        # Prior checks exist: Soft-deactivate starting from this month
        db_expense.is_active = False
        db_expense.deactivated_at = end_of_prev_month

        if membership:
            share, _ = membership
            user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
            user_prof = user_prof_res.scalars().first()
            user_name = user_prof.display_name if user_prof and user_prof.display_name else "Usuario"
            expense_name = db_expense.name

            await sharing.notify_members(
                db=db,
                share_id=share.id,
                exclude_user_id=user_id,
                title="Gasto fijo compartido finalizado",
                body=f"{user_name} dio de baja el gasto fijo compartido '{expense_name}' a partir de {month_year}",
                type="shared_fe_deleted",
                url="/herramientas/gastos-fijos"
            )

        await db.commit()
        return True


async def get_fixed_expenses_summary(db: AsyncSession, user_id: UUID, month_year: str = None):
    if not month_year:
        month_year = datetime.now(timezone.utc).strftime("%Y-%m")

    year, month = map(int, month_year.split('-'))
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    _, last_day = calendar.monthrange(year, month)
    end_date = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    user_scope = or_(
        models.FixedExpense.user_id == user_id,
        models.FixedExpense.id.in_(sharing.shared_entity_ids_subquery(user_id, "fixed_expense"))
    )

    active_condition = and_(
        user_scope,
        models.FixedExpense.is_active == True,
        models.FixedExpense.created_at <= end_date,
        or_(
            models.FixedExpense.deactivated_at == None,
            models.FixedExpense.deactivated_at >= start_date
        )
    )

    count_result = await db.execute(
        select(func.count(models.FixedExpense.id)).filter(active_condition)
    )
    total_active = count_result.scalar() or 0

    paid_result = await db.execute(
        select(func.count(models.FixedExpenseCheck.id))
        .join(models.FixedExpense, models.FixedExpenseCheck.fixed_expense_id == models.FixedExpense.id)
        .filter(user_scope)
        .filter(models.FixedExpenseCheck.month_year == month_year)
    )
    total_paid = paid_result.scalar() or 0
    total_pending = max(total_active - total_paid, 0)

    sum_result = await db.execute(
        select(
            func.coalesce(func.sum(models.FixedExpense.amount_bs), 0),
            func.coalesce(func.sum(models.FixedExpense.amount_usd), 0),
            func.coalesce(func.sum(models.FixedExpense.amount_eur), 0),
            func.coalesce(func.sum(models.FixedExpense.amount_usdt), 0),
        )
        .filter(active_condition)
    )
    total_bs, total_usd, total_eur, total_usdt = sum_result.first()

    return schemas.FixedExpenseSummary(
        total_active=total_active,
        total_paid=total_paid,
        total_pending=total_pending,
        total_bs=total_bs,
        total_usd=total_usd,
        total_eur=total_eur,
        total_usdt=total_usdt,
    )


# ── Fixed Expense Checks (payment history) ──────────────────────────

async def check_fixed_expense(
    db: AsyncSession,
    fixed_expense_id: UUID,
    check_data: schemas.FixedExpenseCheckCreate,
    extra_data: dict = None,
    expense_id: UUID = None,
    user_id: UUID = None,
):
    data = check_data.model_dump(exclude_unset=True)
    if 'manual_rate' in data:
        del data['manual_rate']
    if extra_data:
        data.update(extra_data)
    if expense_id:
        data['expense_id'] = expense_id

    payer_name = "Usuario"
    if user_id:
        payer_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        payer_prof = payer_prof_res.scalars().first()
        if payer_prof and payer_prof.display_name:
            payer_name = payer_prof.display_name

    data['paid_by_name'] = data.get('paid_by_name') or payer_name
    data['paid_by_user_id'] = user_id
    sync_uuid = uuid4()
    data['sync_id'] = sync_uuid
    
    db_check = models.FixedExpenseCheck(**data, fixed_expense_id=fixed_expense_id)
    db.add(db_check)
    await db.flush()

    # Update legacy last_paid_month
    expense_res = await db.execute(
        select(models.FixedExpense)
        .options(selectinload(models.FixedExpense.checks))
        .filter(models.FixedExpense.id == fixed_expense_id)
    )
    fe = expense_res.scalars().first()
    if fe:
        fe.last_paid_month = check_data.month_year

    membership = await sharing.get_membership(db, fixed_expense_id, user_id)

    if membership:
        share, _ = membership
        expense_name = fe.name if fe else "Gasto Fijo"
        await sharing.notify_members(
            db=db,
            share_id=share.id,
            exclude_user_id=user_id,
            title="Gasto fijo pagado",
            body=f"{payer_name} pagó '{expense_name}' de {check_data.month_year}",
            type="shared_fe_paid",
            url="/herramientas/gastos-fijos"
        )

    await db.commit()
    _exp = db.expire_all()
    if hasattr(_exp, "__await__"):
        await _exp
    await db.refresh(db_check)
    return db_check


async def update_fixed_expense_check(
    db: AsyncSession,
    check_id: UUID,
    user_id: UUID,
    check_update: schemas.FixedExpenseCheckUpdate,
    extra_data: dict = None
):
    result = await db.execute(
        select(models.FixedExpenseCheck)
        .join(models.FixedExpense, models.FixedExpenseCheck.fixed_expense_id == models.FixedExpense.id)
        .filter(
            models.FixedExpenseCheck.id == check_id,
            or_(
                models.FixedExpense.user_id == user_id,
                models.FixedExpense.id.in_(sharing.shared_entity_ids_subquery(user_id, "fixed_expense"))
            )
        )
    )
    check = result.scalars().first()
    if not check:
        return None

    membership = await sharing.get_membership(db, check.fixed_expense_id, user_id)
    if membership:
        share, member = membership
        if not sharing.can_edit_child(member, check.paid_by_user_id):
            raise HTTPException(status_code=403, detail="Solo puedes editar los pagos que tú registraste o debes ser administrador")

    update_dict = check_update.model_dump(exclude_unset=True)
    manual_rate = update_dict.pop('manual_rate', None)

    if extra_data is None and ('paid_amount' in update_dict or 'currency' in update_dict):
        new_amount = update_dict.get('paid_amount', check.paid_amount)
        raw_curr = update_dict.get('currency', check.currency)
        new_curr = raw_curr.value if hasattr(raw_curr, "value") else str(raw_curr)
        rates = await bcv_service.get_all_rates()
        extra_data = bcv_service.convert_amount(
            amount=new_amount,
            currency=new_curr,
            rates=rates,
            manual_rate=manual_rate
        )

    if extra_data:
        update_dict.update(extra_data)

    for k, v in update_dict.items():
        setattr(check, k, v)
    await db.flush()

    if check.expense_id:
        exp_res = await db.execute(select(models.Expense).where(models.Expense.id == check.expense_id))
        linked_exp = exp_res.scalars().first()
        if linked_exp:
            if 'paid_amount' in update_dict:
                linked_exp.amount = update_dict['paid_amount']
            if 'currency' in update_dict:
                linked_exp.currency = update_dict['currency'].value if hasattr(update_dict['currency'], 'value') else str(update_dict['currency'])
            for key in ["amount_usd", "amount_bs", "amount_eur", "amount_usdt", "rate_usd_bs", "rate_eur_bs", "rate_usdt_bs"]:
                if key in update_dict:
                    setattr(linked_exp, key, update_dict[key])

    await db.commit()
    _exp = db.expire_all()
    if hasattr(_exp, "__await__"):
        await _exp
    await db.refresh(check)
    return check


async def uncheck_fixed_expense(db: AsyncSession, fixed_expense_id: UUID, month_year: str, user_id: UUID = None):
    result = await db.execute(
        select(models.FixedExpenseCheck).filter(
            models.FixedExpenseCheck.fixed_expense_id == fixed_expense_id,
            models.FixedExpenseCheck.month_year == month_year,
        )
    )
    check = result.scalars().first()
    if not check:
        return None, None
    
    expense_id = check.expense_id

    membership = await sharing.get_membership(db, fixed_expense_id, user_id)

    if membership:
        share, member = membership
        if user_id and not sharing.can_edit_child(member, check.paid_by_user_id):
            raise HTTPException(status_code=403, detail="Solo puedes desmarcar pagos que tú realizaste o debes ser administrador")

    if expense_id:
        exp_res = await db.execute(select(models.Expense).where(models.Expense.id == expense_id))
        exp_obj = exp_res.scalars().first()
        if exp_obj:
            await db.delete(exp_obj)
        expense_id = None

    await db.delete(check)

    exp = await db.execute(select(models.FixedExpense).where(models.FixedExpense.id == fixed_expense_id))
    fe_item = exp.scalars().first()
    if fe_item and fe_item.last_paid_month == month_year:
        fe_item.last_paid_month = None

    await db.commit()
    _exp = db.expire_all()
    if hasattr(_exp, "__await__"):
        await _exp
    return True, expense_id


async def get_monthly_fixed_expenses(db: AsyncSession, user_id: UUID, month_year: str):
    year, month = map(int, month_year.split('-'))
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    _, last_day = calendar.monthrange(year, month)
    end_date = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    user_scope = or_(
        models.FixedExpense.user_id == user_id,
        models.FixedExpense.id.in_(sharing.shared_entity_ids_subquery(user_id, "fixed_expense"))
    )

    query = (
        select(models.FixedExpense)
        .options(selectinload(models.FixedExpense.checks))
        .outerjoin(models.FixedExpenseCheck, 
                   (models.FixedExpenseCheck.fixed_expense_id == models.FixedExpense.id) & 
                   (models.FixedExpenseCheck.month_year == month_year))
        .filter(
            user_scope,
            models.FixedExpense.created_at <= end_date,
            or_(
                models.FixedExpense.deactivated_at == None,
                models.FixedExpense.deactivated_at >= start_date,
                models.FixedExpenseCheck.id != None
            )
        )
        .order_by(models.FixedExpense.payment_day.asc().nullslast(), models.FixedExpense.created_at.desc())
    )
    result = await db.execute(query)
    expenses = result.scalars().unique().all()
    await sharing.populate_share_meta(db, expenses, user_id, "fixed_expense")
    return expenses
