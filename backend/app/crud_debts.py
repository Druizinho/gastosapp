from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_, and_
from fastapi import HTTPException
from typing import List, Optional
from uuid import UUID
from decimal import Decimal

from . import models, schemas
from .push_service import send_notification_to_user


async def _populate_shared_info(db: AsyncSession, debts: List[models.Debt], user_id: UUID) -> List[models.Debt]:
    if not debts:
        return debts
    
    debt_ids = [d.id for d in debts]
    shared_result = await db.execute(
        select(models.SharedDebt).where(
            or_(
                models.SharedDebt.debt_id.in_(debt_ids),
                models.SharedDebt.mirror_debt_id.in_(debt_ids)
            )
        )
    )
    shared_records = shared_result.scalars().all()
    if not shared_records:
        for d in debts:
            d.is_shared = False
            d.shared_partner_name = None
            d.shared_by = None
        return debts

    profile_ids = set()
    for s in shared_records:
        profile_ids.add(s.owner_id)
        profile_ids.add(s.partner_id)
        
    profiles_result = await db.execute(
        select(models.Profile).where(models.Profile.id.in_(profile_ids))
    )
    profiles = {p.id: p for p in profiles_result.scalars().all()}

    shared_by_debt_id = {}
    for s in shared_records:
        shared_by_debt_id[s.debt_id] = s
        if s.mirror_debt_id:
            shared_by_debt_id[s.mirror_debt_id] = s

    for d in debts:
        if d.id in shared_by_debt_id:
            s = shared_by_debt_id[d.id]
            is_owner = s.owner_id == user_id
            partner_id = s.partner_id if is_owner else s.owner_id
            partner_profile = profiles.get(partner_id)
            owner_profile = profiles.get(s.owner_id)

            d.is_shared = True
            d.shared_partner_name = partner_profile.display_name if partner_profile and partner_profile.display_name else "Usuario"
            d.shared_by = owner_profile.display_name if owner_profile and owner_profile.display_name else "Usuario"
        else:
            d.is_shared = False
            d.shared_partner_name = None
            d.shared_by = None

    return debts


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
    await _populate_shared_info(db, debts, user_id)
    return debts


async def get_debt(db: AsyncSession, debt_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.Debt)
        .filter(models.Debt.id == debt_id, models.Debt.user_id == user_id)
        .options(selectinload(models.Debt.payments))
    )
    debt = result.scalars().first()
    if debt:
        await _populate_shared_info(db, [debt], user_id)
    return debt


async def create_debt(db: AsyncSession, debt: schemas.DebtCreate, user_id: UUID):
    shared_with = debt.shared_with
    debt_data = debt.model_dump(exclude={'shared_with'})
    
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

        partner_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == shared_with))
        partner_prof = partner_prof_res.scalars().first()
        partner_name = partner_prof.display_name if partner_prof and partner_prof.display_name else "Usuario"

        # Create primary debt
        db_debt = models.Debt(**debt_data, user_id=user_id)
        db.add(db_debt)
        await db.flush()

        # Create identical mirror debt for partner (same type and same counterpart, both share the debt together)
        mirror_data = {
            "type": debt.type,
            "counterpart": debt.counterpart,
            "concept": debt.concept,
            "total_amount": debt.total_amount,
            "currency": debt.currency.value if hasattr(debt.currency, "value") else str(debt.currency),
            "start_date": debt.start_date,
            "due_date": debt.due_date,
            "is_settled": debt.is_settled,
            "notes": debt.notes,
            "user_id": shared_with
        }
        db_mirror = models.Debt(**mirror_data)
        db.add(db_mirror)
        await db.flush()

        # Link in shared_debts
        shared_record = models.SharedDebt(
            debt_id=db_debt.id,
            owner_id=user_id,
            partner_id=shared_with,
            mirror_debt_id=db_mirror.id
        )
        db.add(shared_record)

        # Notify partner
        await send_notification_to_user(
            db=db,
            user_id=shared_with,
            title="Nueva deuda compartida",
            body=f"{req_name} creó una deuda compartida: {debt.concept}",
            type="shared_debt_created"
        )

        await db.commit()
        await db.refresh(db_debt)
        return await get_debt(db, db_debt.id, user_id)
    else:
        db_debt = models.Debt(**debt_data, user_id=user_id)
        db.add(db_debt)
        await db.commit()
        await db.refresh(db_debt)
        return await get_debt(db, db_debt.id, user_id)


