from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_, and_
from typing import List, Optional
from uuid import UUID
from decimal import Decimal
import datetime
from fastapi import HTTPException

from . import models, schemas
from .push_service import send_notification_to_user


async def _populate_shared_info(db: AsyncSession, goals: List[models.SavingGoal], user_id: UUID) -> List[models.SavingGoal]:
    if not goals:
        return []

    goal_ids = [g.id for g in goals]
    shared_result = await db.execute(
        select(models.SharedSavingGoal).where(
            or_(
                models.SharedSavingGoal.goal_id.in_(goal_ids),
                models.SharedSavingGoal.mirror_goal_id.in_(goal_ids)
            )
        )
    )
    shared_records = shared_result.scalars().all()
    if not shared_records:
        for g in goals:
            g.is_shared = False
            g.shared_partner_name = None
            g.shared_by = None
        return goals

    profile_ids = set()
    for s in shared_records:
        profile_ids.add(s.owner_id)
        profile_ids.add(s.partner_id)

    profiles_result = await db.execute(
        select(models.Profile).where(models.Profile.id.in_(profile_ids))
    )
    profiles = {p.id: p for p in profiles_result.scalars().all()}

    shared_by_goal_id = {}
    for s in shared_records:
        shared_by_goal_id[s.goal_id] = s
        if s.mirror_goal_id:
            shared_by_goal_id[s.mirror_goal_id] = s

    for g in goals:
        if g.id in shared_by_goal_id:
            s = shared_by_goal_id[g.id]
            is_owner = s.owner_id == user_id
            partner_id = s.partner_id if is_owner else s.owner_id
            partner_profile = profiles.get(partner_id)
            owner_profile = profiles.get(s.owner_id)

            g.is_shared = True
            g.shared_partner_name = partner_profile.display_name if partner_profile and partner_profile.display_name else "Pana"
            g.shared_by = owner_profile.display_name if owner_profile and owner_profile.display_name else "Pana"
        else:
            g.is_shared = False
            g.shared_partner_name = None
            g.shared_by = None

    return goals


async def get_saving_goals(
    db: AsyncSession, 
    user_id: UUID, 
    is_completed: Optional[bool] = None,
    is_active: Optional[bool] = None
) -> List[models.SavingGoal]:
    query = select(models.SavingGoal).filter(
        models.SavingGoal.user_id == user_id
    ).options(selectinload(models.SavingGoal.deposits))

    if is_completed is not None:
        query = query.filter(models.SavingGoal.is_completed == is_completed)
    if is_active is not None:
        query = query.filter(models.SavingGoal.is_active == is_active)

    query = query.order_by(models.SavingGoal.is_completed.asc(), models.SavingGoal.created_at.desc())
    result = await db.execute(query)
    goals = result.scalars().all()
    return await _populate_shared_info(db, goals, user_id)


async def get_saving_goal(db: AsyncSession, goal_id: UUID, user_id: UUID) -> Optional[models.SavingGoal]:
    result = await db.execute(
        select(models.SavingGoal)
        .filter(models.SavingGoal.id == goal_id, models.SavingGoal.user_id == user_id)
        .options(selectinload(models.SavingGoal.deposits))
    )
    goal = result.scalars().first()
    if not goal:
        return None
    populated = await _populate_shared_info(db, [goal], user_id)
    return populated[0] if populated else None


async def create_saving_goal(
    db: AsyncSession, 
    goal: schemas.SavingGoalCreate, 
    user_id: UUID,
    extra_data: Optional[dict] = None
) -> models.SavingGoal:
    shared_with = goal.shared_with
    data = goal.model_dump(exclude={'manual_rate', 'shared_with'})
    if extra_data:
        data.update(extra_data)

    if shared_with:
        # Validate that connection with partner is accepted
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
            raise HTTPException(status_code=400, detail="El usuario seleccionado no es un pana conectado")

        # Get requester profile name
        prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        requester_prof = prof_res.scalars().first()
        req_name = requester_prof.display_name if requester_prof and requester_prof.display_name else "Tu pana"

        # Create primary goal
        db_goal = models.SavingGoal(**data, user_id=user_id)
        db.add(db_goal)
        await db.flush()

        # Create mirror goal for partner
        mirror_data = {**data, "user_id": shared_with}
        db_mirror = models.SavingGoal(**mirror_data)
        db.add(db_mirror)
        await db.flush()

        # Link in shared_saving_goals
        shared_record = models.SharedSavingGoal(
            goal_id=db_goal.id,
            owner_id=user_id,
            partner_id=shared_with,
            mirror_goal_id=db_mirror.id
        )
        db.add(shared_record)

        # Notify partner
        await send_notification_to_user(
            db=db,
            user_id=shared_with,
            title="Nuevo fondo de ahorro compartido",
            body=f"{req_name} creó un fondo de ahorro compartido: {goal.name}",
            type="savings",
            url="/herramientas/ahorros"
        )

        await db.commit()
        await db.refresh(db_goal)
        return await get_saving_goal(db, db_goal.id, user_id)
    else:
        db_goal = models.SavingGoal(**data, user_id=user_id)
        db.add(db_goal)
        await db.commit()
        await db.refresh(db_goal)
        return await get_saving_goal(db, db_goal.id, user_id)


