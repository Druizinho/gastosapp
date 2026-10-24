from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_, and_, delete
from typing import List, Optional
from uuid import UUID, uuid4
from decimal import Decimal
import datetime
from fastapi import HTTPException

from . import models, schemas, sharing, bcv_service
from .push_service import send_notification_to_user
from .crud_budgets import check_and_notify_budget_thresholds


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
    await sharing.populate_share_meta(db, goals, user_id, "saving_goal")
    return goals


async def get_saving_goal(db: AsyncSession, goal_id: UUID, user_id: UUID) -> Optional[models.SavingGoal]:
    result = await db.execute(
        select(models.SavingGoal)
        .filter(models.SavingGoal.id == goal_id, models.SavingGoal.user_id == user_id)
        .options(selectinload(models.SavingGoal.deposits))
    )
    goal = result.scalars().first()
    if not goal:
        return None
    await sharing.populate_share_meta(db, [goal], user_id, "saving_goal")
    return goal


async def create_saving_goal(
    db: AsyncSession, 
    goal: schemas.SavingGoalCreate, 
    user_id: UUID,
    extra_data: Optional[dict] = None
) -> models.SavingGoal:
    shared_with_ids = goal.shared_with_ids or ([] if not goal.shared_with else [goal.shared_with])
    admin_ids = getattr(goal, 'admin_ids', None) or []

    data = goal.model_dump(exclude={'manual_rate', 'shared_with', 'shared_with_ids', 'admin_ids'})
    if extra_data:
        data.update(extra_data)

    clean_targets = [tid for tid in shared_with_ids if tid != user_id]

    if clean_targets:
        await sharing.assert_can_add(db, user_id, clean_targets)

        # Create primary goal for creator
        db_goal = models.SavingGoal(**data, user_id=user_id)
        db.add(db_goal)
        await db.flush()

        share = await sharing.create_share(
            db=db,
            entity_type="saving_goal",
            owner_id=user_id,
            owner_entity=db_goal,
            target_ids=clean_targets,
            admin_ids=admin_ids
        )

        user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        user_prof = user_prof_res.scalars().first()
        req_name = user_prof.display_name if user_prof and user_prof.display_name else "Tu pana"

        is_proj = db_goal.type == "project"
        title_es = "Nuevo proyecto compartido" if is_proj else "Nuevo fondo de ahorro compartido"
        ent_desc = "un proyecto compartido" if is_proj else "un fondo de ahorro compartido"

        await sharing.notify_members(
            db=db,
            share_id=share.id,
            exclude_user_id=user_id,
            title=title_es,
            body=f"{req_name} creó {ent_desc}: {db_goal.name}",
            type="savings",
            url="/herramientas/ahorros"
        )

        await db.commit()
        return await get_saving_goal(db, db_goal.id, user_id)
    else:
        db_goal = models.SavingGoal(**data, user_id=user_id)
        db.add(db_goal)
        await db.commit()
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
    shared_with_ids = update_data.pop('shared_with_ids', None)
    admin_ids = update_data.pop('admin_ids', None)
    update_data.pop('shared_with', None)
    manual_rate = update_data.pop('manual_rate', None)

    if extra_data is None and ('target_amount' in update_data or 'currency' in update_data):
        new_target = update_data.get('target_amount', db_goal.target_amount)
        if new_target is not None:
            raw_curr = update_data.get('currency', db_goal.currency)
            new_curr = raw_curr.value if hasattr(raw_curr, "value") else str(raw_curr)
            rates = await bcv_service.get_all_rates()
            extra_data = bcv_service.convert_amount(
                amount=new_target,
                currency=new_curr,
                rates=rates,
                manual_rate=manual_rate
            )
        else:
            extra_data = {
                "amount_usd": None,
                "amount_bs": None,
                "amount_eur": None,
                "amount_usdt": None,
                "rate_usd_bs": None,
                "rate_eur_bs": None,
                "rate_usdt_bs": None,
            }

    if extra_data:
        update_data.update(extra_data)

    membership = await sharing.get_membership(db, goal_id)

    if membership:
        share, member = membership
        sharing.require_admin(member)

        if 'is_completed' in update_data:
            if update_data['is_completed'] and not db_goal.is_completed:
                update_data['completed_at'] = datetime.datetime.now(datetime.timezone.utc)
            elif not update_data['is_completed']:
                update_data['completed_at'] = None

        for key, value in update_data.items():
            setattr(db_goal, key, value)
        await db.flush()

        await sharing.sync_parent_fields(db, share, goal_id, update_data)

        if 'target_amount' in update_data or 'currency' in update_data:
            siblings = await sharing.sibling_entity_ids(db, share.id)
            all_ids = list(set(list(siblings.values()) + [goal_id]))
            await sharing.recompute_settlement(db, "saving_goal", all_ids)
    else:
        if 'is_completed' in update_data:
            if update_data['is_completed'] and not db_goal.is_completed:
                db_goal.completed_at = datetime.datetime.now(datetime.timezone.utc)
            elif not update_data['is_completed']:
                db_goal.completed_at = None

        for key, value in update_data.items():
            setattr(db_goal, key, value)
        await db.flush()

        if 'target_amount' in update_data or 'currency' in update_data:
            await sharing.recompute_settlement(db, "saving_goal", [goal_id])

        if shared_with_ids:
            clean_targets = [tid for tid in shared_with_ids if tid != user_id]
            if clean_targets:
                await sharing.assert_can_add(db, user_id, clean_targets)
                share = await sharing.create_share(
                    db=db,
                    entity_type="saving_goal",
                    owner_id=user_id,
                    owner_entity=db_goal,
                    target_ids=clean_targets,
                    admin_ids=admin_ids or []
                )

                user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
                user_prof = user_prof_res.scalars().first()
                req_name = user_prof.display_name if user_prof and user_prof.display_name else "Tu pana"

                is_proj = db_goal.type == "project"
                title_es = "Nuevo proyecto compartido" if is_proj else "Nuevo fondo de ahorro compartido"
                ent_desc = "un proyecto compartido" if is_proj else "un fondo de ahorro compartido"

                await sharing.notify_members(
                    db=db,
                    share_id=share.id,
                    exclude_user_id=user_id,
                    title=title_es,
                    body=f"{req_name} creó {ent_desc}: {db_goal.name}",
                    type="savings",
                    url="/herramientas/ahorros"
                )

    await db.commit()
    return await get_saving_goal(db, goal_id, user_id)


