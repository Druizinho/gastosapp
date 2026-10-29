import { subscribeToPush, unsubscribeFromPush } from './api';
import { messaging, getToken, onMessage } from './firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const getMessagingInstance = async () => messaging;

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

export const enablePushNotifications = async (userId?: string): Promise<boolean> => {
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
    const vapidKey = VAPID_KEY;
    
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
      if (userId) {
        localStorage.setItem('fcm_token_user_id', userId);
      }
      
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

export const syncPushSubscription = async (userId: string): Promise<void> => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const savedToken = localStorage.getItem('fcm_token');
    if (!savedToken) return; // El usuario no ha activado push en la app
    const savedUserId = localStorage.getItem('fcm_token_user_id');
    const messaging = await getMessagingInstance();
    if (!messaging) return;
    const registration = await navigator.serviceWorker.ready;
    const currentToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (currentToken && (currentToken !== savedToken || savedUserId !== userId)) {
      await subscribeToPush({ fcm_token: currentToken });
      localStorage.setItem('fcm_token', currentToken);
      localStorage.setItem('fcm_token_user_id', userId);
    }
  } catch (err) {
    console.warn('Silent push sync skipped:', err);
  }
};

export const disablePushNotifications = async (): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !messaging) {
    localStorage.removeItem('fcm_token');
    localStorage.removeItem('fcm_token_user_id');
    return false;
  }

  try {
    const token = localStorage.getItem('fcm_token');
    if (token) {
      await unsubscribeFromPush(token);
    }
    return true;
  } catch (error) {
    console.error('Failed to disable push notifications:', error);
    return false;
  } finally {
    localStorage.removeItem('fcm_token');
    localStorage.removeItem('fcm_token_user_id');
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
    onMessage(messaging, async (payload: any) => {
      console.log('Mensaje recibido en primer plano:', payload);
      
      const title = payload.notification?.title || payload.data?.title || 'GastosApp';
      const options = {
        body: payload.notification?.body || payload.data?.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: { url: payload.fcmOptions?.link || payload.data?.url || '/' },
      };

      if (Notification.permission === 'granted') {
        // Use ServiceWorker.showNotification — works on Android Chrome AND iOS Safari PWA.
        // new Notification() in the main thread fails silently on Android Chrome.
        try {
          const registration = await navigator.serviceWorker.ready;
          registration.showNotification(title, options);
        } catch {
          // Fallback for desktop browsers that don't need the SW approach
          new Notification(title, options);
        }
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


