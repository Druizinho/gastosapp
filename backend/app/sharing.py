import uuid
from uuid import UUID
from typing import List, Dict, Optional, Set, Any, Tuple
from decimal import Decimal
from datetime import datetime, timezone, date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value
from sqlalchemy import or_, and_, delete, text, update, func
from fastapi import HTTPException

from . import models, schemas
from .push_service import send_notification_to_user

# Configuration of entity models and child models
ENTITY_CONFIG = {
    "debt": {
        "model": models.Debt,
        "child_model": models.DebtPayment,
        "child_fk": "debt_id",
        "child_attr": "payments",
        "name_attr": "concept",
        "label": "deuda",
        "url": "/herramientas/deudas-nuestras",
    },
    "fixed_expense": {
        "model": models.FixedExpense,
        "child_model": models.FixedExpenseCheck,
        "child_fk": "fixed_expense_id",
        "child_attr": "checks",
        "name_attr": "name",
        "label": "gasto fijo",
        "url": "/herramientas/gastos-fijos",
    },
    "saving_goal": {
        "model": models.SavingGoal,
        "child_model": models.SavingDeposit,
        "child_fk": "goal_id",
        "child_attr": "deposits",
        "name_attr": "name",
        "label": "meta de ahorro",
        "url": "/herramientas/ahorros",
    },
    "sub_budget": {
        "model": models.MonthlyBudget,
        "child_model": None,
        "child_fk": None,
        "child_attr": None,
        "name_attr": "name",
        "label": "un sub-presupuesto compartido",
        "url": "/herramientas/presupuestos",
    },
}


# ==============================================================================
# Helper & Connection queries
# ==============================================================================

async def are_panas(db: AsyncSession, a: UUID, b: UUID) -> bool:
    if a == b:
        return True
    res = await db.execute(
        select(models.Connection).where(
            models.Connection.status == 'accepted',
            or_(
                and_(models.Connection.requester_id == a, models.Connection.receiver_id == b),
                and_(models.Connection.requester_id == b, models.Connection.receiver_id == a),
            )
        )
    )
    return res.scalars().first() is not None


async def my_pana_ids(db: AsyncSession, user_id: UUID) -> Set[UUID]:
    res = await db.execute(
        select(models.Connection).where(
            models.Connection.status == 'accepted',
            or_(
                models.Connection.requester_id == user_id,
                models.Connection.receiver_id == user_id,
            )
        )
    )
    conns = res.scalars().all()
    return {c.receiver_id if c.requester_id == user_id else c.requester_id for c in conns}


async def assert_can_add(db: AsyncSession, actor_id: UUID, target_ids: List[UUID]):
    clean_targets = [tid for tid in target_ids if tid != actor_id]
    if not clean_targets:
        return

    if len(clean_targets) > 20:
        raise HTTPException(status_code=400, detail="No puedes agregar más de 20 integrantes a un ítem")

    accepted_panas = await my_pana_ids(db, actor_id)
    not_panas = [tid for tid in clean_targets if tid not in accepted_panas]
    if not_panas:
        raise HTTPException(
            status_code=400,
            detail="Todos los integrantes que agregas deben ser panas aceptados en tus conexiones"
        )


# ==============================================================================
# Permission & Hierarchy Checkers (R6, R7, R9)
# ==============================================================================

def require_admin(member: models.ShareMember):
    if member.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Solo los administradores o el creador pueden realizar esta acción"
        )


def can_edit_child(member: models.ShareMember, child_paid_by_user_id: Optional[UUID]) -> bool:
    if member.role == "admin":
        return True
    if child_paid_by_user_id is not None and child_paid_by_user_id == member.user_id:
        return True
    return False


def assert_can_remove_member(
    share: models.Share,
    actor_member: models.ShareMember,
    target_member: models.ShareMember
):
    # 1. Self leave is always allowed
    if actor_member.user_id == target_member.user_id:
        return

    # 2. Nobody can kick or remove the owner
    if target_member.user_id == share.owner_id:
        raise HTTPException(status_code=403, detail="No se puede expulsar al creador del ítem")

    # 3. Owner can kick anyone
    if actor_member.user_id == share.owner_id:
        return

    # 4. Admin can kick only common members
    if actor_member.role == "admin":
        if target_member.role == "admin":
            raise HTTPException(
                status_code=403,
                detail="Un administrador no puede expulsar a otro administrador"
            )
        return

    # 5. Common member cannot kick anyone
    raise HTTPException(status_code=403, detail="Solo administradores pueden expulsar integrantes")


