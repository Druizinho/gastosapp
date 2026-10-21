import os
import firebase_admin
from firebase_admin import messaging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from uuid import UUID
from . import models

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://gastosapp.vercel.app")

def normalize_url(url: str) -> str:
    if not url:
        return FRONTEND_URL
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if not url.startswith("/"):
        url = "/" + url
    return f"{FRONTEND_URL.rstrip('/')}{url}"

def send_push_notification_to_token(fcm_token: str, title: str, body: str, url: str = "/") -> tuple[bool, bool]:
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
            },
            webpush=messaging.WebpushConfig(
                notification=messaging.WebpushNotification(
                    icon='/pwa-192x192.png',
                    badge='/favicon.svg',
                    data={"url": target_url}
                ),
                fcm_options=messaging.WebpushFCMOptions(
                    link=target_url
                )
            ),
            token=fcm_token,
        )

        response = messaging.send(message)
        print('Successfully sent push message:', response)
        return True, False
    except messaging.UnregisteredError:
        print(f"Token is unregistered or invalid: {fcm_token}")
        return False, True
    except (messaging.InvalidArgumentError, messaging.SenderIdMismatchError) as e:
        print(f"Token invalid or sender mismatch: {fcm_token} ({e})")
        return False, True
    except Exception as e:
        err_str = str(e).lower()
        if "unregistered" in err_str or "registration-token-not-registered" in err_str:
            print(f"Token unregistered detected via exception: {fcm_token}")
            return False, True
        print("Push notification general error:", repr(e))
        return False, False

def send_push_notification(fcm_token: str, title: str, body: str, url: str = "/") -> bool:
    """
    Sends a push notification to a specific FCM token.
    Returns True if successful, False otherwise.
    """
    success, _ = send_push_notification_to_token(fcm_token, title, body, url=url)
    return success

async def send_notification_to_user(
    db: AsyncSession, 
    user_id: UUID, 
    title: str, 
    body: str, 
    type: str,
    url: str = "/"
):
    """
    Envía push (respetando preferencias de perfil y tokens) 
    y siempre guarda la notificación en `models.Notification` para el historial in-app.
    """
    try:
        # 1. Guardar notificación en tabla notifications para historial in-app
        notification = models.Notification(
            user_id=user_id, title=title, body=body, type=type
        )
        db.add(notification)
        await db.flush()

        # 2. Verificar preferencia del usuario en Profile
        prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
        profile = prof_res.scalars().first()

        should_send_push = True
        if profile:
            if type in ["shared_debt_created", "shared_debt_payment", "shared_debt_settled", "shared_debt_deleted", "debts"]:
                should_send_push = getattr(profile, "notify_debts", True)
            elif type in ["shared_fe_created", "shared_fe_paid", "fixed_expenses"]:
                should_send_push = getattr(profile, "notify_fixed_expenses", True)
            elif type in ["incomes"]:
                should_send_push = getattr(profile, "notify_incomes", True)
            elif type in ["inactivity"]:
                should_send_push = getattr(profile, "notify_inactivity", True)

        # 3. Despachar push si la preferencia está activa
        if should_send_push:
            subs = await db.execute(
                select(models.PushSubscription).where(models.PushSubscription.user_id == user_id)
            )
            
            tokens_to_delete = []
            for sub in subs.scalars().all():
                success, is_unregistered = send_push_notification_to_token(sub.fcm_token, title, body, url=url)
                if is_unregistered:
                    tokens_to_delete.append(sub.fcm_token)
            
            if tokens_to_delete:
                await db.execute(
                    delete(models.PushSubscription).where(
                        models.PushSubscription.fcm_token.in_(tokens_to_delete)
                    )
                )
                await db.commit()

    except Exception as e:
        print("Error in send_notification_to_user:", repr(e))


