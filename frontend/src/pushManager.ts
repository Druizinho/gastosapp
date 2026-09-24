import { subscribeToPush, unsubscribeFromPush } from './api';
import { messaging, getToken, onMessage } from './firebase';

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
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !messaging) {
    return false;
  }
  
  if (Notification.permission !== 'granted') {
    return false;
  }
  
  const storedToken = localStorage.getItem('fcm_token');
  return !!storedToken;
};

export const enablePushNotifications = async (): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !messaging) {
    throw new NotSupportedError('Push notifications are not supported in this browser or context.');
  }

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

  try {
    const registration = await navigator.serviceWorker.ready;
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    
    if (!vapidKey) {
      console.warn("VITE_FIREBASE_VAPID_KEY is not defined. Notifications might fail to register on some browsers.");
    }

    const currentToken = await getToken(messaging, { 
      vapidKey: vapidKey,
      serviceWorkerRegistration: registration 
    });

    if (currentToken) {
      await subscribeToPush({ fcm_token: currentToken });
      localStorage.setItem('fcm_token', currentToken);
      
      // Attempt to show a native notification for testing since we are in foreground
      if (Notification.permission === 'granted') {
         // The backend will send a message but foreground JS might intercept it.
         // Calling setupForegroundMessageListener ensures we catch it.
         setupForegroundMessageListener();
      }

      return true;
    } else {
      throw new Error('No registration token available. Request permission to generate one.');
    }
  } catch (e: any) {
    throw new Error(`Error suscribiendo a notificaciones push: ${e.message}`);
  }
};

export const disablePushNotifications = async (): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !messaging) {
    return false;
  }

  try {
    const token = localStorage.getItem('fcm_token');
    if (token) {
      await unsubscribeFromPush(token);
      localStorage.removeItem('fcm_token');
    }
    return true;
  } catch (error) {
    console.error('Failed to disable push notifications:', error);
    return false;
  }
};

type ForegroundMessageCallback = (payload: any) => void;
const listeners: ForegroundMessageCallback[] = [];
let isForegroundListenerSetup = false;

export const setupForegroundMessageListener = (callback?: ForegroundMessageCallback) => {
  if (callback) {
    listeners.push(callback);
  }

  if (!messaging || isForegroundListenerSetup) {
    return () => {
      if (callback) {
        const index = listeners.indexOf(callback);
        if (index > -1) listeners.splice(index, 1);
      }
    };
  }
  
  try {
    onMessage(messaging, (payload: any) => {
      console.log('Mensaje recibido en primer plano:', payload);
      
      const title = payload.notification?.title || 'GastosApp';
      const options = {
        body: payload.notification?.body,
        icon: '/pwa-192x192.png',
        badge: '/favicon.svg'
      };

      if (Notification.permission === 'granted') {
        new Notification(title, options);
      }

      listeners.forEach(cb => cb(payload));
    });
    isForegroundListenerSetup = true;
  } catch (err) {
    console.error("Error setting up foreground message listener:", err);
  }

  return () => {
    if (callback) {
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    }
  };
};


