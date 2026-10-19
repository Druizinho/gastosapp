from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_, and_
from fastapi import HTTPException
from typing import List, Optional
from uuid import UUID, uuid4
from decimal import Decimal
from datetime import datetime, timezone, date

from . import models, schemas, sharing, bcv_service
from .push_service import send_notification_to_user
from .crud_budgets import check_and_notify_budget_thresholds


def _debt_url(debt_type: Optional[str]) -> str:
    return "/herramientas/deudas-por-cobrar" if debt_type == "receivable" else "/herramientas/deudas-nuestras"


async def get_debts(db: AsyncSession, user_id: UUID, debt_type: str, is_settled: Optional[bool] = None):
    query = select(models.Debt).filter(
        models.Debt.user_id == user_id,
        models.Debt.type == debt_type
    ).options(selectinload(models.Debt.payments))
    
    if is_settled is not None:
        query = query.filter(models.Debt.is_settled == is_settled)
        
    query = query.order_by(models.Debt.created_at.desc())
    result = await db.execute(query)
    debts = result.scalars().all()
    await sharing.populate_share_meta(db, debts, user_id, "debt")
    return debts


async def get_debt(db: AsyncSession, debt_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.Debt)
        .filter(models.Debt.id == debt_id, models.Debt.user_id == user_id)
        .options(selectinload(models.Debt.payments))
    )
    debt = result.scalars().first()
    if debt:
        await sharing.populate_share_meta(db, [debt], user_id, "debt")
    return debt


async def create_debt(db: AsyncSession, debt: schemas.DebtCreate, user_id: UUID):
    shared_with_ids = [tid for tid in (debt.shared_with_ids or []) if tid != user_id]
    admin_ids = debt.admin_ids or []
    
    debt_data = debt.model_dump(exclude={'shared_with', 'shared_with_ids', 'admin_ids'})
    
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
            url=_debt_url(db_debt.type)
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
    membership = await sharing.get_membership(db, debt_id)

    if membership:
        share, member = membership
        sharing.require_admin(member)

        # Apply update to current user's debt
        for key, value in update_data.items():
            setattr(db_debt, key, value)
        await db.flush()

        # Sync changes to all sibling debts in the share
        await sharing.sync_parent_fields(db, share, debt_id, update_data)

        # If financial fields changed, recalculate settlement for all members
        siblings = await sharing.sibling_entity_ids(db, share.id)
        all_debt_ids = list(set(list(siblings.values()) + [debt_id]))
        if 'total_amount' in update_data or 'currency' in update_data:
            await sharing.recompute_settlement(db, "debt", all_debt_ids)

        # If manually marked settled, notify members
        if update_data.get('is_settled') is True:
            user_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
            user_prof = user_prof_res.scalars().first()
            user_name = user_prof.display_name if user_prof and user_prof.display_name else "Usuario"
            await sharing.notify_members(
                db=db,
                share_id=share.id,
                exclude_user_id=user_id,
                title="¡Deuda saldada!",
                body=f"🎉 {user_name} marcó la deuda '{db_debt.concept}' como saldada",
                type="shared_debt_settled",
                url=_debt_url(db_debt.type)
            )
    else:
        # Debt was not shared previously
        for key, value in update_data.items():
            setattr(db_debt, key, value)
        await db.flush()

        if 'total_amount' in update_data or 'currency' in update_data:
            await sharing.recompute_settlement(db, "debt", [debt_id])

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
                    url=_debt_url(db_debt.type)
                )

    await db.commit()
    return await get_debt(db, debt_id, user_id)