def assert_can_change_role(
    share: models.Share,
    actor_member: models.ShareMember,
    target_member: models.ShareMember,
    new_role: str,
    all_members: Optional[List[models.ShareMember]] = None
):
    if share.entity_type == "sub_budget":
        raise HTTPException(
            status_code=400,
            detail="Los sub-presupuestos compartidos son de solo lectura."
        )

    if target_member.user_id == share.owner_id:
        raise HTTPException(status_code=403, detail="No se puede cambiar el rol del creador del ítem")

    # Owner has full control
    if actor_member.user_id == share.owner_id:
        return

    # Admin rules
    if actor_member.role == "admin":
        if target_member.role == "admin" and new_role == "member":
            # PAN-09: Permitir auto-degradación si queda al menos otro administrador
            if actor_member.user_id == target_member.user_id:
                if all_members is not None:
                    other_admins = [
                        m for m in all_members 
                        if m.role == "admin" and m.user_id != actor_member.user_id
                    ]
                    if not other_admins:
                        raise HTTPException(
                            status_code=400,
                            detail="No puedes renunciar al rol de administrador si eres el único administrador restante"
                        )
                return
            raise HTTPException(
                status_code=403,
                detail="Solo el creador puede degradar a otro administrador"
            )
        return

    raise HTTPException(status_code=403, detail="No tienes permisos para modificar roles")


# ==============================================================================
# Membership queries
# ==============================================================================

def shared_entity_ids_subquery(user_id: UUID, entity_type: str):
    return (
        select(models.ShareMember.entity_id)
        .join(models.Share, models.Share.id == models.ShareMember.share_id)
        .where(
            models.ShareMember.user_id == user_id,
            models.Share.entity_type == entity_type,
        )
    )


async def get_membership(
    db: AsyncSession,
    entity_id: UUID,
    user_id: Optional[UUID] = None
) -> Optional[Tuple[models.Share, models.ShareMember]]:
    stmt = (
        select(models.Share, models.ShareMember)
        .join(models.ShareMember, models.Share.id == models.ShareMember.share_id)
        .where(models.ShareMember.entity_id == entity_id)
    )
    if user_id is not None:
        stmt = stmt.where(models.ShareMember.user_id == user_id)
    res = await db.execute(stmt)
    row = res.first()
    if not row:
        return None
    return row[0], row[1]


async def get_members(db: AsyncSession, share_id: UUID) -> List[models.ShareMember]:
    res = await db.execute(
        select(models.ShareMember)
        .where(models.ShareMember.share_id == share_id)
        .order_by(models.ShareMember.joined_at.asc())
    )
    return res.scalars().all()


async def resolve_initial_member_category(
    db: AsyncSession,
    target_user_id: UUID,
    entity_type: str,
    owner_entity: Any
) -> str:
    if entity_type == "debt":
        default_cat = "Deudas"
    elif entity_type == "fixed_expense":
        default_cat = "Gastos Fijos"
    elif entity_type == "saving_goal":
        default_cat = "Proyectos" if getattr(owner_entity, "type", "saving") == "project" else "Ahorro"
    else:
        default_cat = "Sin Categoría"

    owner_cat = getattr(owner_entity, "category", None)
    if not owner_cat or not str(owner_cat).strip():
        return default_cat

    owner_cat = str(owner_cat).strip()
    standard_defaults = {"deudas", "gastos fijos", "proyectos", "ahorro"}
    if owner_cat.lower() in standard_defaults:
        return owner_cat

    res = await db.execute(
        select(models.Category.name).where(
            models.Category.user_id == target_user_id,
            func.lower(models.Category.name) == func.lower(owner_cat)
        )
    )
    matched_cat = res.scalars().first()
    if matched_cat:
        return matched_cat

    return default_cat


# ==============================================================================
# Share Lifecycle (Create, Add, Remove, Sync)
# ==============================================================================

