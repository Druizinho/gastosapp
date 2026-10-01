from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List
from uuid import UUID
from . import models, schemas
from decimal import Decimal
from datetime import datetime


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
    return result.scalars().unique().all()


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


async def get_fixed_expenses_summary(db: AsyncSession, user_id: UUID, month_year: str = None):
    """Calculate summary of active fixed expenses including paid/pending counts."""
    if not month_year:
        month_year = datetime.now().strftime("%Y-%m")

    # Count active
    count_result = await db.execute(
        select(func.count(models.FixedExpense.id))
        .filter(models.FixedExpense.user_id == user_id)
        .filter(models.FixedExpense.is_active == True)
    )
    total_active = count_result.scalar() or 0

    # Count paid this month (from checks table)
    paid_result = await db.execute(
        select(func.count(models.FixedExpenseCheck.id))
        .join(models.FixedExpense, models.FixedExpenseCheck.fixed_expense_id == models.FixedExpense.id)
        .filter(models.FixedExpense.user_id == user_id)
        .filter(models.FixedExpense.is_active == True)
        .filter(models.FixedExpenseCheck.month_year == month_year)
    )
    total_paid = paid_result.scalar() or 0
    total_pending = total_active - total_paid

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
        total_paid=total_paid,
        total_pending=total_pending,
        total_bs=total_bs,
        total_usd=total_usd,
        total_eur=total_eur,
        total_usdt=total_usdt,
    )


# ── Fixed Expense Checks (payment history) ──────────────────────────

async def check_fixed_expense(
    db: AsyncSession,
    fixed_expense_id: UUID,
    check_data: schemas.FixedExpenseCheckCreate,
    extra_data: dict = None,
    expense_id: UUID = None,
):
    """Mark a fixed expense as paid for a given month."""
    data = check_data.model_dump(exclude_unset=True)
    if 'manual_rate' in data:
        del data['manual_rate']
    if extra_data:
        data.update(extra_data)
    if expense_id:
        data['expense_id'] = expense_id
    
    db_check = models.FixedExpenseCheck(**data, fixed_expense_id=fixed_expense_id)
    db.add(db_check)

    # Also update legacy last_paid_month for backward compatibility
    expense = await db.execute(
        select(models.FixedExpense).filter(models.FixedExpense.id == fixed_expense_id)
    )
    fe = expense.scalars().first()
    if fe:
        fe.last_paid_month = check_data.month_year

    await db.commit()
    await db.refresh(db_check)
    return db_check


async def uncheck_fixed_expense(db: AsyncSession, fixed_expense_id: UUID, month_year: str):
    """Remove the paid mark for a fixed expense for a given month. Returns the expense_id if one was created."""
    result = await db.execute(
        select(models.FixedExpenseCheck).filter(
            models.FixedExpenseCheck.fixed_expense_id == fixed_expense_id,
            models.FixedExpenseCheck.month_year == month_year,
        )
    )
    check = result.scalars().first()
    if not check:
        return None, None
    
    expense_id = check.expense_id
    await db.delete(check)

    # Update legacy last_paid_month
    expense = await db.execute(
        select(models.FixedExpense).filter(models.FixedExpense.id == fixed_expense_id)
    )
    fe = expense.scalars().first()
    if fe and fe.last_paid_month == month_year:
        fe.last_paid_month = None

    await db.commit()
    return True, expense_id


async def get_monthly_fixed_expenses(db: AsyncSession, user_id: UUID, month_year: str):
    """Get all fixed expenses with their check status for a specific month."""
    query = (
        select(models.FixedExpense)
        .filter(models.FixedExpense.user_id == user_id)
        .order_by(models.FixedExpense.payment_day.asc().nullslast(), models.FixedExpense.created_at.desc())
    )
    result = await db.execute(query)
    return result.scalars().unique().all()
