import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { NotificationSheet } from './NotificationSheet';

export const NotificationBell = () => {
  const { unreadCount } = useNotifications();
  const [isSheetOpen, setIsSheetOpen] = useState(() => {
    return typeof window !== 'undefined' && window.location.search.includes('notifications=open');
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOpen = () => setIsSheetOpen(true);
    window.addEventListener('gastosapp:open-notifications', handleOpen);
    return () => {
      window.removeEventListener('gastosapp:open-notifications', handleOpen);
    };
  }, []);

  return (
    <>
      <button 
        onClick={() => setIsSheetOpen(true)}
        className="notification-bell-btn"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationSheet 
        isOpen={isSheetOpen} 
        onClose={() => setIsSheetOpen(false)} 
      />
    </>
  );
};
