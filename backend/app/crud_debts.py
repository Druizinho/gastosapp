from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_, and_, delete
from fastapi import HTTPException
from typing import List, Optional
from uuid import UUID, uuid4
from decimal import Decimal
from datetime import datetime, timezone, date

from . import models, schemas, sharing, bcv_service
from .push_service import send_notification_to_user, resolve_notifications_for_entity
from .crud_budgets import check_and_notify_budget_thresholds


def _debt_url(debt_type: Optional[str]) -> str:
    if debt_type in ["owed", "receivable"]:
        return f"/herramientas/deudas?tab={debt_type}"
    return "/herramientas/deudas"


async def get_debts(db: AsyncSession, user_id: UUID, debt_type: Optional[str] = None, is_settled: Optional[bool] = None):
    from .crud import ensure_categories_and_debts_schema
    await ensure_categories_and_debts_schema()

    query = select(models.Debt).filter(
        or_(
            models.Debt.user_id == user_id,
            models.Debt.id.in_(sharing.shared_entity_ids_subquery(user_id, "debt"))
        )
    ).options(selectinload(models.Debt.payments))
    
    if is_settled is not None:
        query = query.filter(models.Debt.is_settled == is_settled)
        
    query = query.order_by(models.Debt.start_date.desc(), models.Debt.created_at.desc())
    result = await db.execute(query)
    debts = result.scalars().all()
    await sharing.populate_share_meta(db, debts, user_id, "debt")
    if debt_type:
        debts = [d for d in debts if d.type == debt_type]
    return debts


async def get_debt(db: AsyncSession, debt_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.Debt)
        .filter(
            models.Debt.id == debt_id,
            or_(
                models.Debt.user_id == user_id,
                models.Debt.id.in_(sharing.shared_entity_ids_subquery(user_id, "debt"))
            )
        )
        .options(selectinload(models.Debt.payments))
        .execution_options(populate_existing=True)
    )
    debt = result.scalars().first()
    if debt:
        await sharing.populate_share_meta(db, [debt], user_id, "debt")
    return debt


async def create_debt(db: AsyncSession, debt: schemas.DebtCreate, user_id: UUID):
    shared_with_ids = [tid for tid in (debt.shared_with_ids or []) if tid != user_id]
    admin_ids = debt.admin_ids or []
    
    debt_data = debt.model_dump(exclude={'shared_with', 'shared_with_ids', 'admin_ids'})
    if not debt_data.get("category"):
        debt_data["category"] = "Sin Categoría"
    
    # Primary debt created for current user
    db_debt = models.Debt(**debt_data, user_id=user_id)
    db.add(db_debt)
    await db.flush()

    if shared_with_ids:
        # Validate connections
        await sharing.assert_can_add(db, user_id, shared_with_ids)

        requester_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        requester_prof = requester_prof_res.scalars().first()
        req_name = requester_prof.display_name if requester_prof and requester_prof.display_name else "Alguien"

        # Create multi-member share
        share = await sharing.create_share(
            db=db,
            entity_type="debt",
            owner_id=user_id,
            owner_entity=db_debt,
            target_ids=shared_with_ids,
            admin_ids=admin_ids
        )

        # Notify all target members
        await sharing.notify_members(
            db=db,
            share_id=share.id,
            exclude_user_id=user_id,
            title="Nueva deuda compartida",
            body=f"{req_name} creó una deuda compartida: {debt.concept}",
            type="shared_debt_created",
            url=_debt_url(db_debt.type),
            send_push=True,
            entity_type="debt",
            entity_id=db_debt.id,
        )

    await db.commit()
    await db.refresh(db_debt)
    return await get_debt(db, db_debt.id, user_id)


