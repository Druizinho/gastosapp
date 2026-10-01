from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
from datetime import datetime, date

from .. import crud_fixed_expenses, crud, schemas, bcv_service, models
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(
    prefix="/api/fixed-expenses",
    tags=["fixed-expenses"],
)


@router.get("/summary", response_model=schemas.FixedExpenseSummary)
async def read_summary(
    month: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user),
):
    return await crud_fixed_expenses.get_fixed_expenses_summary(db, user_id, month_year=month)


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


@router.get("/monthly/{month_year}", response_model=List[schemas.FixedExpenseResponse])
async def read_monthly_fixed_expenses(
    month_year: str,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user),
):
    """Get all fixed expenses with their check status for a given month (YYYY-MM)."""
    return await crud_fixed_expenses.get_monthly_fixed_expenses(db, user_id=user_id, month_year=month_year)


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


# ── Check / Uncheck (new payment history system) ─────────────────────

@router.post("/{expense_id}/checks", response_model=schemas.FixedExpenseCheckResponse)
async def check_fixed_expense(
    expense_id: UUID,
    check_data: schemas.FixedExpenseCheckCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user),
):
    """Mark a fixed expense as paid for a given month, optionally creating a real Expense."""
    db_expense = await crud_fixed_expenses.get_fixed_expense(db, expense_id=expense_id, user_id=user_id)
    if not db_expense:
        raise HTTPException(status_code=404, detail="Fixed expense not found")

    # Convert the paid amount
    rates = await bcv_service.get_all_rates()
    equivalents = bcv_service.convert_amount(
        amount=check_data.paid_amount,
        currency=check_data.currency.value if check_data.currency else "BS",
        rates=rates,
        manual_rate=check_data.manual_rate,
    )

    # Optionally create a real Expense in the dashboard
    created_expense_id = None
    if check_data.create_expense:
        expense_create = schemas.ExpenseCreate(
            amount=check_data.paid_amount,
            description=f"Gasto fijo: {db_expense.name}",
            category=db_expense.category or "Gastos Fijos",
            date=check_data.paid_date or date.today(),
            currency=check_data.currency or schemas.CurrencyType.BS,
        )
        db_real_expense = await crud.create_expense(
            db=db, expense=expense_create, user_id=user_id, extra_data=equivalents
        )
        created_expense_id = db_real_expense.id

    try:
        return await crud_fixed_expenses.check_fixed_expense(
            db, fixed_expense_id=expense_id, check_data=check_data,
            extra_data=equivalents, expense_id=created_expense_id,
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="Este gasto fijo ya está marcado como pagado para este mes")
        raise


@router.delete("/{expense_id}/checks/{month_year}")
async def uncheck_fixed_expense(
    expense_id: UUID,
    month_year: str,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user),
):
    """Remove the paid mark for a fixed expense for a given month. Also deletes the linked Expense if one was created."""
    db_expense = await crud_fixed_expenses.get_fixed_expense(db, expense_id=expense_id, user_id=user_id)
    if not db_expense:
        raise HTTPException(status_code=404, detail="Fixed expense not found")

    success, linked_expense_id = await crud_fixed_expenses.uncheck_fixed_expense(
        db, fixed_expense_id=expense_id, month_year=month_year
    )

    if not success:
        raise HTTPException(status_code=404, detail="No check found for this month")

    # Also delete the linked real expense if one was created
    if linked_expense_id:
        await crud.delete_expense(db, expense_id=linked_expense_id, user_id=user_id)

    return {"message": "Check removed successfully"}


# ── Legacy mark-paid endpoint (kept for backward compat) ─────────────

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
