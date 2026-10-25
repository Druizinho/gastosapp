import React, { useState } from 'react';
import { UserPlus, AlertCircle, Home, CreditCard, Bell } from 'lucide-react';
import { requestConnection } from '../api';

interface InvitePanaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const InvitePanaModal: React.FC<InvitePanaModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      setLoading(true);
      setError(null);
      await requestConnection(email.trim().toLowerCase());
      setEmail('');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al enviar la invitación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className="expense-form-container" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px' }}
      >
        <h2>Invitar a un Pana</h2>
        <p style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          marginTop: '-1rem',
          marginBottom: '1.25rem',
          fontWeight: 500,
        }}>
          Finanzas compartidas en equipo
        </p>

        {error && (
          <div style={{ 
            padding: '0.75rem 1rem', 
            background: 'rgba(239, 68, 68, 0.1)', 
            color: '#EF4444', 
            borderRadius: 'var(--radius-md)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            marginBottom: '1rem', 
            fontSize: '0.85rem' 
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Info Box */}
        <div style={{ 
          background: 'var(--surface-muted)', 
          borderRadius: 'var(--radius-md)', 
          padding: '0.85rem', 
          marginBottom: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          fontSize: '0.82rem',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <Home size={16} style={{ color: 'var(--primary-color)', marginTop: '2px', flexShrink: 0 }} />
            <span><strong>Gastos fijos compartidos:</strong> Divide alquiler, internet o servicios. Cuando uno paga el mes, se actualiza para los dos.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <CreditCard size={16} style={{ color: '#10B981', marginTop: '2px', flexShrink: 0 }} />
            <span><strong>Deudas conjuntas con terceros:</strong> Cada abono reduce el saldo restante para ambos en tiempo real.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <Bell size={16} style={{ color: '#F59E0B', marginTop: '2px', flexShrink: 0 }} />
            <span><strong>Avisos automáticos:</strong> Recibe notificaciones push cuando tu pana registre o cubra un pago.</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pana-email">
              Correo electrónico del usuario
            </label>
            <input
              id="pana-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ejemplo@correo.com"
              required
              autoFocus
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem', display: 'block' }}>
              Debe ser el correo con el que tu pana se registró en GastosApp.
            </span>
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn-cancel"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-submit"
              disabled={loading || !email.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
              }}
            >
              {loading ? 'Enviando...' : (
                <>
                  <UserPlus size={16} />
                  Enviar Invitación
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
