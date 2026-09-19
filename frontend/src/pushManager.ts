import { getVapidPublicKey, subscribeToPush, unsubscribeFromPush } from './api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const checkPushSubscriptionStatus = async (): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
};

export const enablePushNotifications = async (): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.error('Push notifications are not supported in this browser.');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.error('Notification permission not granted.');
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const publicVapidKey = await getVapidPublicKey();
      const convertedVapidKey = urlBase64ToUint8Array(publicVapidKey);

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
    }

    const subJson = subscription.toJSON();
    if (!subJson.keys) throw new Error('Missing keys in subscription');

    await subscribeToPush({
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth
    });

    return true;
  } catch (error) {
    console.error('Failed to enable push notifications:', error);
    return false;
  }
};

export const disablePushNotifications = async (): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await unsubscribeFromPush(endpoint);
    }
    return true;
  } catch (error) {
    console.error('Failed to disable push notifications:', error);
    return false;
  }
};