async def create_share(
    db: AsyncSession,
    entity_type: str,
    owner_id: UUID,
    owner_entity: Any,
    target_ids: List[UUID],
    admin_ids: Optional[List[UUID]] = None
) -> models.Share:
    admin_set = set(admin_ids or [])
    if entity_type == "sub_budget":
        admin_set = set()
    clean_targets = list(dict.fromkeys(tid for tid in target_ids if tid and tid != owner_id))

    share = models.Share(
        entity_type=entity_type,
        owner_id=owner_id
    )
    db.add(share)
    await db.flush()

    # Add owner member
    owner_member = models.ShareMember(
        share_id=share.id,
        user_id=owner_id,
        entity_id=owner_entity.id,
        role="admin",
        added_by=owner_id,
        local_category=getattr(owner_entity, "category", None),
        perspective_type=getattr(owner_entity, "type", None) if entity_type == "debt" else None,
        counterpart_label=getattr(owner_entity, "counterpart", None) if entity_type == "debt" else None
    )
    db.add(owner_member)

    creator_name = "Mi Pana"
    if entity_type == "debt":
        creator_prof = await db.get(models.Profile, owner_id)
        if creator_prof and creator_prof.display_name:
            creator_name = creator_prof.display_name

    for tid in clean_targets:
        if entity_type == "debt":
            inv_type = "owed" if getattr(owner_entity, "type", None) == "receivable" else "receivable"
            c_label = creator_name
        else:
            inv_type = None
            c_label = None

        init_cat = await resolve_initial_member_category(db, tid, entity_type, owner_entity)

        member = models.ShareMember(
            share_id=share.id,
            user_id=tid,
            entity_id=owner_entity.id,
            role="admin" if tid in admin_set else "member",
            added_by=owner_id,
            local_category=init_cat,
            perspective_type=inv_type,
            counterpart_label=c_label
        )
        db.add(member)

    await db.flush()
    return share


async def add_members(
    db: AsyncSession,
    share: models.Share,
    actor_id: UUID,
    target_ids: List[UUID],
    admin_ids: Optional[List[UUID]] = None
):
    admin_set = set(admin_ids or [])
    if share.entity_type == "sub_budget":
        admin_set = set()
    existing_members = await get_members(db, share.id)
    existing_user_ids = {m.user_id for m in existing_members}
    new_targets = list(dict.fromkeys(tid for tid in target_ids if tid and tid not in existing_user_ids))

    if not new_targets:
        return

    await assert_can_add(db, actor_id, new_targets)

    cfg = ENTITY_CONFIG[share.entity_type]
    model_cls = cfg["model"]

    canonical_entity_res = await db.execute(
        select(model_cls).where(model_cls.id == existing_members[0].entity_id)
    )
    canonical_entity = canonical_entity_res.scalars().first()
    if not canonical_entity:
        raise HTTPException(status_code=404, detail="Entidad base no encontrada para agregar integrantes")

    owner_name = "Mi Pana"
    if share.entity_type == "debt":
        owner_prof = await db.get(models.Profile, share.owner_id)
        if owner_prof and owner_prof.display_name:
            owner_name = owner_prof.display_name

    for tid in new_targets:
        if share.entity_type == "debt":
            inv_type = "owed" if getattr(canonical_entity, "type", None) == "receivable" else "receivable"
            c_label = owner_name
        else:
            inv_type = None
            c_label = None

        init_cat = await resolve_initial_member_category(db, tid, share.entity_type, canonical_entity)

        member = models.ShareMember(
            share_id=share.id,
            user_id=tid,
            entity_id=canonical_entity.id,
            role="admin" if tid in admin_set else "member",
            added_by=actor_id,
            local_category=init_cat,
            perspective_type=inv_type,
            counterpart_label=c_label
        )
        db.add(member)

    await db.flush()