async def delete_debt(db: AsyncSession, debt_id: UUID, user_id: UUID):
    db_debt = await get_debt(db, debt_id, user_id)
    if not db_debt:
        return False

    membership = await sharing.get_membership(db, debt_id)

    if membership:
        share, member = membership
        if member.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Solo un administrador puede eliminar una deuda compartida. Si deseas dejar de verla, usa la opción 'Salir'."
            )

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
            url=_debt_url(debt_type)
        )

        # Batch-load and delete all member copies and share
        members = await sharing.get_members(db, share.id)
        entity_ids = [m.entity_id for m in members]
        if entity_ids:
            res = await db.execute(select(models.Debt).where(models.Debt.id.in_(entity_ids)))
            for d_obj in res.scalars().all():
                await db.delete(d_obj)

        await db.delete(share)
    else:
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

    if register_as_expense:
        expense_data = {
            "amount": data["amount"],
            "currency": data["currency"],
            "description": f"Abono: {db_debt.concept} -> {db_debt.counterpart}",
            "category": "Deudas",
            "date": data.get("payment_date") or date.today(),
            "user_id": user_id
        }
        for key in ["amount_usd", "amount_bs", "amount_eur", "amount_usdt", "rate_usd_bs", "rate_eur_bs", "rate_usdt_bs"]:
            if extra_data and key in extra_data:
                expense_data[key] = extra_data[key]
                
        db_expense = models.Expense(**expense_data)
        db.add(db_expense)

    membership = await sharing.get_membership(db, debt_id)

    if membership:
        share, member = membership
        await sharing.fan_out_child_create(
            db=db,
            share=share,
            source_child=db_payment,
            child_data=data,
            child_model=models.DebtPayment,
            parent_fk_name="debt_id",
            payer_id=user_id,
            payer_name=payer_name
        )

        siblings = await sharing.sibling_entity_ids(db, share.id)
        all_debt_ids = list(set(list(siblings.values()) + [debt_id]))
        await sharing.recompute_settlement(db, "debt", all_debt_ids)

        # Check if settled after payment
        await db.refresh(db_debt)
        curr_label = payment.currency.value if hasattr(payment.currency, "value") else str(payment.currency)
        if db_debt.is_settled:
            await sharing.notify_members(
                db=db,
                share_id=share.id,
                exclude_user_id=user_id,
                title="¡Deuda saldada!",
                body=f"🎉 ¡La deuda '{db_debt.concept}' fue saldada por {payer_name} con un abono de {payment.amount} {curr_label}!",
                type="shared_debt_settled",
                url=_debt_url(db_debt.type)
            )
        else:
            await sharing.notify_members(
                db=db,
                share_id=share.id,
                exclude_user_id=user_id,
                title="Nuevo abono en deuda compartida",
                body=f"{payer_name} abonó {payment.amount} {curr_label} a la deuda '{db_debt.concept}'",
                type="shared_debt_payment",
                url=_debt_url(db_debt.type)
            )
    else:
        # Check settlement on personal debt
        await sharing.recompute_settlement(db, "debt", [debt_id])

    await db.commit()
    if register_as_expense:
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
        select(models.DebtPayment)
        .join(models.Debt)
        .filter(models.DebtPayment.id == payment_id, models.Debt.user_id == user_id)
    )
    payment = result.scalars().first()
    if not payment:
        return None

    membership = await sharing.get_membership(db, payment.debt_id)
    if membership:
        share, member = membership
        if not sharing.can_edit_child(member, payment.paid_by_user_id):
            raise HTTPException(status_code=403, detail="Solo puedes editar tus propios abonos o debes ser administrador")

    update_dict = payment_update.model_dump(exclude_unset=True)
    manual_rate = update_dict.pop('manual_rate', None)

    if extra_data is None and ('amount' in update_dict or 'currency' in update_dict):
        new_amount = update_dict.get('amount', payment.amount)
        raw_curr = update_dict.get('currency', payment.currency)
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
        setattr(payment, k, v)
    await db.flush()

    if membership and payment.sync_id:
        share, _ = membership
        await sharing.fan_out_child_update(db, models.DebtPayment, payment.sync_id, update_dict)
        siblings = await sharing.sibling_entity_ids(db, share.id)
        all_debt_ids = list(set(list(siblings.values()) + [payment.debt_id]))
        await sharing.recompute_settlement(db, "debt", all_debt_ids)
    else:
        await sharing.recompute_settlement(db, "debt", [payment.debt_id])

    await db.commit()
    return await get_debt(db, payment.debt_id, user_id)


async def delete_debt_payment(db: AsyncSession, payment_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.DebtPayment)
        .join(models.Debt)
        .filter(models.DebtPayment.id == payment_id, models.Debt.user_id == user_id)
    )
    payment = result.scalars().first()
    if not payment:
        return None
        
    debt_id = payment.debt_id
    sync_id = payment.sync_id or payment.id
    amount_label = f"{payment.amount} {payment.currency}"

    membership = await sharing.get_membership(db, debt_id)

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

        # Delete across all siblings via sync_id
        await sharing.fan_out_child_delete(db, models.DebtPayment, sync_id)

        siblings = await sharing.sibling_entity_ids(db, share.id)
        all_debt_ids = list(set(list(siblings.values()) + [debt_id]))
        await sharing.recompute_settlement(db, "debt", all_debt_ids)

        await sharing.notify_members(
            db=db,
            share_id=share.id,
            exclude_user_id=user_id,
            title="Abono eliminado",
            body=f"{user_name} eliminó un abono de {amount_label} en la deuda '{concept}'",
            type="shared_debt_payment",
            url=_debt_url(debt_type)
        )
    else:
        await db.delete(payment)
        await db.flush()
        await sharing.recompute_settlement(db, "debt", [debt_id])

    await db.commit()
    return await get_debt(db, debt_id, user_id)
