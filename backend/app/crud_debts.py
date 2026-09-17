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
    await db.refresh(db_debt)
    return db_debt


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
    await db.commit()
    
    # Check if settled after payment
    # This requires converting the payment amounts to the original debt currency to compare.
    # We will do a simple check on the frontend/controller level to update `is_settled`
    # or the user can manually set it, but let's refresh and return the updated debt.
    return await get_debt(db, debt_id, user_id)
