import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import { SkeletonList } from './ui/Skeleton';
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
  PieChart,
  ChevronRight 
} from 'lucide-react';
import type { Notification } from '../types';

interface NotificationSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const getTargetRouteForType = (type: string): string | null => {
  if (
    type === 'budgets' ||
    type === 'budget_80' ||
    type === 'budget_100' ||
    type.startsWith('shared_sub_budget_')
  ) {
    return '/herramientas/presupuestos';
  }

  if (
    type === 'debts' ||
    type === 'debt' ||
    type.startsWith('shared_debt_')
  ) {
    return '/herramientas/deudas';
  }

  if (
    type === 'fixed_expenses' ||
    type === 'fixed_expense' ||
    type.startsWith('shared_fe_') ||
    type.startsWith('shared_fixed_expense_')
  ) {
    return '/herramientas/gastos-fijos';
  }

  if (type === 'incomes' || type === 'income') {
    return '/herramientas/ingresos';
  }

  if (type === 'savings' || type.startsWith('shared_saving_goal_')) {
    return '/herramientas/ahorros';
  }

  if (
    type === 'connection_request' ||
    type === 'connection_accepted' ||
    type === 'pana' ||
    type === 'share_member_added' ||
    type === 'share_member_left' ||
    type === 'share_role_changed'
  ) {
    return '/panas';
  }

  if (type === 'inactivity') {
    return '/?add=true';
  }

  return null;
};

const getIconForType = (type: string) => {
  if (
    type === 'budgets' ||
    type === 'budget_80' ||
    type === 'budget_100' ||
    type.startsWith('shared_sub_budget_')
  ) {
    return <PieChart size={20} style={{ color: 'var(--warning-color)' }} />;
  }

  if (
    type === 'savings' ||
    type.startsWith('shared_saving_goal_')
  ) {
    return <DollarSign size={20} style={{ color: '#10B981' }} />;
  }

  if (
    type === 'fixed_expenses' ||
    type === 'fixed_expense' ||
    type.startsWith('shared_fe_') ||
    type.startsWith('shared_fixed_expense_')
  ) {
    if (type === 'shared_fe_paid' || type.endsWith('_paid')) {
      return <CheckCircle2 size={20} style={{ color: '#10B981' }} />;
    }
    if (type.includes('_delete') || type.includes('_leave') || type.includes('_kick')) {
      return <AlertCircle size={20} style={{ color: 'var(--text-tertiary)' }} />;
    }
    return <Calendar size={20} style={{ color: 'var(--info-color)' }} />;
  }

  if (
    type === 'debts' ||
    type === 'debt' ||
    type.startsWith('shared_debt_')
  ) {
    if (type === 'shared_debt_settled') {
      return <CheckCircle2 size={20} style={{ color: '#10B981' }} />;
    }
    if (type === 'shared_debt_payment') {
      return <CreditCard size={20} style={{ color: '#10B981' }} />;
    }
    if (type.includes('_delete') || type.includes('_leave') || type.includes('_kick')) {
      return <AlertCircle size={20} style={{ color: 'var(--text-tertiary)' }} />;
    }
    return <CreditCard size={20} style={{ color: 'var(--expense-color)' }} />;
  }

  if (type === 'connection_request') {
    return <UserPlus size={20} style={{ color: 'var(--primary-color)' }} />;
  }

  if (
    type === 'connection_accepted' ||
    type === 'pana' ||
    type === 'share_member_added'
  ) {
    return <Users size={20} style={{ color: '#10B981' }} />;
  }

  if (type === 'share_member_left') {
    return <AlertCircle size={20} style={{ color: 'var(--text-tertiary)' }} />;
  }

  if (type === 'share_role_changed') {
    return <Users size={20} style={{ color: 'var(--expense-color)' }} />;
  }

  if (type === 'incomes' || type === 'income') {
    return <DollarSign size={20} style={{ color: 'var(--income-color)' }} />;
  }

  if (type === 'inactivity') {
    return <Activity size={20} style={{ color: 'var(--warning-color)' }} />;
  }

  return <Bell size={20} style={{ color: 'var(--text-secondary)' }} />;
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getDateGroup = (dateStr: string): 'Hoy' | 'Ayer' | 'Anteriores' => {
  const date = new Date(dateStr);
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) return 'Hoy';

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return 'Ayer';

  return 'Anteriores';
};

export const NotificationSheet = ({ isOpen, onClose }: NotificationSheetProps) => {
  const navigate = useNavigate();
  const { notifications, markAsRead, fetchNotifications } = useNotifications();
  const [loading, setLoading] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      setLoading(true);
      fetchNotifications().finally(() => {
        setLoading(false);
      });
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      markAsRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleItemClick = (n: Notification) => {
    const targetRoute = (n.url && n.url !== '/') ? n.url : getTargetRouteForType(n.type);
    if (targetRoute) {
      markAsRead();
      onClose();
      navigate(targetRoute);
    }
  };

  const groups: { title: 'Hoy' | 'Ayer' | 'Anteriores'; items: Notification[] }[] = [
    { title: 'Hoy', items: [] },
    { title: 'Ayer', items: [] },
    { title: 'Anteriores', items: [] }
  ];

  for (const n of notifications) {
    const group = getDateGroup(n.created_at);
    const target = groups.find(g => g.title === group);
    if (target) {
      target.items.push(n);
    }
  }

  const visibleGroups = groups.filter(g => g.items.length > 0);

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
        
        <div 
          className="fade-in-content"
          style={{ overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          {loading ? (
            <SkeletonList count={3} />
          ) : visibleGroups.length === 0 ? (
            <div style={{ padding: '3rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-tertiary)', gap: '1rem' }}>
              <Bell size={40} style={{ opacity: 0.5 }} />
              <p>No tienes notificaciones</p>
            </div>
          ) : (
            visibleGroups.map((group) => (
              <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  margin: '0.25rem 0 0 0.25rem'
                }}>
                  {group.title}
                </h3>
                {group.items.map((n: Notification) => {
                  const targetRoute = (n.url && n.url !== '/') ? n.url : getTargetRouteForType(n.type);
                  const isClickable = !!targetRoute;

                  return (
                    <div 
                      key={n.id} 
                      onClick={() => isClickable && handleItemClick(n)}
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
                        boxShadow: !n.is_read ? '0 2px 8px rgba(0,0,0,0.04)' : 'none',
                        opacity: n.is_resolved ? 0.68 : 1
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{formatDate(n.created_at)}</span>
                          {n.is_resolved && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              color: '#10B981',
                              background: 'rgba(16, 185, 129, 0.1)',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '6px'
                            }}>
                              <CheckCircle2 size={12} />
                              Resuelto
                            </span>
                          )}
                        </div>
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
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