async def update_debt(db: AsyncSession, debt_id: UUID, debt: schemas.DebtUpdate, user_id: UUID):
    db_debt = await get_debt(db, debt_id, user_id)
    if not db_debt:
        return None
        
    update_data = debt.model_dump(exclude_unset=True)

    # Check if this debt is shared
    shared_res = await db.execute(
        select(models.SharedDebt).where(
            or_(
                models.SharedDebt.debt_id == debt_id,
                models.SharedDebt.mirror_debt_id == debt_id
            )
        )
    )
    shared_record = shared_res.scalars().first()

    if shared_record:
        if 'total_amount' in update_data and update_data['total_amount'] != db_debt.total_amount:
            raise HTTPException(status_code=400, detail="No se puede modificar el monto de una deuda compartida")
        if 'concept' in update_data and update_data['concept'] != db_debt.concept:
            raise HTTPException(status_code=400, detail="No se puede modificar el concepto de una deuda compartida")
        if 'counterpart' in update_data and update_data['counterpart'] != db_debt.counterpart:
            raise HTTPException(status_code=400, detail="No se puede modificar la contraparte de una deuda compartida")

        mirror_id = shared_record.mirror_debt_id if shared_record.debt_id == debt_id else shared_record.debt_id
        if mirror_id:
            mirror_res = await db.execute(select(models.Debt).where(models.Debt.id == mirror_id))
            mirror_debt = mirror_res.scalars().first()
            if mirror_debt:
                if 'is_settled' in update_data:
                    mirror_debt.is_settled = update_data['is_settled']
                if 'due_date' in update_data:
                    mirror_debt.due_date = update_data['due_date']

    for key, value in update_data.items():
        setattr(db_debt, key, value)
        
    await db.commit()
    return await get_debt(db, debt_id, user_id)


