from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_, and_, delete, text, func
from uuid import UUID
from typing import List, Optional
from datetime import datetime, timezone
from decimal import Decimal
import time
from collections import defaultdict

from . import models, schemas, sharing, crud_budgets
from .push_service import send_push_notification, send_notification_to_user

_connection_request_history = defaultdict(list)
_RATE_LIMIT_WINDOW_SECONDS = 60
_MAX_REQUESTS_PER_WINDOW = 5

def _check_connection_rate_limit(user_id: UUID) -> bool:
    now = time.time()
    user_times = _connection_request_history[str(user_id)]
    valid_times = [t for t in user_times if now - t < _RATE_LIMIT_WINDOW_SECONDS]
    _connection_request_history[str(user_id)] = valid_times
    if len(valid_times) >= _MAX_REQUESTS_PER_WINDOW:
        return False
    _connection_request_history[str(user_id)].append(now)
    return True

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
    # SEC-09: Prevenir enumeración masiva de correos mediante rate limiting
    if not _check_connection_rate_limit(requester_id):
        return None, "Has realizado demasiadas solicitudes en poco tiempo. Por favor espera un minuto antes de reintentar."

    clean_email = (target_email or "").strip().lower()
    target = await find_user_by_email(db, clean_email)
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

    other_user_id = conn.receiver_id if conn.requester_id == user_id else conn.requester_id

    # Disolver shares bipersonales entre estos dos usuarios para evitar sincronizaciones no autorizadas
    shared_res = await db.execute(
        select(models.ShareMember.share_id)
        .where(models.ShareMember.user_id.in_([user_id, other_user_id]))
        .group_by(models.ShareMember.share_id)
        .having(func.count(models.ShareMember.user_id) == 2)
    )
    candidate_share_ids = shared_res.scalars().all()
    for sid in candidate_share_ids:
        all_m_res = await db.execute(
            select(func.count(models.ShareMember.user_id)).where(models.ShareMember.share_id == sid)
        )
        if all_m_res.scalar() == 2:
            share_obj = await db.get(models.Share, sid)
            if share_obj:
                await db.delete(share_obj)
        
    await db.delete(conn)
    await db.commit()
    return True


