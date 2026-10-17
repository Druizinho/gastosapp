import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import { 
  Bell, 
  CreditCard, 
  DollarSign, 
  Activity, 
  Calendar, 
  UserPlus, 
  Users, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight 
} from 'lucide-react';
import type { Notification } from '../types';

interface NotificationSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const getTargetRouteForType = (type: string) => {
  switch (type) {
    case 'connection_request':
    case 'connection_accepted':
    case 'share_member_added':
    case 'share_member_left':
    case 'share_role_changed':
      return '/herramientas/panas';
    case 'shared_debt_created':
    case 'shared_debt_payment':
    case 'shared_debt_settled':
    case 'shared_debt_deleted':
    case 'shared_debt_leave':
    case 'shared_debt_kick':
    case 'shared_debt_role':
    case 'debts':
      return '/herramientas/deudas-nuestras';
    case 'shared_fe_created':
    case 'shared_fe_paid':
    case 'shared_fe_deleted':
    case 'shared_fe_leave':
    case 'shared_fe_kick':
    case 'shared_fe_role':
    case 'fixed_expenses':
      return '/herramientas/gastos-fijos';
    case 'savings':
      return '/herramientas/ahorros';
    case 'incomes':
      return '/herramientas/ingresos-estimados';
    default:
      return null;
  }
};

const getIconForType = (type: string) => {
  switch (type) {
    case 'connection_request':
      return <UserPlus size={20} style={{ color: 'var(--primary-color)' }} />;
    case 'connection_accepted':
    case 'share_member_added':
      return <Users size={20} style={{ color: '#10B981' }} />;
    case 'shared_debt_created':
    case 'shared_debt_role':
    case 'share_role_changed':
      return <Users size={20} style={{ color: 'var(--expense-color)' }} />;
    case 'shared_debt_payment':
      return <CreditCard size={20} style={{ color: '#10B981' }} />;
    case 'shared_debt_settled':
      return <CheckCircle2 size={20} style={{ color: '#10B981' }} />;
    case 'shared_debt_deleted':
    case 'shared_debt_leave':
    case 'shared_debt_kick':
    case 'shared_fe_deleted':
    case 'shared_fe_leave':
    case 'shared_fe_kick':
    case 'share_member_left':
      return <AlertCircle size={20} style={{ color: 'var(--text-tertiary)' }} />;
    case 'shared_fe_created':
    case 'shared_fe_role':
      return <Calendar size={20} style={{ color: 'var(--info-color)' }} />;
    case 'shared_fe_paid':
      return <CheckCircle2 size={20} style={{ color: '#10B981' }} />;
    case 'fixed_expenses': 
      return <Calendar size={20} style={{ color: 'var(--info-color)' }} />;
    case 'debts': 
      return <CreditCard size={20} style={{ color: 'var(--expense-color)' }} />;
    case 'savings':
      return <DollarSign size={20} style={{ color: '#10B981' }} />;
    case 'incomes': 
      return <DollarSign size={20} style={{ color: 'var(--income-color)' }} />;
    case 'inactivity': 
      return <Activity size={20} style={{ color: 'var(--warning-color)' }} />;
    default: 
      return <Bell size={20} style={{ color: 'var(--text-secondary)' }} />;
  }
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const NotificationSheet = ({ isOpen, onClose }: NotificationSheetProps) => {
  const navigate = useNavigate();
  const { notifications, markAsRead, fetchNotifications } = useNotifications();

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    } else {
      markAsRead();
    }
  }, [isOpen, markAsRead, fetchNotifications]);

  if (!isOpen) return null;

  const handleItemClick = (type: string) => {
    const route = getTargetRouteForType(type);
    if (route) {
      navigate(route);
      onClose();
    }
  };

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
            notifications.map((n: Notification) => {
              const targetRoute = getTargetRouteForType(n.type);
              const isClickable = !!targetRoute;

              return (
                <div 
                  key={n.id} 
                  onClick={() => isClickable && handleItemClick(n.type)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem',
                    background: !n.is_read ? 'var(--surface-hover)' : 'var(--surface-color)',
                    border: `1px solid ${!n.is_read ? 'var(--info-bg)' : 'var(--accent-light)'}`,
                    borderRadius: 'var(--radius-md)',
                    cursor: isClickable ? 'pointer' : 'default',
                    transition: 'all var(--transition-base)',
                    boxShadow: !n.is_read ? '0 2px 8px rgba(0,0,0,0.04)' : 'none'
                  }}
                >
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: 'var(--surface-muted)'
                  }}>
                    {getIconForType(n.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ 
                      fontSize: '0.95rem', 
                      fontWeight: 600, 
                      color: 'var(--text-primary)', 
                      marginBottom: '0.25rem', 
                      opacity: n.is_read ? 0.8 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4, wordBreak: 'break-word' }}>{n.body}</p>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.4rem', display: 'block' }}>{formatDate(n.created_at)}</span>
                  </div>
                  {!n.is_read && (
                    <div style={{ 
                      width: '8px', 
                      height: '8px', 
                      background: 'var(--info-color)', 
                      borderRadius: '50%', 
                      flexShrink: 0 
                    }} />
                  )}
                  {isClickable && (
                    <ChevronRight size={18} style={{ color: 'var(--text-tertiary)', flexShrink: 0, opacity: 0.6 }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

