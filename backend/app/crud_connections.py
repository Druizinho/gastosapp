from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_, delete, text
from uuid import UUID
from typing import List, Optional
from datetime import datetime, timezone

from . import models, schemas
from .push_service import send_push_notification, send_notification_to_user

async def find_user_by_email(db: AsyncSession, email: str) -> Optional[schemas.UserSearchResult]:
    result = await db.execute(
        text("SELECT id, email FROM auth.users WHERE email = :email"),
        {"email": email}
    )
    auth_user = result.first()
    if not auth_user:
        return None
        
    auth_id = auth_user.id
    
    profile_result = await db.execute(
        select(models.Profile).where(models.Profile.id == auth_id)
    )
    profile = profile_result.scalars().first()
    
    display_name = profile.display_name if profile and profile.display_name else auth_user.email
    
    return schemas.UserSearchResult(
        id=auth_id,
        display_name=display_name,
        email=auth_user.email
    )

def _populate_connection_response(conn: models.Connection, user_id: UUID, profiles: dict) -> schemas.ConnectionResponse:
    is_requester = conn.requester_id == user_id
    partner_id = conn.receiver_id if is_requester else conn.requester_id
    partner = profiles.get(partner_id)
    partner_name = partner.display_name if partner and partner.display_name else "Usuario"
    
    return schemas.ConnectionResponse(
        id=conn.id,
        requester_id=conn.requester_id,
        receiver_id=conn.receiver_id,
        status=conn.status,
        created_at=conn.created_at,
        updated_at=conn.updated_at,
        partner_id=partner_id,
        partner_name=partner_name,
        is_requester=is_requester
    )

async def get_connections(db: AsyncSession, user_id: UUID) -> List[schemas.ConnectionResponse]:
    result = await db.execute(
        select(models.Connection).where(
            or_(
                models.Connection.requester_id == user_id,
                models.Connection.receiver_id == user_id
            )
        ).order_by(models.Connection.created_at.desc())
    )
    connections = result.scalars().all()
    
    # Get all involved profiles
    partner_ids = set()
    for c in connections:
        partner_ids.add(c.receiver_id if c.requester_id == user_id else c.requester_id)
        
    if not partner_ids:
        return []
        
    profiles_result = await db.execute(
        select(models.Profile).where(models.Profile.id.in_(partner_ids))
    )
    profiles = {p.id: p for p in profiles_result.scalars().all()}
    
    return [_populate_connection_response(c, user_id, profiles) for c in connections]

async def create_connection_request(db: AsyncSession, requester_id: UUID, target_email: str):
    target = await find_user_by_email(db, target_email)
    if not target:
        return None, "Usuario no encontrado"
        
    if target.id == requester_id:
        return None, "No puedes conectarte contigo mismo"
        
    # Check if connection already exists
    existing = await db.execute(
        select(models.Connection).where(
            or_(
                and_(models.Connection.requester_id == requester_id, models.Connection.receiver_id == target.id),
                and_(models.Connection.requester_id == target.id, models.Connection.receiver_id == requester_id)
            )
        )
    )
    if existing.scalars().first():
        return None, "Ya existe una conexión o solicitud pendiente con este usuario"
        
    conn = models.Connection(
        requester_id=requester_id,
        receiver_id=target.id,
        status='pending'
    )
    db.add(conn)
    
    # Send notification
    requester_profile_res = await db.execute(select(models.Profile).where(models.Profile.id == requester_id))
    requester_profile = requester_profile_res.scalars().first()
    req_name = requester_profile.display_name if requester_profile and requester_profile.display_name else "Alguien"
    
    await send_notification_to_user(
        db, target.id, "Nueva solicitud de conexión", f"{req_name} quiere conectar contigo", "connection_request", url="/herramientas/panas"
    )
    
    await db.commit()
    await db.refresh(conn)
    
    profiles = {target.id: models.Profile(id=target.id, display_name=target.display_name)}
    return _populate_connection_response(conn, requester_id, profiles), None

async def accept_connection(db: AsyncSession, connection_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.Connection).where(
            models.Connection.id == connection_id,
            models.Connection.receiver_id == user_id,
            models.Connection.status == 'pending'
        )
    )
    conn = result.scalars().first()
    if not conn:
        return None
        
    conn.status = 'accepted'
    conn.updated_at = datetime.now(timezone.utc)
    
    # Send notification to requester
    receiver_profile_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
    receiver_profile = receiver_profile_res.scalars().first()
    rec_name = receiver_profile.display_name if receiver_profile and receiver_profile.display_name else "Alguien"
    
    await send_notification_to_user(
        db, conn.requester_id, "Solicitud aceptada", f"{rec_name} aceptó tu solicitud de conexión", "connection_accepted", url="/herramientas/panas"
    )
    
    await db.commit()
    await db.refresh(conn)
    
    req_profile_res = await db.execute(select(models.Profile).where(models.Profile.id == conn.requester_id))
    profiles = {conn.requester_id: req_profile_res.scalars().first()}
    
    return _populate_connection_response(conn, user_id, profiles)

