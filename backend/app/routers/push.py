from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from typing import List, Dict, Any
import os
import datetime

from .. import schemas, models, auth
from ..database import get_db
from ..push_service import send_push_notification

router = APIRouter(
    prefix="/push",
    tags=["push"],
)

@router.get("/public-key")
async def get_public_key():
    """Returns the VAPID public key needed by the frontend to subscribe."""
    public_key = os.getenv("VAPID_PUBLIC_KEY")
    if not public_key:
        raise HTTPException(status_code=500, detail="VAPID_PUBLIC_KEY not configured")
    return {"public_key": public_key}

@router.post("/subscribe", response_model=schemas.PushSubscriptionResponse)
async def subscribe_push(
    subscription: schemas.PushSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.Profile = Depends(auth.get_current_user)
):
    """Saves a push subscription for the current user."""
    # Check if subscription already exists for this endpoint
    stmt = select(models.PushSubscription).where(models.PushSubscription.endpoint == subscription.endpoint)
    result = await db.execute(stmt)
    existing_sub = result.scalars().first()
    
    if existing_sub:
        # Update user id if it changed (same device, different user)
        if existing_sub.user_id != current_user.id:
            existing_sub.user_id = current_user.id
            await db.commit()
            await db.refresh(existing_sub)
        return existing_sub
    
    # Create new subscription
    new_sub = models.PushSubscription(
        user_id=current_user.id,
        endpoint=subscription.endpoint,
        p256dh=subscription.p256dh,
        auth=subscription.auth
    )
    db.add(new_sub)
    await db.commit()
    await db.refresh(new_sub)
    return new_sub

@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe_push(
    endpoint: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.Profile = Depends(auth.get_current_user)
):
    """Removes a push subscription."""
    stmt = delete(models.PushSubscription).where(
        models.PushSubscription.endpoint == endpoint,
        models.PushSubscription.user_id == current_user.id
    )
    await db.execute(stmt)
    await db.commit()
    return None

@router.post("/trigger")
async def trigger_notifications(db: AsyncSession = Depends(get_db)):
    """
    Trigger endpoint called by Vercel Cron.
    This will query the database for pending notifications and send them.
    In a real app, this should be protected by a secret key.
    """
    # 1. Check fixed expenses due today
    today = datetime.date.today()
    day_of_month = today.day
    
    # Very basic example: Find active fixed expenses due today
    stmt_fixed = select(models.FixedExpense).where(
        models.FixedExpense.is_active == True,
        models.FixedExpense.payment_day == day_of_month
    )
    fixed_result = await db.execute(stmt_fixed)
    due_fixed = fixed_result.scalars().all()
    
    # Group by user
    user_notifications = {}
    for expense in due_fixed:
        if expense.user_id not in user_notifications:
            user_notifications[expense.user_id] = []
        user_notifications[expense.user_id].append(
            f"Gasto fijo vence hoy: {expense.name} ({expense.amount} {expense.currency})"
        )
    
    # Check debts due today or tomorrow
    stmt_debts = select(models.Debt).where(
        models.Debt.is_settled == False,
        models.Debt.due_date <= today + datetime.timedelta(days=1)
    )
    debts_result = await db.execute(stmt_debts)
    due_debts = debts_result.scalars().all()
    
    for debt in due_debts:
        if debt.user_id not in user_notifications:
            user_notifications[debt.user_id] = []
        
        status_word = "vence pronto" if debt.due_date > today else "venció"
        type_word = "Te deben" if debt.type == 'receivable' else "Debes"
        
        user_notifications[debt.user_id].append(
            f"{type_word} {debt.total_amount} {debt.currency} por '{debt.concept}' ({status_word})"
        )
        
    sent_count = 0
    failed_count = 0
    
    # Send notifications
    for user_id, messages in user_notifications.items():
        if not messages:
            continue
            
        # Get user's subscriptions
        sub_stmt = select(models.PushSubscription).where(models.PushSubscription.user_id == user_id)
        sub_result = await db.execute(sub_stmt)
        subscriptions = sub_result.scalars().all()
        
        if not subscriptions:
            continue
            
        payload = {
            "title": "Recordatorio de GastosApp",
            "body": "\\n".join(messages),
            "url": "/"
        }
        
        for sub in subscriptions:
            sub_info = {
                "endpoint": sub.endpoint,
                "keys": {
                    "p256dh": sub.p256dh,
                    "auth": sub.auth
                }
            }
            success = send_push_notification(sub_info, payload)
            if success:
                sent_count += 1
            else:
                failed_count += 1
                # Optional: Remove failed subscriptions if they are invalid (e.g., 410 Gone)
                # For simplicity, we just count them here.

    return {
        "status": "success", 
        "sent": sent_count, 
        "failed": failed_count,
        "users_notified": len(user_notifications)
    }
