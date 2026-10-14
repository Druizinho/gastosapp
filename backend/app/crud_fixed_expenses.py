from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException
from . import models, schemas
from decimal import Decimal
from datetime import datetime, timezone, timedelta
import calendar
from .push_service import send_notification_to_user


async def _populate_shared_info(db: AsyncSession, expenses: List[models.FixedExpense], user_id: UUID) -> List[models.FixedExpense]:
    if not expenses:
        return expenses
    
    fe_ids = [e.id for e in expenses]
    shared_result = await db.execute(
        select(models.SharedFixedExpense).where(
            or_(
                models.SharedFixedExpense.fixed_expense_id.in_(fe_ids),
                models.SharedFixedExpense.mirror_expense_id.in_(fe_ids)
            )
        )
    )
    shared_records = shared_result.scalars().all()
    if not shared_records:
        for e in expenses:
            e.is_shared = False
            e.shared_partner_name = None
            e.shared_by = None
        return expenses

    profile_ids = set()
    for s in shared_records:
        profile_ids.add(s.owner_id)
        profile_ids.add(s.partner_id)
        
    profiles_result = await db.execute(
        select(models.Profile).where(models.Profile.id.in_(profile_ids))
    )
    profiles = {p.id: p for p in profiles_result.scalars().all()}

    shared_by_fe_id = {}
    for s in shared_records:
        shared_by_fe_id[s.fixed_expense_id] = s
        if s.mirror_expense_id:
            shared_by_fe_id[s.mirror_expense_id] = s

    for e in expenses:
        if e.id in shared_by_fe_id:
            s = shared_by_fe_id[e.id]
            is_owner = s.owner_id == user_id
            partner_id = s.partner_id if is_owner else s.owner_id
            partner_profile = profiles.get(partner_id)
            owner_profile = profiles.get(s.owner_id)

            e.is_shared = True
            e.shared_partner_name = partner_profile.display_name if partner_profile and partner_profile.display_name else "Usuario"
            e.shared_by = owner_profile.display_name if owner_profile and owner_profile.display_name else "Usuario"
        else:
            e.is_shared = False
            e.shared_partner_name = None
            e.shared_by = None

    return expenses


async def create_fixed_expense(db: AsyncSession, expense: schemas.FixedExpenseCreate, user_id: UUID, extra_data: dict = None):
    shared_with = expense.shared_with
    data = expense.model_dump(exclude_unset=True, exclude={'shared_with'})
    if 'manual_rate' in data:
        del data['manual_rate']
    if extra_data:
        data.update(extra_data)

    if shared_with:
        # Validate connection
        conn_res = await db.execute(
            select(models.Connection).where(
                models.Connection.status == 'accepted',
                or_(
                    and_(models.Connection.requester_id == user_id, models.Connection.receiver_id == shared_with),
                    and_(models.Connection.receiver_id == user_id, models.Connection.requester_id == shared_with)
                )
            )
        )
        if not conn_res.scalars().first():
            raise HTTPException(status_code=400, detail="El usuario seleccionado no es una conexión aceptada")

        # Get profiles
        requester_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        requester_prof = requester_prof_res.scalars().first()
        req_name = requester_prof.display_name if requester_prof and requester_prof.display_name else "Alguien"

        # Create primary fixed expense
        db_expense = models.FixedExpense(**data, user_id=user_id)
        db.add(db_expense)
        await db.flush()

        # Create identical mirror fixed expense for partner
        mirror_data = {
            **data,
            "user_id": shared_with
        }
        db_mirror = models.FixedExpense(**mirror_data)
        db.add(db_mirror)
        await db.flush()

        # Link in shared_fixed_expenses
        shared_record = models.SharedFixedExpense(
            fixed_expense_id=db_expense.id,
            owner_id=user_id,
            partner_id=shared_with,
            mirror_expense_id=db_mirror.id
        )
        db.add(shared_record)

        # Notify partner
        await notify_shared_fixed_expense_created(
            db=db,
            partner_id=shared_with,
            creator_name=req_name,
            expense_name=expense.name
        )

        await db.commit()
        await db.refresh(db_expense)
        return await get_fixed_expense(db, db_expense.id, user_id)
    else:
        db_expense = models.FixedExpense(**data, user_id=user_id)
        db.add(db_expense)
        await db.commit()
        await db.refresh(db_expense)
        return await get_fixed_expense(db, db_expense.id, user_id)