async def reject_connection(db: AsyncSession, connection_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.Connection).where(
            models.Connection.id == connection_id,
            models.Connection.receiver_id == user_id,
            models.Connection.status == 'pending'
        )
    )
    conn = result.scalars().first()
    if not conn:
        return False
        
    conn.status = 'rejected'
    conn.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return True

from decimal import Decimal
from sqlalchemy.orm import selectinload

async def delete_connection(db: AsyncSession, connection_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.Connection).where(
            models.Connection.id == connection_id,
            or_(
                models.Connection.requester_id == user_id,
                models.Connection.receiver_id == user_id
            )
        )
    )
    conn = result.scalars().first()
    if not conn:
        return False
        
    await db.delete(conn)
    await db.commit()
    return True

async def get_panas_overview(db: AsyncSession, user_id: UUID) -> schemas.PanasGlobalOverview:
    now = datetime.now(timezone.utc)
    current_month_str = f"{now.year}-{now.month:02d}"

    result = await db.execute(
        select(models.Connection).where(
            models.Connection.status == 'accepted',
            or_(
                models.Connection.requester_id == user_id,
                models.Connection.receiver_id == user_id
            )
        ).order_by(models.Connection.created_at.desc())
    )
    connections = result.scalars().all()

    panas_summaries: List[schemas.PanaSummary] = []
    total_shared_fixed_expenses = 0
    pending_shared_fe_this_month = 0
    total_shared_debts = 0
    global_debts_currency_summary: dict = {}

    for conn in connections:
        partner_id = conn.receiver_id if conn.requester_id == user_id else conn.requester_id

        prof_res = await db.execute(select(models.Profile).where(models.Profile.id == partner_id))
        prof = prof_res.scalars().first()
        partner_name = prof.display_name if prof and prof.display_name else "Pana"

        email_res = await db.execute(
            text("SELECT email FROM auth.users WHERE id = :pid"),
            {"pid": partner_id}
        )
        email_row = email_res.first()
        partner_email = email_row.email if email_row else None

        # Shared fixed expenses
        shared_fe_res = await db.execute(
            select(models.SharedFixedExpense).where(
                or_(
                    and_(models.SharedFixedExpense.owner_id == user_id, models.SharedFixedExpense.partner_id == partner_id),
                    and_(models.SharedFixedExpense.owner_id == partner_id, models.SharedFixedExpense.partner_id == user_id)
                )
            )
        )
        shared_fes = shared_fe_res.scalars().all()

        shared_fe_count = 0
        pending_fe_count = 0

        for s_fe in shared_fes:
            my_fe_id = s_fe.fixed_expense_id if s_fe.owner_id == user_id else s_fe.mirror_expense_id
            fe_res = await db.execute(select(models.FixedExpense).where(models.FixedExpense.id == my_fe_id))
            fe = fe_res.scalars().first()
            if fe and fe.is_active:
                shared_fe_count += 1
                total_shared_fixed_expenses += 1

                chk_res = await db.execute(
                    select(models.FixedExpenseCheck).where(
                        models.FixedExpenseCheck.fixed_expense_id == my_fe_id,
                        models.FixedExpenseCheck.month_year == current_month_str
                    )
                )
                if not chk_res.scalars().first():
                    pending_fe_count += 1
                    pending_shared_fe_this_month += 1

        # Shared debts
        shared_debts_res = await db.execute(
            select(models.SharedDebt).where(
                or_(
                    and_(models.SharedDebt.owner_id == user_id, models.SharedDebt.partner_id == partner_id),
                    and_(models.SharedDebt.owner_id == partner_id, models.SharedDebt.partner_id == user_id)
                )
            )
        )
        shared_debts = shared_debts_res.scalars().all()

        shared_debts_count = 0
        pana_debts_currency_summary = {}

        for s_d in shared_debts:
            my_debt_id = s_d.debt_id if s_d.owner_id == user_id else s_d.mirror_debt_id
            debt_res = await db.execute(
                select(models.Debt)
                .options(selectinload(models.Debt.payments))
                .where(models.Debt.id == my_debt_id)
            )
            debt = debt_res.scalars().first()
            if debt and not debt.is_settled:
                shared_debts_count += 1
                total_shared_debts += 1

                paid = sum(Decimal(p.amount) for p in debt.payments)
                rem = max(Decimal(debt.total_amount) - paid, Decimal(0))

                curr = debt.currency or "BS"
                pana_debts_currency_summary[curr] = pana_debts_currency_summary.get(curr, Decimal(0)) + rem
                global_debts_currency_summary[curr] = global_debts_currency_summary.get(curr, Decimal(0)) + rem

        total_remaining = sum(pana_debts_currency_summary.values()) if pana_debts_currency_summary else Decimal(0)

        # Shared saving goals
        shared_goals_res = await db.execute(
            select(models.SharedSavingGoal).where(
                or_(
                    and_(models.SharedSavingGoal.owner_id == user_id, models.SharedSavingGoal.partner_id == partner_id),
                    and_(models.SharedSavingGoal.owner_id == partner_id, models.SharedSavingGoal.partner_id == user_id)
                )
            )
        )
        shared_goals_count = len(shared_goals_res.scalars().all())

        panas_summaries.append(
            schemas.PanaSummary(
                id=conn.id,
                partner_id=partner_id,
                partner_name=partner_name,
                partner_email=partner_email,
                status=conn.status,
                created_at=conn.created_at,
                shared_fixed_expenses_count=shared_fe_count,
                pending_fixed_expenses_this_month=pending_fe_count,
                shared_debts_count=shared_debts_count,
                total_debts_remaining=total_remaining,
                debts_currency_summary=pana_debts_currency_summary,
                shared_saving_goals_count=shared_goals_count
            )
        )

    total_shared_saving_goals = sum(p.shared_saving_goals_count for p in panas_summaries)

    return schemas.PanasGlobalOverview(
        panas=panas_summaries,
        total_active_panas=len(panas_summaries),
        total_shared_fixed_expenses=total_shared_fixed_expenses,
        pending_shared_fixed_expenses_this_month=pending_shared_fe_this_month,
        total_shared_debts=total_shared_debts,
        shared_debts_remaining_by_currency=global_debts_currency_summary,
        total_shared_saving_goals=total_shared_saving_goals
    )

