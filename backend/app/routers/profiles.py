from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from uuid import UUID
from datetime import datetime, timezone

from app.database import get_db
from app import schemas
from app.auth import get_current_user
from app.models import Profile, Category

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
    result = await db.execute(select(Profile).where(Profile.id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        # Auto-create profile if it doesn't exist (edge case for pre-existing users)
        profile = Profile(id=user_id)
        db.add(profile)
        
        # Create default categories
        default_categories = [
            Category(user_id=user_id, name="Alimentación", color="Utensils"),
            Category(user_id=user_id, name="Transporte", color="Car"),
            Category(user_id=user_id, name="Vivienda", color="Home"),
            Category(user_id=user_id, name="Ocio", color="Tv"),
            Category(user_id=user_id, name="Salud", color="HeartPulse"),
        ]
        db.add_all(default_categories)
        
        await db.commit()
        await db.refresh(profile)
    return profile

@router.put("/", response_model=schemas.ProfileResponse)
async def update_profile(
    profile_data: schemas.ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    result = await db.execute(select(Profile).where(Profile.id == user_id))
    profile = result.scalar_one_or_none()
    
    if not profile:
        # Auto-create if missing
        profile = Profile(id=user_id)
        db.add(profile)
        
        # Create default categories
        default_categories = [
            Category(user_id=user_id, name="Alimentación", color="Utensils"),
            Category(user_id=user_id, name="Transporte", color="Car"),
            Category(user_id=user_id, name="Vivienda", color="Home"),
            Category(user_id=user_id, name="Ocio", color="Tv"),
            Category(user_id=user_id, name="Salud", color="HeartPulse"),
        ]
        db.add_all(default_categories)
        
        await db.commit()
        await db.refresh(profile)

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