async def delete_saving_goal(db: AsyncSession, goal_id: UUID, user_id: UUID) -> bool:
    db_goal = await get_saving_goal(db, goal_id, user_id)
    if not db_goal:
        return False

    membership = await sharing.get_membership(db, goal_id)

    if membership:
        share, member = membership
        is_proj = db_goal.type == "project"
        ent_desc = "un proyecto compartido" if is_proj else "un fondo de ahorro compartido"
        ent_noun = "proyecto" if is_proj else "fondo de ahorro"

        if member.role != "admin":
            raise HTTPException(
                status_code=403,
                detail=f"Solo un administrador puede eliminar {ent_desc}. Si deseas dejar de verlo, usa la opción 'Salir'."
            )

        user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        user_prof = user_prof_res.scalars().first()
        user_name = user_prof.display_name if user_prof and user_prof.display_name else "Usuario"

        await sharing.notify_members(
            db=db,
            share_id=share.id,
            exclude_user_id=user_id,
            title=f"{ent_noun.capitalize()} eliminado",
            body=f"{user_name} eliminó el {ent_noun} compartido '{db_goal.name}' para todos los integrantes",
            type="savings",
            url="/herramientas/ahorros"
        )

        members = await sharing.get_members(db, share.id)
        entity_ids = [m.entity_id for m in members]
        if entity_ids:
            linked_exp_res = await db.execute(
                select(models.SavingDeposit.expense_id).where(
                    models.SavingDeposit.goal_id.in_(entity_ids),
                    models.SavingDeposit.expense_id.isnot(None)
                )
            )
            linked_exp_ids = [eid for eid in linked_exp_res.scalars().all() if eid is not None]
            if linked_exp_ids:
                await db.execute(delete(models.Expense).where(models.Expense.id.in_(linked_exp_ids)))

            res = await db.execute(select(models.SavingGoal).where(models.SavingGoal.id.in_(entity_ids)))
            for g_obj in res.scalars().all():
                await db.delete(g_obj)

        await db.delete(share)
    else:
        linked_exp_res = await db.execute(
            select(models.SavingDeposit.expense_id).where(
                models.SavingDeposit.goal_id == goal_id,
                models.SavingDeposit.expense_id.isnot(None)
            )
        )
        linked_exp_ids = [eid for eid in linked_exp_res.scalars().all() if eid is not None]
        if linked_exp_ids:
            await db.execute(delete(models.Expense).where(models.Expense.id.in_(linked_exp_ids)))

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

    was_completed = db_goal.is_completed

    prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
    user_prof = prof_res.scalars().first()
    user_name = user_prof.display_name if user_prof and user_prof.display_name else "Usuario"

    data = deposit.model_dump(exclude_unset=True)
    if 'manual_rate' in data:
        del data['manual_rate']
    register_as_expense = data.pop('register_as_expense', False)

    if extra_data:
        data.update(extra_data)

    data["deposit_date"] = data.get("deposit_date") or datetime.date.today()

    expense_id = None
    if register_as_expense:
        if db_goal.type == 'project':
            exp_desc = f"Pago {db_goal.name}: {deposit.note}" if deposit.note else f"Pago de Proyecto: {db_goal.name}"
            exp_cat = db_goal.category or "Otros"
        else:
            exp_desc = f"Aporte de Ahorro: {db_goal.name}"
            exp_cat = db_goal.category or "Sin Categoría"

        expense_data = {
            "amount": data["amount"],
            "currency": data["currency"].value if hasattr(data["currency"], "value") else str(data["currency"]),
            "description": exp_desc,
            "category": exp_cat,
            "date": data["deposit_date"],
            "user_id": user_id
        }
        for key in ["amount_usd", "amount_bs", "amount_eur", "amount_usdt", "rate_usd_bs", "rate_eur_bs", "rate_usdt_bs"]:
            if extra_data and key in extra_data:
                expense_data[key] = extra_data[key]

        db_expense = models.Expense(**expense_data)
        db.add(db_expense)
        await db.flush()
        expense_id = db_expense.id

    sync_uuid = uuid4()
    db_deposit = models.SavingDeposit(
        **data,
        goal_id=goal_id,
        create_expense=register_as_expense,
        expense_id=expense_id,
        paid_by_name=user_name,
        paid_by_user_id=user_id,
        sync_id=sync_uuid
    )
    db.add(db_deposit)
    db_goal.deposits.append(db_deposit)
    await db.flush()

    membership = await sharing.get_membership(db, goal_id)

    if membership:
        share, member = membership
        await sharing.fan_out_child_create(
            db=db,
            share=share,
            source_child=db_deposit,
            child_data=data,
            child_model=models.SavingDeposit,
            parent_fk_name="goal_id",
            payer_id=user_id,
            payer_name=user_name
        )

        siblings = await sharing.sibling_entity_ids(db, share.id)
        all_goal_ids = list(set(list(siblings.values()) + [goal_id]))
        await sharing.recompute_settlement(db, "saving_goal", all_goal_ids)

        await db.refresh(db_goal)
        curr_label = data["currency"].value if hasattr(data["currency"], "value") else str(data["currency"])
        is_project = db_goal.type == "project"
        dep_noun = "pago" if is_project else "aporte"
        dep_verb = "pagó" if is_project else "aportó"
        ent_noun = "el proyecto" if is_project else "el fondo"
        ent_label = "al proyecto" if is_project else "al fondo"

        if not is_project and not was_completed and db_goal.is_completed:
            await sharing.notify_members(
                db=db,
                share_id=share.id,
                exclude_user_id=None,
                title="🎉 ¡Meta de ahorro alcanzada!",
                body=f"¡Felicidades! Se completó {ent_noun} compartido '{db_goal.name}' con un {dep_noun} de {user_name} de {data['amount']} {curr_label}!",
                type="savings",
                url="/herramientas/ahorros"
            )
        else:
            await sharing.notify_members(
                db=db,
                share_id=share.id,
                exclude_user_id=user_id,
                title="Pago en proyecto compartido" if is_project else "Aporte a fondo compartido",
                body=f"{user_name} {dep_verb} {data['amount']} {curr_label} {ent_label} '{db_goal.name}'",
                type="savings",
                url="/herramientas/ahorros"
            )
    else:
        await sharing.recompute_settlement(db, "saving_goal", [goal_id])
        await db.refresh(db_goal)
        is_project = db_goal.type == "project"
        if not is_project and not was_completed and db_goal.is_completed:
            await send_notification_to_user(
                db=db,
                user_id=user_id,
                title="🎉 ¡Meta de ahorro alcanzada!",
                body=f"¡Felicidades! Has completado tu meta '{db_goal.name}'.",
                type="savings",
                url="/herramientas/ahorros"
            )

    await db.commit()
    if register_as_expense:
        dep_date = data["deposit_date"]
        await check_and_notify_budget_thresholds(db, user_id, dep_date, allow_notify=True)
    return await get_saving_goal(db, goal_id, user_id)


