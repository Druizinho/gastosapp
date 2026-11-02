from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from uuid import UUID
from datetime import datetime, timezone

from app.database import get_db
from app import schemas, crud
from app.auth import get_current_user
from app.models import Profile, Category
from app.user_resolver import get_or_hydrate_profile

router = APIRouter(
    prefix="/api/profile",
    tags=["profile"],
    dependencies=[Depends(get_current_user)]
)

@router.get("/", response_model=schemas.ProfileResponse)
async def get_profile(
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    profile = await get_or_hydrate_profile(db, user_id=user_id)
        
    # Idempotent lazy seeding if user has 0 categories
    await crud.seed_default_categories(db, user_id=user_id, only_if_empty=True)
    return profile

@router.put("/", response_model=schemas.ProfileResponse)
async def update_profile(
    profile_data: schemas.ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    profile = await get_or_hydrate_profile(db, user_id=user_id)
    await crud.seed_default_categories(db, user_id=user_id, only_if_empty=True)

    # Update fields
    update_data = profile_data.model_dump(exclude_unset=True)
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await db.execute(
            update(Profile).where(Profile.id == user_id).values(**update_data)
        )
        await db.commit()
        # Refresh
        result = await db.execute(select(Profile).where(Profile.id == user_id))
        profile = result.scalar_one()
    
    return profile
