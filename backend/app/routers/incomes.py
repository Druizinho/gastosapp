from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID

from .. import crud_incomes, schemas, bcv_service
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(
    prefix="/api/incomes",
    tags=["incomes"],
)

@router.post("/", response_model=schemas.EstimatedIncomeResponse)
async def create_estimated_income(
    income: schemas.EstimatedIncomeCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    return await crud_incomes.create_estimated_income(db=db, income=income, user_id=user_id)

@router.get("/", response_model=List[schemas.EstimatedIncomeResponse])
async def read_estimated_incomes(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    return await crud_incomes.get_estimated_incomes(db, user_id=user_id, active_only=active_only)

@router.get("/monthly/{month_year}", response_model=List[schemas.EstimatedIncomeResponse])
async def read_monthly_incomes(
    month_year: str,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    return await crud_incomes.get_monthly_incomes(db, user_id=user_id, month_year=month_year)

@router.get("/{income_id}", response_model=schemas.EstimatedIncomeResponse)
async def read_estimated_income(
    income_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    db_income = await crud_incomes.get_estimated_income(db, income_id=income_id, user_id=user_id)
    if db_income is None:
        raise HTTPException(status_code=404, detail="Estimated income not found")
    return db_income

@router.put("/{income_id}", response_model=schemas.EstimatedIncomeResponse)
async def update_estimated_income(
    income_id: UUID,
    income: schemas.EstimatedIncomeUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    db_income = await crud_incomes.update_estimated_income(db, income_id=income_id, income=income, user_id=user_id)
    if db_income is None:
        raise HTTPException(status_code=404, detail="Estimated income not found")
    return db_income

@router.delete("/{income_id}")
async def delete_estimated_income(
    income_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    success = await crud_incomes.delete_estimated_income(db, income_id=income_id, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Estimated income not found")
    return {"ok": True}

@router.post("/{income_id}/checks", response_model=schemas.IncomeCheckResponse)
async def check_income(
    income_id: UUID,
    check: schemas.IncomeCheckCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    rates = await bcv_service.get_all_rates()
    equivalents = bcv_service.convert_amount(
        amount=check.real_amount,
        currency=check.currency.value if check.currency else "BS",
        rates=rates,
        manual_rate=check.manual_rate
    )
    
    db_check = await crud_incomes.check_income(db=db, income_id=income_id, check=check, user_id=user_id, extra_data=equivalents)
    if db_check is None:
        raise HTTPException(status_code=404, detail="Estimated income not found")
    return db_check

@router.delete("/{income_id}/checks/{month_year}")
async def uncheck_income(
    income_id: UUID,
    month_year: str,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    success = await crud_incomes.uncheck_income(db, income_id=income_id, month_year=month_year, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Income check not found")
    return {"ok": True}
