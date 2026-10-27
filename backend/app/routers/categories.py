from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID

from app.database import get_db
from app import crud, schemas
from app.auth import get_current_user

router = APIRouter(
    prefix="/api/categories",
    tags=["categories"],
    dependencies=[Depends(get_current_user)]
)

@router.get("/", response_model=List[schemas.CategoryResponse])
async def read_categories(
    kind: Optional[str] = Query("expense", pattern="^(expense|income)$"),
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    categories = await crud.get_categories(db, user_id=user_id, kind=kind or "expense")
    return categories

@router.post("/", response_model=schemas.CategoryResponse)
async def create_category(
    category: schemas.CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    try:
        return await crud.create_category(db=db, category=category, user_id=user_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail="Category may already exist or is invalid")

@router.post("/seed-defaults", response_model=List[schemas.CategoryResponse])
async def restore_default_categories(
    kind: Optional[str] = Query("expense", pattern="^(expense|income)$"),
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    await crud.seed_default_categories(db, user_id=user_id, only_if_empty=False, kind=kind or "expense")
    return await crud.get_categories(db, user_id=user_id, kind=kind or "expense")

# Dedicated /income routes declared BEFORE parameterized /{category_id} routes

@router.get("/income", response_model=List[schemas.CategoryResponse])
async def read_income_categories(
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    return await crud.get_categories(db, user_id=user_id, kind="income")

@router.post("/income", response_model=schemas.CategoryResponse)
async def create_income_category(
    category: schemas.CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    try:
        return await crud.create_category(db=db, category=category, user_id=user_id, kind_override="income")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail="Category may already exist or is invalid")

@router.post("/income/seed-defaults", response_model=List[schemas.CategoryResponse])
async def restore_default_income_categories(
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    await crud.seed_default_categories(db, user_id=user_id, only_if_empty=False, kind="income")
    return await crud.get_categories(db, user_id=user_id, kind="income")

@router.put("/income/{category_id}", response_model=schemas.CategoryResponse)
async def update_income_category(
    category_id: UUID,
    category_update: schemas.CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    try:
        updated_category = await crud.update_category(
            db=db, category_id=category_id, category_update=category_update, user_id=user_id, kind="income"
        )
        if not updated_category:
            raise HTTPException(status_code=404, detail="Category not found")
        return updated_category
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error updating category: {str(e)}")

@router.delete("/income/{category_id}")
async def delete_income_category(
    category_id: UUID,
    reassign_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    success = await crud.delete_category(
        db=db, category_id=category_id, user_id=user_id, reassign_to=reassign_to, kind="income"
    )
    if not success:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}

@router.put("/{category_id}", response_model=schemas.CategoryResponse)
async def update_category(
    category_id: UUID,
    category_update: schemas.CategoryCreate,
    kind: Optional[str] = Query(None, pattern="^(expense|income)$"),
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    try:
        updated_category = await crud.update_category(
            db=db, category_id=category_id, category_update=category_update, user_id=user_id, kind=kind
        )
        if not updated_category:
            raise HTTPException(status_code=404, detail="Category not found")
        return updated_category
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error updating category: {str(e)}")

@router.delete("/{category_id}")
async def delete_category(
    category_id: UUID,
    reassign_to: Optional[str] = Query(None),
    kind: Optional[str] = Query(None, pattern="^(expense|income)$"),
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    success = await crud.delete_category(
        db=db, category_id=category_id, user_id=user_id, reassign_to=reassign_to, kind=kind
    )
    if not success:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}