async def update_saving_goal(
    db: AsyncSession,
    goal_id: UUID,
    goal: schemas.SavingGoalUpdate,
    user_id: UUID,
    extra_data: Optional[dict] = None
) -> Optional[models.SavingGoal]:
    db_goal = await get_saving_goal(db, goal_id, user_id)
    if not db_goal:
        return None

    update_data = goal.model_dump(exclude_unset=True)
    if 'manual_rate' in update_data:
        del update_data['manual_rate']
    if 'shared_with' in update_data:
        del update_data['shared_with']

    if extra_data:
        update_data.update(extra_data)

    if 'is_completed' in update_data:
        if update_data['is_completed'] and not db_goal.is_completed:
            db_goal.completed_at = datetime.datetime.now(datetime.timezone.utc)
        elif not update_data['is_completed']:
            db_goal.completed_at = None

    for key, value in update_data.items():
        setattr(db_goal, key, value)

    # If shared, sync changes to mirror goal
    shared_res = await db.execute(
        select(models.SharedSavingGoal).where(
            or_(
                models.SharedSavingGoal.goal_id == goal_id,
                models.SharedSavingGoal.mirror_goal_id == goal_id
            )
        )
    )
    shared_record = shared_res.scalars().first()
    if shared_record:
        mirror_id = shared_record.mirror_goal_id if shared_record.goal_id == goal_id else shared_record.goal_id
        if mirror_id:
            mirror_res = await db.execute(select(models.SavingGoal).where(models.SavingGoal.id == mirror_id))
            db_mirror = mirror_res.scalars().first()
            if db_mirror:
                sync_keys = ['name', 'target_amount', 'currency', 'target_date', 'category', 'color', 'icon', 'notes', 'is_active', 'is_completed', 'completed_at']
                for k in sync_keys:
                    if hasattr(db_goal, k):
                        setattr(db_mirror, k, getattr(db_goal, k))

    await db.commit()
    return await get_saving_goal(db, goal_id, user_id)


async def delete_saving_goal(db: AsyncSession, goal_id: UUID, user_id: UUID) -> bool:
    db_goal = await get_saving_goal(db, goal_id, user_id)
    if not db_goal:
        return False

    shared_res = await db.execute(
        select(models.SharedSavingGoal).where(
            or_(
                models.SharedSavingGoal.goal_id == goal_id,
                models.SharedSavingGoal.mirror_goal_id == goal_id
            )
        )
    )
    shared_record = shared_res.scalars().first()
    if shared_record:
        mirror_id = shared_record.mirror_goal_id if shared_record.goal_id == goal_id else shared_record.goal_id
        partner_id = shared_record.partner_id if shared_record.owner_id == user_id else shared_record.owner_id

        if mirror_id:
            mirror_res = await db.execute(select(models.SavingGoal).where(models.SavingGoal.id == mirror_id))
            db_mirror = mirror_res.scalars().first()
            if db_mirror:
                await db.delete(db_mirror)

        await db.delete(shared_record)

        prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        req_prof = prof_res.scalars().first()
        req_name = req_prof.display_name if req_prof and req_prof.display_name else "Tu pana"
        await send_notification_to_user(
            db=db,
            user_id=partner_id,
            title="Fondo de ahorro eliminado",
            body=f"{req_name} eliminó el fondo de ahorro compartido '{db_goal.name}'",
            type="savings",
            url="/herramientas/ahorros"
        )

    await db.delete(db_goal)
    await db.commit()
    return True


