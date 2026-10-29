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
async def read_rates(target_date: Optional[date] = None, db: AsyncSession = Depends(get_db)):
    rates = await bcv_service.get_rates_for_date(target_date=target_date, db=db)
    return schemas.ExchangeRateResponse(
        usd_bs=rates.get('usd_bs'),
        eur_bs=rates.get('eur_bs'),
        usdt_bs=rates.get('usdt_bs'),
        last_updated=datetime.now()
    )

@router.post("/", response_model=schemas.ExpenseResponse)
async def create_expense(expense: schemas.ExpenseCreate, db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    rates = await bcv_service.get_rates_for_date(target_date=expense.date, db=db)
    equivalents = bcv_service.convert_amount(
        amount=expense.amount,
        currency=expense.currency.value if expense.currency else "BS",
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
        
    equivalents = None
    if expense.amount is not None or expense.currency is not None or expense.date is not None or expense.manual_rate is not None:
        amount = expense.amount if expense.amount is not None else db_expense.amount
        raw_curr = expense.currency if expense.currency is not None else db_expense.currency
        currency = raw_curr.value if hasattr(raw_curr, "value") else str(raw_curr)
        target_date = expense.date if expense.date is not None else db_expense.date
        date_changed = (expense.date is not None and expense.date != db_expense.date)
        rates = await bcv_service.resolve_rates_for_update(
            db_expense, target_date=target_date, existing_date=db_expense.date, db=db
        )
        eff_manual = bcv_service.resolve_manual_rate_for_update(
            db_expense, currency, expense.manual_rate, date_changed=date_changed
        )
        equivalents = bcv_service.convert_amount(
            amount=amount,
            currency=currency,
            rates=rates,
            manual_rate=eff_manual
        )
    
    updated_expense = await crud.update_expense(db, expense_id=expense_id, expense=expense, user_id=user_id, extra_data=equivalents)
    return updated_expense

@router.delete("/{expense_id}")
async def delete_expense(expense_id: UUID, db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    success = await crud.delete_expense(db, expense_id=expense_id, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Expense deleted successfully"}
