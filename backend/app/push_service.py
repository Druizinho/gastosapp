import os
import logging
import asyncio
import datetime
from typing import Optional, Tuple
import firebase_admin
from firebase_admin import messaging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, update
from uuid import UUID
from . import models
from .time_utils import vet_now

logger = logging.getLogger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://gastosapp.vercel.app")

def normalize_url(url: str) -> str:
    if not url:
        return FRONTEND_URL
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if not url.startswith("/"):
        url = "/" + url
    return f"{FRONTEND_URL.rstrip('/')}{url}"

def is_quiet_hours(now_vet: Optional[datetime.datetime] = None) -> bool:
    """Horario de silencio nocturno: 10:00 PM (22:00) a 07:59 AM VET."""
    current = now_vet or vet_now()
    return current.hour >= 22 or current.hour < 8

class PushResult(tuple):
    def __new__(cls, success: bool, is_unregistered: bool):
        return super().__new__(cls, (success, is_unregistered))

    def __bool__(self):
        return bool(self[0])

    def __eq__(self, other):
        if other == "UNREGISTERED":
            return bool(self[1])
        return super().__eq__(other)

def send_push_notification_to_token(
    fcm_token: str,
    title: str,
    body: str,
    url: str = "/",
    tag: str = "gastosapp-alert"
) -> PushResult:
    """
    Sends a push notification to a specific FCM token.
    Returns (success: bool, is_unregistered: bool).
    Only is_unregistered=True means the token should be purged from database.
    """
    target_url = normalize_url(url)
    try:
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data={
                "url": target_url,
                "title": title,
                "body": body,
                "tag": tag,
            },
            webpush=messaging.WebpushConfig(
                notification=messaging.WebpushNotification(
                    icon='/pwa-192x192.png',
                    badge='/pwa-192x192.png',
                    tag=tag,
                    data={"url": target_url}
                ),
                fcm_options=messaging.WebpushFCMOptions(
                    link=target_url
                )
            ),
            token=fcm_token,
        )

        response = messaging.send(message)
        logger.info(f"Successfully sent push message: {response}")
        return PushResult(True, False)
    except messaging.UnregisteredError:
        logger.warning(f"Token is unregistered or invalid: {fcm_token}")
        return PushResult(False, True)
    except (messaging.InvalidArgumentError, messaging.SenderIdMismatchError) as e:
        logger.warning(f"Token invalid or sender mismatch: {fcm_token} ({e})")
        return PushResult(False, True)
    except Exception as e:
        err_str = str(e).lower()
        if "unregistered" in err_str or "registration-token-not-registered" in err_str:
            logger.warning(f"Token unregistered detected via exception: {fcm_token}")
            return PushResult(False, True)
        logger.error(f"Push notification general error: {repr(e)}")
        return PushResult(False, False)

def send_push_notification(
    fcm_token: str,
    title: str,
    body: str,
    url: str = "/",
    tag: str = "gastosapp-alert"
) -> bool:
    """
    Sends a push notification to a specific FCM token.
    Returns True if successful, False otherwise.
    """
    result = send_push_notification_to_token(fcm_token, title, body, url=url, tag=tag)
    return bool(result)

async def send_notification_to_user(
    db: AsyncSession,
    user_id: UUID,
    title: str,
    body: str,
    type: str,
    url: str = "/",
    send_push: bool = True,
    entity_type: Optional[str] = None,
    entity_id: Optional[UUID] = None,
    commit: bool = True,
    now_vet: Optional[datetime.datetime] = None,
) -> Optional[models.Notification]:
    """
    Envía push (respetando preferencias de perfil, tokens y horario de silencio)
    y siempre guarda la notificación en `models.Notification` para el historial in-app.
    """
    try:
        target_url = url if url and url.startswith("/") else f"/{url or ''}"

        # 1. Guardar notificación en tabla notifications para historial in-app
        notification = models.Notification(
            user_id=user_id,
            title=title,
            body=body,
            type=type,
            url=target_url,
            is_resolved=False,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        db.add(notification)
        await db.flush()

        # 2. Verificar preferencia del usuario en Profile
        prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        profile = prof_res.scalars().first()

        should_send_push = True
        if profile:
            if type in ("budgets", "budget_80", "budget_100"):
                should_send_push = getattr(profile, "notify_budgets", True)
            elif type in ("connection_request", "connection_accepted", "share_member_added", "share_member_left", "share_role_changed", "savings", "pana") or type.startswith("shared_"):
                should_send_push = getattr(profile, "notify_panas", True)
            elif type in ("debts", "debt"):
                should_send_push = getattr(profile, "notify_debts", True)
            elif type in ("fixed_expenses", "fixed_expense"):
                should_send_push = getattr(profile, "notify_fixed_expenses", True)
            elif type in ("incomes", "income"):
                should_send_push = getattr(profile, "notify_incomes", True)
            elif type == "inactivity":
                should_send_push = getattr(profile, "notify_inactivity", True)

        # 3. Despachar push si la preferencia está activa y fuera del horario de silencio
        if send_push and should_send_push and not is_quiet_hours(now_vet):
            subs = await db.execute(
                select(models.PushSubscription).where(models.PushSubscription.user_id == user_id)
            )

            tokens_to_delete = []
            for sub in subs.scalars().all():
                res = await asyncio.to_thread(
                    send_push_notification_to_token, sub.fcm_token, title, body, target_url
                )
                if res == "UNREGISTERED" or (isinstance(res, tuple) and len(res) > 1 and res[1]):
                    tokens_to_delete.append(sub.fcm_token)

            if tokens_to_delete:
                await db.execute(
                    delete(models.PushSubscription).where(
                        models.PushSubscription.fcm_token.in_(tokens_to_delete)
                    )
                )

        # 4. Control transaccional
        if commit:
            await db.commit()
        else:
            await db.flush()
        return notification

    except Exception as e:
        logger.error(f"Error in send_notification_to_user: {repr(e)}")
        return None

async def resolve_notifications_for_entity(
    db: AsyncSession,
    entity_type: str,
    entity_id: UUID,
    user_id: Optional[UUID] = None,
    commit: bool = False,
) -> None:
    """Marca como resueltas y leídas las notificaciones asociadas a una entidad."""
    try:
        stmt = (
            update(models.Notification)
            .where(
                models.Notification.entity_type == entity_type,
                models.Notification.entity_id == entity_id,
            )
            .values(is_resolved=True, is_read=True)
        )
        if user_id is not None:
            stmt = stmt.where(models.Notification.user_id == user_id)
        await db.execute(stmt)
        if commit:
            await db.commit()
        else:
            await db.flush()
    except Exception as e:
        logger.error(f"Error resolving notifications for {entity_type}:{entity_id}: {e}")