async def update_saving_deposit(
    db: AsyncSession,
    deposit_id: UUID,
    user_id: UUID,
    deposit_update: schemas.SavingDepositUpdate,
    extra_data: Optional[dict] = None
) -> Optional[models.SavingGoal]:
    result = await db.execute(
        select(models.SavingDeposit)
        .join(models.SavingGoal)
        .filter(models.SavingDeposit.id == deposit_id, models.SavingGoal.user_id == user_id)
    )
    deposit = result.scalars().first()
    if not deposit:
        return None

    membership = await sharing.get_membership(db, deposit.goal_id)
    if membership:
        share, member = membership
        if not sharing.can_edit_child(member, deposit.paid_by_user_id):
            raise HTTPException(status_code=403, detail="Solo puedes editar tus propios aportes o debes ser administrador")

    update_dict = deposit_update.model_dump(exclude_unset=True)
    manual_rate = update_dict.pop('manual_rate', None)

    if extra_data is None and ('amount' in update_dict or 'currency' in update_dict):
        new_amount = update_dict.get('amount', deposit.amount)
        raw_curr = update_dict.get('currency', deposit.currency)
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
        setattr(deposit, k, v)
    await db.flush()

    # If linked to expense, update expense record too (only if belonging to the payer/user)
    if deposit.expense_id:
        target_owner_id = deposit.paid_by_user_id or user_id
        exp_res = await db.execute(
            select(models.Expense).filter(
                models.Expense.id == deposit.expense_id,
                models.Expense.user_id == target_owner_id
            )
        )
        exp = exp_res.scalars().first()
        if exp:
            if 'amount' in update_dict:
                exp.amount = update_dict['amount']
            if 'currency' in update_dict:
                exp.currency = update_dict['currency'].value if hasattr(update_dict['currency'], 'value') else str(update_dict['currency'])
            if 'deposit_date' in update_dict:
                exp.date = update_dict['deposit_date']
            for key in ["amount_usd", "amount_bs", "amount_eur", "amount_usdt", "rate_usd_bs", "rate_eur_bs", "rate_usdt_bs"]:
                if key in update_dict:
                    setattr(exp, key, update_dict[key])

    if membership and deposit.sync_id:
        share, _ = membership
        await sharing.fan_out_child_update(db, models.SavingDeposit, deposit.sync_id, update_dict)
        siblings = await sharing.sibling_entity_ids(db, share.id)
        all_goal_ids = list(set(list(siblings.values()) + [deposit.goal_id]))
        await sharing.recompute_settlement(db, "saving_goal", all_goal_ids)
    else:
        await sharing.recompute_settlement(db, "saving_goal", [deposit.goal_id])

    had_expense = deposit.expense_id is not None
    dep_date = deposit.deposit_date

    await db.commit()
    if had_expense:
        await check_and_notify_budget_thresholds(db, user_id, dep_date, allow_notify=True)
    return await get_saving_goal(db, deposit.goal_id, user_id)


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
    sync_id = deposit.sync_id or deposit.id
    amount_label = f"{deposit.amount} {deposit.currency}"

    # If linked to expense, delete the expense as well (only if belonging to the payer/user)
    if deposit.expense_id:
        target_owner_id = deposit.paid_by_user_id or user_id
        exp_res = await db.execute(
            select(models.Expense).filter(
                models.Expense.id == deposit.expense_id,
                models.Expense.user_id == target_owner_id
            )
        )
        exp = exp_res.scalars().first()
        if exp:
            await db.delete(exp)

    membership = await sharing.get_membership(db, goal_id)

    if membership:
        share, member = membership
        if not sharing.can_edit_child(member, deposit.paid_by_user_id):
            raise HTTPException(status_code=403, detail="Solo puedes eliminar tus propios aportes o debes ser administrador")

        user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        user_prof = user_prof_res.scalars().first()
        user_name = user_prof.display_name if user_prof and user_prof.display_name else "Usuario"

        g_res = await db.execute(select(models.SavingGoal).where(models.SavingGoal.id == goal_id))
        g_obj = g_res.scalars().first()
        goal_name = g_obj.name if g_obj else "Fondo"

        if deposit.sync_id:
            linked_expense_ids = await sharing.fan_out_child_delete(db, models.SavingDeposit, deposit.sync_id)
            for lexp_id in set(linked_expense_ids):
                exp_res = await db.execute(select(models.Expense).where(models.Expense.id == lexp_id))
                exp_obj = exp_res.scalars().first()
                if exp_obj:
                    await db.delete(exp_obj)
        
        res_chk = await db.execute(select(models.SavingDeposit).where(models.SavingDeposit.id == deposit_id))
        dep_chk = res_chk.scalars().first()
        if dep_chk:
            if dep_chk.goal and hasattr(dep_chk.goal, 'deposits') and dep_chk in dep_chk.goal.deposits:
                dep_chk.goal.deposits.remove(dep_chk)
            else:
                await db.delete(dep_chk)
        await db.flush()
        if deposit.goal:
            db.expire(deposit.goal, ['deposits'])

        siblings = await sharing.sibling_entity_ids(db, share.id)
        all_goal_ids = list(set(list(siblings.values()) + [goal_id]))
        await sharing.recompute_settlement(db, "saving_goal", all_goal_ids)

        is_proj = g_obj.type == "project" if g_obj else False
        dep_noun = "pago" if is_proj else "aporte"
        ent_noun = "proyecto" if is_proj else "fondo"
        await sharing.notify_members(
            db=db,
            share_id=share.id,
            exclude_user_id=user_id,
            title=f"{dep_noun.capitalize()} eliminado de {ent_noun}",
            body=f"{user_name} eliminó un {dep_noun} de {amount_label} del {ent_noun} '{goal_name}'",
            type="savings",
            url="/herramientas/ahorros"
        )
    else:
        if deposit.goal and hasattr(deposit.goal, 'deposits') and deposit in deposit.goal.deposits:
            deposit.goal.deposits.remove(deposit)
        else:
            await db.delete(deposit)
        await db.flush()
        if deposit.goal:
            db.expire(deposit.goal, ['deposits'])
        await sharing.recompute_settlement(db, "saving_goal", [goal_id])

    had_expense = deposit.expense_id is not None
    dep_date = deposit.deposit_date

    await db.commit()
    if deposit.goal:
        db.expire(deposit.goal, ['deposits'])
    if had_expense:
        await check_and_notify_budget_thresholds(db, user_id, dep_date, allow_notify=False)
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