async def get_fixed_expenses(db: AsyncSession, user_id: UUID, active_only: bool = False):
    query = select(models.FixedExpense).options(selectinload(models.FixedExpense.checks)).filter(models.FixedExpense.user_id == user_id)
    
    if active_only:
        query = query.filter(models.FixedExpense.is_active == True)
    
    query = query.order_by(models.FixedExpense.payment_day.asc().nullslast(), models.FixedExpense.created_at.desc())
    result = await db.execute(query)
    expenses = result.scalars().unique().all()
    await _populate_shared_info(db, expenses, user_id)
    return expenses


async def get_fixed_expense(db: AsyncSession, expense_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.FixedExpense)
        .options(selectinload(models.FixedExpense.checks))
        .filter(
            models.FixedExpense.id == expense_id,
            models.FixedExpense.user_id == user_id
        )
    )
    fe = result.scalars().first()
    if fe:
        await _populate_shared_info(db, [fe], user_id)
    return fe


async def update_fixed_expense(db: AsyncSession, expense_id: UUID, expense: schemas.FixedExpenseUpdate, user_id: UUID, extra_data: dict = None):
    db_expense = await get_fixed_expense(db, expense_id, user_id)
    if not db_expense:
        return None
    
    update_data = expense.model_dump(exclude_unset=True)
    shared_with = update_data.pop('shared_with', None)
    if 'manual_rate' in update_data:
        del update_data['manual_rate']
    if extra_data:
        update_data.update(extra_data)

    # Check if this fixed expense is shared
    shared_res = await db.execute(
        select(models.SharedFixedExpense).where(
            or_(
                models.SharedFixedExpense.fixed_expense_id == expense_id,
                models.SharedFixedExpense.mirror_expense_id == expense_id
            )
        )
    )
    shared_record = shared_res.scalars().first()

    if shared_record:
        # Sync changes to mirror expense as well
        mirror_id = shared_record.mirror_expense_id if shared_record.fixed_expense_id == expense_id else shared_record.fixed_expense_id
        if mirror_id:
            mirror_res = await db.execute(select(models.FixedExpense).where(models.FixedExpense.id == mirror_id))
            mirror_expense = mirror_res.scalars().first()
            if mirror_expense:
                for key, value in update_data.items():
                    setattr(mirror_expense, key, value)
    elif shared_with:
        # Fixed expense was not shared previously, but user is sharing it now
        conn_res = await db.execute(
            select(models.Connection).where(
                models.Connection.status == 'accepted',
                or_(
                    and_(models.Connection.requester_id == user_id, models.Connection.receiver_id == shared_with),
                    and_(models.Connection.receiver_id == user_id, models.Connection.requester_id == shared_with)
                )
            )
        )
        if not conn_res.scalars().first():
            raise HTTPException(status_code=400, detail="El usuario seleccionado no es una conexión aceptada")

        for key, value in update_data.items():
            setattr(db_expense, key, value)
        await db.flush()

        requester_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        requester_prof = requester_prof_res.scalars().first()
        req_name = requester_prof.display_name if requester_prof and requester_prof.display_name else "Alguien"

        mirror_data = {
            "name": db_expense.name,
            "amount": db_expense.amount,
            "currency": db_expense.currency,
            "amount_usd": db_expense.amount_usd,
            "amount_bs": db_expense.amount_bs,
            "amount_eur": db_expense.amount_eur,
            "amount_usdt": db_expense.amount_usdt,
            "rate_usd_bs": db_expense.rate_usd_bs,
            "rate_eur_bs": db_expense.rate_eur_bs,
            "rate_usdt_bs": db_expense.rate_usdt_bs,
            "category": db_expense.category,
            "payment_day": db_expense.payment_day,
            "is_active": db_expense.is_active,
            "notes": db_expense.notes,
            "user_id": shared_with
        }
        db_mirror = models.FixedExpense(**mirror_data)
        db.add(db_mirror)
        await db.flush()

        shared_record = models.SharedFixedExpense(
            fixed_expense_id=db_expense.id,
            owner_id=user_id,
            partner_id=shared_with,
            mirror_expense_id=db_mirror.id
        )
        db.add(shared_record)

        # Copy existing checks to mirror fixed expense if any exist
        for c in db_expense.checks:
            mirror_c_data = {
                "fixed_expense_id": db_mirror.id,
                "month_year": c.month_year,
                "paid_amount": c.paid_amount,
                "currency": c.currency,
                "amount_usd": c.amount_usd,
                "amount_bs": c.amount_bs,
                "amount_eur": c.amount_eur,
                "amount_usdt": c.amount_usdt,
                "rate_usd_bs": c.rate_usd_bs,
                "rate_eur_bs": c.rate_eur_bs,
                "rate_usdt_bs": c.rate_usdt_bs,
                "paid_date": c.paid_date,
                "create_expense": False,
                "notes": c.notes,
                "paid_by_name": c.paid_by_name or req_name,
                "mirror_check_id": c.id
            }
            db_mirror_c = models.FixedExpenseCheck(**mirror_c_data)
            db.add(db_mirror_c)
            await db.flush()
            c.mirror_check_id = db_mirror_c.id

        await notify_shared_fixed_expense_created(
            db=db,
            partner_id=shared_with,
            creator_name=req_name,
            expense_name=db_expense.name
        )

        await db.commit()
        return await get_fixed_expense(db, expense_id, user_id)
    
    for key, value in update_data.items():
        setattr(db_expense, key, value)
    
    await db.commit()
    return await get_fixed_expense(db, expense_id, user_id)