async def add_saving_deposit(
    db: AsyncSession,
    goal_id: UUID,
    user_id: UUID,
    deposit: schemas.SavingDepositCreate,
    extra_data: Optional[dict] = None
) -> Optional[models.SavingGoal]:
    db_goal = await get_saving_goal(db, goal_id, user_id)
    if not db_goal:
        return None

    # Get user profile name
    prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
    user_prof = prof_res.scalars().first()
    user_name = user_prof.display_name if user_prof and user_prof.display_name else "Usuario"

    data = deposit.model_dump(exclude_unset=True)
    if 'manual_rate' in data:
        del data['manual_rate']
    register_as_expense = data.pop('register_as_expense', False)

    if extra_data:
        data.update(extra_data)

    expense_id = None
    if register_as_expense:
        expense_data = {
            "amount": data["amount"],
            "currency": data["currency"].value if hasattr(data["currency"], "value") else str(data["currency"]),
            "description": f"Aporte de Ahorro: {db_goal.name}",
            "category": db_goal.category or "Ahorro",
            "date": data.get("deposit_date") or datetime.date.today(),
            "user_id": user_id
        }
        for key in ["amount_usd", "amount_bs", "amount_eur", "amount_usdt", "rate_usd_bs", "rate_eur_bs", "rate_usdt_bs"]:
            if extra_data and key in extra_data:
                expense_data[key] = extra_data[key]

        db_expense = models.Expense(**expense_data)
        db.add(db_expense)
        await db.flush()
        expense_id = db_expense.id

    db_deposit = models.SavingDeposit(
        **data,
        goal_id=goal_id,
        create_expense=register_as_expense,
        expense_id=expense_id,
        paid_by_name=user_name
    )
    db.add(db_deposit)
    db_goal.deposits.append(db_deposit)
    await db.flush()

    # Check if goal is shared
    shared_res = await db.execute(
        select(models.SharedSavingGoal).where(
            or_(
                models.SharedSavingGoal.goal_id == goal_id,
                models.SharedSavingGoal.mirror_goal_id == goal_id
            )
        )
    )
    shared_record = shared_res.scalars().first()
    mirror_goal = None
    partner_id = None

    if shared_record:
        mirror_id = shared_record.mirror_goal_id if shared_record.goal_id == goal_id else shared_record.goal_id
        partner_id = shared_record.partner_id if shared_record.owner_id == user_id else shared_record.owner_id

        if mirror_id:
            mirror_res = await db.execute(
                select(models.SavingGoal).where(models.SavingGoal.id == mirror_id).options(selectinload(models.SavingGoal.deposits))
            )
            mirror_goal = mirror_res.scalars().first()
            if mirror_goal:
                mirror_deposit_data = {
                    **data,
                    "goal_id": mirror_id,
                    "create_expense": False,
                    "expense_id": None,
                    "paid_by_name": user_name,
                    "mirror_deposit_id": db_deposit.id
                }
                db_mirror_deposit = models.SavingDeposit(**mirror_deposit_data)
                db.add(db_mirror_deposit)
                mirror_goal.deposits.append(db_mirror_deposit)
                await db.flush()
                db_deposit.mirror_deposit_id = db_mirror_deposit.id

    def calc_total_deposited(goal_obj):
        goal_currency = goal_obj.currency
        tot = Decimal('0')
        for d in goal_obj.deposits:
            if d.currency == goal_currency:
                tot += Decimal(str(d.amount))
            elif goal_currency in ['USD_BCV', 'USD_CASH'] and d.amount_usd:
                tot += Decimal(str(d.amount_usd))
            elif goal_currency == 'BS' and d.amount_bs:
                tot += Decimal(str(d.amount_bs))
            elif goal_currency == 'EUR_BCV' and d.amount_eur:
                tot += Decimal(str(d.amount_eur))
            elif goal_currency == 'USDT' and d.amount_usdt:
                tot += Decimal(str(d.amount_usdt))
            else:
                tot += Decimal(str(d.amount))
        return tot

    total_deposited = calc_total_deposited(db_goal)
    just_completed = False
    if total_deposited >= Decimal(str(db_goal.target_amount)) and not db_goal.is_completed:
        db_goal.is_completed = True
        db_goal.completed_at = datetime.datetime.now(datetime.timezone.utc)
        just_completed = True

    if mirror_goal:
        mirror_total = calc_total_deposited(mirror_goal)
        if mirror_total >= Decimal(str(mirror_goal.target_amount)) and not mirror_goal.is_completed:
            mirror_goal.is_completed = True
            mirror_goal.completed_at = datetime.datetime.now(datetime.timezone.utc)

    await db.commit()

    if just_completed:
        await send_notification_to_user(
            db=db,
            user_id=user_id,
            title="🎉 ¡Meta de ahorro alcanzada!",
            body=f"¡Felicidades! Has completado tu meta '{db_goal.name}' con un total de {total_deposited:.2f} {db_goal.currency}.",
            type="savings",
            url="/herramientas/ahorros"
        )
        if partner_id:
            await send_notification_to_user(
                db=db,
                user_id=partner_id,
                title="🎉 ¡Meta de ahorro alcanzada!",
                body=f"¡Felicidades! Se completó el fondo compartido '{db_goal.name}' con un total de {total_deposited:.2f} {db_goal.currency}.",
                type="savings",
                url="/herramientas/ahorros"
            )
    elif partner_id:
        curr_str = data["currency"].value if hasattr(data["currency"], "value") else str(data["currency"])
        await send_notification_to_user(
            db=db,
            user_id=partner_id,
            title="Aporte a fondo compartido",
            body=f"{user_name} aportó {data['amount']} {curr_str} al fondo '{db_goal.name}'",
            type="savings",
            url="/herramientas/ahorros"
        )

    return await get_saving_goal(db, goal_id, user_id)


