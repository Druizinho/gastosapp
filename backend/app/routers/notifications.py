from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, desc
from typing import List
from uuid import UUID

from .. import schemas, models, auth
from ..database import get_db

router = APIRouter(
    prefix="/api/notifications",
    tags=["notifications"],
)

@router.get("/", response_model=List[schemas.NotificationResponse])
async def get_notifications(
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user),
    limit: int = 50,
    unread_only: bool = False
):
    stmt = select(models.Notification).where(models.Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(models.Notification.is_read == False)
    stmt = stmt.order_by(desc(models.Notification.created_at)).limit(limit)
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.patch("/mark-read", status_code=204)
async def mark_notifications_read(
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user)
):
    stmt = update(models.Notification).where(
        models.Notification.user_id == user_id,
        models.Notification.is_read == False
    ).values(is_read=True)
    
    await db.execute(stmt)
    await db.commit()
    return None
