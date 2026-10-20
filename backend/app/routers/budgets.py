from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
import re

from .. import crud_budgets, schemas
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(
    prefix="/api/budgets",
    tags=["budgets"],
)

MONTH_REGEX = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

def _validate_month_year(month_year: str) -> str:
    if not MONTH_REGEX.match(month_year):
        raise HTTPException(
            status_code=400,
            detail="Formato de mes inválido. Debe ser YYYY-MM (ej. 2026-10)"
        )
    return month_year


@router.get("/categories", response_model=List[str])
async def get_budget_categories(
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Returns available categories for budget configuration (user categories + system categories).
    """
    return await crud_budgets.get_available_budget_categories(db, user_id)


@router.get("/monthly/{month_year}", response_model=schemas.MonthlyBudgetResponse)
async def read_monthly_budget(
    month_year: str,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Gets or auto-clones the budget view for month_year.
    """
    _validate_month_year(month_year)
    return await crud_budgets.get_monthly_budget_view(db, user_id, month_year)


@router.put("/monthly/{month_year}", response_model=schemas.MonthlyBudgetResponse)
async def upsert_monthly_budget(
    month_year: str,
    payload: schemas.MonthlyBudgetUpsert,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Upserts (creates or modifies) the budget configuration and category limits for month_year.
    """
    _validate_month_year(month_year)
    return await crud_budgets.upsert_monthly_budget(db, user_id, month_year, payload)


@router.post("/monthly/{month_year}/confirm", response_model=schemas.MonthlyBudgetResponse)
async def confirm_monthly_budget(
    month_year: str,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Explicitly confirms the budget for month_year (e.g. accepting auto-cloned budget).
    """
    _validate_month_year(month_year)
    return await crud_budgets.confirm_monthly_budget(db, user_id, month_year)


@router.put("/monthly/{month_year}/category", response_model=schemas.MonthlyBudgetResponse)
async def upsert_budget_category_limit(
    month_year: str,
    payload: schemas.BudgetCategoryLimitInput,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Upserts a single category limit for month_year.
    """
    _validate_month_year(month_year)
    return await crud_budgets.upsert_budget_category_limit(db, user_id, month_year, payload)


@router.delete("/monthly/{month_year}/category/{category_name}", response_model=schemas.MonthlyBudgetResponse)
async def delete_budget_category_limit(
    month_year: str,
    category_name: str,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Deletes a single category limit for month_year.
    """
    _validate_month_year(month_year)
    return await crud_budgets.delete_budget_category_limit(db, user_id, month_year, category_name)


@router.post("/monthly/{month_year}", response_model=schemas.MonthlyBudgetResponse)
async def create_monthly_budget(
    month_year: str,
    payload: schemas.MonthlyBudgetCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Creates a new named budget in month_year.
    """
    _validate_month_year(month_year)
    return await crud_budgets.create_monthly_budget(db, user_id, month_year, payload)


@router.put("/{budget_id}", response_model=schemas.MonthlyBudgetResponse)
async def update_monthly_budget_by_id(
    budget_id: UUID,
    payload: schemas.MonthlyBudgetUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Updates an existing monthly budget by ID.
    """
    return await crud_budgets.update_monthly_budget_by_id(db, user_id, budget_id, payload)


@router.post("/{budget_id}/primary", response_model=schemas.MonthlyBudgetResponse)
async def set_primary_monthly_budget(
    budget_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Marks a specific budget as the primary budget for its month_year.
    """
    return await crud_budgets.set_primary_monthly_budget(db, user_id, budget_id)


@router.delete("/{budget_id}", response_model=schemas.MonthlyBudgetResponse)
async def delete_monthly_budget_by_id(
    budget_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Deletes a monthly budget by ID.
    """
    return await crud_budgets.delete_monthly_budget_by_id(db, user_id, budget_id)


@router.put("/{budget_id}/category", response_model=schemas.MonthlyBudgetResponse)
async def upsert_category_limit_by_budget_id(
    budget_id: UUID,
    payload: schemas.BudgetCategoryLimitInput,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Upserts a category limit inside a specific budget by ID.
    """
    return await crud_budgets.upsert_category_limit_by_budget_id(db, user_id, budget_id, payload)


@router.delete("/{budget_id}/category/{category_name}", response_model=schemas.MonthlyBudgetResponse)
async def delete_category_limit_by_budget_id(
    budget_id: UUID,
    category_name: str,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Deletes a category limit from a specific budget by ID.
    """
    return await crud_budgets.delete_category_limit_by_budget_id(db, user_id, budget_id, category_name)