async def delete_saving_deposit(db: AsyncSession, deposit_id: UUID, user_id: UUID) -> Optional[models.SavingGoal]:
    result = await db.execute(
        select(models.SavingDeposit)
        .join(models.SavingGoal)
        .filter(models.SavingDeposit.id == deposit_id, models.SavingGoal.user_id == user_id)
    )
    deposit = result.scalars().first()
    if not deposit:
        return None

    goal_id = deposit.goal_id

    # If linked to expense, delete the expense as well
    if deposit.expense_id:
        exp_res = await db.execute(select(models.Expense).filter(models.Expense.id == deposit.expense_id, models.Expense.user_id == user_id))
        exp = exp_res.scalars().first()
        if exp:
            await db.delete(exp)

    # If mirror deposit exists, delete it too
    if deposit.mirror_deposit_id:
        mirror_res = await db.execute(select(models.SavingDeposit).where(models.SavingDeposit.id == deposit.mirror_deposit_id))
        mirror_dep = mirror_res.scalars().first()
        if mirror_dep:
            await db.delete(mirror_dep)

    await db.delete(deposit)
    await db.commit()

    # Re-evaluate goal status
    updated_goal = await get_saving_goal(db, goal_id, user_id)
    if updated_goal and updated_goal.is_completed:
        goal_currency = updated_goal.currency
        total_deposited = Decimal('0')
        for d in updated_goal.deposits:
            if d.currency == goal_currency:
                total_deposited += Decimal(str(d.amount))
            elif goal_currency in ['USD_BCV', 'USD_CASH'] and d.amount_usd:
                total_deposited += Decimal(str(d.amount_usd))
            elif goal_currency == 'BS' and d.amount_bs:
                total_deposited += Decimal(str(d.amount_bs))
            elif goal_currency == 'EUR_BCV' and d.amount_eur:
                total_deposited += Decimal(str(d.amount_eur))
            elif goal_currency == 'USDT' and d.amount_usdt:
                total_deposited += Decimal(str(d.amount_usdt))
            else:
                total_deposited += Decimal(str(d.amount))

        if total_deposited < Decimal(str(updated_goal.target_amount)):
            updated_goal.is_completed = False
            updated_goal.completed_at = None
            await db.commit()

    return await get_saving_goal(db, goal_id, user_id)


async def get_savings_summary(db: AsyncSession, user_id: UUID) -> schemas.SavingSummaryResponse:
    goals = await get_saving_goals(db, user_id)

    total_goals = len(goals)
    active_goals = sum(1 for g in goals if not g.is_completed and g.is_active)
    completed_goals = sum(1 for g in goals if g.is_completed)

    total_saved_bs = Decimal('0')
    total_saved_usd = Decimal('0')
    total_saved_eur = Decimal('0')
    total_saved_usdt = Decimal('0')

    for goal in goals:
        for deposit in goal.deposits:
            if deposit.amount_bs:
                total_saved_bs += Decimal(str(deposit.amount_bs))
            if deposit.amount_usd:
                total_saved_usd += Decimal(str(deposit.amount_usd))
            if deposit.amount_eur:
                total_saved_eur += Decimal(str(deposit.amount_eur))
            if deposit.amount_usdt:
                total_saved_usdt += Decimal(str(deposit.amount_usdt))

    return schemas.SavingSummaryResponse(
        total_goals=total_goals,
        active_goals=active_goals,
        completed_goals=completed_goals,
        total_saved_bs=total_saved_bs,
        total_saved_usd=total_saved_usd,
        total_saved_eur=total_saved_eur,
        total_saved_usdt=total_saved_usdt
    )