async def update_debt(db: AsyncSession, debt_id: UUID, debt: schemas.DebtUpdate, user_id: UUID):
    db_debt = await get_debt(db, debt_id, user_id)
    if not db_debt:
        return None
        
    update_data = debt.model_dump(exclude_unset=True)
    shared_with_ids = update_data.pop('shared_with_ids', None)
    admin_ids = update_data.pop('admin_ids', None)
    update_data.pop('shared_with', None)

    # Check if this debt is currently shared
    membership = await sharing.get_membership(db, debt_id, user_id)

    if membership:
        if isinstance(membership, (tuple, list)):
            share, member = membership
            mem_role = getattr(member, 'role', None)
            mem_share_id = getattr(share, 'id', None)
        else:
            share = getattr(membership, 'share', None)
            member = membership
            mem_role = getattr(membership, 'role', None)
            mem_share_id = getattr(membership, 'share_id', None)

        if shared_with_ids is not None and (mem_role in ("owner", "admin") or (share and share.owner_id == user_id)):
            share_obj = (await db.get(models.Share, mem_share_id)) if mem_share_id else share
            if share_obj:
                await sharing.sync_share_members(db, share_obj, user_id, db_debt, shared_with_ids, admin_ids=admin_ids)

        if 'category' in update_data:
            new_cat = update_data.pop('category')
            member.local_category = new_cat
            if db_debt.user_id == user_id:
                db_debt.category = new_cat

        changing_fields = {k: v for k, v in update_data.items() if getattr(db_debt, k, None) != v}
        if changing_fields:
            sharing.require_admin(member)
            for key, value in changing_fields.items():
                setattr(db_debt, key, value)
            await db.flush()

            if 'total_amount' in changing_fields or 'currency' in changing_fields:
                await sharing.recompute_settlement(db, "debt", [debt_id])

            if changing_fields.get('is_settled') is True:
                await resolve_notifications_for_entity(db, "debt", db_debt.id)
                user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
                user_prof = user_prof_res.scalars().first()
                user_name = user_prof.display_name if user_prof and user_prof.display_name else "Usuario"
                await sharing.notify_members(
                    db=db,
                    share_id=share.id,
                    exclude_user_id=user_id,
                    title="Deuda saldada",
                    body=f"{user_name} marcó la deuda '{db_debt.concept}' como saldada",
                    type="shared_debt_settled",
                    url=_debt_url(db_debt.type),
                    send_push=False,
                    entity_type="debt",
                    entity_id=db_debt.id,
                )
    else:
        # Debt was not shared previously
        for key, value in update_data.items():
            setattr(db_debt, key, value)
        await db.flush()

        if 'total_amount' in update_data or 'currency' in update_data:
            await sharing.recompute_settlement(db, "debt", [debt_id])

        if update_data.get('is_settled') is True:
            await resolve_notifications_for_entity(db, "debt", db_debt.id)

        # If user is now sharing it
        if shared_with_ids:
            clean_targets = [tid for tid in shared_with_ids if tid != user_id]
            if clean_targets:
                await sharing.assert_can_add(db, user_id, clean_targets)
                share = await sharing.create_share(
                    db=db,
                    entity_type="debt",
                    owner_id=user_id,
                    owner_entity=db_debt,
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
                    title="Nueva deuda compartida",
                    body=f"{user_name} compartió una deuda contigo: {db_debt.concept}",
                    type="shared_debt_created",
                    url=_debt_url(db_debt.type),
                    send_push=True,
                    entity_type="debt",
                    entity_id=db_debt.id,
                )

    await db.commit()
    _exp = db.expire_all()
    if hasattr(_exp, "__await__"):
        await _exp
    return await get_debt(db, debt_id, user_id)


async def delete_debt(db: AsyncSession, debt_id: UUID, user_id: UUID):
    db_debt = await get_debt(db, debt_id, user_id)
    if not db_debt:
        return False

    await resolve_notifications_for_entity(db, "debt", debt_id)

    membership = await sharing.get_membership(db, debt_id, user_id)

    if membership:
        share, member = membership
        sharing.require_admin(member)

        user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        user_prof = user_prof_res.scalars().first()
        user_name = user_prof.display_name if user_prof and user_prof.display_name else "Usuario"
        concept = db_debt.concept
        debt_type = db_debt.type

        # Notify members before deleting
        await sharing.notify_members(
            db=db,
            share_id=share.id,
            exclude_user_id=user_id,
            title="Deuda compartida eliminada",
            body=f"{user_name} eliminó la deuda compartida '{concept}' para todos los integrantes",
            type="shared_debt_deleted",
            url=_debt_url(debt_type),
            send_push=True,
            entity_type="debt",
            entity_id=debt_id,
        )

        # Purge linked expenses before deleting debt and payments
        linked_exp_res = await db.execute(
            select(models.DebtPayment.expense_id).where(
                models.DebtPayment.debt_id == debt_id,
                models.DebtPayment.expense_id.isnot(None)
            )
        )
        linked_exp_ids = [eid for eid in linked_exp_res.scalars().all() if eid is not None]
        if linked_exp_ids:
            await db.execute(delete(models.Expense).where(models.Expense.id.in_(linked_exp_ids)))

        await db.delete(db_debt)
        await db.delete(share)
    else:
        # Purge linked expenses for personal debt
        linked_exp_res = await db.execute(
            select(models.DebtPayment.expense_id).where(
                models.DebtPayment.debt_id == debt_id,
                models.DebtPayment.expense_id.isnot(None)
            )
        )
        linked_exp_ids = [eid for eid in linked_exp_res.scalars().all() if eid is not None]
        if linked_exp_ids:
            await db.execute(delete(models.Expense).where(models.Expense.id.in_(linked_exp_ids)))

        await db.delete(db_debt)

    await db.commit()
    return True


