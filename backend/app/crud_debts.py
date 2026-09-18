from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from uuid import UUID
from . import models, schemas
from decimal import Decimal


async def get_debts(db: AsyncSession, user_id: UUID, debt_type: str, is_settled: Optional[bool] = None):
    query = select(models.Debt).filter(
        models.Debt.user_id == user_id,
        models.Debt.type == debt_type
    ).options(selectinload(models.Debt.payments))
    
    if is_settled is not None:
        query = query.filter(models.Debt.is_settled == is_settled)
        
    query = query.order_by(models.Debt.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


async def get_debt(db: AsyncSession, debt_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.Debt)
        .filter(models.Debt.id == debt_id, models.Debt.user_id == user_id)
        .options(selectinload(models.Debt.payments))
    )
    return result.scalars().first()


async def create_debt(db: AsyncSession, debt: schemas.DebtCreate, user_id: UUID):
    db_debt = models.Debt(**debt.model_dump(), user_id=user_id)
    db.add(db_debt)
    await db.commit()
    await db.refresh(db_debt)
    return await get_debt(db, db_debt.id, user_id)


async def update_debt(db: AsyncSession, debt_id: UUID, debt: schemas.DebtUpdate, user_id: UUID):
    db_debt = await get_debt(db, debt_id, user_id)
    if not db_debt:
        return None
        
    update_data = debt.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_debt, key, value)
        
    await db.commit()
    return await get_debt(db, debt_id, user_id)


async def delete_debt(db: AsyncSession, debt_id: UUID, user_id: UUID):
    db_debt = await get_debt(db, debt_id, user_id)
    if not db_debt:
        return False
        
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
    if extra_data:
        data.update(extra_data)
        
    db_payment = models.DebtPayment(**data, debt_id=debt_id)
    db.add(db_payment)
    db_debt.payments.append(db_payment)
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
    
    if total_paid >= db_debt.total_amount and not db_debt.is_settled:
        db_debt.is_settled = True
        await db.commit()
    
    return await get_debt(db, debt_id, user_id)
