from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List
from uuid import UUID
from . import models, schemas
from decimal import Decimal


async def create_fixed_expense(db: AsyncSession, expense: schemas.FixedExpenseCreate, user_id: UUID, extra_data: dict = None):
    data = expense.model_dump(exclude_unset=True)
    if 'manual_rate' in data:
        del data['manual_rate']
    if extra_data:
        data.update(extra_data)
    
    db_expense = models.FixedExpense(**data, user_id=user_id)
    db.add(db_expense)
    await db.commit()
    await db.refresh(db_expense)
    return db_expense


async def get_fixed_expenses(db: AsyncSession, user_id: UUID, active_only: bool = False):
    query = select(models.FixedExpense).filter(models.FixedExpense.user_id == user_id)
    
    if active_only:
        query = query.filter(models.FixedExpense.is_active == True)
    
    query = query.order_by(models.FixedExpense.payment_day.asc().nullslast(), models.FixedExpense.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


async def get_fixed_expense(db: AsyncSession, expense_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.FixedExpense).filter(
            models.FixedExpense.id == expense_id,
            models.FixedExpense.user_id == user_id
        )
    )
    return result.scalars().first()


async def update_fixed_expense(db: AsyncSession, expense_id: UUID, expense: schemas.FixedExpenseUpdate, user_id: UUID, extra_data: dict = None):
    db_expense = await get_fixed_expense(db, expense_id, user_id)
    if not db_expense:
        return None
    
    update_data = expense.model_dump(exclude_unset=True)
    if 'manual_rate' in update_data:
        del update_data['manual_rate']
    if extra_data:
        update_data.update(extra_data)
    
    for key, value in update_data.items():
        setattr(db_expense, key, value)
    
    await db.commit()
    await db.refresh(db_expense)
    return db_expense


async def delete_fixed_expense(db: AsyncSession, expense_id: UUID, user_id: UUID):
    db_expense = await get_fixed_expense(db, expense_id, user_id)
    if not db_expense:
        return False
    
    await db.delete(db_expense)
    await db.commit()
    return True


async def get_fixed_expenses_summary(db: AsyncSession, user_id: UUID):
    """Calculate summary of active fixed expenses."""
    # Count active
    count_result = await db.execute(
        select(func.count(models.FixedExpense.id))
        .filter(models.FixedExpense.user_id == user_id)
        .filter(models.FixedExpense.is_active == True)
    )
    total_active = count_result.scalar() or 0

    # Sum by currency equivalents (only active)
    sum_result = await db.execute(
        select(
            func.coalesce(func.sum(models.FixedExpense.amount_bs), 0),
            func.coalesce(func.sum(models.FixedExpense.amount_usd), 0),
            func.coalesce(func.sum(models.FixedExpense.amount_eur), 0),
            func.coalesce(func.sum(models.FixedExpense.amount_usdt), 0),
        )
        .filter(models.FixedExpense.user_id == user_id)
        .filter(models.FixedExpense.is_active == True)
    )
    total_bs, total_usd, total_eur, total_usdt = sum_result.first()

    return schemas.FixedExpenseSummary(
        total_active=total_active,
        total_bs=total_bs,
        total_usd=total_usd,
        total_eur=total_eur,
        total_usdt=total_usdt,
    )
