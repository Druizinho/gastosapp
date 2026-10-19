from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import extract, func, case
from typing import Optional, List
from datetime import date
from uuid import UUID
from . import models, schemas
from decimal import Decimal
from .crud_budgets import check_and_notify_budget_thresholds

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
    await check_and_notify_budget_thresholds(db, user_id, db_expense.date, allow_notify=True)
    return db_expense

async def get_expenses(db: AsyncSession, user_id: UUID, skip: int = 0, limit: int = 100, date_from: date = None, date_to: date = None):
    query = select(models.Expense).filter(models.Expense.user_id == user_id)
    
    if date_from:
        query = query.filter(models.Expense.date >= date_from)
    if date_to:
        query = query.filter(models.Expense.date <= date_to)
    
    query = query.order_by(models.Expense.date.desc(), models.Expense.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
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
    await check_and_notify_budget_thresholds(db, user_id, db_expense.date, allow_notify=True)
    return db_expense

async def delete_expense(db: AsyncSession, expense_id: UUID, user_id: UUID):
    db_expense = await get_expense(db, expense_id, user_id)
    if not db_expense:
        return False
    
    exp_date = db_expense.date
    await db.delete(db_expense)
    await db.commit()
    await check_and_notify_budget_thresholds(db, user_id, exp_date, allow_notify=False)
    return True

async def get_summary(db: AsyncSession, user_id: UUID):
    # Base query helpers
    def sum_cols():
        return [
            func.coalesce(func.sum(models.Expense.amount_bs), 0),
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

async def get_summary_range(db: AsyncSession, user_id: UUID, date_from: date, date_to: date):
    """Calcula totales y desglose por categoría para un rango de fechas arbitrario."""
    def sum_cols():
        return [
            func.coalesce(func.sum(models.Expense.amount_bs), 0),
            func.coalesce(func.sum(models.Expense.amount_usd), 0),
            func.coalesce(func.sum(models.Expense.amount_eur), 0),
            func.coalesce(func.sum(models.Expense.amount_usdt), 0)
        ]

    # Totales del rango
    total_result = await db.execute(
        select(*sum_cols())
        .filter(models.Expense.user_id == user_id)
        .filter(models.Expense.date >= date_from)
        .filter(models.Expense.date <= date_to)
    )
    total_bs, total_usd, total_eur, total_usdt = total_result.first()

    # Por categoría
    category_result = await db.execute(
        select(models.Expense.category, *sum_cols())
        .filter(models.Expense.user_id == user_id)
        .filter(models.Expense.date >= date_from)
        .filter(models.Expense.date <= date_to)
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

    days_in_range = max((date_to - date_from).days + 1, 1)  # mínimo 1 para evitar div/0

    return schemas.RangeSummaryResponse(
        date_from=date_from,
        date_to=date_to,
        days_in_range=days_in_range,
        total_bs=total_bs,
        total_usd=total_usd,
        total_eur=total_eur,
        total_usdt=total_usdt,
        daily_avg_bs=total_bs / days_in_range,
        daily_avg_usd=total_usd / days_in_range,
        daily_avg_eur=total_eur / days_in_range,
        daily_avg_usdt=total_usdt / days_in_range,
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

async def update_category(db: AsyncSession, category_id: UUID, category_update: schemas.CategoryCreate, user_id: UUID):
    db_category = await get_category(db, category_id, user_id)
    if not db_category:
        return None
    
    # Check if there's a name change and we need to update existing expenses & budgets
    old_name = db_category.name
    new_name = category_update.name
    
    for key, value in category_update.model_dump().items():
        setattr(db_category, key, value)
        
    if old_name != new_name:
        # 1. Update expenses that used the old category name
        await db.execute(
            models.Expense.__table__.update()
            .where(models.Expense.user_id == user_id)
            .where(models.Expense.category == old_name)
            .values(category=new_name)
        )

        # 2. Synchronize BudgetCategoryLimit for user's budgets
        user_budgets_res = await db.execute(
            select(models.MonthlyBudget.id).where(models.MonthlyBudget.user_id == user_id)
        )
        user_budget_ids = user_budgets_res.scalars().all()
        if user_budget_ids:
            existing_new_limits = await db.execute(
                select(models.BudgetCategoryLimit.budget_id)
                .where(models.BudgetCategoryLimit.budget_id.in_(user_budget_ids))
                .where(models.BudgetCategoryLimit.category_name == new_name)
            )
            budgets_with_new = set(existing_new_limits.scalars().all())
            budgets_to_rename = [b_id for b_id in user_budget_ids if b_id not in budgets_with_new]

            if budgets_to_rename:
                await db.execute(
                    models.BudgetCategoryLimit.__table__.update()
                    .where(models.BudgetCategoryLimit.budget_id.in_(budgets_to_rename))
                    .where(models.BudgetCategoryLimit.category_name == old_name)
                    .values(category_name=new_name)
                )
            if budgets_with_new:
                await db.execute(
                    models.BudgetCategoryLimit.__table__.delete()
                    .where(models.BudgetCategoryLimit.budget_id.in_(list(budgets_with_new)))
                    .where(models.BudgetCategoryLimit.category_name == old_name)
                )
        
    await db.commit()
    await db.refresh(db_category)
    return db_category

async def delete_category(db: AsyncSession, category_id: UUID, user_id: UUID, reassign_to: Optional[str] = None):
    db_category = await get_category(db, category_id, user_id)
    if not db_category:
        return False
    
    category_name = db_category.name
    target_category = reassign_to if reassign_to else "Sin Categoría"

    # 1. Reassign expenses
    await db.execute(
        models.Expense.__table__.update()
        .where(models.Expense.user_id == user_id)
        .where(models.Expense.category == category_name)
        .values(category=target_category)
    )

    # 2. Synchronize BudgetCategoryLimit rows
    user_budgets_res = await db.execute(
        select(models.MonthlyBudget.id).where(models.MonthlyBudget.user_id == user_id)
    )
    user_budget_ids = user_budgets_res.scalars().all()
    if user_budget_ids:
        if reassign_to:
            existing_target_limits = await db.execute(
                select(models.BudgetCategoryLimit.budget_id)
                .where(models.BudgetCategoryLimit.budget_id.in_(user_budget_ids))
                .where(models.BudgetCategoryLimit.category_name == reassign_to)
            )
            budgets_with_target = set(existing_target_limits.scalars().all())
            budgets_to_reassign = [b_id for b_id in user_budget_ids if b_id not in budgets_with_target]

            if budgets_to_reassign:
                await db.execute(
                    models.BudgetCategoryLimit.__table__.update()
                    .where(models.BudgetCategoryLimit.budget_id.in_(budgets_to_reassign))
                    .where(models.BudgetCategoryLimit.category_name == category_name)
                    .values(category_name=reassign_to)
                )
            if budgets_with_target:
                await db.execute(
                    models.BudgetCategoryLimit.__table__.delete()
                    .where(models.BudgetCategoryLimit.budget_id.in_(list(budgets_with_target)))
                    .where(models.BudgetCategoryLimit.category_name == category_name)
                )
        else:
            await db.execute(
                models.BudgetCategoryLimit.__table__.delete()
                .where(models.BudgetCategoryLimit.budget_id.in_(user_budget_ids))
                .where(models.BudgetCategoryLimit.category_name == category_name)
            )
    
    await db.delete(db_category)
    await db.commit()
    return True