async def remove_member(db: AsyncSession, share: models.Share, user_id_to_remove: UUID):
    members = await get_members(db, share.id)
    target_member = next((m for m in members if m.user_id == user_id_to_remove), None)
    if not target_member:
        return

    cfg = ENTITY_CONFIG[share.entity_type]
    model_cls = cfg["model"]

    canonical_entity_res = await db.execute(
        select(model_cls).where(model_cls.id == target_member.entity_id)
    )
    canonical_entity = canonical_entity_res.scalars().first()

    await db.delete(target_member)
    await db.flush()

    remaining_members = [m for m in members if m.user_id != user_id_to_remove]

    if share.entity_type == "sub_budget":
        if user_id_to_remove == share.owner_id or len(remaining_members) <= 1:
            await db.delete(share)
            await db.commit()
            return None
        await db.flush()
        return None

    if remaining_members:
        if share.owner_id == user_id_to_remove:
            admins = [m for m in remaining_members if m.role == "admin"]
            new_owner_member = admins[0] if admins else remaining_members[0]
            new_owner_member.role = "admin"
            share.owner_id = new_owner_member.user_id

        if canonical_entity and canonical_entity.user_id == user_id_to_remove:
            owner_m = next((m for m in remaining_members if m.user_id == share.owner_id), remaining_members[0])
            canonical_entity.user_id = owner_m.user_id
            if owner_m.local_category:
                canonical_entity.category = owner_m.local_category
            if share.entity_type == "debt":
                if owner_m.perspective_type:
                    canonical_entity.type = owner_m.perspective_type
                if owner_m.counterpart_label:
                    canonical_entity.counterpart = owner_m.counterpart_label

    if len(remaining_members) <= 1:
        if len(remaining_members) == 1 and canonical_entity:
            last_m = remaining_members[0]
            canonical_entity.user_id = last_m.user_id
            if last_m.local_category:
                canonical_entity.category = last_m.local_category
            if share.entity_type == "debt":
                if last_m.perspective_type:
                    canonical_entity.type = last_m.perspective_type
                if last_m.counterpart_label:
                    canonical_entity.counterpart = last_m.counterpart_label
        await db.delete(share)

    await db.flush()


# ==============================================================================
# Settlement & Progress Recalculation
# ==============================================================================

def sum_children_in_currency(children: List[Any], target_currency: str, amount_attr: str = "amount") -> Decimal:
    total = Decimal("0")
    for ch in children or []:
        raw_val = getattr(ch, amount_attr, None)
        if raw_val is None:
            continue
        if ch.currency == target_currency:
            total += Decimal(str(raw_val))
        elif target_currency == "USD_BCV" and getattr(ch, "amount_usd", None) is not None:
            total += Decimal(str(ch.amount_usd))
        elif target_currency == "USD_CASH":
            # Si el pago es en USD_CASH, ya hizo match arriba (1:1).
            # Para pagos en otra moneda (BS, EUR, etc.), convertir usando la tasa efectivo de referencia
            if getattr(ch, "amount_bs", None) is not None and Decimal(str(ch.amount_bs)) > 0:
                amount_bs = Decimal(str(ch.amount_bs))
                r_usd = Decimal(str(ch.rate_usd_bs)) if getattr(ch, "rate_usd_bs", None) else Decimal("0")
                r_eur = Decimal(str(ch.rate_eur_bs)) if getattr(ch, "rate_eur_bs", None) else Decimal("0")
                r_usdt = Decimal(str(ch.rate_usdt_bs)) if getattr(ch, "rate_usdt_bs", None) else Decimal("0")
                valid_rates = [r for r in (r_usd, r_eur, r_usdt) if r > 0]
                cash_rate = max(valid_rates) if valid_rates else (r_usd if r_usd > 0 else Decimal("0"))
                if cash_rate > 0:
                    total += (amount_bs / cash_rate)
                elif getattr(ch, "amount_usd", None) is not None:
                    total += Decimal(str(ch.amount_usd))
            elif getattr(ch, "amount_usd", None) is not None:
                total += Decimal(str(ch.amount_usd))
            else:
                total += Decimal(str(raw_val))
        elif target_currency == "BS" and getattr(ch, "amount_bs", None) is not None:
            total += Decimal(str(ch.amount_bs))
        elif target_currency == "EUR_BCV" and getattr(ch, "amount_eur", None) is not None:
            total += Decimal(str(ch.amount_eur))
        elif target_currency == "USDT" and getattr(ch, "amount_usdt", None) is not None:
            total += Decimal(str(ch.amount_usdt))
        else:
            total += Decimal(str(raw_val))
    return total


