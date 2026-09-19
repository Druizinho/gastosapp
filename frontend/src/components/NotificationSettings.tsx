import React, { useState, useEffect } from 'react';
import { Bell, AlertTriangle } from 'lucide-react';
import { 
  checkPushSubscriptionStatus, 
  enablePushNotifications, 
  disablePushNotifications,
  NotSupportedError,
  PermissionDeniedError
} from '../pushManager';

export const NotificationSettings: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const status = await checkPushSubscriptionStatus();
      setIsEnabled(status);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (isEnabled) {
        const success = await disablePushNotifications();
        if (success) setIsEnabled(false);
      } else {
        const success = await enablePushNotifications();
        if (success) setIsEnabled(true);
      }
    } catch (e: any) {
      if (e instanceof NotSupportedError) {
        setError('Tu navegador no soporta notificaciones push. Por favor, actualízalo o usa otro navegador.');
      } else if (e instanceof PermissionDeniedError) {
        setError('Has denegado el permiso para recibir notificaciones. Para activarlas, haz clic en el icono del candado junto a la barra de direcciones de tu navegador y permite las notificaciones.');
      } else {
        setError(`Error del sistema: ${e.message}`);
      }
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="soft-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ 
          width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(236, 72, 153, 0.05) 100%)', 
          color: '#EC4899', borderRadius: '16px'
        }}>
          <Bell size={24} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Notificaciones Push</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', margin: '0.25rem 0 0 0' }}>Recibe alertas sobre tus gastos y presupuesto</p>
        </div>
      </div>

      {error && (
        <div style={{ 
          padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', 
          borderRadius: '12px', fontSize: '0.85rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start'
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '1rem 0', borderTop: '1px solid var(--surface-muted)' 
      }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Permitir Notificaciones</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: '0.25rem 0 0 0' }}>Habilita las notificaciones en este dispositivo</p>
        </div>
        
        {/* iOS style toggle */}
        <button 
          onClick={handleToggle}
          disabled={isLoading}
          style={{
            position: 'relative',
            width: '50px',
            height: '30px',
            borderRadius: '15px',
            background: isEnabled ? '#10B981' : 'var(--surface-muted)',
            border: 'none',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            transition: 'background 0.3s',
            opacity: isLoading ? 0.7 : 1
          }}
        >
          <div style={{
            position: 'absolute',
            top: '2px',
            left: isEnabled ? '22px' : '2px',
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            transition: 'left 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }} />
        </button>
      </div>

      <div style={{ padding: '1rem', background: 'var(--surface-hover)', borderRadius: '12px' }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 0.75rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipos de Alertas</h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: isEnabled ? 1 : 0.5 }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>Gastos Inusuales</span>
            <input type="checkbox" checked={isEnabled} readOnly style={{ accentColor: '#10B981', transform: 'scale(1.2)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: isEnabled ? 1 : 0.5 }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>Límites de Presupuesto</span>
            <input type="checkbox" checked={isEnabled} readOnly style={{ accentColor: '#10B981', transform: 'scale(1.2)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: isEnabled ? 1 : 0.5 }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>Resumen Semanal</span>
            <input type="checkbox" checked={isEnabled} readOnly style={{ accentColor: '#10B981', transform: 'scale(1.2)' }} />
          </div>
        </div>
      </div>
    </div>
  );
};
