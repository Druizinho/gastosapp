import uuid
from uuid import UUID
from typing import List, Dict, Optional, Set, Any, Tuple
from decimal import Decimal
from datetime import datetime, timezone, date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_, and_, delete, text, update
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

async def get_membership(db: AsyncSession, entity_id: UUID) -> Optional[Tuple[models.Share, models.ShareMember]]:
    res = await db.execute(
        select(models.Share, models.ShareMember)
        .join(models.ShareMember, models.Share.id == models.ShareMember.share_id)
        .where(models.ShareMember.entity_id == entity_id)
    )
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


async def sibling_entity_ids(
    db: AsyncSession,
    share_id: UUID,
    exclude_user_id: Optional[UUID] = None
) -> Dict[UUID, UUID]:
    members = await get_members(db, share_id)
    return {
        m.user_id: m.entity_id
        for m in members
        if exclude_user_id is None or m.user_id != exclude_user_id
    }


# ==============================================================================
# Share Lifecycle (Create, Add, Remove, Sync)
# ==============================================================================

def _clone_entity_data(entity: Any, new_user_id: UUID) -> dict:
    data = {}
    for col in entity.__table__.columns:
        if col.name in ("id", "user_id", "created_at", "deactivated_at", "completed_at"):
            continue
        data[col.name] = getattr(entity, col.name)
    data["user_id"] = new_user_id
    return data


async def create_share(
    db: AsyncSession,
    entity_type: str,
    owner_id: UUID,
    owner_entity: Any,
    target_ids: List[UUID],
    admin_ids: Optional[List[UUID]] = None
) -> models.Share:
    admin_set = set(admin_ids or [])
    clean_targets = [tid for tid in target_ids if tid != owner_id]

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
        added_by=owner_id
    )
    db.add(owner_member)

    cfg = ENTITY_CONFIG[entity_type]
    model_cls = cfg["model"]
    child_model_cls = cfg["child_model"]
    child_fk = cfg["child_fk"]
    child_attr = cfg["child_attr"]

    # Copy existing child records (payments/checks/deposits) to the clone
    ch_res = await db.execute(
        select(child_model_cls).where(getattr(child_model_cls, child_fk) == owner_entity.id)
    )
    existing_children = ch_res.scalars().all()

    # Obtener nombre del creador para asignar como contraparte en clones de deudas
    creator_name = "Mi Pana"
    if entity_type == "debt":
        creator_prof = await db.get(models.Profile, owner_id)
        if creator_prof and creator_prof.display_name:
            creator_name = creator_prof.display_name

    # Clone for each target
    for tid in clean_targets:
        clone_data = _clone_entity_data(owner_entity, tid)
        if entity_type == "debt":
            # Inversión simétrica obligatoria de deudas:
            # Si el creador cobra ('receivable'), el pana debe ('owed'); y viceversa
            if getattr(owner_entity, "type", None) == "receivable":
                clone_data["type"] = "owed"
            elif getattr(owner_entity, "type", None) == "owed":
                clone_data["type"] = "receivable"
            clone_data["counterpart"] = creator_name

        clone = model_cls(**clone_data)
        db.add(clone)
        await db.flush()

        role = "admin" if tid in admin_set else "member"
        member = models.ShareMember(
            share_id=share.id,
            user_id=tid,
            entity_id=clone.id,
            role=role,
            added_by=owner_id
        )
        db.add(member)

        for ch in existing_children:
            if not ch.sync_id:
                ch.sync_id = ch.id
            ch_data = {}
            for col in ch.__table__.columns:
                if col.name in ("id", child_fk, "created_at"):
                    continue
                ch_data[col.name] = getattr(ch, col.name)
            ch_data[child_fk] = clone.id
            ch_data["sync_id"] = ch.sync_id
            ch_data["paid_by_user_id"] = ch.paid_by_user_id or owner_id
            if "create_expense" in ch_data:
                ch_data["create_expense"] = False
            if "expense_id" in ch_data:
                ch_data["expense_id"] = None
            ch_clone = child_model_cls(**ch_data)
            db.add(ch_clone)

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
    existing_members = await get_members(db, share.id)
    existing_user_ids = {m.user_id for m in existing_members}
    new_targets = [tid for tid in target_ids if tid not in existing_user_ids]

    if not new_targets:
        return

    await assert_can_add(db, actor_id, new_targets)

    cfg = ENTITY_CONFIG[share.entity_type]
    model_cls = cfg["model"]
    child_model_cls = cfg["child_model"]
    child_fk = cfg["child_fk"]
    child_attr = cfg["child_attr"]

    # Use first existing member's entity as template
    template_entity_res = await db.execute(
        select(model_cls)
        .options(selectinload(getattr(model_cls, child_attr)))
        .where(model_cls.id == existing_members[0].entity_id)
    )
    template_entity = template_entity_res.scalars().first()
    if not template_entity:
        raise HTTPException(status_code=404, detail="Entidad base no encontrada para clonar")

    actor_name = "Mi Pana"
    if share.entity_type == "debt":
        actor_prof = await db.get(models.Profile, actor_id)
        if actor_prof and actor_prof.display_name:
            actor_name = actor_prof.display_name

    for tid in new_targets:
        clone_data = _clone_entity_data(template_entity, tid)
        if share.entity_type == "debt":
            if getattr(template_entity, "type", None) == "receivable":
                clone_data["type"] = "owed"
            elif getattr(template_entity, "type", None) == "owed":
                clone_data["type"] = "receivable"
            clone_data["counterpart"] = actor_name

        clone = model_cls(**clone_data)
        db.add(clone)
        await db.flush()

        role = "admin" if tid in admin_set else "member"
        member = models.ShareMember(
            share_id=share.id,
            user_id=tid,
            entity_id=clone.id,
            role=role,
            added_by=actor_id
        )
        db.add(member)

        # Copy existing child records to new member
        existing_children = getattr(template_entity, child_attr, []) or []
        for ch in existing_children:
            if not ch.sync_id:
                ch.sync_id = ch.id
            ch_data = {}
            for col in ch.__table__.columns:
                if col.name in ("id", child_fk, "created_at"):
                    continue
                ch_data[col.name] = getattr(ch, col.name)
            ch_data[child_fk] = clone.id
            ch_data["sync_id"] = ch.sync_id
            if "create_expense" in ch_data:
                ch_data["create_expense"] = False
            if "expense_id" in ch_data:
                ch_data["expense_id"] = None
            ch_clone = child_model_cls(**ch_data)
            db.add(ch_clone)

    await db.flush()