async def add_debt_payment(db: AsyncSession, debt_id: UUID, user_id: UUID, payment: schemas.DebtPaymentCreate, extra_data: dict = None):
    db_debt = await get_debt(db, debt_id, user_id)
    if not db_debt:
        return None
        
    data = payment.model_dump(exclude_unset=True)
    if 'manual_rate' in data:
        del data['manual_rate']
    register_as_expense = data.pop('register_as_expense', False)
    create_exp_flag = data.pop('create_expense', None)
    should_create_expense = bool(register_as_expense or create_exp_flag)

    membership = await sharing.get_membership(db, debt_id, user_id)
    payment_cat = data.get("category")
    if payment_cat and str(payment_cat).strip():
        chosen_cat = str(payment_cat).strip()
        if membership:
            membership[1].local_category = chosen_cat
        elif db_debt.user_id == user_id:
            db_debt.category = chosen_cat
        effective_category = chosen_cat
    else:
        effective_category = (membership[1].local_category if (membership and membership[1].local_category) else None) or db_debt.category or "Deudas"
    data["category"] = effective_category
    data["create_expense"] = should_create_expense

    if extra_data:
        data.update(extra_data)

    payer_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
    payer_prof = payer_prof_res.scalars().first()
    payer_name = payer_prof.display_name if payer_prof and payer_prof.display_name else "Usuario"

    sync_uuid = uuid4()
    db_payment = models.DebtPayment(
        **data,
        debt_id=debt_id,
        paid_by_name=payer_name,
        paid_by_user_id=user_id,
        sync_id=sync_uuid
    )
    db.add(db_payment)
    db_debt.payments.append(db_payment)
    await db.flush()

    if should_create_expense:
        raw_curr = data["currency"].value if hasattr(data["currency"], "value") else str(data["currency"])
        expense_data = {
            "amount": data["amount"],
            "currency": raw_curr,
            "description": f"Abono: {db_debt.concept} -> {db_debt.counterpart}",
            "category": effective_category,
            "date": data.get("payment_date") or date.today(),
            "user_id": user_id
        }
        for key in ["amount_usd", "amount_bs", "amount_eur", "amount_usdt", "rate_usd_bs", "rate_eur_bs", "rate_usdt_bs"]:
            if extra_data and key in extra_data:
                expense_data[key] = extra_data[key]
                
        db_expense = models.Expense(**expense_data)
        db.add(db_expense)
        await db.flush()
        db_payment.expense_id = db_expense.id

    await sharing.recompute_settlement(db, "debt", [debt_id])
    if db_debt.is_settled:
        await resolve_notifications_for_entity(db, "debt", debt_id)

    if membership:
        share, member = membership
        await db.refresh(db_debt)
        curr_label = payment.currency.value if hasattr(payment.currency, "value") else str(payment.currency)
        if db_debt.is_settled:
            await sharing.notify_members(
                db=db,
                share_id=share.id,
                exclude_user_id=user_id,
                title="Deuda saldada",
                body=f"La deuda '{db_debt.concept}' fue saldada por {payer_name} con un abono de {payment.amount} {curr_label}",
                type="shared_debt_settled",
                url=_debt_url(db_debt.type),
                send_push=True,
                entity_type="debt",
                entity_id=debt_id,
            )
        else:
            await sharing.notify_members(
                db=db,
                share_id=share.id,
                exclude_user_id=user_id,
                title="Nuevo abono en deuda compartida",
                body=f"{payer_name} abonó {payment.amount} {curr_label} a la deuda '{db_debt.concept}'",
                type="shared_debt_payment",
                url=_debt_url(db_debt.type),
                send_push=True,
                entity_type="debt",
                entity_id=debt_id,
            )

    await db.commit()
    _exp = db.expire_all()
    if hasattr(_exp, "__await__"):
        await _exp
    if should_create_expense:
        pay_date = data.get("payment_date") or date.today()
        await check_and_notify_budget_thresholds(db, user_id, pay_date, allow_notify=True)
    return await get_debt(db, debt_id, user_id)


