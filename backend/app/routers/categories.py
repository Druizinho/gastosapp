from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID
import asyncpg

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
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    categories = await crud.get_categories(db, user_id=user_id)
    return categories

@router.post("/", response_model=schemas.CategoryResponse)
async def create_category(
    category: schemas.CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    try:
        return await crud.create_category(db=db, category=category, user_id=user_id)
    except Exception as e:
        # Pydantic or SQLAlchemy constraint errors
        raise HTTPException(status_code=400, detail="Category may already exist or is invalid")

@router.put("/{category_id}", response_model=schemas.CategoryResponse)
async def update_category(
    category_id: UUID,
    category_update: schemas.CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    try:
        updated_category = await crud.update_category(db=db, category_id=category_id, category_update=category_update, user_id=user_id)
        if not updated_category:
            raise HTTPException(status_code=404, detail="Category not found")
        return updated_category
    except Exception as e:
        raise HTTPException(status_code=400, detail="Category may already exist or is invalid")

@router.delete("/{category_id}")
async def delete_category(
    category_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    success = await crud.delete_category(db=db, category_id=category_id, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}