async def remove_member(db: AsyncSession, share: models.Share, user_id_to_remove: UUID):
    members = await get_members(db, share.id)
    target_member = next((m for m in members if m.user_id == user_id_to_remove), None)
    if not target_member:
        return

    cfg = ENTITY_CONFIG[share.entity_type]
    child_model_cls = cfg["child_model"]
    child_fk = cfg["child_fk"]

    # PAN-06: No destruir la entidad del usuario expulsado para preservar su historial financiero.
    # Desvinculamos sus registros hijos (sync_id=None) para que futuras mutaciones del share no los afecten.
    await db.execute(
        update(child_model_cls)
        .where(getattr(child_model_cls, child_fk) == target_member.entity_id)
        .values(sync_id=None)
    )

    await db.delete(target_member)
    await db.flush()

    remaining_members = [m for m in members if m.user_id != user_id_to_remove]

    # If owner was removed, transfer ownership
    if share.owner_id == user_id_to_remove and remaining_members:
        admins = [m for m in remaining_members if m.role == "admin"]
        if admins:
            share.owner_id = admins[0].user_id
        else:
            remaining_members[0].role = "admin"
            share.owner_id = remaining_members[0].user_id

    # If only 1 member remains, dissolve the share (they keep their entity as personal)
    if len(remaining_members) <= 1:
        await db.delete(share)

    await db.flush()


async def sync_parent_fields(
    db: AsyncSession,
    share: models.Share,
    source_entity_id: UUID,
    fields: dict
):
    if not fields:
        return
    cfg = ENTITY_CONFIG[share.entity_type]
    model_cls = cfg["model"]

    siblings = await sibling_entity_ids(db, share.id, exclude_user_id=None)
    target_eids = [eid for eid in siblings.values() if eid != source_entity_id]
    if not target_eids:
        return

    res = await db.execute(select(model_cls).where(model_cls.id.in_(target_eids)))
    for sibling in res.scalars().all():
        for k, v in fields.items():
            # Excluir tipo y contraparte en deudas para no destruir la inversión simétrica
            if share.entity_type == "debt" and k in ("type", "counterpart"):
                continue
            if hasattr(sibling, k):
                setattr(sibling, k, v)


# ==============================================================================
# Child Rows Fan-out (Payments, Checks, Deposits)
# ==============================================================================