async def recompute_settlement(db: AsyncSession, entity_type: str, entity_ids: List[UUID]):
    if not entity_ids:
        return
    cfg = ENTITY_CONFIG[entity_type]
    child_attr = cfg.get("child_attr")
    if not child_attr:
        return
    model_cls = cfg["model"]

    res = await db.execute(
        select(model_cls)
        .options(selectinload(getattr(model_cls, child_attr)))
        .where(model_cls.id.in_(entity_ids))
    )
    items = res.scalars().all()

    for item in items:
        if entity_type == "debt":
            total_paid = sum_children_in_currency(item.payments, item.currency, "amount")
            item.is_settled = (total_paid >= Decimal(str(item.total_amount)))

        elif entity_type == "saving_goal":
            goal_type = getattr(item, 'type', 'saving') or 'saving'
            if item.target_amount is not None and goal_type == 'saving':
                total_saved = sum_children_in_currency(item.deposits, item.currency, "amount")
                is_done = (total_saved >= Decimal(str(item.target_amount)))
                if is_done and not item.is_completed:
                    item.is_completed = True
                    item.completed_at = datetime.now(timezone.utc)
                elif not is_done and item.is_completed:
                    item.is_completed = False
                    item.completed_at = None

    await db.flush()


# ==============================================================================
# Notifications
# ==============================================================================

async def notify_members(
    db: AsyncSession,
    share_id: UUID,
    exclude_user_id: Optional[UUID],
    title: str,
    body: str,
    type: str,
    url: str
):
    members = await get_members(db, share_id)
    for m in members:
        if exclude_user_id and m.user_id == exclude_user_id:
            continue
        await send_notification_to_user(
            db=db,
            user_id=m.user_id,
            title=title,
            body=body,
            type=type,
            url=url
        )


# ==============================================================================
# Bulk Population for Lists & Details (Fast, 3-4 queries total)
# ==============================================================================

