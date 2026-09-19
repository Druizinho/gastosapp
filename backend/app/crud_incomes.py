from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func
from typing import List, Optional
from uuid import UUID
from . import models, schemas
from decimal import Decimal


async def create_estimated_income(db: AsyncSession, income: schemas.EstimatedIncomeCreate, user_id: UUID):
    data = income.model_dump()
    db_income = models.EstimatedIncome(**data, user_id=user_id)
    db.add(db_income)
    await db.commit()
    return await get_estimated_income(db, db_income.id, user_id)


async def get_estimated_incomes(db: AsyncSession, user_id: UUID, active_only: bool = False):
    query = (
        select(models.EstimatedIncome)
        .options(selectinload(models.EstimatedIncome.checks))
        .filter(models.EstimatedIncome.user_id == user_id)
    )
    if active_only:
        query = query.filter(models.EstimatedIncome.is_active == True)
    
    query = query.order_by(models.EstimatedIncome.payment_day.asc().nullslast(), models.EstimatedIncome.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


async def get_estimated_income(db: AsyncSession, income_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.EstimatedIncome)
        .options(selectinload(models.EstimatedIncome.checks))
        .filter(models.EstimatedIncome.id == income_id, models.EstimatedIncome.user_id == user_id)
    )
    return result.scalars().first()


async def update_estimated_income(db: AsyncSession, income_id: UUID, income: schemas.EstimatedIncomeUpdate, user_id: UUID):
    db_income = await get_estimated_income(db, income_id, user_id)
    if not db_income:
        return None
    
    update_data = income.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_income, key, value)
    
    await db.commit()
    await db.refresh(db_income)
    return await get_estimated_income(db, income_id, user_id)


async def delete_estimated_income(db: AsyncSession, income_id: UUID, user_id: UUID):
    db_income = await get_estimated_income(db, income_id, user_id)
    if not db_income:
        return False
    
    db_income.is_active = False
    db_income.deactivated_at = func.now()
    await db.commit()
    return True


from sqlalchemy.orm.attributes import set_committed_value
import calendar
from datetime import datetime, timezone

async def get_monthly_incomes(db: AsyncSession, user_id: UUID, month_year: str):
    """
    Get all estimated incomes for a specific month.
    Includes active incomes and inactive incomes that have a check for this month.
    """
    year, month = map(int, month_year.split('-'))
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    _, last_day = calendar.monthrange(year, month)
    end_date = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    # Find all incomes belonging to the user that are either active or have a check this month
    query = (
        select(models.EstimatedIncome)
        .outerjoin(models.IncomeCheck, 
                   (models.IncomeCheck.income_id == models.EstimatedIncome.id) & 
                   (models.IncomeCheck.month_year == month_year))
        .filter(
            models.EstimatedIncome.user_id == user_id,
            models.EstimatedIncome.created_at <= end_date,
            (models.EstimatedIncome.deactivated_at == None) | (models.EstimatedIncome.deactivated_at >= start_date) | (models.IncomeCheck.id != None)
        )
    )
    
    query = query.order_by(models.EstimatedIncome.payment_day.asc().nullslast(), models.EstimatedIncome.created_at.desc())
    result = await db.execute(query)
    
    incomes = result.scalars().unique().all()
    
    # Load the checks manually
    checks_result = await db.execute(
        select(models.IncomeCheck)
        .filter(
            models.IncomeCheck.income_id.in_([inc.id for inc in incomes]) if incomes else False,
            models.IncomeCheck.month_year == month_year
        )
    )
    checks = checks_result.scalars().all()
    
    # Map checks to incomes
    check_map = {}
    for check in checks:
        if check.income_id not in check_map:
            check_map[check.income_id] = []
        check_map[check.income_id].append(check)
        
    for inc in incomes:
        # Assign the checks attribute directly without triggering lazy-loading
        set_committed_value(inc, 'checks', check_map.get(inc.id, []))
        
    return incomes


async def check_income(db: AsyncSession, income_id: UUID, check: schemas.IncomeCheckCreate, user_id: UUID, extra_data: dict = None):
    # Verify the income exists and belongs to the user
    db_income = await get_estimated_income(db, income_id, user_id)
    if not db_income:
        return None
        
    # Check if a check already exists for this month
    existing = await db.execute(
        select(models.IncomeCheck)
        .filter(
            models.IncomeCheck.income_id == income_id,
            models.IncomeCheck.month_year == check.month_year
        )
    )
    existing_check = existing.scalars().first()
    
    data = check.model_dump(exclude_unset=True)
    if 'manual_rate' in data:
        del data['manual_rate']
    if extra_data:
        data.update(extra_data)
        
    if existing_check:
        for key, value in data.items():
            setattr(existing_check, key, value)
        db_check = existing_check
    else:
        db_check = models.IncomeCheck(**data, income_id=income_id)
        db.add(db_check)
        
    await db.commit()
    await db.refresh(db_check)
    return db_check


async def uncheck_income(db: AsyncSession, income_id: UUID, month_year: str, user_id: UUID):
    # Verify the income exists and belongs to the user
    db_income = await get_estimated_income(db, income_id, user_id)
    if not db_income:
        return False
        
    existing = await db.execute(
        select(models.IncomeCheck)
        .filter(
            models.IncomeCheck.income_id == income_id,
            models.IncomeCheck.month_year == month_year
        )
    )
    existing_check = existing.scalars().first()
    
    if existing_check:
        await db.delete(existing_check)
        await db.commit()
        return True
    return False
