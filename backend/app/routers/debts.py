from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID

from .. import crud_debts, schemas, bcv_service
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(
    prefix="/api/debts",
    tags=["debts"],
)

@router.get("/", response_model=List[schemas.DebtResponse])
async def read_debts(
    type: str = Query(..., description="'owed' or 'receivable'"),
    is_settled: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    if type not in ["owed", "receivable"]:
        raise HTTPException(status_code=400, detail="Invalid debt type")
    return await crud_debts.get_debts(db, user_id=user_id, debt_type=type, is_settled=is_settled)

@router.get("/{debt_id}", response_model=schemas.DebtResponse)
async def read_debt(
    debt_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    db_debt = await crud_debts.get_debt(db, debt_id=debt_id, user_id=user_id)
    if db_debt is None:
        raise HTTPException(status_code=404, detail="Debt not found")
    return db_debt

@router.post("/", response_model=schemas.DebtResponse)
async def create_debt(
    debt: schemas.DebtCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    return await crud_debts.create_debt(db=db, debt=debt, user_id=user_id)

@router.put("/{debt_id}", response_model=schemas.DebtResponse)
async def update_debt(
    debt_id: UUID,
    debt: schemas.DebtUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    db_debt = await crud_debts.update_debt(db, debt_id=debt_id, debt=debt, user_id=user_id)
    if not db_debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    return db_debt

@router.delete("/{debt_id}")
async def delete_debt(
    debt_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    success = await crud_debts.delete_debt(db, debt_id=debt_id, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Debt not found")
    return {"message": "Debt deleted successfully"}


@router.post("/{debt_id}/payments", response_model=schemas.DebtResponse)
async def add_debt_payment(
    debt_id: UUID,
    payment: schemas.DebtPaymentCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    # Get rates for currency conversion at the time of payment
    rates = await bcv_service.get_all_rates()
    equivalents = bcv_service.convert_amount(
        amount=payment.amount,
        currency=payment.currency.value if payment.currency else "BS",
        rates=rates,
        manual_rate=payment.manual_rate
    )
    
    db_debt = await crud_debts.add_debt_payment(
        db=db, 
        debt_id=debt_id, 
        user_id=user_id, 
        payment=payment, 
        extra_data=equivalents
    )
    
    if not db_debt:
        raise HTTPException(status_code=404, detail="Debt not found")
        
    return db_debt
