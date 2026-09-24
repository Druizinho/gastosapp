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

@router.post("/test")
async def test_push(
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user)
):
    """Sends a test push notification to the current user."""
    # Save a test notification in the database
    new_notification = models.Notification(
        user_id=user_id,
        title="Notificación de Prueba 🚀",
        body="¡Esto es una prueba enviada manualmente desde tu entorno local!",
        type="general"
    )
    db.add(new_notification)
    
    # Get all subscriptions for this user
    sub_stmt = select(models.PushSubscription).where(models.PushSubscription.user_id == user_id)
    sub_result = await db.execute(sub_stmt)
    subscriptions = sub_result.scalars().all()
    
    sent = 0
    for sub in subscriptions:
        success = send_push_notification(fcm_token=sub.fcm_token, title=new_notification.title, body=new_notification.body)
        if success:
            sent += 1
            
    await db.commit()
    
    return {"message": f"Notificación enviada a {sent} dispositivos."}

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
    is_morning = local_now.hour == 9 and 0 <= local_now.minute < 15
    is_evening = local_now.hour == 20 and 0 <= local_now.minute < 15
    
    if not is_morning and not is_evening:
        return {"status": "awake", "time": local_now.isoformat(), "message": "Ping received. Not notification time."}

    today = local_now.date()
    yesterday = today - datetime.timedelta(days=1)
    current_month_str = today.strftime("%Y-%m")
    
    sent_count = 0
    failed_count = 0
    tokens_to_delete = []

    # Helper function to send to a user, checking preferences
    async def send_to_user(user_id: UUID, title: str, body: str, pref_key: str):
        nonlocal sent_count, failed_count, tokens_to_delete
        
        # Check user profile preference
        profile_stmt = select(models.Profile).where(models.Profile.id == user_id)
        profile = (await db.execute(profile_stmt)).scalar()
        if not profile or not getattr(profile, pref_key, True):
            return  # User opted out
            
        # Save notification to database
        notification_type = pref_key.replace('notify_', '')
        new_notification = models.Notification(
            user_id=user_id,
            title=title,
            body=body,
            type=notification_type
        )
        db.add(new_notification)
        await db.commit()
            
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
        # 1. Fixed expenses due TODAY
        stmt_fixed = select(models.FixedExpense).where(
            models.FixedExpense.is_active == True,
            models.FixedExpense.payment_day == today.day
        )
        for expense in (await db.execute(stmt_fixed)).scalars().all():
            await send_to_user(expense.user_id, "Gasto Fijo Vence Hoy", f"{expense.name} ({expense.amount} {expense.currency})", "notify_fixed_expenses")
            
        # 2. Fixed expenses due YESTERDAY (Day After Reminder)
        stmt_fixed_yest = select(models.FixedExpense).where(
            models.FixedExpense.is_active == True,
            models.FixedExpense.payment_day == yesterday.day
        )
        for expense in (await db.execute(stmt_fixed_yest)).scalars().all():
            if expense.last_paid_month != current_month_str:
                await send_to_user(expense.user_id, "¿Pagaste tu gasto fijo?", f"Olvidaste avisarnos si pagaste '{expense.name}'.", "notify_fixed_expenses")

        # 3. Estimated Incomes due TODAY
        stmt_inc = select(models.EstimatedIncome).where(
            models.EstimatedIncome.is_active == True,
            models.EstimatedIncome.payment_day == today.day
        )
        for inc in (await db.execute(stmt_inc)).scalars().all():
            await send_to_user(inc.user_id, "Ingreso Estimado Hoy", f"Hoy te toca recibir el pago de {inc.name}", "notify_incomes")
            
        # 4. Estimated Incomes due YESTERDAY (Day After Reminder)
        stmt_inc_yest = select(models.EstimatedIncome).where(
            models.EstimatedIncome.is_active == True,
            models.EstimatedIncome.payment_day == yesterday.day
        )
        for inc in (await db.execute(stmt_inc_yest)).scalars().all():
            check_stmt = select(models.IncomeCheck).where(
                models.IncomeCheck.income_id == inc.id,
                models.IncomeCheck.month == current_month_str
            )
            has_paid = (await db.execute(check_stmt)).scalar() is not None
            if not has_paid:
                await send_to_user(inc.user_id, "¿Te pagaron?", f"¿{inc.name} te pagó? Olvidaste avisarnos.", "notify_incomes")

        # 5. Debts due TODAY or OVERDUE
        stmt_debts = select(models.Debt).where(
            models.Debt.is_settled == False,
            models.Debt.due_date <= today
        )
        for debt in (await db.execute(stmt_debts)).scalars().all():
            type_word = "Te deben" if debt.type == 'receivable' else "Debes"
            await send_to_user(debt.user_id, "Deuda Vencida", f"{type_word} {debt.total_amount} {debt.currency} por '{debt.concept}'", "notify_debts")

    # ==========================================
    # 🌙 EVENING WINDOW (8:00 PM) - Due Tomorrow + Inactivity
    # ==========================================
    if is_evening:
        tomorrow = today + datetime.timedelta(days=1)
        
        # 1. Fixed expenses due TOMORROW
        stmt_fixed_tmr = select(models.FixedExpense).where(
            models.FixedExpense.is_active == True,
            models.FixedExpense.payment_day == tomorrow.day
        )
        for expense in (await db.execute(stmt_fixed_tmr)).scalars().all():
            await send_to_user(expense.user_id, "Gasto Fijo Vence Mañana", f"{expense.name} ({expense.amount} {expense.currency})", "notify_fixed_expenses")
            
        # 2. Estimated Incomes due TOMORROW
        stmt_inc_tmr = select(models.EstimatedIncome).where(
            models.EstimatedIncome.is_active == True,
            models.EstimatedIncome.payment_day == tomorrow.day
        )
        for inc in (await db.execute(stmt_inc_tmr)).scalars().all():
            await send_to_user(inc.user_id, "Ingreso Estimado Mañana", f"Mañana {inc.name} debería pagarte", "notify_incomes")

        # 3. Debts due TOMORROW
        stmt_debts_tmr = select(models.Debt).where(
            models.Debt.is_settled == False,
            models.Debt.due_date == tomorrow
        )
        for debt in (await db.execute(stmt_debts_tmr)).scalars().all():
            type_word = "Te deben" if debt.type == 'receivable' else "Debes"
            await send_to_user(debt.user_id, "Deuda Vence Mañana", f"{type_word} {debt.total_amount} {debt.currency} por '{debt.concept}'", "notify_debts")

        # 4. Inactivity Reminder (Exactly 3 days without expenses)
        three_days_ago = today - datetime.timedelta(days=3)
        
        # Get all users who have subscriptions so we only check active users
        users_with_subs = (await db.execute(select(models.PushSubscription.user_id).distinct())).scalars().all()
        
        for uid in users_with_subs:
            # Get their most recent expense date
            last_exp_stmt = select(models.Expense.date).where(models.Expense.user_id == uid).order_by(models.Expense.date.desc()).limit(1)
            last_exp = (await db.execute(last_exp_stmt)).scalar()
            
            if last_exp and last_exp == three_days_ago:
                await send_to_user(uid, "Te hemos extrañado 👀", "Llevas 3 días sin registar gastos. Mantén tus finanzas al día, ¿registramos algo hoy?", "notify_inactivity")

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