async def delete_fixed_expense(db: AsyncSession, expense_id: UUID, user_id: UUID, month_year: Optional[str] = None):
    db_expense = await get_fixed_expense(db, expense_id, user_id)
    if not db_expense:
        return False

    checks = db_expense.checks or []
    if not month_year:
        month_year = datetime.now(timezone.utc).strftime("%Y-%m")

    year, month = map(int, month_year.split('-'))
    start_of_target_month = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    end_of_prev_month = start_of_target_month - timedelta(microseconds=1)

    prior_checks = [c for c in checks if c.month_year < month_year]
    checks_to_remove = [c for c in checks if c.month_year >= month_year]

    # Clean up expenses created by checks being removed in target/future months
    for c in checks_to_remove:
        if c.expense_id:
            exp_res = await db.execute(select(models.Expense).where(models.Expense.id == c.expense_id))
            exp = exp_res.scalars().first()
            if exp:
                await db.delete(exp)
        await db.delete(c)

    shared_res = await db.execute(
        select(models.SharedFixedExpense).where(
            or_(
                models.SharedFixedExpense.fixed_expense_id == expense_id,
                models.SharedFixedExpense.mirror_expense_id == expense_id
            )
        )
    )
    shared_record = shared_res.scalars().first()

    if not prior_checks:
        # Full deletion: no prior historical checks exist at all
        if shared_record:
            partner_id = shared_record.partner_id if shared_record.owner_id == user_id else shared_record.owner_id
            user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
            user_prof = user_prof_res.scalars().first()
            user_name = user_prof.display_name if user_prof and user_prof.display_name else "Usuario"
            expense_name = db_expense.name

            mirror_id = shared_record.mirror_expense_id if shared_record.fixed_expense_id == expense_id else shared_record.fixed_expense_id
            if mirror_id:
                mirror_res = await db.execute(select(models.FixedExpense).where(models.FixedExpense.id == mirror_id))
                mirror_fe = mirror_res.scalars().first()
                if mirror_fe:
                    await db.delete(mirror_fe)
            await db.delete(shared_record)

            await send_notification_to_user(
                db=db,
                user_id=partner_id,
                title="Gasto fijo compartido eliminado",
                body=f"{user_name} eliminó el gasto fijo compartido '{expense_name}'",
                type="shared_fe_deleted",
                url="/gastos-fijos"
            )

        await db.delete(db_expense)
        await db.commit()
        return True
    else:
        # Prior checks exist: Soft-deactivate starting from this month!
        db_expense.is_active = False
        db_expense.deactivated_at = end_of_prev_month

        if shared_record:
            mirror_id = shared_record.mirror_expense_id if shared_record.fixed_expense_id == expense_id else shared_record.fixed_expense_id
            if mirror_id:
                mirror_res = await db.execute(select(models.FixedExpense).where(models.FixedExpense.id == mirror_id))
                mirror_fe = mirror_res.scalars().first()
                if mirror_fe:
                    mirror_fe.is_active = False
                    mirror_fe.deactivated_at = end_of_prev_month
                    mirror_checks_to_remove = [mc for mc in (mirror_fe.checks or []) if mc.month_year >= month_year]
                    for mc in mirror_checks_to_remove:
                        if mc.expense_id:
                            exp_res = await db.execute(select(models.Expense).where(models.Expense.id == mc.expense_id))
                            exp = exp_res.scalars().first()
                            if exp:
                                await db.delete(exp)
                        await db.delete(mc)

            partner_id = shared_record.partner_id if shared_record.owner_id == user_id else shared_record.owner_id
            user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
            user_prof = user_prof_res.scalars().first()
            user_name = user_prof.display_name if user_prof and user_prof.display_name else "Usuario"
            expense_name = db_expense.name

            await send_notification_to_user(
                db=db,
                user_id=partner_id,
                title="Gasto fijo compartido finalizado",
                body=f"{user_name} dio de baja el gasto fijo compartido '{expense_name}' a partir de {month_year}",
                type="shared_fe_deleted",
                url="/gastos-fijos"
            )

        await db.commit()
        return True


