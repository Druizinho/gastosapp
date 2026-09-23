from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from typing import List, Dict, Any
import os
import datetime
from uuid import UUID

from .. import schemas, models, auth
from ..database import get_db
from ..push_service import send_push_notification

router = APIRouter(
    prefix="/api/push",
    tags=["push"],
)

@router.post("/subscribe", response_model=schemas.PushSubscriptionResponse)
async def subscribe_push(
    subscription: schemas.PushSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user)
):
    """Saves a push subscription (FCM token) for the current user."""
    # Check if subscription already exists for this token
    stmt = select(models.PushSubscription).where(models.PushSubscription.fcm_token == subscription.fcm_token)
    result = await db.execute(stmt)
    existing_sub = result.scalars().first()
    
    if existing_sub:
        # Update user id if it changed (same device, different user)
        if existing_sub.user_id != user_id:
            existing_sub.user_id = user_id
            await db.commit()
            await db.refresh(existing_sub)
        return existing_sub
    
    # Create new subscription
    new_sub = models.PushSubscription(
        user_id=user_id,
        fcm_token=subscription.fcm_token
    )
    db.add(new_sub)
    await db.commit()
    await db.refresh(new_sub)
    
    # Send a welcome/test notification
    title = "¡Bienvenido/a!"
    body = "Activaste las notificaciones de GastosApp"
    send_push_notification(fcm_token=subscription.fcm_token, title=title, body=body)
    
    return new_sub

@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe_push(
    fcm_token: str,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user)
):
    """Removes a push subscription."""
    stmt = delete(models.PushSubscription).where(
        models.PushSubscription.fcm_token == fcm_token,
        models.PushSubscription.user_id == user_id
    )
    await db.execute(stmt)
    await db.commit()
    return None

@router.get("/cron")
async def trigger_notifications(
    token: str = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Trigger endpoint called by cron-job.org every 14 minutes.
    """
    cron_secret = os.getenv("CRON_SECRET")
    if not cron_secret:
        raise HTTPException(status_code=500, detail="CRON_SECRET is not configured")
        
    if token != cron_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Get current time in UTC-4 (Venezuela/Miami)
    utc_now = datetime.datetime.now(datetime.timezone.utc)
    local_now = utc_now.astimezone(datetime.timezone(datetime.timedelta(hours=-4)))
    
    # We only want to send notifications if the current local time is between 9:00 AM and 9:14 AM
    is_notification_window = local_now.hour == 9 and 0 <= local_now.minute < 14
    
    if not is_notification_window:
        return {"status": "awake", "time": local_now.isoformat(), "message": "Ping received. Not notification time."}

    # 1. Check fixed expenses due today
    today = local_now.date()
    day_of_month = today.day
    
    # Find active fixed expenses due today
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
    tokens_to_delete = []
    
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
            
        title = "Recordatorio de GastosApp"
        body = "\\n".join(messages)
        
        for sub in subscriptions:
            success = send_push_notification(fcm_token=sub.fcm_token, title=title, body=body)
            if success:
                sent_count += 1
            else:
                failed_count += 1
                tokens_to_delete.append(sub.fcm_token)

    # Clean up invalid tokens
    if tokens_to_delete:
        del_stmt = delete(models.PushSubscription).where(
            models.PushSubscription.fcm_token.in_(tokens_to_delete)
        )
        await db.execute(del_stmt)
        await db.commit()

    return {
        "status": "success", 
        "sent": sent_count, 
        "failed": failed_count,
        "deleted_invalid_tokens": len(tokens_to_delete),
        "users_notified": len(user_notifications)
    }
