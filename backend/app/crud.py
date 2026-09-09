from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import extract, func, case
from typing import Optional, List
from datetime import date
from uuid import UUID
from . import models, schemas
from decimal import Decimal

async def create_expense(db: AsyncSession, expense: schemas.ExpenseCreate, user_id: UUID, extra_data: dict = None):
    data = expense.model_dump(exclude_unset=True)
    if 'manual_rate' in data:
        del data['manual_rate']
    if extra_data:
        data.update(extra_data)
        
    db_expense = models.Expense(**data, user_id=user_id)
    if not db_expense.date:
        db_expense.date = date.today()
        
    db.add(db_expense)
    await db.commit()
    await db.refresh(db_expense)
    return db_expense

async def get_expenses(db: AsyncSession, user_id: UUID, skip: int = 0, limit: int = 100):
    result = await db.execute(
        select(models.Expense).filter(models.Expense.user_id == user_id).order_by(models.Expense.date.desc(), models.Expense.created_at.desc()).offset(skip).limit(limit)
    )
    return result.scalars().all()

async def get_expense(db: AsyncSession, expense_id: UUID, user_id: UUID):
    result = await db.execute(select(models.Expense).filter(models.Expense.id == expense_id, models.Expense.user_id == user_id))
    return result.scalars().first()

async def update_expense(db: AsyncSession, expense_id: UUID, expense: schemas.ExpenseUpdate, user_id: UUID, extra_data: dict = None):
    db_expense = await get_expense(db, expense_id, user_id)
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

async def delete_expense(db: AsyncSession, expense_id: UUID, user_id: UUID):
    db_expense = await get_expense(db, expense_id, user_id)
    if not db_expense:
        return False
    
    await db.delete(db_expense)
    await db.commit()
    return True

async def get_summary(db: AsyncSession, user_id: UUID):
    # Base query helpers
    def sum_cols():
        highest_rate = func.greatest(
            func.coalesce(models.Expense.rate_usd_bs, 0),
            func.coalesce(models.Expense.rate_eur_bs, 0),
            func.coalesce(models.Expense.rate_usdt_bs, 0)
        )
        return [
            func.coalesce(func.sum(
                case(
                    (models.Expense.currency == 'USD_CASH', models.Expense.amount * highest_rate),
                    else_=models.Expense.amount_bs
                )
            ), 0),
            func.coalesce(func.sum(models.Expense.amount_usd), 0),
            func.coalesce(func.sum(models.Expense.amount_eur), 0),
            func.coalesce(func.sum(models.Expense.amount_usdt), 0)
        ]
        
    # Total spent
    total_result = await db.execute(select(*sum_cols()).filter(models.Expense.user_id == user_id))
    total_bs, total_usd, total_eur, total_usdt = total_result.first()

    # Total this month
    today = date.today()
    month_result = await db.execute(
        select(*sum_cols())
        .filter(models.Expense.user_id == user_id)
        .filter(extract('year', models.Expense.date) == today.year)
        .filter(extract('month', models.Expense.date) == today.month)
    )
    month_bs, month_usd, month_eur, month_usdt = month_result.first()

    # By category
    category_result = await db.execute(
        select(models.Expense.category, *sum_cols())
        .filter(models.Expense.user_id == user_id)
        .group_by(models.Expense.category)
    )
    
    by_category = []
    for row in category_result.all():
        by_category.append(schemas.CategorySummary(
            category=row[0],
            total_bs=row[1],
            total_usd=row[2],
            total_eur=row[3],
            total_usdt=row[4]
        ))

    return schemas.SummaryResponse(
        total_spent_bs=total_bs,
        total_spent_usd=total_usd,
        total_spent_eur=total_eur,
        total_spent_usdt=total_usdt,
        total_this_month_bs=month_bs,
        total_this_month_usd=month_usd,
        total_this_month_eur=month_eur,
        total_this_month_usdt=month_usdt,
        by_category=by_category
    )

# Category CRUD

async def get_categories(db: AsyncSession, user_id: UUID):
    result = await db.execute(
        select(models.Category).filter(models.Category.user_id == user_id).order_by(models.Category.created_at.asc())
    )
    return result.scalars().all()

async def get_category(db: AsyncSession, category_id: UUID, user_id: UUID):
    result = await db.execute(select(models.Category).filter(models.Category.id == category_id, models.Category.user_id == user_id))
    return result.scalars().first()

async def create_category(db: AsyncSession, category: schemas.CategoryCreate, user_id: UUID):
    db_category = models.Category(**category.model_dump(), user_id=user_id)
    db.add(db_category)
    await db.commit()
    await db.refresh(db_category)
    return db_category

async def delete_category(db: AsyncSession, category_id: UUID, user_id: UUID):
    db_category = await get_category(db, category_id, user_id)
    if not db_category:
        return False
    
    # Reassign orphaned expenses to 'Sin Categoría'
    category_name = db_category.name
    await db.execute(
        models.Expense.__table__.update()
        .where(models.Expense.user_id == user_id)
        .where(models.Expense.category == category_name)
        .values(category="Sin Categoría")
    )
    
    await db.delete(db_category)
    await db.commit()
    return True