async def delete_debt(db: AsyncSession, debt_id: UUID, user_id: UUID):
    db_debt = await get_debt(db, debt_id, user_id)
    if not db_debt:
        return False

    shared_res = await db.execute(
        select(models.SharedDebt).where(
            or_(
                models.SharedDebt.debt_id == debt_id,
                models.SharedDebt.mirror_debt_id == debt_id
            )
        )
    )
    shared_record = shared_res.scalars().first()
    if shared_record:
        mirror_id = shared_record.mirror_debt_id if shared_record.debt_id == debt_id else shared_record.debt_id
        if mirror_id:
            mirror_res = await db.execute(select(models.Debt).where(models.Debt.id == mirror_id))
            mirror_debt = mirror_res.scalars().first()
            if mirror_debt:
                await db.delete(mirror_debt)
        await db.delete(shared_record)

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

    db_payment = models.DebtPayment(**data, debt_id=debt_id, paid_by_name=payer_name)
    db.add(db_payment)
    db_debt.payments.append(db_payment)
    await db.flush()

    if register_as_expense:
        from datetime import date
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

    # Check if this debt is shared
    shared_res = await db.execute(
        select(models.SharedDebt).where(
            or_(
                models.SharedDebt.debt_id == debt_id,
                models.SharedDebt.mirror_debt_id == debt_id
            )
        )
    )
    shared_record = shared_res.scalars().first()

    partner_id = None
    if shared_record:
        is_owner = shared_record.owner_id == user_id
        partner_id = shared_record.partner_id if is_owner else shared_record.owner_id
        mirror_debt_id = shared_record.mirror_debt_id if shared_record.debt_id == debt_id else shared_record.debt_id
        
        if mirror_debt_id:
            mirror_payment_data = {**data}
            mirror_payment_data['debt_id'] = mirror_debt_id
            mirror_payment_data['paid_by_name'] = payer_name
            mirror_payment_data['mirror_payment_id'] = db_payment.id
            db_mirror_payment = models.DebtPayment(**mirror_payment_data)
            db.add(db_mirror_payment)
            await db.flush()
            db_payment.mirror_payment_id = db_mirror_payment.id

            # Check mirror debt settlement
            mirror_debt_res = await db.execute(
                select(models.Debt).where(models.Debt.id == mirror_debt_id).options(selectinload(models.Debt.payments))
            )
            mirror_debt = mirror_debt_res.scalars().first()
            if mirror_debt:
                cur_key = "amount_" + mirror_debt.currency.lower().replace("_bcv", "").replace("_cash", "")
                m_total_paid = Decimal("0")
                for p in mirror_debt.payments:
                    if p.currency == mirror_debt.currency:
                        m_total_paid += p.amount
                    else:
                        equiv = getattr(p, cur_key, None)
                        if equiv is not None:
                            m_total_paid += equiv
                if m_total_paid >= mirror_debt.total_amount and not mirror_debt.is_settled:
                    mirror_debt.is_settled = True

    await db.commit()
    
    # Reload debt with all payments to check settlement
    db.expire(db_debt)
    db_debt = await get_debt(db, debt_id, user_id)
    
    # Auto-detect if debt is fully paid
    currency_key = "amount_" + db_debt.currency.lower().replace("_bcv", "").replace("_cash", "")
    total_paid = Decimal("0")
    for p in db_debt.payments:
        if p.currency == db_debt.currency:
            total_paid += p.amount
        else:
            equivalent = getattr(p, currency_key, None)
            if equivalent is not None:
                total_paid += equivalent
    
    was_settled = False
    if total_paid >= db_debt.total_amount and not db_debt.is_settled:
        db_debt.is_settled = True
        was_settled = True
        await db.commit()
    elif db_debt.is_settled:
        was_settled = True

    # Send push notification to partner
    if partner_id:
        curr_label = payment.currency.value if hasattr(payment.currency, "value") else str(payment.currency)
        if was_settled:
            await send_notification_to_user(
                db=db,
                user_id=partner_id,
                title="¡Deuda saldada!",
                body=f"🎉 ¡La deuda '{db_debt.concept}' fue saldada por {payer_name}!",
                type="shared_debt_settled"
            )
        else:
            await send_notification_to_user(
                db=db,
                user_id=partner_id,
                title="Nuevo abono en deuda compartida",
                body=f"{payer_name} abonó {payment.amount} {curr_label} a la deuda '{db_debt.concept}'",
                type="shared_debt_payment"
            )
        await db.commit()
    
    return await get_debt(db, debt_id, user_id)


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
    mirror_payment_id = payment.mirror_payment_id

    # If this payment has a mirror payment, delete it and recalculate settlement on mirror debt
    if mirror_payment_id:
        mirror_payment_res = await db.execute(
            select(models.DebtPayment).where(models.DebtPayment.id == mirror_payment_id)
        )
        mirror_payment = mirror_payment_res.scalars().first()
        if mirror_payment:
            mirror_debt_id = mirror_payment.debt_id
            await db.delete(mirror_payment)
            await db.flush()
            
            mirror_debt_res = await db.execute(
                select(models.Debt).where(models.Debt.id == mirror_debt_id).options(selectinload(models.Debt.payments))
            )
            mirror_debt = mirror_debt_res.scalars().first()
            if mirror_debt:
                cur_key = "amount_" + mirror_debt.currency.lower().replace("_bcv", "").replace("_cash", "")
                m_total_paid = Decimal("0")
                for p in mirror_debt.payments:
                    if p.currency == mirror_debt.currency:
                        m_total_paid += p.amount
                    else:
                        equiv = getattr(p, cur_key, None)
                        if equiv is not None:
                            m_total_paid += equiv
                if m_total_paid < mirror_debt.total_amount and mirror_debt.is_settled:
                    mirror_debt.is_settled = False

    await db.delete(payment)
    await db.commit()
    
    db_debt = await get_debt(db, debt_id, user_id)
    
    currency_key = "amount_" + db_debt.currency.lower().replace("_bcv", "").replace("_cash", "")
    total_paid = Decimal("0")
    for p in db_debt.payments:
        if p.currency == db_debt.currency:
            total_paid += p.amount
        else:
            equivalent = getattr(p, currency_key, None)
            if equivalent is not None:
                total_paid += equivalent
    
    if total_paid < db_debt.total_amount and db_debt.is_settled:
        db_debt.is_settled = False
        await db.commit()
        
    return await get_debt(db, debt_id, user_id)
