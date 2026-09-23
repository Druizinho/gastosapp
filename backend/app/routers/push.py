from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from typing import List, Dict, Any
import os
import datetime
import asyncio
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
    
    # Determine which window we are in
    is_morning = local_now.hour == 9 and 0 <= local_now.minute < 10
    is_evening = local_now.hour == 20 and 0 <= local_now.minute < 10
    
    if not is_morning and not is_evening:
        return {"status": "awake", "time": local_now.isoformat(), "message": "Ping received. Not notification time."}

    today = local_now.date()
    sent_count = 0
    failed_count = 0
    tokens_to_delete = []

    # Helper function to send to a user
    async def send_to_user(user_id: UUID, title: str, body: str):
        nonlocal sent_count, failed_count, tokens_to_delete
        sub_stmt = select(models.PushSubscription).where(models.PushSubscription.user_id == user_id)
        sub_result = await db.execute(sub_stmt)
        subscriptions = sub_result.scalars().all()
        for sub in subscriptions:
            success = send_push_notification(fcm_token=sub.fcm_token, title=title, body=body)
            if success:
                sent_count += 1
            else:
                failed_count += 1
                tokens_to_delete.append(sub.fcm_token)
            # Add a 2 second delay to avoid vibrating the phone simultaneously for multiple notifications
            await asyncio.sleep(2)

    # ==========================================
    # ☀️ MORNING WINDOW (9:00 AM) - Due Today/Overdue
    # ==========================================
    if is_morning:
        # Fixed expenses due TODAY
        stmt_fixed = select(models.FixedExpense).where(
            models.FixedExpense.is_active == True,
            models.FixedExpense.payment_day == today.day
        )
        for expense in (await db.execute(stmt_fixed)).scalars().all():
            await send_to_user(expense.user_id, "Gasto Fijo Vence Hoy", f"{expense.name} ({expense.amount} {expense.currency})")
            
        # Debts due TODAY or OVERDUE
        stmt_debts = select(models.Debt).where(
            models.Debt.is_settled == False,
            models.Debt.due_date <= today
        )
        for debt in (await db.execute(stmt_debts)).scalars().all():
            type_word = "Te deben" if debt.type == 'receivable' else "Debes"
            await send_to_user(debt.user_id, "Deuda Vencida", f"{type_word} {debt.total_amount} {debt.currency} por '{debt.concept}'")

    # ==========================================
    # 🌙 EVENING WINDOW (8:00 PM) - Due Tomorrow + Inactivity
    # ==========================================
    if is_evening:
        tomorrow = today + datetime.timedelta(days=1)
        
        # Fixed expenses due TOMORROW
        stmt_fixed_tmr = select(models.FixedExpense).where(
            models.FixedExpense.is_active == True,
            models.FixedExpense.payment_day == tomorrow.day
        )
        for expense in (await db.execute(stmt_fixed_tmr)).scalars().all():
            await send_to_user(expense.user_id, "Gasto Fijo Vence Mañana", f"{expense.name} ({expense.amount} {expense.currency})")
            
        # Debts due TOMORROW
        stmt_debts_tmr = select(models.Debt).where(
            models.Debt.is_settled == False,
            models.Debt.due_date == tomorrow
        )
        for debt in (await db.execute(stmt_debts_tmr)).scalars().all():
            type_word = "Te deben" if debt.type == 'receivable' else "Debes"
            await send_to_user(debt.user_id, "Deuda Vence Mañana", f"{type_word} {debt.total_amount} {debt.currency} por '{debt.concept}'")

        # Inactivity Reminder (Exactly 3 days without expenses)
        three_days_ago = today - datetime.timedelta(days=3)
        
        # Get all users who have subscriptions so we only check active users
        users_with_subs = (await db.execute(select(models.PushSubscription.user_id).distinct())).scalars().all()
        
        for uid in users_with_subs:
            # Get their most recent expense date
            last_exp_stmt = select(models.Expense.date).where(models.Expense.user_id == uid).order_by(models.Expense.date.desc()).limit(1)
            last_exp = (await db.execute(last_exp_stmt)).scalar()
            
            if last_exp and last_exp == three_days_ago:
                await send_to_user(uid, "Te hemos extrañado 👀", "Llevas 3 días sin registrar gastos. Mantén tus finanzas al día, ¿registramos algo hoy?")

    # Clean up invalid tokens
    if tokens_to_delete:
        del_stmt = delete(models.PushSubscription).where(
            models.PushSubscription.fcm_token.in_(tokens_to_delete)
        )
        await db.execute(del_stmt)
        await db.commit()

    return {
        "status": "success", 
        "window": "morning" if is_morning else "evening",
        "sent": sent_count, 
        "failed": failed_count,
        "deleted_invalid_tokens": len(tokens_to_delete)
    }