async def get_fixed_expenses_summary(db: AsyncSession, user_id: UUID, month_year: str = None):
    """Calculate summary of active fixed expenses including paid/pending counts for the specific month."""
    if not month_year:
        month_year = datetime.now(timezone.utc).strftime("%Y-%m")

    year, month = map(int, month_year.split('-'))
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    _, last_day = calendar.monthrange(year, month)
    end_date = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    # Condition for fixed expenses active during this specific month
    active_condition = and_(
        models.FixedExpense.user_id == user_id,
        models.FixedExpense.is_active == True,
        models.FixedExpense.created_at <= end_date,
        or_(
            models.FixedExpense.deactivated_at == None,
            models.FixedExpense.deactivated_at >= start_date
        )
    )

    # Count active
    count_result = await db.execute(
        select(func.count(models.FixedExpense.id))
        .filter(active_condition)
    )
    total_active = count_result.scalar() or 0

    # Count paid this month (from checks table)
    paid_result = await db.execute(
        select(func.count(models.FixedExpenseCheck.id))
        .join(models.FixedExpense, models.FixedExpenseCheck.fixed_expense_id == models.FixedExpense.id)
        .filter(models.FixedExpense.user_id == user_id)
        .filter(models.FixedExpenseCheck.month_year == month_year)
    )
    total_paid = paid_result.scalar() or 0
    total_pending = max(total_active - total_paid, 0)

    # Sum by currency equivalents (only active for this month)
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
    """Mark a fixed expense as paid for a given month and sync check to partner if shared."""
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
    
    db_check = models.FixedExpenseCheck(**data, fixed_expense_id=fixed_expense_id)
    db.add(db_check)
    await db.flush()

    # Also update legacy last_paid_month for backward compatibility
    expense_res = await db.execute(
        select(models.FixedExpense)
        .options(selectinload(models.FixedExpense.checks))
        .filter(models.FixedExpense.id == fixed_expense_id)
    )
    fe = expense_res.scalars().first()
    if fe:
        fe.last_paid_month = check_data.month_year

    # Check if this fixed expense is shared
    shared_res = await db.execute(
        select(models.SharedFixedExpense).where(
            or_(
                models.SharedFixedExpense.fixed_expense_id == fixed_expense_id,
                models.SharedFixedExpense.mirror_expense_id == fixed_expense_id
            )
        )
    )
    shared_record = shared_res.scalars().first()

    if shared_record:
        is_owner = shared_record.owner_id == (user_id or (fe.user_id if fe else user_id))
        partner_id = shared_record.partner_id if is_owner else shared_record.owner_id
        mirror_fe_id = shared_record.mirror_expense_id if shared_record.fixed_expense_id == fixed_expense_id else shared_record.fixed_expense_id

        if mirror_fe_id:
            # Check if mirror check already exists
            existing_mirror_check = await db.execute(
                select(models.FixedExpenseCheck).where(
                    models.FixedExpenseCheck.fixed_expense_id == mirror_fe_id,
                    models.FixedExpenseCheck.month_year == check_data.month_year
                )
            )
            mirror_check = existing_mirror_check.scalars().first()
            if not mirror_check:
                mirror_check_data = {
                    **data,
                    "fixed_expense_id": mirror_fe_id,
                    "expense_id": None,  # Partner does not get expense deduction in their wallet
                    "create_expense": False,
                    "mirror_check_id": db_check.id,
                    "paid_by_name": payer_name
                }
                db_mirror_check = models.FixedExpenseCheck(**mirror_check_data)
                db.add(db_mirror_check)
                await db.flush()
                db_check.mirror_check_id = db_mirror_check.id

                # Update mirror expense legacy last_paid_month
                mirror_fe_res = await db.execute(select(models.FixedExpense).where(models.FixedExpense.id == mirror_fe_id))
                mirror_fe = mirror_fe_res.scalars().first()
                if mirror_fe:
                    mirror_fe.last_paid_month = check_data.month_year

            # Send push notification to partner
            expense_name = fe.name if fe else "Gasto Fijo"
            await notify_shared_fixed_expense_check(
                db=db,
                partner_id=partner_id,
                payer_name=payer_name,
                expense_name=expense_name,
                month_year=check_data.month_year
            )

    await db.commit()
    await db.refresh(db_check)
    return db_check