async def get_pana_details(db: AsyncSession, user_id: UUID, partner_id: UUID) -> Optional[schemas.PanaDetail]:
    now = datetime.now(timezone.utc)
    current_month_str = f"{now.year}-{now.month:02d}"

    conn_res = await db.execute(
        select(models.Connection).where(
            models.Connection.status == 'accepted',
            or_(
                and_(models.Connection.requester_id == user_id, models.Connection.receiver_id == partner_id),
                and_(models.Connection.receiver_id == user_id, models.Connection.requester_id == partner_id)
            )
        )
    )
    conn = conn_res.scalars().first()
    if not conn:
        return None

    prof_res = await db.execute(select(models.Profile).where(models.Profile.id == partner_id))
    prof = prof_res.scalars().first()
    partner_name = prof.display_name if prof and prof.display_name else "Pana"

    email_res = await db.execute(
        text("SELECT email FROM auth.users WHERE id = :pid"),
        {"pid": partner_id}
    )
    email_row = email_res.first()
    partner_email = email_row.email if email_row else None

    # Shared fixed expenses
    shared_fe_res = await db.execute(
        select(models.SharedFixedExpense).where(
            or_(
                and_(models.SharedFixedExpense.owner_id == user_id, models.SharedFixedExpense.partner_id == partner_id),
                and_(models.SharedFixedExpense.owner_id == partner_id, models.SharedFixedExpense.partner_id == user_id)
            )
        )
    )
    shared_fes = shared_fe_res.scalars().all()

    fe_briefs: List[schemas.SharedFixedExpenseBrief] = []
    for s_fe in shared_fes:
        my_fe_id = s_fe.fixed_expense_id if s_fe.owner_id == user_id else s_fe.mirror_expense_id
        fe_res = await db.execute(select(models.FixedExpense).where(models.FixedExpense.id == my_fe_id))
        fe = fe_res.scalars().first()
        if not fe:
            continue

        chk_res = await db.execute(
            select(models.FixedExpenseCheck).where(
                models.FixedExpenseCheck.fixed_expense_id == my_fe_id,
                models.FixedExpenseCheck.month_year == current_month_str
            )
        )
        chk = chk_res.scalars().first()

        fe_briefs.append(
            schemas.SharedFixedExpenseBrief(
                id=fe.id,
                name=fe.name,
                amount=Decimal(fe.amount),
                currency=fe.currency or "BS",
                category=fe.category,
                payment_day=fe.payment_day,
                is_active=fe.is_active,
                is_paid_this_month=bool(chk is not None),
                paid_by_name=chk.paid_by_name if chk else None,
                paid_date=chk.paid_date if chk else None
            )
        )

    # Shared debts
    shared_debts_res = await db.execute(
        select(models.SharedDebt).where(
            or_(
                and_(models.SharedDebt.owner_id == user_id, models.SharedDebt.partner_id == partner_id),
                and_(models.SharedDebt.owner_id == partner_id, models.SharedDebt.partner_id == user_id)
            )
        )
    )
    shared_debts = shared_debts_res.scalars().all()

    debt_briefs: List[schemas.SharedDebtBrief] = []
    for s_d in shared_debts:
        my_debt_id = s_d.debt_id if s_d.owner_id == user_id else s_d.mirror_debt_id
        debt_res = await db.execute(
            select(models.Debt)
            .options(selectinload(models.Debt.payments))
            .where(models.Debt.id == my_debt_id)
        )
        debt = debt_res.scalars().first()
        if not debt:
            continue

        paid = sum(Decimal(p.amount) for p in debt.payments)
        remaining = max(Decimal(debt.total_amount) - paid, Decimal(0))
        paid_pct = float(min(round((paid / Decimal(debt.total_amount)) * 100, 1), 100.0)) if debt.total_amount > 0 else 100.0

        last_payment = None
        if debt.payments:
            sorted_payments = sorted(debt.payments, key=lambda x: x.payment_date or datetime.min.date(), reverse=True)
            last_payment = sorted_payments[0]

        debt_briefs.append(
            schemas.SharedDebtBrief(
                id=debt.id,
                concept=debt.concept,
                counterpart=debt.counterpart,
                total_amount=Decimal(debt.total_amount),
                remaining_amount=remaining,
                currency=debt.currency or "BS",
                type=debt.type,
                is_settled=debt.is_settled,
                paid_percentage=paid_pct,
                last_payment_by=last_payment.paid_by_name if last_payment else None,
                last_payment_date=last_payment.payment_date if last_payment else None
            )
        )

    # Shared saving goals
    shared_goals_res = await db.execute(
        select(models.SharedSavingGoal).where(
            or_(
                and_(models.SharedSavingGoal.owner_id == user_id, models.SharedSavingGoal.partner_id == partner_id),
                and_(models.SharedSavingGoal.owner_id == partner_id, models.SharedSavingGoal.partner_id == user_id)
            )
        )
    )
    shared_goals = shared_goals_res.scalars().all()

    goal_briefs: List[schemas.SharedSavingGoalBrief] = []
    for s_g in shared_goals:
        my_goal_id = s_g.goal_id if s_g.owner_id == user_id else s_g.mirror_goal_id
        goal_res = await db.execute(
            select(models.SavingGoal)
            .options(selectinload(models.SavingGoal.deposits))
            .where(models.SavingGoal.id == my_goal_id)
        )
        g = goal_res.scalars().first()
        if not g:
            continue

        curr_amount = Decimal('0')
        for d in g.deposits:
            if d.currency == g.currency:
                curr_amount += Decimal(str(d.amount))
            elif g.currency in ['USD_BCV', 'USD_CASH'] and d.amount_usd:
                curr_amount += Decimal(str(d.amount_usd))
            elif g.currency == 'BS' and d.amount_bs:
                curr_amount += Decimal(str(d.amount_bs))
            elif g.currency == 'EUR_BCV' and d.amount_eur:
                curr_amount += Decimal(str(d.amount_eur))
            elif g.currency == 'USDT' and d.amount_usdt:
                curr_amount += Decimal(str(d.amount_usdt))
            else:
                curr_amount += Decimal(str(d.amount))

        prog_pct = float(min(round((curr_amount / Decimal(str(g.target_amount))) * 100, 1), 100.0)) if g.target_amount > 0 else 100.0

        last_dep = None
        if g.deposits:
            sorted_deps = sorted(g.deposits, key=lambda x: x.deposit_date or datetime.date.min, reverse=True)
            last_dep = sorted_deps[0]

        goal_briefs.append(
            schemas.SharedSavingGoalBrief(
                id=g.id,
                name=g.name,
                target_amount=Decimal(g.target_amount),
                current_amount=curr_amount,
                currency=g.currency,
                category=g.category,
                color=g.color,
                icon=g.icon,
                is_completed=g.is_completed,
                progress_percentage=prog_pct,
                last_deposit_by=last_dep.paid_by_name if last_dep else None,
                last_deposit_amount=Decimal(last_dep.amount) if last_dep else None,
                last_deposit_date=last_dep.deposit_date if last_dep else None
            )
        )

    return schemas.PanaDetail(
        connection_id=conn.id,
        partner_id=partner_id,
        partner_name=partner_name,
        partner_email=partner_email,
        shared_fixed_expenses=fe_briefs,
        shared_debts=debt_briefs,
        shared_saving_goals=goal_briefs
    )