async def populate_share_meta(
    db: AsyncSession,
    entities: List[Any],
    user_id: UUID,
    entity_type: str
) -> List[Any]:
    if not entities:
        return entities

    entity_ids = [e.id for e in entities]

    # Query 1: Find all share_members for these entities
    sm_res = await db.execute(
        select(models.ShareMember).where(
            models.ShareMember.entity_id.in_(entity_ids),
            models.ShareMember.user_id == user_id
        )
    )
    my_memberships = sm_res.scalars().all()
    if not my_memberships:
        for e in entities:
            e.is_shared = False
            e.share_id = None
            e.my_role = None
            e.shared_members = []
            e.shared_partner_name = None
            e.shared_by = None
            e.owner_id = getattr(e, "user_id", None)
            e.is_read_only = False
            # can_edit defaults to True for personal items
            cfg = ENTITY_CONFIG[entity_type]
            children = (getattr(e, cfg["child_attr"], []) if cfg.get("child_attr") else []) or []
            for ch in children:
                ch.can_edit = True
        return entities

    share_ids = {m.share_id for m in my_memberships}
    my_membership_by_entity = {m.entity_id: m for m in my_memberships}

    # Query 2: All members and their shares for these share_ids
    all_sm_res = await db.execute(
        select(models.ShareMember, models.Share)
        .join(models.Share, models.ShareMember.share_id == models.Share.id)
        .where(models.ShareMember.share_id.in_(share_ids))
        .order_by(models.ShareMember.joined_at.asc())
    )
    all_sm_rows = all_sm_res.all()

    share_by_id: Dict[UUID, models.Share] = {}
    members_by_share: Dict[UUID, List[models.ShareMember]] = {}
    involved_user_ids: Set[UUID] = set()

    for sm_row, s_row in all_sm_rows:
        share_by_id[s_row.id] = s_row
        members_by_share.setdefault(s_row.id, []).append(sm_row)
        involved_user_ids.add(sm_row.user_id)

    involved_user_ids.add(user_id)

    # Query 3: Profiles for all involved users
    prof_res = await db.execute(
        select(models.Profile).where(models.Profile.id.in_(involved_user_ids))
    )
    profiles = {p.id: p for p in prof_res.scalars().all()}

    # Query 4: Connections involving user_id (for is_my_pana and pana_request_pending)
    conn_res = await db.execute(
        select(models.Connection).where(
            or_(
                models.Connection.requester_id == user_id,
                models.Connection.receiver_id == user_id
            )
        )
    )
    conns = conn_res.scalars().all()
    my_pana_ids_set = set()
    pending_pana_ids_set = set()
    for c in conns:
        other_id = c.receiver_id if c.requester_id == user_id else c.requester_id
        if c.status == "accepted":
            my_pana_ids_set.add(other_id)
        elif c.status == "pending":
            pending_pana_ids_set.add(other_id)

    cfg = ENTITY_CONFIG[entity_type]

    for e in entities:
        if e.id in my_membership_by_entity:
            my_sm = my_membership_by_entity[e.id]
            share = share_by_id.get(my_sm.share_id)
            share_members_list = members_by_share.get(my_sm.share_id, [])

            owner_prof = profiles.get(share.owner_id) if share else None
            owner_name = owner_prof.display_name if owner_prof and owner_prof.display_name else "Usuario"

            members_out: List[schemas.ShareMemberOut] = []
            partner_names: List[str] = []

            for m in share_members_list:
                m_prof = profiles.get(m.user_id)
                m_name = m_prof.display_name if m_prof and m_prof.display_name else "Usuario"
                is_me = (m.user_id == user_id)
                is_owner = (share and m.user_id == share.owner_id)

                if not is_me:
                    partner_names.append(m_name)

                members_out.append(
                    schemas.ShareMemberOut(
                        user_id=m.user_id,
                        name=m_name,
                        role=schemas.ShareRole(m.role),
                        avatar_url=m_prof.avatar_url if m_prof else None,
                        is_me=is_me,
                        is_owner=is_owner,
                        is_my_pana=(m.user_id in my_pana_ids_set or is_me),
                        pana_request_pending=(m.user_id in pending_pana_ids_set),
                        local_category=m.local_category,
                    )
                )

            e.is_shared = True
            e.share_id = my_sm.share_id
            e.my_role = schemas.ShareRole(my_sm.role)
            e.shared_members = members_out
            e.shared_by = owner_name
            e.shared_partner_name = ", ".join(partner_names) if partner_names else "Pana"
            e.owner_id = share.owner_id if share else getattr(e, "user_id", None)
            e.is_read_only = (entity_type == "sub_budget" and my_sm.user_id != (share.owner_id if share else None))

            eff_cat = my_sm.local_category or getattr(e, "category", None)
            if entity_type != "sub_budget" and hasattr(type(e), "category"):
                try:
                    set_committed_value(e, "category", eff_cat)
                except Exception:
                    setattr(e, "category", eff_cat)

            if entity_type == "debt":
                if my_sm.perspective_type:
                    try:
                        set_committed_value(e, "type", my_sm.perspective_type)
                    except Exception:
                        setattr(e, "type", my_sm.perspective_type)
                if my_sm.counterpart_label:
                    try:
                        set_committed_value(e, "counterpart", my_sm.counterpart_label)
                    except Exception:
                        setattr(e, "counterpart", my_sm.counterpart_label)

            # Compute can_edit on child items
            children = (getattr(e, cfg["child_attr"], []) if cfg.get("child_attr") else []) or []
            for ch in children:
                ch.can_edit = can_edit_child(my_sm, ch.paid_by_user_id)
                if ch.paid_by_user_id and ch.paid_by_user_id != user_id:
                    if hasattr(ch, "category"):
                        try:
                            set_committed_value(ch, "category", eff_cat)
                        except Exception:
                            setattr(ch, "category", eff_cat)
                    if hasattr(ch, "create_expense"):
                        try:
                            set_committed_value(ch, "create_expense", False)
                        except Exception:
                            setattr(ch, "create_expense", False)
                    if hasattr(ch, "expense_id"):
                        try:
                            set_committed_value(ch, "expense_id", None)
                        except Exception:
                            setattr(ch, "expense_id", None)
        else:
            e.is_shared = False
            e.share_id = None
            e.my_role = None
            e.shared_members = []
            e.shared_partner_name = None
            e.shared_by = None
            e.owner_id = getattr(e, "user_id", None)
            e.is_read_only = False
            children = (getattr(e, cfg["child_attr"], []) if cfg.get("child_attr") else []) or []
            for ch in children:
                ch.can_edit = True

    return entities