async def uncheck_fixed_expense(db: AsyncSession, fixed_expense_id: UUID, month_year: str):
    """Remove the paid mark for a fixed expense for a given month. Returns the expense_id if one was created."""
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
    mirror_check_id = check.mirror_check_id

    # If this check has a mirror check, delete it
    if mirror_check_id:
        mirror_check_res = await db.execute(
            select(models.FixedExpenseCheck).where(models.FixedExpenseCheck.id == mirror_check_id)
        )
        mirror_check = mirror_check_res.scalars().first()
        if mirror_check:
            m_fe_id = mirror_check.fixed_expense_id
            await db.delete(mirror_check)
            await db.flush()

            m_fe_res = await db.execute(select(models.FixedExpense).where(models.FixedExpense.id == m_fe_id))
            m_fe = m_fe_res.scalars().first()
            if m_fe and m_fe.last_paid_month == month_year:
                m_fe.last_paid_month = None

    # Check if any other check pointed to this check as mirror_check_id
    reverse_checks = await db.execute(
        select(models.FixedExpenseCheck).where(models.FixedExpenseCheck.mirror_check_id == check.id)
    )
    for rc in reverse_checks.scalars().all():
        m_fe_id = rc.fixed_expense_id
        await db.delete(rc)
        await db.flush()
        m_fe_res = await db.execute(select(models.FixedExpense).where(models.FixedExpense.id == m_fe_id))
        m_fe = m_fe_res.scalars().first()
        if m_fe and m_fe.last_paid_month == month_year:
            m_fe.last_paid_month = None

    await db.delete(check)

    # Update legacy last_paid_month
    expense = await db.execute(
        select(models.FixedExpense)
        .options(selectinload(models.FixedExpense.checks))
        .filter(models.FixedExpense.id == fixed_expense_id)
    )
    fe = expense.scalars().first()
    if fe and fe.last_paid_month == month_year:
        fe.last_paid_month = None

    await db.commit()
    return True, expense_id


async def get_monthly_fixed_expenses(db: AsyncSession, user_id: UUID, month_year: str):
    """Get all fixed expenses with their check status for a specific month."""
    year, month = map(int, month_year.split('-'))
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    _, last_day = calendar.monthrange(year, month)
    end_date = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    query = (
        select(models.FixedExpense)
        .options(selectinload(models.FixedExpense.checks))
        .outerjoin(models.FixedExpenseCheck, 
                   (models.FixedExpenseCheck.fixed_expense_id == models.FixedExpense.id) & 
                   (models.FixedExpenseCheck.month_year == month_year))
        .filter(
            models.FixedExpense.user_id == user_id,
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
    await _populate_shared_info(db, expenses, user_id)
    return expenses


async def notify_shared_fixed_expense_check(
    db: AsyncSession,
    partner_id: UUID,
    payer_name: str,
    expense_name: str,
    month_year: str
):
    """Notifica al partner que se ha marcado como pagado un gasto fijo compartido."""
    await send_notification_to_user(
        db=db,
        user_id=partner_id,
        title="Gasto fijo pagado",
        body=f"{payer_name} pagó '{expense_name}' de {month_year}",
        type="shared_fe_paid",
        url="/gastos-fijos"
    )


async def notify_shared_fixed_expense_created(
    db: AsyncSession,
    partner_id: UUID,
    creator_name: str,
    expense_name: str
):
    """Notifica al partner que se ha creado/compartido un gasto fijo con él."""
    await send_notification_to_user(
        db=db,
        user_id=partner_id,
        title="Nuevo gasto fijo compartido",
        body=f"{creator_name} compartió un gasto fijo contigo: {expense_name}",
        type="shared_fe_created",
        url="/gastos-fijos"
    )
