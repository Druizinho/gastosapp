from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
from datetime import date

from .. import crud_incomes, schemas, bcv_service
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()


# ─── Estimated Incomes & Checks Endpoints ───

@router.post("/api/estimated-incomes/", response_model=schemas.EstimatedIncomeResponse, tags=["estimated-incomes"])
async def create_estimated_income(
    income: schemas.EstimatedIncomeCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    return await crud_incomes.create_estimated_income(db=db, income=income, user_id=user_id)


@router.get("/api/estimated-incomes/", response_model=List[schemas.EstimatedIncomeResponse], tags=["estimated-incomes"])
async def read_estimated_incomes(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    return await crud_incomes.get_estimated_incomes(db, user_id=user_id, active_only=active_only)


# Backward-compatible alias declared BEFORE /api/incomes/{income_id}
@router.get("/api/incomes/monthly/{month_year}", response_model=List[schemas.EstimatedIncomeResponse], tags=["incomes"])
@router.get("/api/estimated-incomes/monthly/{month_year}", response_model=List[schemas.EstimatedIncomeResponse], tags=["estimated-incomes"])
async def read_monthly_incomes(
    month_year: str,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    return await crud_incomes.get_monthly_incomes(db, user_id=user_id, month_year=month_year)


# Backward-compatible check alias declared BEFORE /api/incomes/{income_id}
@router.post("/api/incomes/{income_id}/checks", response_model=schemas.IncomeCheckResponse, tags=["incomes"])
@router.post("/api/estimated-incomes/{income_id}/checks", response_model=schemas.IncomeCheckResponse, tags=["estimated-incomes"])
async def check_income(
    income_id: UUID,
    check: schemas.IncomeCheckCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    rates = await bcv_service.get_rates_for_date(target_date=check.payment_date, db=db)
    currency_str = check.currency.value if hasattr(check.currency, "value") else str(check.currency or "BS")
    equivalents = bcv_service.convert_amount(
        amount=check.real_amount,
        currency=currency_str,
        rates=rates,
        manual_rate=check.manual_rate
    )
    
    db_check = await crud_incomes.check_income(db=db, income_id=income_id, check=check, user_id=user_id, extra_data=equivalents)
    if db_check is None:
        raise HTTPException(status_code=404, detail="Estimated income not found")
    return db_check


# Backward-compatible uncheck alias declared BEFORE /api/incomes/{income_id}
@router.delete("/api/incomes/{income_id}/checks/{month_year}", tags=["incomes"])
@router.delete("/api/estimated-incomes/{income_id}/checks/{month_year}", tags=["estimated-incomes"])
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


@router.get("/api/estimated-incomes/{income_id}", response_model=schemas.EstimatedIncomeResponse, tags=["estimated-incomes"])
async def read_estimated_income(
    income_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    db_income = await crud_incomes.get_estimated_income(db, income_id=income_id, user_id=user_id)
    if db_income is None:
        raise HTTPException(status_code=404, detail="Estimated income not found")
    return db_income


@router.put("/api/estimated-incomes/{income_id}", response_model=schemas.EstimatedIncomeResponse, tags=["estimated-incomes"])
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


@router.delete("/api/estimated-incomes/{income_id}", tags=["estimated-incomes"])
async def delete_estimated_income(
    income_id: UUID,
    month_year: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    success = await crud_incomes.delete_estimated_income(db, income_id=income_id, user_id=user_id, month_year=month_year)
    if not success:
        raise HTTPException(status_code=404, detail="Estimated income not found")
    return {"ok": True}


# ─── Real Incomes Endpoints (/api/incomes) ───

@router.post("/api/incomes/", response_model=schemas.IncomeResponse, tags=["incomes"])
async def create_income(
    income: schemas.IncomeCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    rates = await bcv_service.get_rates_for_date(target_date=income.date, db=db)
    currency_str = income.currency.value if hasattr(income.currency, "value") else str(income.currency or "BS")
    equivalents = bcv_service.convert_amount(
        amount=income.amount,
        currency=currency_str,
        rates=rates,
        manual_rate=income.manual_rate
    )
    db_income = await crud_incomes.create_income(db=db, income=income, user_id=user_id, extra_data=equivalents)
    if db_income is None:
        raise HTTPException(status_code=404, detail="Estimated income target not found")
    return db_income


@router.get("/api/incomes/", response_model=List[schemas.IncomeResponse], tags=["incomes"])
async def read_incomes(
    skip: int = 0,
    limit: int = 200,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    return await crud_incomes.get_incomes(
        db, user_id=user_id, skip=skip, limit=limit, date_from=date_from, date_to=date_to
    )


@router.get("/api/incomes/{income_id}", response_model=schemas.IncomeResponse, tags=["incomes"])
async def read_income(
    income_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    db_income = await crud_incomes.get_income(db, entry_id=income_id, user_id=user_id)
    if db_income is None:
        raise HTTPException(status_code=404, detail="Income not found")
    return db_income


@router.put("/api/incomes/{income_id}", response_model=schemas.IncomeResponse, tags=["incomes"])
async def update_income(
    income_id: UUID,
    income: schemas.IncomeUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    db_income = await crud_incomes.get_income(db, entry_id=income_id, user_id=user_id)
    if not db_income:
        raise HTTPException(status_code=404, detail="Income not found")

    equivalents = None
    if income.amount is not None or income.currency is not None or income.date is not None or income.manual_rate is not None:
        amount = income.amount if income.amount is not None else db_income.amount
        curr_val = income.currency.value if hasattr(income.currency, "value") else income.currency
        currency = curr_val if curr_val is not None else db_income.currency
        currency_str = currency.value if hasattr(currency, "value") else str(currency or "BS")
        target_date = income.date if income.date is not None else db_income.date
        date_changed = (income.date is not None and income.date != db_income.date)
        rates = await bcv_service.resolve_rates_for_update(
            db_income, target_date=target_date, existing_date=db_income.date, db=db
        )
        eff_manual = bcv_service.resolve_manual_rate_for_update(
            db_income, currency_str, income.manual_rate, date_changed=date_changed
        )
        equivalents = bcv_service.convert_amount(
            amount=amount,
            currency=currency_str,
            rates=rates,
            manual_rate=eff_manual
        )

    updated_income = await crud_incomes.update_income(
        db, entry_id=income_id, income_update=income, user_id=user_id, extra_data=equivalents
    )
    if updated_income is None:
        raise HTTPException(status_code=404, detail="Income not found")
    return updated_income


@router.delete("/api/incomes/{income_id}", tags=["incomes"])
async def delete_income(
    income_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    success = await crud_incomes.delete_income(db, entry_id=income_id, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Income not found")
    return {"ok": True}
