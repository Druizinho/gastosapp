import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Notification } from '../types';
import { getNotifications, markNotificationsAsRead } from '../api';
import { useAuth } from './AuthContext';
import { setupForegroundMessageListener } from '../pushManager';

interface NotificationContextProps {
  notifications: Notification[];
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // FRONT-09: Unificar el estado de autenticación consumiendo useAuth() directamente
  const isAuthenticated = !!session;

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await getNotifications();
      setNotifications(data);
      setUnreadCount(data.filter((n: Notification) => !n.is_read && !n.is_resolved).length);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }, [isAuthenticated]);

  const markAsRead = useCallback(async () => {
    if (unreadCount === 0) return;
    try {
      await markNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }
  }, [unreadCount]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();

      // Check if page loaded with notifications=open
      if (typeof window !== 'undefined' && window.location.search.includes('notifications=open')) {
        window.dispatchEvent(new CustomEvent('gastosapp:open-notifications'));
      }

      // Listen for foreground FCM messages to update unread count
      const unsubscribe = setupForegroundMessageListener((_payload) => {
        // We received a push notification while the app is open!
        fetchNotifications();
      });

      // Listen for messages from the Service Worker (e.g. background notification clicks)
      const handleSwMessage = (event: MessageEvent) => {
        if (event.data?.type === 'NOTIFICATION_CLICK') {
          fetchNotifications();
          const targetUrl = event.data?.url || '';
          if (targetUrl.includes('notifications=open') || (typeof window !== 'undefined' && window.location.search.includes('notifications=open'))) {
            window.dispatchEvent(new CustomEvent('gastosapp:open-notifications'));
          }
        }
      };

      navigator.serviceWorker?.addEventListener('message', handleSwMessage);

      return () => {
        if (unsubscribe) unsubscribe();
        navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
      };
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [isAuthenticated, fetchNotifications]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, fetchNotifications, markAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
