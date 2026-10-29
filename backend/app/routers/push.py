from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, func
from typing import List, Dict, Any, Optional
import os
import datetime
import asyncio
import calendar
import secrets
from uuid import UUID

from .. import schemas, models, auth
from ..database import get_db
from ..push_service import send_push_notification, send_push_notification_to_token
from ..time_utils import vet_now, vet_today, VET_TZ

router = APIRouter(
    prefix="/api/push",
    tags=["push"],
)

_cron_lock = asyncio.Lock()


def _due_days_for_date(d: datetime.date) -> list[int]:
    """Helper para días 29, 30 y 31 en meses más cortos (Hallazgo #8)."""
    last_day = calendar.monthrange(d.year, d.month)[1]
    if d.day == last_day and last_day < 31:
        return list(range(d.day, 32))
    return [d.day]


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
    
    # Send a welcome push notification asynchronously without blocking event loop
    await asyncio.to_thread(
        send_push_notification,
        subscription.fcm_token,
        "Notificaciones activadas",
        "Recibirás tus recordatorios y alertas importantes de GastosApp.",
        "/ajustes"
    )
    
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
        type="general",
        url="/ajustes",
        is_resolved=False,
    )
    db.add(new_notification)
    
    # Get all subscriptions for this user
    sub_stmt = select(models.PushSubscription).where(models.PushSubscription.user_id == user_id)
    sub_result = await db.execute(sub_stmt)
    subscriptions = sub_result.scalars().all()
    
    sent = 0
    tokens_to_delete = []
    for sub in subscriptions:
        res = await asyncio.to_thread(
            send_push_notification_to_token,
            sub.fcm_token,
            new_notification.title,
            new_notification.body,
            "/ajustes"
        )
        success = res[0] if isinstance(res, tuple) else bool(res)
        is_unregistered = res[1] if isinstance(res, tuple) and len(res) > 1 else (res == "UNREGISTERED")
        if success:
            sent += 1
        if is_unregistered:
            tokens_to_delete.append(sub.fcm_token)
            
    if tokens_to_delete:
        await db.execute(
            delete(models.PushSubscription).where(models.PushSubscription.fcm_token.in_(tokens_to_delete))
        )
    await db.commit()
    
    return {"message": f"Notificación enviada a {sent} dispositivos."}