async def update_debt_payment(
    db: AsyncSession,
    payment_id: UUID,
    user_id: UUID,
    payment_update: schemas.DebtPaymentUpdate,
    extra_data: dict = None
):
    result = await db.execute(
        select(models.DebtPayment, models.Debt)
        .join(models.Debt, models.DebtPayment.debt_id == models.Debt.id)
        .filter(
            models.DebtPayment.id == payment_id,
            or_(
                models.Debt.user_id == user_id,
                models.Debt.id.in_(sharing.shared_entity_ids_subquery(user_id, "debt"))
            )
        )
    )
    row = result.first()
    if not row:
        return None
    payment, db_debt = row

    membership = await sharing.get_membership(db, payment.debt_id, user_id)

    update_dict = payment_update.model_dump(exclude_unset=True)
    manual_rate = update_dict.pop('manual_rate', None)
    register_as_expense = update_dict.pop('register_as_expense', None)
    create_exp_flag = update_dict.pop('create_expense', None)
    if register_as_expense is None and create_exp_flag is not None:
        register_as_expense = create_exp_flag

    if 'category' in update_dict:
        raw_cat = update_dict.pop('category')
        if raw_cat and str(raw_cat).strip():
            new_cat = str(raw_cat).strip()
            if membership:
                member = membership[1]
                member.local_category = new_cat
                if payment.paid_by_user_id == user_id:
                    payment.category = new_cat
            else:
                payment.category = new_cat

            if payment.expense_id and payment.paid_by_user_id == user_id:
                exp_res = await db.execute(
                    select(models.Expense).where(models.Expense.id == payment.expense_id)
                )
                linked_exp = exp_res.scalars().first()
                if linked_exp:
                    linked_exp.category = new_cat

        if not (update_dict or register_as_expense is not None or manual_rate is not None):
            await db.commit()
            db.expire_all()
            return await get_debt(db, payment.debt_id, user_id)

    if membership:
        share, member = membership
        if update_dict or register_as_expense is not None or manual_rate is not None:
            if not sharing.can_edit_child(member, payment.paid_by_user_id):
                raise HTTPException(status_code=403, detail="Solo puedes editar tus propios abonos o debes ser administrador")

    if extra_data is None and ('amount' in update_dict or 'currency' in update_dict or 'payment_date' in update_dict or manual_rate is not None):
        new_amount = update_dict.get('amount', payment.amount)
        raw_curr = update_dict.get('currency', payment.currency)
        new_curr = raw_curr.value if hasattr(raw_curr, "value") else str(raw_curr)
        new_date = update_dict.get('payment_date', payment.payment_date)
        date_changed = ('payment_date' in update_dict and update_dict['payment_date'] != payment.payment_date)
        rates = await bcv_service.resolve_rates_for_update(
            payment, target_date=new_date, existing_date=payment.payment_date, db=db
        )
        eff_manual = bcv_service.resolve_manual_rate_for_update(
            payment, new_curr, manual_rate, date_changed=date_changed
        )
        extra_data = bcv_service.convert_amount(
            amount=new_amount,
            currency=new_curr,
            rates=rates,
            manual_rate=eff_manual
        )

    if extra_data:
        update_dict.update(extra_data)

    for k, v in update_dict.items():
        setattr(payment, k, v)

    target_create_expense = payment.create_expense if register_as_expense is None else bool(register_as_expense)
    payment.create_expense = target_create_expense
    effective_cat = payment.category or db_debt.category or "Sin Categoría"
    if not payment.category:
        payment.category = effective_cat

    # Synchronize linked expense
    if payment.expense_id:
        exp_res = await db.execute(
            select(models.Expense).where(models.Expense.id == payment.expense_id)
        )
        linked_exp = exp_res.scalars().first()
        if linked_exp:
            if not target_create_expense:
                await db.delete(linked_exp)
                payment.expense_id = None
            else:
                linked_exp.amount = payment.amount
                raw_curr = payment.currency.value if hasattr(payment.currency, "value") else str(payment.currency)
                linked_exp.currency = raw_curr
                linked_exp.date = payment.payment_date or linked_exp.date
                linked_exp.category = payment.category or effective_cat
                linked_exp.description = f"Abono: {db_debt.concept} -> {db_debt.counterpart}"
                for key in ["amount_usd", "amount_bs", "amount_eur", "amount_usdt", "rate_usd_bs", "rate_eur_bs", "rate_usdt_bs"]:
                    if hasattr(payment, key):
                        setattr(linked_exp, key, getattr(payment, key))
        elif target_create_expense:
            raw_curr = payment.currency.value if hasattr(payment.currency, "value") else str(payment.currency)
            new_exp_data = {
                "amount": payment.amount,
                "currency": raw_curr,
                "description": f"Abono: {db_debt.concept} -> {db_debt.counterpart}",
                "category": payment.category or effective_cat,
                "date": payment.payment_date or date.today(),
                "user_id": payment.paid_by_user_id or user_id
            }
            for key in ["amount_usd", "amount_bs", "amount_eur", "amount_usdt", "rate_usd_bs", "rate_eur_bs", "rate_usdt_bs"]:
                if hasattr(payment, key):
                    new_exp_data[key] = getattr(payment, key)
            new_exp = models.Expense(**new_exp_data)
            db.add(new_exp)
            await db.flush()
            payment.expense_id = new_exp.id
    elif target_create_expense:
        raw_curr = payment.currency.value if hasattr(payment.currency, "value") else str(payment.currency)
        new_exp_data = {
            "amount": payment.amount,
            "currency": raw_curr,
            "description": f"Abono: {db_debt.concept} -> {db_debt.counterpart}",
            "category": payment.category or effective_cat,
            "date": payment.payment_date or date.today(),
            "user_id": payment.paid_by_user_id or user_id
        }
        for key in ["amount_usd", "amount_bs", "amount_eur", "amount_usdt", "rate_usd_bs", "rate_eur_bs", "rate_usdt_bs"]:
            if hasattr(payment, key):
                new_exp_data[key] = getattr(payment, key)
        new_exp = models.Expense(**new_exp_data)
        db.add(new_exp)
        await db.flush()
        payment.expense_id = new_exp.id

    await db.flush()
    await sharing.recompute_settlement(db, "debt", [payment.debt_id])

    await db.commit()
    _exp = db.expire_all()
    if hasattr(_exp, "__await__"):
        await _exp
    if target_create_expense:
        pay_date = payment.payment_date or date.today()
        await check_and_notify_budget_thresholds(db, user_id, pay_date, allow_notify=True)
    return await get_debt(db, payment.debt_id, user_id)


