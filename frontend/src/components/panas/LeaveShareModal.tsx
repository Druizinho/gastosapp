import React, { useState } from 'react';
import { LogOut, AlertTriangle, Loader2, X } from 'lucide-react';

export interface LeaveShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  entityType: 'debt' | 'fixed_expense' | 'saving_goal';
  entityTitle: string;
  hasPendingBalance?: boolean;
  pendingBalanceAmount?: number;
  currency?: string;
  loading?: boolean;
}

const currencySymbols: Record<string, string> = {
  USD_BCV: '$',
  EUR_BCV: '€',
  BS: 'Bs.',
  USDT: 'USDT',
  USD_CASH: '$ Cash',
};

export const LeaveShareModal: React.FC<LeaveShareModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  entityType,
  entityTitle,
  hasPendingBalance = false,
  pendingBalanceAmount,
  currency,
  loading = false,
}) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const isBusy = loading || internalLoading;

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isBusy) return;
    try {
      setInternalLoading(true);
      await onConfirm();
    } finally {
      setInternalLoading(false);
    }
  };

  const getWarningMessage = () => {
    switch (entityType) {
      case 'debt':
        return 'Dejarás de formar parte de esta deuda compartida y se eliminará de tus listas.';
      case 'fixed_expense':
        return 'Dejarás de formar parte de este gasto fijo compartido y no recibirás más recordatorios o checks mensuales.';
      case 'saving_goal':
        return 'Dejarás de seguir esta meta o proyecto de ahorro grupal. Tus aportes históricos seguirán registrados en el monto acumulado del fondo.';
      default:
        return 'Dejarás de tener acceso a este elemento compartido.';
    }
  };

  const symbol = currency ? (currencySymbols[currency] || currency) : '';
  const formattedPendingAmount =
    pendingBalanceAmount != null
      ? `${symbol ? `${symbol} ` : ''}${pendingBalanceAmount.toLocaleString('es-VE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : `${symbol ? `${symbol} ` : ''}0,00`;

  return (
    <div
      className="modal-backdrop"
      style={{
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={() => {
        if (!isBusy) onClose();
      }}
    >
      <div
        className="soft-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-color)',
          border: '1px solid var(--accent-light, rgba(255, 255, 255, 0.1))',
          borderRadius: '16px',
          padding: '1.5rem',
          maxWidth: '420px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
          position: 'relative',
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isBusy}
          aria-label="Cerrar modal"
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary)',
            cursor: isBusy ? 'not-allowed' : 'pointer',
            padding: '0.25rem',
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isBusy ? 0.4 : 1,
            transition: 'color 150ms ease-out, transform 150ms ease-out',
          }}
          onMouseDown={(e) => {
            if (!isBusy) e.currentTarget.style.transform = 'scale(0.92)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <X size={18} />
        </button>

        {/* Header Icon + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EF4444',
              flexShrink: 0,
            }}
          >
            <LogOut size={22} style={{ transform: 'translateX(1px)' }} />
          </div>
          <div style={{ paddingRight: '1.5rem' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '1.08rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                lineHeight: 1.3,
              }}
            >
              ¿Desvincularte de {entityTitle}?
            </h3>
          </div>
        </div>

        {/* Descriptive message */}
        <p
          style={{
            margin: 0,
            fontSize: '0.9rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {getWarningMessage()}
        </p>

        {/* Pending balance alert callout for debts */}
        {entityType === 'debt' && hasPendingBalance && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem',
              padding: '0.8rem 0.95rem',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.28)',
              color: 'var(--text-primary)',
            }}
          >
            <AlertTriangle
              size={18}
              style={{
                color: '#F59E0B',
                flexShrink: 0,
                marginTop: '0.12rem',
              }}
            />
            <span
              style={{
                fontSize: '0.84rem',
                lineHeight: 1.45,
                color: 'var(--text-secondary)',
              }}
            >
              <strong style={{ color: '#F59E0B', fontWeight: 600 }}>Atención:</strong> Tienes un saldo pendiente de{' '}
              <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formattedPendingAmount}</strong>. La deuda continuará registrada en la cuenta de tu pana.
            </span>
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.65rem',
            marginTop: '0.5rem',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            style={{
              padding: '0.65rem 1.15rem',
              borderRadius: '12px',
              background: 'var(--surface-muted)',
              border: '1px solid var(--accent-light, rgba(255, 255, 255, 0.1))',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              opacity: isBusy ? 0.6 : 1,
              transition: 'transform 150ms ease-out, background 150ms',
            }}
            onMouseDown={(e) => {
              if (!isBusy) e.currentTarget.style.transform = 'scale(0.96)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isBusy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              padding: '0.65rem 1.25rem',
              borderRadius: '12px',
              background: 'var(--expense-color, #EF4444)',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              opacity: isBusy ? 0.75 : 1,
              boxShadow: '0 2px 4px rgba(239, 68, 68, 0.25)',
              transition: 'transform 150ms ease-out, opacity 150ms',
            }}
            onMouseDown={(e) => {
              if (!isBusy) e.currentTarget.style.transform = 'scale(0.96)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {isBusy ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Desvinculando...</span>
              </>
            ) : (
              <span>Sí, desvincularme</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveShareModal;
