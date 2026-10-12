import firebase_admin
from firebase_admin import messaging

def send_push_notification(fcm_token: str, title: str, body: str, url: str = "https://gastosapp.vercel.app/"):
    """
    Sends a push notification to a specific FCM token.
    Returns True if successful, False otherwise.
    """
    try:
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            webpush=messaging.WebpushConfig(
                notification=messaging.WebpushNotification(
                    icon='/pwa-192x192.png',
                    badge='/favicon.svg'
                ),
                fcm_options=messaging.WebpushFCMOptions(
                    link=url
                )
            ),
            token=fcm_token,
        )

        # Send a message to the device corresponding to the provided registration token.
        response = messaging.send(message)
        print('Successfully sent message:', response)
        return True
    except messaging.UnregisteredError:
        print(f"Token is unregistered or invalid: {fcm_token}")
        return False
    except Exception as e:
        print("Push notification general error:", repr(e))
        return False

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from uuid import UUID
from . import models

async def send_notification_to_user(
    db: AsyncSession, 
    user_id: UUID, 
    title: str, 
    body: str, 
    type: str,
    url: str = "https://gastosapp.vercel.app/"
):
    """Envía push + guarda notificación en DB para un user_id específico."""
    notification = models.Notification(
        user_id=user_id, title=title, body=body, type=type
    )
    db.add(notification)
    
    subs = await db.execute(
        select(models.PushSubscription).where(models.PushSubscription.user_id == user_id)
    )
    
    tokens_to_delete = []
    for sub in subs.scalars().all():
        success = send_push_notification(sub.fcm_token, title, body, url=url)
        if not success:
            tokens_to_delete.append(sub.fcm_token)
    
    if tokens_to_delete:
        await db.execute(
            delete(models.PushSubscription).where(
                models.PushSubscription.fcm_token.in_(tokens_to_delete)
            )
        )