async def execute_scheduled_notifications(
    db: AsyncSession,
    window: str,
    now_vet: Optional[datetime.datetime] = None
) -> dict:
    """
    Ejecuta el ciclo de notificaciones programadas (morning o evening)
    protegido por un asyncio.Lock() de nivel módulo.
    Inserta las notificaciones individuales en Bandeja y despacha
    exactamente un Push consolidado por usuario con pendientes.
    """
    global _cron_lock
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _cron_lock._loop is not None and current_loop is not None and _cron_lock._loop != current_loop:
        _cron_lock = asyncio.Lock()

    async with _cron_lock:
        local_now = now_vet or vet_now()
        today = local_now.date()
        yesterday = today - datetime.timedelta(days=1)
        tomorrow = today + datetime.timedelta(days=1)
        start_of_today = datetime.datetime.combine(today, datetime.time.min, tzinfo=VET_TZ)

        # Cargar perfiles de usuarios para verificar preferencias e inactividad
        profiles_res = await db.execute(select(models.Profile))
        profiles_map: dict[UUID, models.Profile] = {p.id: p for p in profiles_res.scalars().all()}

        pending_by_user: dict[UUID, list[dict]] = {}

        async def queue_item(
            user_id: UUID,
            title: str,
            body: str,
            pref_key: str,
            url: str = "/",
            entity_type: Optional[str] = None,
            entity_id: Optional[UUID] = None
        ) -> bool:
            # 1. Verificar preferencia en el perfil del usuario
            profile = profiles_map.get(user_id)
            if profile and not getattr(profile, pref_key, True):
                return False

            # 2. Deduplicación diaria exacta (Fix Hallazgo #7B)
            existing = await db.execute(
                select(models.Notification.id).where(
                    models.Notification.user_id == user_id,
                    models.Notification.title == title,
                    models.Notification.body == body,
                    models.Notification.created_at >= start_of_today
                )
            )
            if existing.scalars().first() is not None:
                return False

            # 3. Insertar notificación individual en la bandeja
            new_notif = models.Notification(
                user_id=user_id,
                title=title,
                body=body,
                type=pref_key.replace("notify_", ""),
                url=url,
                is_resolved=False,
                entity_type=entity_type,
                entity_id=entity_id
            )
            db.add(new_notif)

            # 4. Acumular en lista de pendientes para el push consolidado
            pending_by_user.setdefault(user_id, []).append({
                "title": title,
                "body": body,
                "url": url
            })
            return True

        async def get_recipients_for_item(item, entity_type: Optional[str] = None) -> list[UUID]:
            """Obtiene destinatarios: dueño + miembros de ShareMember si tiene share_id o vía Share (Fix #9A)."""
            recipients = [item.user_id]
            share_id = getattr(item, "share_id", None)
            if share_id is not None:
                share_stmt = select(models.ShareMember.user_id).where(models.ShareMember.share_id == share_id)
                res = await db.execute(share_stmt)
                for u in res.scalars().all():
                    if u and u not in recipients:
                        recipients.append(u)

            if len(recipients) == 1:
                stmt_shared = (
                    select(models.ShareMember.user_id)
                    .join(models.Share, models.ShareMember.share_id == models.Share.id)
                    .where(models.ShareMember.entity_id == item.id)
                )
                if entity_type:
                    stmt_shared = stmt_shared.where(models.Share.entity_type == entity_type)
                res_shared = await db.execute(stmt_shared)
                for u in res_shared.scalars().all():
                    if u and u not in recipients:
                        recipients.append(u)
            return recipients

        # ==========================================
        # ☀️ MORNING WINDOW (9:00 AM VET)
        # ==========================================
        if window == "morning":
            current_month_str = today.strftime("%Y-%m")
            yest_month_str = yesterday.strftime("%Y-%m")
            due_days_today = _due_days_for_date(today)
            due_days_yest = _due_days_for_date(yesterday)

            # 1. Gastos fijos que vencen HOY
            stmt_fixed_today = select(models.FixedExpense).where(
                models.FixedExpense.is_active == True,
                models.FixedExpense.payment_day.in_(due_days_today)
            )
            for expense in (await db.execute(stmt_fixed_today)).scalars().all():
                chk_stmt = select(models.FixedExpenseCheck).where(
                    models.FixedExpenseCheck.fixed_expense_id == expense.id,
                    models.FixedExpenseCheck.month_year == current_month_str
                )
                if (await db.execute(chk_stmt)).scalars().first() is None:
                    recipients = await get_recipients_for_item(expense, entity_type="fixed_expense")
                    for u_id in recipients:
                        await queue_item(
                            u_id,
                            title="Gasto fijo vence hoy",
                            body=f"{expense.name}: {expense.amount} {expense.currency}",
                            pref_key="notify_fixed_expenses",
                            url="/herramientas/gastos-fijos",
                            entity_type="fixed_expense",
                            entity_id=expense.id
                        )

            # 2. Gastos fijos que vencieron AYER
            stmt_fixed_yest = select(models.FixedExpense).where(
                models.FixedExpense.is_active == True,
                models.FixedExpense.payment_day.in_(due_days_yest)
            )
            for expense in (await db.execute(stmt_fixed_yest)).scalars().all():
                chk_stmt = select(models.FixedExpenseCheck).where(
                    models.FixedExpenseCheck.fixed_expense_id == expense.id,
                    models.FixedExpenseCheck.month_year == yest_month_str
                )
                if (await db.execute(chk_stmt)).scalars().first() is None:
                    recipients = await get_recipients_for_item(expense, entity_type="fixed_expense")
                    for u_id in recipients:
                        await queue_item(
                            u_id,
                            title="Gasto fijo venció ayer",
                            body=f"{expense.name} ({expense.amount} {expense.currency}) sigue pendiente de pago.",
                            pref_key="notify_fixed_expenses",
                            url="/herramientas/gastos-fijos",
                            entity_type="fixed_expense",
                            entity_id=expense.id
                        )

            # 3. Ingresos estimados para HOY
            stmt_inc_today = select(models.EstimatedIncome).where(
                models.EstimatedIncome.is_active == True,
                models.EstimatedIncome.payment_day.in_(due_days_today)
            )
            for inc in (await db.execute(stmt_inc_today)).scalars().all():
                chk_stmt = select(models.IncomeCheck).where(
                    models.IncomeCheck.income_id == inc.id,
                    models.IncomeCheck.month_year == current_month_str
                )
                chk = (await db.execute(chk_stmt)).scalars().first()
                is_complete = chk is not None and not getattr(chk, "is_partial", False)
                if not is_complete:
                    amt = getattr(inc, "amount", getattr(inc, "expected_amount", ""))
                    await queue_item(
                        inc.user_id,
                        title="Ingreso esperado hoy",
                        body=f"{inc.name}: {amt} {inc.currency}",
                        pref_key="notify_incomes",
                        url="/herramientas/ingresos",
                        entity_type="estimated_income",
                        entity_id=inc.id
                    )

            # 4. Ingresos estimados de AYER
            stmt_inc_yest = select(models.EstimatedIncome).where(
                models.EstimatedIncome.is_active == True,
                models.EstimatedIncome.payment_day.in_(due_days_yest)
            )
            for inc in (await db.execute(stmt_inc_yest)).scalars().all():
                chk_stmt = select(models.IncomeCheck).where(
                    models.IncomeCheck.income_id == inc.id,
                    models.IncomeCheck.month_year == yest_month_str
                )
                chk = (await db.execute(chk_stmt)).scalars().first()
                if chk is None:
                    amt = getattr(inc, "amount", getattr(inc, "expected_amount", ""))
                    await queue_item(
                        inc.user_id,
                        title="Ingreso pendiente de ayer",
                        body=f"¿Recibiste {inc.name} ({amt} {inc.currency})?",
                        pref_key="notify_incomes",
                        url="/herramientas/ingresos",
                        entity_type="estimated_income",
                        entity_id=inc.id
                    )

            # 5. Saldos parciales de ingresos para HOY (Fix Hallazgo #9B)
            stmt_partial = (
                select(models.IncomeCheck, models.EstimatedIncome)
                .join(models.EstimatedIncome, models.IncomeCheck.income_id == models.EstimatedIncome.id)
                .where(
                    models.IncomeCheck.is_partial == True,
                    models.IncomeCheck.pending_date == today
                )
            )
            for chk, inc in (await db.execute(stmt_partial)).all():
                pending_amt = getattr(chk, "pending_amount", None)
                if pending_amt is None:
                    expected = getattr(inc, "expected_amount", getattr(inc, "amount", 0)) or 0
                    real = getattr(chk, "real_amount", 0) or 0
                    diff = expected - real
                    pending_amt = diff if diff > 0 else expected
                await queue_item(
                    inc.user_id,
                    title="Saldo de ingreso para hoy",
                    body=f"Restante de {inc.name}: {pending_amt} {inc.currency}",
                    pref_key="notify_incomes",
                    url="/herramientas/ingresos?tab=por-cobrar",
                    entity_type="estimated_income",
                    entity_id=inc.id
                )

            # 6. Deudas que vencen HOY (Cadencia máxima 3 avisos q4)
            stmt_debts_today = select(models.Debt).where(
                models.Debt.is_settled == False,
                models.Debt.due_date == today
            )
            for debt in (await db.execute(stmt_debts_today)).scalars().all():
                person_name = getattr(debt, "person_name", None) or getattr(debt, "counterpart", "")
                recipients = await get_recipients_for_item(debt, entity_type="debt")
                for u_id in recipients:
                    await queue_item(
                        u_id,
                        title="Deuda vence hoy",
                        body=f"{debt.concept} ({person_name}) vence hoy.",
                        pref_key="notify_debts",
                        url=f"/herramientas/deudas?tab={debt.type}",
                        entity_type="debt",
                        entity_id=debt.id
                    )

            # 6b. Deudas que vencieron AYER
            stmt_debts_yest = select(models.Debt).where(
                models.Debt.is_settled == False,
                models.Debt.due_date == yesterday
            )
            for debt in (await db.execute(stmt_debts_yest)).scalars().all():
                person_name = getattr(debt, "person_name", None) or getattr(debt, "counterpart", "")
                recipients = await get_recipients_for_item(debt, entity_type="debt")
                for u_id in recipients:
                    await queue_item(
                        u_id,
                        title="Deuda venció ayer",
                        body=f"{debt.concept} ({person_name}) sigue pendiente.",
                        pref_key="notify_debts",
                        url=f"/herramientas/deudas?tab={debt.type}",
                        entity_type="debt",
                        entity_id=debt.id
                    )

        # ==========================================
        # 🌙 EVENING WINDOW (7:00 PM / 19:00 VET)
        # ==========================================
        elif window == "evening":
            tmr_month_str = tomorrow.strftime("%Y-%m")
            due_days_tmr = _due_days_for_date(tomorrow)

            # 1. Gastos fijos que vencen MAÑANA
            stmt_fixed_tmr = select(models.FixedExpense).where(
                models.FixedExpense.is_active == True,
                models.FixedExpense.payment_day.in_(due_days_tmr)
            )
            for expense in (await db.execute(stmt_fixed_tmr)).scalars().all():
                chk_stmt = select(models.FixedExpenseCheck).where(
                    models.FixedExpenseCheck.fixed_expense_id == expense.id,
                    models.FixedExpenseCheck.month_year == tmr_month_str
                )
                if (await db.execute(chk_stmt)).scalars().first() is None:
                    recipients = await get_recipients_for_item(expense, entity_type="fixed_expense")
                    for u_id in recipients:
                        await queue_item(
                            u_id,
                            title="Gasto fijo vence mañana",
                            body=f"{expense.name}: {expense.amount} {expense.currency}",
                            pref_key="notify_fixed_expenses",
                            url="/herramientas/gastos-fijos",
                            entity_type="fixed_expense",
                            entity_id=expense.id
                        )

            # 2. Ingresos estimados para MAÑANA
            stmt_inc_tmr = select(models.EstimatedIncome).where(
                models.EstimatedIncome.is_active == True,
                models.EstimatedIncome.payment_day.in_(due_days_tmr)
            )
            for inc in (await db.execute(stmt_inc_tmr)).scalars().all():
                chk_stmt = select(models.IncomeCheck).where(
                    models.IncomeCheck.income_id == inc.id,
                    models.IncomeCheck.month_year == tmr_month_str
                )
                chk = (await db.execute(chk_stmt)).scalars().first()
                is_complete = chk is not None and not getattr(chk, "is_partial", False)
                if not is_complete:
                    amt = getattr(inc, "amount", getattr(inc, "expected_amount", ""))
                    await queue_item(
                        inc.user_id,
                        title="Ingreso esperado mañana",
                        body=f"{inc.name}: {amt} {inc.currency}",
                        pref_key="notify_incomes",
                        url="/herramientas/ingresos",
                        entity_type="estimated_income",
                        entity_id=inc.id
                    )

            # 3. Deudas que vencen MAÑANA
            stmt_debts_tmr = select(models.Debt).where(
                models.Debt.is_settled == False,
                models.Debt.due_date == tomorrow
            )
            for debt in (await db.execute(stmt_debts_tmr)).scalars().all():
                person_name = getattr(debt, "person_name", None) or getattr(debt, "counterpart", "")
                recipients = await get_recipients_for_item(debt, entity_type="debt")
                for u_id in recipients:
                    await queue_item(
                        u_id,
                        title="Deuda vence mañana",
                        body=f"{debt.concept} ({person_name}) vence mañana.",
                        pref_key="notify_debts",
                        url=f"/herramientas/deudas?tab={debt.type}",
                        entity_type="debt",
                        entity_id=debt.id
                    )

            # 4. Inactividad con freno en Día 3 y Día 7 (q6)
            for u_id in profiles_map.keys():
                last_exp_stmt = select(func.max(models.Expense.date)).where(models.Expense.user_id == u_id)
                last_exp = (await db.execute(last_exp_stmt)).scalar()
                if last_exp is not None:
                    if isinstance(last_exp, datetime.datetime):
                        last_exp = last_exp.date()
                    days_inactive = (today - last_exp).days
                    if days_inactive == 3:
                        await queue_item(
                            u_id,
                            title="3 días sin registrar gastos",
                            body="Registra tus movimientos recientes para mantener tus cuentas al día.",
                            pref_key="notify_inactivity",
                            url="/?add=true",
                            entity_type="inactivity",
                            entity_id=u_id
                        )
                    elif days_inactive == 7:
                        await queue_item(
                            u_id,
                            title="7 días sin registrar gastos",
                            body="Último recordatorio: actualiza tus gastos cuando quieras retomar el control.",
                            pref_key="notify_inactivity",
                            url="/?add=true",
                            entity_type="inactivity",
                            entity_id=u_id
                        )

        # Purga de retención de 30 días (q16)
        retention_limit = local_now - datetime.timedelta(days=30)
        await db.execute(
            delete(models.Notification).where(models.Notification.created_at < retention_limit)
        )

        # Commit de las filas en Bandeja ANTES del envío Push
        await db.commit()

        # Despacho del Push Consolidado por Usuario (q2, q14)
        sent_count = 0
        failed_count = 0
        tokens_to_delete = []

        for user_id, items in pending_by_user.items():
            if not items:
                continue
            if len(items) == 1:
                push_title = items[0]["title"]
                push_body = items[0]["body"]
                push_url = items[0]["url"]
            else:
                if window == "morning":
                    push_title = f"Tienes {len(items)} recordatorios para hoy"
                else:
                    push_title = f"Resumen de la noche: {len(items)} pendientes"
                push_body = " • ".join(i["body"] for i in items[:3]) + (f" (+{len(items) - 3} más)" if len(items) > 3 else "")
                push_url = "/?notifications=open"

            sub_stmt = select(models.PushSubscription).where(models.PushSubscription.user_id == user_id)
            subs = (await db.execute(sub_stmt)).scalars().all()
            for sub in subs:
                res = await asyncio.to_thread(
                    send_push_notification_to_token, sub.fcm_token, push_title, push_body, push_url
                )
                success = res[0] if isinstance(res, tuple) else bool(res)
                is_unregistered = res[1] if isinstance(res, tuple) and len(res) > 1 else (res == "UNREGISTERED")
                if success:
                    sent_count += 1
                else:
                    failed_count += 1
                    if is_unregistered:
                        tokens_to_delete.append(sub.fcm_token)

        if tokens_to_delete:
            del_stmt = delete(models.PushSubscription).where(
                models.PushSubscription.fcm_token.in_(tokens_to_delete)
            )
            await db.execute(del_stmt)
            await db.commit()

        return {
            "status": "success",
            "window": window,
            "items_queued": sum(len(items) for items in pending_by_user.values()),
            "users_notified": len(pending_by_user),
            "sent": sent_count,
            "failed": failed_count,
            "deleted_invalid_tokens": len(tokens_to_delete),
        }


