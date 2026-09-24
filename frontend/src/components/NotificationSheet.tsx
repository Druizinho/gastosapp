import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNotifications } from '../context/NotificationContext';
import { Bell, CreditCard, DollarSign, Activity, Calendar } from 'lucide-react';
import type { Notification } from '../types';

interface NotificationSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const getIconForType = (type: string) => {
  switch (type) {
    case 'fixed_expenses': return <Calendar size={20} style={{ color: 'var(--info-color)' }} />;
    case 'debts': return <CreditCard size={20} style={{ color: 'var(--expense-color)' }} />;
    case 'incomes': return <DollarSign size={20} style={{ color: 'var(--income-color)' }} />;
    case 'inactivity': return <Activity size={20} style={{ color: 'var(--warning-color)' }} />;
    default: return <Bell size={20} style={{ color: 'var(--text-secondary)' }} />;
  }
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const NotificationSheet = ({ isOpen, onClose }: NotificationSheetProps) => {
  const { notifications, markAsRead, fetchNotifications } = useNotifications();

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    } else {
      markAsRead();
    }
  }, [isOpen, markAsRead, fetchNotifications]);

  if (!isOpen) return null;

  return createPortal(
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div 
        className="bottom-sheet" 
        onClick={(e) => e.stopPropagation()}
        style={{ padding: '0', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}
      >
        <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid var(--surface-muted)' }}>
          <div className="bottom-sheet-handle" onClick={onClose} style={{ cursor: 'pointer' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>Notificaciones</h2>
        </div>
        
        <div style={{ overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {notifications.length === 0 ? (
            <div style={{ padding: '3rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-tertiary)', gap: '1rem' }}>
              <Bell size={40} style={{ opacity: 0.5 }} />
              <p>No tienes notificaciones</p>
            </div>
          ) : (
            notifications.map((n: Notification) => (
              <div 
                key={n.id} 
                style={{
                  display: 'flex',
                  gap: '1rem',
                  padding: '1rem',
                  background: !n.is_read ? 'var(--surface-hover)' : 'var(--surface-color)',
                  border: `1px solid ${!n.is_read ? 'var(--info-bg)' : 'var(--accent-light)'}`,
                  borderRadius: 'var(--radius-md)',
                  transition: 'background var(--transition-base)'
                }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: 'var(--surface-muted)'
                }}>
                  {getIconForType(n.type)}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem', opacity: n.is_read ? 0.7 : 1 }}>{n.title}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{n.body}</p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.5rem', display: 'block' }}>{formatDate(n.created_at)}</span>
                </div>
                {!n.is_read && <div style={{ width: '8px', height: '8px', background: 'var(--info-color)', borderRadius: '50%', marginTop: '0.5rem', flexShrink: 0 }} />}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
