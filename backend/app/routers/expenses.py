from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID

from .. import crud, schemas
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(
    prefix="/api/expenses",
    tags=["expenses"],
)

@router.get("/summary", response_model=schemas.SummaryResponse)
async def read_summary(db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    return await crud.get_summary(db, user_id)

@router.post("/", response_model=schemas.ExpenseResponse)
async def create_expense(expense: schemas.ExpenseCreate, db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    return await crud.create_expense(db=db, expense=expense, user_id=user_id)

@router.get("/", response_model=List[schemas.ExpenseResponse])
async def read_expenses(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    expenses = await crud.get_expenses(db, user_id=user_id, skip=skip, limit=limit)
    return expenses

@router.get("/{expense_id}", response_model=schemas.ExpenseResponse)
async def read_expense(expense_id: UUID, db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    db_expense = await crud.get_expense(db, expense_id=expense_id, user_id=user_id)
    if db_expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    return db_expense

@router.put("/{expense_id}", response_model=schemas.ExpenseResponse)
async def update_expense(expense_id: UUID, expense: schemas.ExpenseUpdate, db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    db_expense = await crud.update_expense(db, expense_id=expense_id, expense=expense, user_id=user_id)
    if db_expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    return db_expense

@router.delete("/{expense_id}")
async def delete_expense(expense_id: UUID, db: AsyncSession = Depends(get_db), user_id: UUID = Depends(get_current_user)):
    success = await crud.delete_expense(db, expense_id=expense_id, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Expense deleted successfully"}
