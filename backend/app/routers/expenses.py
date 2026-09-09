from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID

from .. import crud, schemas, bcv_service
from ..database import get_db
from ..auth import get_current_user
from datetime import datetime, date

router = APIRouter(
    prefix="/api/expenses",
    tags=["expenses"],
)

@router.get("/summary", response_model=schemas.SummaryResponse)
async def read_summary(db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    return await crud.get_summary(db, user_id)

@router.get("/summary-range", response_model=schemas.RangeSummaryResponse)
async def read_summary_range(
    date_from: date,
    date_to: date,
    db: AsyncSession = Depends(get_db), 
    user_id: UUID = Depends(get_current_user)
):
    return await crud.get_summary_range(db, user_id, date_from, date_to)

@router.get("/rates", response_model=schemas.ExchangeRateResponse)
async def read_rates():
    rates = await bcv_service.get_all_rates()
    return schemas.ExchangeRateResponse(
        usd_bs=rates.get('usd_bs'),
        eur_bs=rates.get('eur_bs'),
        usdt_bs=rates.get('usdt_bs'),
        last_updated=datetime.now()
    )

@router.post("/", response_model=schemas.ExpenseResponse)
async def create_expense(expense: schemas.ExpenseCreate, db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    rates = await bcv_service.get_all_rates()
    equivalents = bcv_service.convert_amount(
        amount=expense.amount,
        currency=expense.currency.value if expense.currency else "BS_USD",
        rates=rates,
        manual_rate=expense.manual_rate
    )
    return await crud.create_expense(db=db, expense=expense, user_id=user_id, extra_data=equivalents)

@router.get("/", response_model=List[schemas.ExpenseResponse])
async def read_expenses(
    skip: int = 0, 
    limit: int = 100, 
    date_from: Optional[date] = None, 
    date_to: Optional[date] = None,
    db: AsyncSession = Depends(get_db), 
    user_id: UUID = Depends(get_current_user)
):
    expenses = await crud.get_expenses(db, user_id=user_id, skip=skip, limit=limit, date_from=date_from, date_to=date_to)
    return expenses

@router.get("/{expense_id}", response_model=schemas.ExpenseResponse)
async def read_expense(expense_id: UUID, db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    db_expense = await crud.get_expense(db, expense_id=expense_id, user_id=user_id)
    if db_expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    return db_expense

@router.put("/{expense_id}", response_model=schemas.ExpenseResponse)
async def update_expense(expense_id: UUID, expense: schemas.ExpenseUpdate, db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    db_expense = await crud.get_expense(db, expense_id=expense_id, user_id=user_id)
    if not db_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
        
    amount = expense.amount if expense.amount is not None else db_expense.amount
    currency = expense.currency.value if expense.currency is not None else db_expense.currency
    
    rates = await bcv_service.get_all_rates()
    equivalents = bcv_service.convert_amount(
        amount=amount,
        currency=currency,
        rates=rates,
        manual_rate=expense.manual_rate
    )
    
    updated_expense = await crud.update_expense(db, expense_id=expense_id, expense=expense, user_id=user_id, extra_data=equivalents)
    return updated_expense

@router.delete("/{expense_id}")
async def delete_expense(expense_id: UUID, db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    success = await crud.delete_expense(db, expense_id=expense_id, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Expense deleted successfully"}
