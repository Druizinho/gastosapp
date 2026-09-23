from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID

from .. import crud_fixed_expenses, schemas, bcv_service
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(
    prefix="/api/fixed-expenses",
    tags=["fixed-expenses"],
)


@router.get("/summary", response_model=schemas.FixedExpenseSummary)
async def read_summary(db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    return await crud_fixed_expenses.get_fixed_expenses_summary(db, user_id)


@router.post("/", response_model=schemas.FixedExpenseResponse)
async def create_fixed_expense(
    expense: schemas.FixedExpenseCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    rates = await bcv_service.get_all_rates()
    equivalents = bcv_service.convert_amount(
        amount=expense.amount,
        currency=expense.currency.value if expense.currency else "BS",
        rates=rates,
        manual_rate=expense.manual_rate
    )
    return await crud_fixed_expenses.create_fixed_expense(db=db, expense=expense, user_id=user_id, extra_data=equivalents)


@router.get("/", response_model=List[schemas.FixedExpenseResponse])
async def read_fixed_expenses(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    return await crud_fixed_expenses.get_fixed_expenses(db, user_id=user_id, active_only=active_only)


@router.get("/{expense_id}", response_model=schemas.FixedExpenseResponse)
async def read_fixed_expense(
    expense_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    db_expense = await crud_fixed_expenses.get_fixed_expense(db, expense_id=expense_id, user_id=user_id)
    if db_expense is None:
        raise HTTPException(status_code=404, detail="Fixed expense not found")
    return db_expense


@router.put("/{expense_id}", response_model=schemas.FixedExpenseResponse)
async def update_fixed_expense(
    expense_id: UUID,
    expense: schemas.FixedExpenseUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    db_expense = await crud_fixed_expenses.get_fixed_expense(db, expense_id=expense_id, user_id=user_id)
    if not db_expense:
        raise HTTPException(status_code=404, detail="Fixed expense not found")
    
    amount = expense.amount if expense.amount is not None else db_expense.amount
    currency = expense.currency.value if expense.currency is not None else db_expense.currency
    
    rates = await bcv_service.get_all_rates()
    equivalents = bcv_service.convert_amount(
        amount=amount,
        currency=currency,
        rates=rates,
        manual_rate=expense.manual_rate
    )
    
    return await crud_fixed_expenses.update_fixed_expense(
        db, expense_id=expense_id, expense=expense, user_id=user_id, extra_data=equivalents
    )


@router.delete("/{expense_id}")
async def delete_fixed_expense(
    expense_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    success = await crud_fixed_expenses.delete_fixed_expense(db, expense_id=expense_id, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Fixed expense not found")
    return {"message": "Fixed expense deleted successfully"}


from datetime import datetime

@router.post("/{expense_id}/mark-paid", response_model=schemas.FixedExpenseResponse)
async def mark_fixed_expense_paid(
    expense_id: UUID,
    paid: bool = True,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    db_expense = await crud_fixed_expenses.get_fixed_expense(db, expense_id=expense_id, user_id=user_id)
    if not db_expense:
        raise HTTPException(status_code=404, detail="Fixed expense not found")
    
    current_month = datetime.now().strftime("%Y-%m")
    
    if paid:
        db_expense.last_paid_month = current_month
    else:
        db_expense.last_paid_month = None
        
    await db.commit()
    await db.refresh(db_expense)
    return db_expense