async def fan_out_child_create(
    db: AsyncSession,
    share: models.Share,
    source_child: Any,
    child_data: dict,
    child_model: Any,
    parent_fk_name: str,
    payer_id: UUID,
    payer_name: str
):
    if not source_child.sync_id:
        source_child.sync_id = source_child.id
    sync_id = source_child.sync_id

    siblings = await sibling_entity_ids(db, share.id)
    source_parent_id = getattr(source_child, parent_fk_name)
    target_parent_ids = [pid for pid in siblings.values() if pid != source_parent_id]
    if not target_parent_ids:
        return

    # Ordenar determinísticamente por UUID para prevenir deadlocks ABBA en fan-out concurrente
    target_parent_ids = sorted(target_parent_ids, key=lambda x: str(x))

    existing_fe_ids: Set[UUID] = set()
    if share.entity_type == "fixed_expense" and "month_year" in child_data:
        chk = await db.execute(
            select(models.FixedExpenseCheck.fixed_expense_id).where(
                models.FixedExpenseCheck.fixed_expense_id.in_(target_parent_ids),
                models.FixedExpenseCheck.month_year == child_data["month_year"]
            )
        )
        existing_fe_ids = set(chk.scalars().all())

    for parent_id in target_parent_ids:
        if parent_id in existing_fe_ids:
            continue

        copy_data = {**child_data}
        copy_data[parent_fk_name] = parent_id
        copy_data["sync_id"] = sync_id
        copy_data["paid_by_name"] = payer_name
        copy_data["paid_by_user_id"] = payer_id

        # Do not cascade personal expense creation to other users
        if "create_expense" in copy_data:
            copy_data["create_expense"] = False
        if "expense_id" in copy_data:
            copy_data["expense_id"] = None
        if "register_as_expense" in copy_data:
            del copy_data["register_as_expense"]

        child_copy = child_model(**copy_data)
        db.add(child_copy)

    await db.flush()


async def fan_out_child_update(
    db: AsyncSession,
    child_model: Any,
    sync_id: UUID,
    fields: dict
):
    if not sync_id or not fields:
        return
    clean_fields = {k: v for k, v in fields.items() if k not in ("expense_id", "create_expense", "register_as_expense")}
    if not clean_fields:
        return
    res = await db.execute(select(child_model).where(child_model.sync_id == sync_id))
    rows = res.scalars().all()
    for row in rows:
        for k, v in clean_fields.items():
            if hasattr(row, k):
                setattr(row, k, v)
        # PAN-08: Sincronizar en cascada el Expense personal del hermano si tiene un gasto vinculado
        exp_id = getattr(row, "expense_id", None)
        if exp_id:
            exp_res = await db.execute(select(models.Expense).where(models.Expense.id == exp_id))
            exp = exp_res.scalars().first()
            if exp:
                if 'amount' in clean_fields:
                    exp.amount = clean_fields['amount']
                if 'currency' in clean_fields:
                    raw_curr = clean_fields['currency']
                    exp.currency = raw_curr.value if hasattr(raw_curr, "value") else str(raw_curr)
                if 'payment_date' in clean_fields:
                    exp.date = clean_fields['payment_date']
                elif 'deposit_date' in clean_fields:
                    exp.date = clean_fields['deposit_date']
                for key in ["amount_usd", "amount_bs", "amount_eur", "amount_usdt", "rate_usd_bs", "rate_eur_bs", "rate_usdt_bs"]:
                    if key in clean_fields:
                        setattr(exp, key, clean_fields[key])
    await db.flush()


async def fan_out_child_delete(
    db: AsyncSession,
    child_model: Any,
    sync_id: UUID
) -> List[UUID]:
    if not sync_id:
        return []
    res = await db.execute(select(child_model).where(child_model.sync_id == sync_id))
    rows = res.scalars().all()
    linked_expense_ids: List[UUID] = []
    for row in rows:
        exp_id = getattr(row, "expense_id", None)
        if exp_id:
            linked_expense_ids.append(exp_id)
        await db.delete(row)
    await db.flush()
    return linked_expense_ids


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
        elif target_currency in ("USD_BCV", "USD_CASH") and getattr(ch, "amount_usd", None) is not None:
            total += Decimal(str(ch.amount_usd))
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
    model_cls = cfg["model"]
    child_attr = cfg["child_attr"]

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
        select(models.ShareMember).where(models.ShareMember.entity_id.in_(entity_ids))
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
            # can_edit defaults to True for personal items
            cfg = ENTITY_CONFIG[entity_type]
            children = e.__dict__.get(cfg["child_attr"], []) or []
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
                        pana_request_pending=(m.user_id in pending_pana_ids_set)
                    )
                )

            e.is_shared = True
            e.share_id = my_sm.share_id
            e.my_role = schemas.ShareRole(my_sm.role)
            e.shared_members = members_out
            e.shared_by = owner_name
            e.shared_partner_name = ", ".join(partner_names) if partner_names else "Pana"

            # Compute can_edit on child items
            children = e.__dict__.get(cfg["child_attr"], []) or []
            for ch in children:
                ch.can_edit = can_edit_child(my_sm, ch.paid_by_user_id)
        else:
            e.is_shared = False
            e.share_id = None
            e.my_role = None
            e.shared_members = []
            e.shared_partner_name = None
            e.shared_by = None
            children = e.__dict__.get(cfg["child_attr"], []) or []
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
                pana_request_pending=(m.user_id in pending_pana_ids_set)
            )
        )

    return schemas.ShareInfoOut(
        share_id=share.id,
        entity_type=share.entity_type,
        my_role=schemas.ShareRole(caller_member.role),
        owner_id=share.owner_id,
        members=members_out
    )
