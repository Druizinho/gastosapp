from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import extract, func
from typing import Optional, List
from datetime import date
from uuid import UUID
from . import models, schemas
from decimal import Decimal

async def create_expense(db: AsyncSession, expense: schemas.ExpenseCreate):
    db_expense = models.Expense(**expense.model_dump(exclude_unset=True))
    if not db_expense.date:
        db_expense.date = date.today()
        
    db.add(db_expense)
    await db.commit()
    await db.refresh(db_expense)
    return db_expense

async def get_expenses(db: AsyncSession, skip: int = 0, limit: int = 100):
    result = await db.execute(
        select(models.Expense).order_by(models.Expense.date.desc(), models.Expense.created_at.desc()).offset(skip).limit(limit)
    )
    return result.scalars().all()

async def get_expense(db: AsyncSession, expense_id: UUID):
    result = await db.execute(select(models.Expense).filter(models.Expense.id == expense_id))
    return result.scalars().first()

async def update_expense(db: AsyncSession, expense_id: UUID, expense: schemas.ExpenseUpdate):
    db_expense = await get_expense(db, expense_id)
    if not db_expense:
        return None
    
    update_data = expense.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_expense, key, value)
        
    await db.commit()
    await db.refresh(db_expense)
    return db_expense

async def delete_expense(db: AsyncSession, expense_id: UUID):
    db_expense = await get_expense(db, expense_id)
    if not db_expense:
        return False
    
    await db.delete(db_expense)
    await db.commit()
    return True

async def get_summary(db: AsyncSession):
    # Total spent
    total_result = await db.execute(select(func.sum(models.Expense.amount)))
    total_spent = total_result.scalar() or Decimal('0.0')

    # Total this month
    today = date.today()
    month_result = await db.execute(
        select(func.sum(models.Expense.amount))
        .filter(extract('year', models.Expense.date) == today.year)
        .filter(extract('month', models.Expense.date) == today.month)
    )
    total_this_month = month_result.scalar() or Decimal('0.0')

    # By category
    category_result = await db.execute(
        select(models.Expense.category, func.sum(models.Expense.amount))
        .group_by(models.Expense.category)
    )
    by_category = [{"category": row[0], "total": row[1]} for row in category_result.all()]

    return schemas.SummaryResponse(
        total_spent=total_spent,
        total_this_month=total_this_month,
        by_category=by_category
    )