async def create_connection_request_by_user_id(db: AsyncSession, requester_id: UUID, target_user_id: UUID):
    if requester_id == target_user_id:
        return None, "No puedes conectarte contigo mismo"

    # Verify they share at least one item via share_members
    co_share_res = await db.execute(
        text("""
            SELECT 1
            FROM share_members sm1
            JOIN share_members sm2 ON sm1.share_id = sm2.share_id
            WHERE sm1.user_id = :u1 AND sm2.user_id = :u2
            LIMIT 1
        """),
        {"u1": requester_id, "u2": target_user_id}
    )
    if not co_share_res.first():
        return None, "Solo puedes enviar solicitudes directas a compañeros de ítems compartidos"

    existing_res = await db.execute(
        select(models.Connection).where(
            or_(
                and_(models.Connection.requester_id == requester_id, models.Connection.receiver_id == target_user_id),
                and_(models.Connection.requester_id == target_user_id, models.Connection.receiver_id == requester_id)
            )
        )
    )
    existing = existing_res.scalars().first()
    if existing:
        if existing.status == "accepted":
            return None, "Ya son panas"
        elif existing.status == "pending":
            return None, "Ya existe una solicitud pendiente con este usuario"
        elif existing.status == "rejected":
            existing.status = "pending"
            existing.requester_id = requester_id
            existing.receiver_id = target_user_id
            existing.updated_at = datetime.now(timezone.utc)
            conn = existing
        else:
            return None, "Ya existe una conexión registrada"
    else:
        conn = models.Connection(
            requester_id=requester_id,
            receiver_id=target_user_id,
            status="pending"
        )
        db.add(conn)

    await db.flush()

    prof_res = await db.execute(select(models.Profile).where(models.Profile.id == requester_id))
    prof = prof_res.scalars().first()
    sender_name = prof.display_name if prof and prof.display_name else "Alguien"

    await send_notification_to_user(
        db=db,
        user_id=target_user_id,
        title="Nueva solicitud de pana",
        body=f"{sender_name} te envió una solicitud para conectarse como panas",
        type="connection_request",
        url="/herramientas/panas"
    )

    await db.commit()
    await db.refresh(conn)

    profiles_res = await db.execute(
        select(models.Profile).where(models.Profile.id.in_([requester_id, target_user_id]))
    )
    profiles = {p.id: p for p in profiles_res.scalars().all()}
    return _populate_connection_response(conn, requester_id, profiles), None


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
    if not connections:
        return schemas.PanasGlobalOverview(
            panas=[],
            total_active_panas=0,
            total_shared_fixed_expenses=0,
            pending_shared_fixed_expenses_this_month=0,
            total_shared_debts=0,
            shared_debts_remaining_by_currency={},
            total_shared_saving_goals=0
        )

    partner_ids = [
        (c.receiver_id if c.requester_id == user_id else c.requester_id)
        for c in connections
    ]

    # Batch-fetch profiles for all partners
    prof_res = await db.execute(select(models.Profile).where(models.Profile.id.in_(partner_ids)))
    profiles_by_id = {p.id: p for p in prof_res.scalars().all()}

    # Batch-fetch emails from auth.users
    email_res = await db.execute(
        text("SELECT id, email FROM auth.users WHERE id = ANY(:pids)"),
        {"pids": partner_ids}
    )
    emails_by_id = {row.id: row.email for row in email_res.all()}

    # Batch-fetch all shares where user_id is a member, along with all ShareMembers in those shares
    my_share_ids_subq = select(models.ShareMember.share_id).where(models.ShareMember.user_id == user_id)
    all_sm_res = await db.execute(
        select(models.Share, models.ShareMember)
        .join(models.ShareMember, models.Share.id == models.ShareMember.share_id)
        .where(models.Share.id.in_(my_share_ids_subq))
    )
    all_sm_rows = all_sm_res.all()

    share_by_id = {}
    my_entity_by_share = {}
    member_uids_by_share = {}

    for share_obj, sm_obj in all_sm_rows:
        share_by_id[share_obj.id] = share_obj
        member_uids_by_share.setdefault(share_obj.id, set()).add(sm_obj.user_id)
        if sm_obj.user_id == user_id:
            my_entity_by_share[share_obj.id] = sm_obj.entity_id

    # Collect user_id's entity IDs by type for bulk loading
    fe_entity_ids = [
        eid for sid, eid in my_entity_by_share.items()
        if share_by_id[sid].entity_type == "fixed_expense"
    ]
    debt_entity_ids = [
        eid for sid, eid in my_entity_by_share.items()
        if share_by_id[sid].entity_type == "debt"
    ]

    fe_by_id = {}
    if fe_entity_ids:
        fe_res = await db.execute(
            select(models.FixedExpense)
            .options(selectinload(models.FixedExpense.checks))
            .where(models.FixedExpense.id.in_(fe_entity_ids))
        )
        fe_by_id = {fe.id: fe for fe in fe_res.scalars().unique().all()}

    debt_by_id = {}
    if debt_entity_ids:
        debt_res = await db.execute(
            select(models.Debt)
            .options(selectinload(models.Debt.payments))
            .where(models.Debt.id.in_(debt_entity_ids))
        )
        debt_by_id = {d.id: d for d in debt_res.scalars().unique().all()}

    panas_summaries: List[schemas.PanaSummary] = []
    seen_fe_ids = set()
    seen_pending_fe_ids = set()
    seen_debt_ids = set()
    seen_goal_ids = set()
    global_debts_currency_summary: dict = {}

    for conn in connections:
        partner_id = conn.receiver_id if conn.requester_id == user_id else conn.requester_id
        prof = profiles_by_id.get(partner_id)
        partner_name = prof.display_name if prof and prof.display_name else "Pana"
        partner_email = emails_by_id.get(partner_id)

        shared_fe_count = 0
        pending_fe_count = 0
        shared_debts_count = 0
        shared_goals_count = 0
        shared_sub_budgets_count = 0
        pana_debts_currency_summary = {}

        for sid, share_obj in share_by_id.items():
            if partner_id not in member_uids_by_share.get(sid, set()):
                continue
            my_entity_id = my_entity_by_share.get(sid)
            if not my_entity_id:
                continue

            if share_obj.entity_type == "fixed_expense":
                fe = fe_by_id.get(my_entity_id)
                if fe and fe.is_active:
                    shared_fe_count += 1
                    seen_fe_ids.add(fe.id)
                    paid_this_month = any(c.month_year == current_month_str for c in (fe.checks or []))
                    if not paid_this_month:
                        pending_fe_count += 1
                        seen_pending_fe_ids.add(fe.id)

            elif share_obj.entity_type == "debt":
                debt = debt_by_id.get(my_entity_id)
                if debt and not debt.is_settled:
                    shared_debts_count += 1
                    paid = sharing.sum_children_in_currency(debt.payments, debt.currency or "BS", "amount")
                    rem = max(Decimal(str(debt.total_amount)) - paid, Decimal("0"))
                    curr = debt.currency or "BS"
                    pana_debts_currency_summary[curr] = pana_debts_currency_summary.get(curr, Decimal("0")) + rem

                    if debt.id not in seen_debt_ids:
                        seen_debt_ids.add(debt.id)
                        global_debts_currency_summary[curr] = global_debts_currency_summary.get(curr, Decimal("0")) + rem

            elif share_obj.entity_type == "saving_goal":
                shared_goals_count += 1
                seen_goal_ids.add(my_entity_id)

            elif share_obj.entity_type == "sub_budget":
                shared_sub_budgets_count += 1

        total_remaining = sum(pana_debts_currency_summary.values()) if pana_debts_currency_summary else Decimal("0")

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
                shared_saving_goals_count=shared_goals_count,
                shared_sub_budgets_count=shared_sub_budgets_count
            )
        )

    return schemas.PanasGlobalOverview(
        panas=panas_summaries,
        total_active_panas=len(panas_summaries),
        total_shared_fixed_expenses=len(seen_fe_ids),
        pending_shared_fixed_expenses_this_month=len(seen_pending_fe_ids),
        total_shared_debts=len(seen_debt_ids),
        shared_debts_remaining_by_currency=global_debts_currency_summary,
        total_shared_saving_goals=len(seen_goal_ids)
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

    # Query all shares between user_id and partner_id
    shares_res = await db.execute(
        select(models.Share, models.ShareMember.entity_id)
        .join(models.ShareMember, models.Share.id == models.ShareMember.share_id)
        .where(
            models.ShareMember.user_id == user_id,
            models.Share.id.in_(
                select(models.ShareMember.share_id).where(models.ShareMember.user_id == partner_id)
            )
        )
    )
    shared_rows = shares_res.all()

    share_ids = [s.id for s, _ in shared_rows]
    members_by_share = {}
    all_member_uids = set()
    if share_ids:
        sm_res = await db.execute(
            select(models.ShareMember)
            .where(models.ShareMember.share_id.in_(share_ids))
            .order_by(models.ShareMember.joined_at.asc())
        )
        for sm in sm_res.scalars().all():
            members_by_share.setdefault(sm.share_id, []).append(sm)
            all_member_uids.add(sm.user_id)

    member_profiles = {}
    if all_member_uids:
        mprof_res = await db.execute(select(models.Profile).where(models.Profile.id.in_(all_member_uids)))
        member_profiles = {p.id: p for p in mprof_res.scalars().all()}

    fe_entity_ids = [eid for s, eid in shared_rows if s.entity_type == "fixed_expense"]
    debt_entity_ids = [eid for s, eid in shared_rows if s.entity_type == "debt"]
    goal_entity_ids = [eid for s, eid in shared_rows if s.entity_type == "saving_goal"]

    fe_by_id = {}
    if fe_entity_ids:
        fe_res = await db.execute(
            select(models.FixedExpense)
            .options(selectinload(models.FixedExpense.checks))
            .where(models.FixedExpense.id.in_(fe_entity_ids))
        )
        fe_by_id = {fe.id: fe for fe in fe_res.scalars().unique().all()}

    debt_by_id = {}
    if debt_entity_ids:
        debt_res = await db.execute(
            select(models.Debt)
            .options(selectinload(models.Debt.payments))
            .where(models.Debt.id.in_(debt_entity_ids))
        )
        debt_by_id = {d.id: d for d in debt_res.scalars().unique().all()}

    goal_by_id = {}
    if goal_entity_ids:
        goal_res = await db.execute(
            select(models.SavingGoal)
            .options(selectinload(models.SavingGoal.deposits))
            .where(models.SavingGoal.id.in_(goal_entity_ids))
        )
        goal_by_id = {g.id: g for g in goal_res.scalars().unique().all()}

    if fe_by_id:
        await sharing.populate_share_meta(db, list(fe_by_id.values()), user_id, "fixed_expense")
    if debt_by_id:
        await sharing.populate_share_meta(db, list(debt_by_id.values()), user_id, "debt")
    if goal_by_id:
        await sharing.populate_share_meta(db, list(goal_by_id.values()), user_id, "saving_goal")

    fe_briefs: List[schemas.SharedFixedExpenseBrief] = []
    debt_briefs: List[schemas.SharedDebtBrief] = []
    goal_briefs: List[schemas.SharedSavingGoalBrief] = []
    sub_budget_briefs: List[schemas.SharedSubBudgetBrief] = []

    for share_obj, my_entity_id in shared_rows:
        s_members = members_by_share.get(share_obj.id, [])
        m_count = len(s_members) if s_members else 2
        m_names = [
            ("Tú" if sm.user_id == user_id else (member_profiles.get(sm.user_id).display_name if member_profiles.get(sm.user_id) and member_profiles.get(sm.user_id).display_name else "Pana"))
            for sm in s_members
        ]

        if share_obj.entity_type == "fixed_expense":
            fe = fe_by_id.get(my_entity_id)
            if not fe:
                continue

            chk = next((c for c in (fe.checks or []) if c.month_year == current_month_str), None)

            fe_briefs.append(
                schemas.SharedFixedExpenseBrief(
                    id=fe.id,
                    name=fe.name,
                    amount=Decimal(str(fe.amount)),
                    currency=fe.currency or "BS",
                    category=fe.category,
                    payment_day=fe.payment_day,
                    is_active=fe.is_active,
                    is_paid_this_month=bool(chk is not None),
                    paid_by_name=chk.paid_by_name if chk else None,
                    paid_date=chk.paid_date if chk else None,
                    members_count=m_count,
                    member_names=m_names
                )
            )

        elif share_obj.entity_type == "debt":
            debt = debt_by_id.get(my_entity_id)
            if not debt:
                continue

            paid = sharing.sum_children_in_currency(debt.payments, debt.currency or "BS", "amount")
            remaining = max(Decimal(str(debt.total_amount)) - paid, Decimal("0"))
            paid_pct = float(min(round((paid / Decimal(str(debt.total_amount))) * 100, 1), 100.0)) if debt.total_amount > 0 else 100.0

            last_payment = None
            if debt.payments:
                sorted_payments = sorted(debt.payments, key=lambda x: x.payment_date or datetime.min.date(), reverse=True)
                last_payment = sorted_payments[0]

            debt_briefs.append(
                schemas.SharedDebtBrief(
                    id=debt.id,
                    concept=debt.concept,
                    counterpart=debt.counterpart,
                    total_amount=Decimal(str(debt.total_amount)),
                    remaining_amount=remaining,
                    currency=debt.currency or "BS",
                    type=debt.type,
                    is_settled=debt.is_settled,
                    paid_percentage=paid_pct,
                    last_payment_by=last_payment.paid_by_name if last_payment else None,
                    last_payment_date=last_payment.payment_date if last_payment else None,
                    members_count=m_count,
                    member_names=m_names
                )
            )

        elif share_obj.entity_type == "saving_goal":
            g = goal_by_id.get(my_entity_id)
            if not g:
                continue

            curr_amount = sharing.sum_children_in_currency(g.deposits, g.currency or "BS", "amount")
            if g.target_amount and g.target_amount > 0:
                prog_pct = float(min(round((curr_amount / Decimal(str(g.target_amount))) * 100, 1), 100.0))
            else:
                prog_pct = 0.0

            last_dep = None
            if g.deposits:
                sorted_deps = sorted(g.deposits, key=lambda x: x.deposit_date or datetime.min.date(), reverse=True)
                last_dep = sorted_deps[0]

            goal_briefs.append(
                schemas.SharedSavingGoalBrief(
                    id=g.id,
                    name=g.name,
                    target_amount=Decimal(str(g.target_amount)) if g.target_amount is not None else None,
                    type=getattr(g, 'type', 'saving') or 'saving',
                    current_amount=curr_amount,
                    currency=g.currency,
                    category=g.category,
                    color=g.color,
                    icon=g.icon,
                    is_completed=g.is_completed,
                    progress_percentage=prog_pct,
                    last_deposit_by=last_dep.paid_by_name if last_dep else None,
                    last_deposit_amount=Decimal(str(last_dep.amount)) if last_dep else None,
                    last_deposit_date=last_dep.deposit_date if last_dep else None,
                    members_count=m_count,
                    member_names=m_names
                )
            )

        elif share_obj.entity_type == "sub_budget":
            anchor_budget = await db.get(models.MonthlyBudget, my_entity_id)
            if not anchor_budget and s_members:
                for sm in s_members:
                    anchor_budget = await db.get(models.MonthlyBudget, sm.entity_id)
                    if anchor_budget:
                        break
            if not anchor_budget:
                continue

            owner_view = await crud_budgets.get_monthly_budget_view(
                db, share_obj.owner_id, current_month_str, allow_auto_clone=True, include_shared_with_me=False
            )
            target_sb = None
            for sb in owner_view.budgets:
                if not sb.is_primary and (sb.id == anchor_budget.id or sb.name.strip().lower() == anchor_budget.name.strip().lower()):
                    target_sb = sb
                    break

            if target_sb:
                curr_val = target_sb.currency.value if hasattr(target_sb.currency, "value") else str(target_sb.currency)
                tl_val = target_sb.global_traffic_light.value if hasattr(target_sb.global_traffic_light, "value") else str(target_sb.global_traffic_light)
                is_mine = (share_obj.owner_id == user_id)
                owner_p = member_profiles.get(share_obj.owner_id)
                owner_disp = "Tú" if is_mine else (owner_p.display_name if owner_p and owner_p.display_name else "Pana")

                sub_budget_briefs.append(
                    schemas.SharedSubBudgetBrief(
                        id=target_sb.id,
                        name=target_sb.name,
                        month_year=current_month_str,
                        currency=curr_val,
                        effective_global_limit=float(target_sb.effective_global_limit or 0.0),
                        total_spent_budget_currency=float(target_sb.total_spent_budget_currency or 0.0),
                        global_spent_percentage=float(target_sb.global_spent_percentage or 0.0),
                        global_traffic_light=tl_val,
                        categories_count=len(target_sb.category_limits),
                        is_mine=is_mine,
                        owner_name=owner_disp,
                        members_count=m_count,
                        member_names=m_names
                    )
                )

    return schemas.PanaDetail(
        connection_id=conn.id,
        partner_id=partner_id,
        partner_name=partner_name,
        partner_email=partner_email,
        shared_fixed_expenses=fe_briefs,
        shared_debts=debt_briefs,
        shared_saving_goals=goal_briefs,
        shared_sub_budgets=sub_budget_briefs
    )