@router.api_route("/cron", methods=["GET", "POST"])
@router.api_route("/trigger", methods=["POST"])
async def trigger_notifications(
    token: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    window: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Trigger endpoint llamado por Vercel Cron o cron-job.org.
    Acepta el token vía query param ?token= o header Authorization: Bearer <secret>.
    """
    provided_token = token
    if not provided_token and authorization:
        if authorization.lower().startswith("bearer "):
            provided_token = authorization.split(" ", 1)[1].strip()
        else:
            provided_token = authorization.strip()

    cron_secret = os.getenv("CRON_SECRET")
    if not cron_secret:
        raise HTTPException(status_code=500, detail="CRON_SECRET is not configured")
        
    if not provided_token or not secrets.compare_digest(provided_token, cron_secret):
        raise HTTPException(status_code=401, detail="Unauthorized")

    local_now = vet_now()
    
    # Determinar ventana activa según tolerancia especificada
    is_morning = window == "morning" or (window is None and (local_now.hour == 9 or (local_now.hour == 10 and local_now.minute <= 30)))
    is_evening = window == "evening" or (window is None and local_now.hour in (19, 20))
    
    if not is_morning and not is_evening:
        return {"status": "awake", "time": local_now.isoformat(), "message": "Ping received. Outside notification window."}

    active_window = "morning" if is_morning else "evening"
    return await execute_scheduled_notifications(db, active_window, now_vet=local_now)
