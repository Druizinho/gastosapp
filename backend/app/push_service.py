import os
from pywebpush import webpush, WebPushException
import json

def send_push_notification(subscription_info: dict, payload_data: dict):
    """
    Sends a push notification to a specific subscription.
    """
    try:
        vapid_private_key = os.getenv("VAPID_PRIVATE_KEY")
        vapid_claims = {"sub": os.getenv("VAPID_CLAIM_EMAIL", "mailto:admin@gastosapp.com")}
        
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload_data),
            vapid_private_key=vapid_private_key,
            vapid_claims=vapid_claims,
            timeout=10
        )
        return True
    except WebPushException as ex:
        print("Push notification failed: {}", repr(ex))
        # Mozilla returns additional info
        if ex.response and ex.response.json():
            print(ex.response.json())
        return False
    except Exception as e:
        print("Push notification general error:", repr(e))
        return False