async def delete_debt_payment(db: AsyncSession, payment_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.DebtPayment)
        .join(models.Debt)
        .filter(
            models.DebtPayment.id == payment_id,
            or_(
                models.Debt.user_id == user_id,
                models.Debt.id.in_(sharing.shared_entity_ids_subquery(user_id, "debt"))
            )
        )
    )
    payment = result.scalars().first()
    if not payment:
        return None
        
    debt_id = payment.debt_id
    amount_label = f"{payment.amount} {payment.currency}"
    linked_expense_id = payment.expense_id

    membership = await sharing.get_membership(db, debt_id, user_id)

    if membership:
        share, member = membership
        if not sharing.can_edit_child(member, payment.paid_by_user_id):
            raise HTTPException(status_code=403, detail="Solo puedes eliminar tus propios abonos o debes ser administrador")

        user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        user_prof = user_prof_res.scalars().first()
        user_name = user_prof.display_name if user_prof and user_prof.display_name else "Usuario"

        debt_res = await db.execute(select(models.Debt).where(models.Debt.id == debt_id))
        debt_obj = debt_res.scalars().first()
        concept = debt_obj.concept if debt_obj else "Deuda"
        debt_type = debt_obj.type if debt_obj else "owed"

        if linked_expense_id:
            await db.execute(
                delete(models.Expense).where(models.Expense.id == linked_expense_id)
            )

        await db.delete(payment)
        await db.flush()
        await sharing.recompute_settlement(db, "debt", [debt_id])

        await sharing.notify_members(
            db=db,
            share_id=share.id,
            exclude_user_id=user_id,
            title="Abono eliminado",
            body=f"{user_name} eliminó un abono de {amount_label} en la deuda '{concept}'",
            type="shared_debt_payment",
            url=_debt_url(debt_type),
            send_push=True,
            entity_type="debt",
            entity_id=debt_id,
        )
    else:
        await db.delete(payment)
        if linked_expense_id:
            await db.execute(
                delete(models.Expense).where(models.Expense.id == linked_expense_id)
            )
        await db.flush()
        await sharing.recompute_settlement(db, "debt", [debt_id])

    await db.commit()
    _exp = db.expire_all()
    if hasattr(_exp, "__await__"):
        await _exp
    return await get_debt(db, debt_id, user_id)
