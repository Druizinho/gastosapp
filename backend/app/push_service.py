import firebase_admin
from firebase_admin import messaging

def send_push_notification(fcm_token: str, title: str, body: str, url: str = "/"):
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
