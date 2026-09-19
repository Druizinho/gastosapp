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

export class NotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotSupportedError';
  }
}

export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionDeniedError';
  }
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
    throw new NotSupportedError('Push notifications are not supported in this browser or context.');
  }

  // Verificar si estamos en iOS y NO es modo standalone (no agregada a pantalla de inicio)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
  
  if (isIOS && !isStandalone) {
    throw new NotSupportedError('En iOS, debes añadir la página a tu Pantalla de Inicio usando el botón "Compartir" de Safari antes de activar notificaciones.');
  }

  const permission = await Notification.requestPermission();
  if (permission === 'denied') {
    throw new PermissionDeniedError('Has bloqueado las notificaciones. Toca el ícono del candado 🔒 en la barra de Chrome, ve a Permisos, y cambia Notificaciones a Permitir.');
  } else if (permission !== 'granted') {
    throw new Error('Permiso de notificaciones no concedido.');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    try {
      const publicVapidKey = await getVapidPublicKey();
      const convertedVapidKey = urlBase64ToUint8Array(publicVapidKey);

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
    } catch (e: any) {
      throw new Error(`Error suscribiendo en el navegador o falló la conexión con Vercel/Render: ${e.message}`);
    }
  }

  const subJson = subscription.toJSON();
  if (!subJson.keys) throw new Error('Faltan las claves criptográficas en la suscripción generada.');

  try {
    await subscribeToPush({
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth
    });
  } catch (e: any) {
    throw new Error(`Error guardando la suscripción en el servidor (Render): ${e.message}`);
  }

  return true;
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