async def build_share_info(db: AsyncSession, share: models.Share, user_id: UUID) -> schemas.ShareInfoOut:
    members = await get_members(db, share.id)
    caller_member = next((m for m in members if m.user_id == user_id), None)
    if not caller_member:
        raise HTTPException(status_code=403, detail="No perteneces a este recurso compartido")

    user_ids = {m.user_id for m in members}
    user_ids.add(user_id)

    prof_res = await db.execute(select(models.Profile).where(models.Profile.id.in_(user_ids)))
    profiles = {p.id: p for p in prof_res.scalars().all()}

    conn_res = await db.execute(
        select(models.Connection).where(
            or_(
                models.Connection.requester_id == user_id,
                models.Connection.receiver_id == user_id
            )
        )
    )
    conns = conn_res.scalars().all()
    my_pana_ids_set = set()
    pending_pana_ids_set = set()
    for c in conns:
        other_id = c.receiver_id if c.requester_id == user_id else c.requester_id
        if c.status == "accepted":
            my_pana_ids_set.add(other_id)
        elif c.status == "pending":
            pending_pana_ids_set.add(other_id)

    members_out: List[schemas.ShareMemberOut] = []
    for m in members:
        m_prof = profiles.get(m.user_id)
        m_name = m_prof.display_name if m_prof and m_prof.display_name else "Usuario"
        is_me = (m.user_id == user_id)
        is_owner = (m.user_id == share.owner_id)
        members_out.append(
            schemas.ShareMemberOut(
                user_id=m.user_id,
                name=m_name,
                role=schemas.ShareRole(m.role),
                avatar_url=m_prof.avatar_url if m_prof else None,
                is_me=is_me,
                is_owner=is_owner,
                is_my_pana=(m.user_id in my_pana_ids_set or is_me),
                pana_request_pending=(m.user_id in pending_pana_ids_set),
                local_category=m.local_category,
            )
        )

    return schemas.ShareInfoOut(
        share_id=share.id,
        entity_type=share.entity_type,
        my_role=schemas.ShareRole(caller_member.role),
        owner_id=share.owner_id,
        members=members_out
    )


async def update_member_local_category(
    db: AsyncSession,
    entity_id: UUID,
    user_id: UUID,
    new_category: str
) -> dict:
    clean_cat = new_category.strip()
    if not clean_cat:
        raise HTTPException(status_code=400, detail="La categoría no puede estar vacía")

    # a) Query ShareMember matching (entity_id, user_id) (joining Share)
    stmt = (
        select(models.ShareMember)
        .join(models.Share, models.ShareMember.share_id == models.Share.id)
        .where(
            models.ShareMember.entity_id == entity_id,
            models.ShareMember.user_id == user_id,
        )
    )
    res = await db.execute(stmt)
    member = res.scalars().first()

    # b) If ShareMember exists:
    if member:
        member.local_category = clean_cat
        await db.commit()
        return {"entity_id": str(entity_id), "local_category": member.local_category}

    # c) If ShareMember does NOT exist:
    # Verify if user_id owns the underlying entity (search across Debt, FixedExpense, SavingGoal)
    entity = None
    entity_type = None

    debt_res = await db.execute(select(models.Debt).where(models.Debt.id == entity_id))
    entity = debt_res.scalars().first()
    if entity:
        entity_type = "debt"
    else:
        fe_res = await db.execute(select(models.FixedExpense).where(models.FixedExpense.id == entity_id))
        entity = fe_res.scalars().first()
        if entity:
            entity_type = "fixed_expense"
        else:
            sg_res = await db.execute(select(models.SavingGoal).where(models.SavingGoal.id == entity_id))
            entity = sg_res.scalars().first()
            if entity:
                entity_type = "saving_goal"

    if not entity:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")

    if entity.user_id != user_id:
        raise HTTPException(status_code=403, detail="No tienes permisos para modificar este recurso")

    # Check if a Share exists for this entity
    share_res = await db.execute(
        select(models.Share)
        .join(models.ShareMember, models.Share.id == models.ShareMember.share_id)
        .where(models.ShareMember.entity_id == entity_id)
    )
    share = share_res.scalars().first()

    if share:
        # Upsert owner's ShareMember with role='admin' and local_category=clean_cat
        owner_sm_res = await db.execute(
            select(models.ShareMember).where(
                models.ShareMember.share_id == share.id,
                models.ShareMember.user_id == user_id,
            )
        )
        owner_member = owner_sm_res.scalars().first()
        if owner_member:
            owner_member.local_category = clean_cat
            owner_member.role = "admin"
        else:
            owner_member = models.ShareMember(
                share_id=share.id,
                user_id=user_id,
                entity_id=entity_id,
                role="admin",
                added_by=user_id,
                local_category=clean_cat,
                perspective_type=getattr(entity, "type", None) if entity_type == "debt" else None,
                counterpart_label=getattr(entity, "counterpart", None) if entity_type == "debt" else None,
            )
            db.add(owner_member)
    else:
        # Not shared: update entity.category directly
        entity.category = clean_cat

    await db.commit()
    return {"entity_id": str(entity_id), "local_category": clean_cat}
