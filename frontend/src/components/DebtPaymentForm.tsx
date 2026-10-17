import React, { useState } from 'react';
import { Users, X, Receipt } from 'lucide-react';
import type { DebtPaymentCreate } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import ConfirmModal from './ConfirmModal';

interface DebtPaymentFormProps {
  debtConcept?: string;
  type: 'owed' | 'receivable';
  debtCurrency: string;
  debtTotalAmount: number;
  debtPaidAmount: number;
  onSubmit: (data: DebtPaymentCreate) => void;
  onCancel: () => void;
  loading: boolean;
  isShared?: boolean;
  sharedPartnerName?: string | null;
}

const currencyLabels: Record<string, string> = {
  'USD_BCV': '$', 'EUR_BCV': '€', 'BS': 'Bs.', 'USDT': 'USDT', 'USD_CASH': '$ Cash',
};
const formatCurrency = (amount: number, currency: string = 'USD_BCV') => {
  if (amount == null) return '';
  return `${currencyLabels[currency] || currency} ${Math.max(0, amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const DebtPaymentForm: React.FC<DebtPaymentFormProps> = ({ 
  debtConcept,
  type, 
  debtCurrency, 
  debtTotalAmount, 
  debtPaidAmount, 
  onSubmit, 
  onCancel, 
  loading,
  isShared = false,
  sharedPartnerName = null
}) => {
  const remaining = Math.max(debtTotalAmount - debtPaidAmount, 0);
  const [formData, setFormData] = useState<DebtPaymentCreate>({
    amount: '' as any,
    currency: debtCurrency as any,
    payment_date: new Date().toISOString().split('T')[0],
    note: '',
    register_as_expense: type === 'owed'
  });
  const [showConfirm, setShowConfirm] = useState(false);

  // Check if user is paying in the same currency as the debt
  const isSameCurrency = formData.currency === debtCurrency;
  const currentAmount = Number(formData.amount) || 0;
  const isOverpaying = isSameCurrency && currentAmount > remaining && remaining > 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = { ...formData };
    submitData.amount = Number(submitData.amount);
    
    if (isSameCurrency && submitData.amount > remaining) {
      setShowConfirm(true);
      return;
    }
    
    onSubmit(submitData);
  };

  const handleConfirmSubmit = () => {
    setShowConfirm(false);
    const submitData = { ...formData };
    submitData.amount = Number(submitData.amount);
    onSubmit(submitData);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem',
    background: 'var(--surface-color)',
    border: '1px solid var(--accent-light)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    marginTop: '0.25rem',
    boxSizing: 'border-box'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-secondary)'
  };

  const themeColor = type === 'owed' ? 'var(--expense-color)' : 'var(--income-color)';

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="expense-form-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '460px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '1.35rem 1.4rem'
        }}
      >
        {/* Header con botón de cierre */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--accent-light)',
          paddingBottom: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#3B82F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Receipt size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Registrar Abono
              </h2>
              {debtConcept && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                  {debtConcept}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-full)'
            }}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isShared && (
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              color: '#3B82F6',
              padding: '0.75rem 0.9rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              border: '1px solid rgba(59, 130, 246, 0.2)'
            }}>
              <Users size={16} style={{ flexShrink: 0 }} />
              <span>
                Este abono se sincronizará automáticamente con todos los miembros del grupo{sharedPartnerName ? ` (${sharedPartnerName})` : ''}.
              </span>
            </div>
          )}

          <div style={{
            background: 'var(--surface-muted)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.9rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>Monto pendiente:</span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatCurrency(remaining, debtCurrency)}
            </span>
          </div>

          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            color: 'var(--accent-color)',
            padding: '0.75rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
            lineHeight: 1.4,
            border: '1px solid rgba(59, 130, 246, 0.15)'
          }}>
            💡 Puedes abonar en una moneda diferente a la original. El sistema guardará la tasa de cambio oficial automáticamente.
          </div>

          {isOverpaying && (
            <div style={{
              background: 'var(--warning-bg)',
              color: 'var(--warning-color)',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.82rem',
              lineHeight: 1.4,
              fontWeight: 500
            }}>
              ⚠️ El monto ingresado supera el saldo pendiente. Se te pedirá confirmación al enviar.
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Monto a Abonar *</label>
              <input
                type="number"
                name="amount"
                required
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={formData.amount || ''}
                onChange={handleChange}
                style={{
                  ...inputStyle,
                  ...(isOverpaying ? { borderColor: 'var(--warning-color)', boxShadow: '0 0 0 2px var(--warning-bg)' } : {})
                }}
              />
            </div>

            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Moneda del Pago *</label>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
                style={inputStyle}
              >
                {CURRENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Fecha del Pago *</label>
            <input
              type="date"
              name="payment_date"
              required
              value={formData.payment_date || ''}
              onChange={handleChange}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Nota Adicional (Opcional)</label>
            <input
              type="text"
              name="note"
              value={formData.note || ''}
              onChange={handleChange}
              style={inputStyle}
              placeholder="Ej: Transferencia Mercantil, Zelle de Pedro..."
            />
          </div>

          {type === 'owed' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              background: 'var(--surface-muted)',
              padding: '0.75rem 0.9rem',
              borderRadius: 'var(--radius-md)'
            }}>
              <input
                type="checkbox"
                id="register_as_expense"
                name="register_as_expense"
                checked={formData.register_as_expense}
                onChange={handleChange}
                style={{ width: '18px', height: '18px', accentColor: themeColor, cursor: 'pointer' }}
              />
              <label htmlFor="register_as_expense" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                Registrar como gasto del mes
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="btn-cancel"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-submit"
              style={{
                background: 'var(--income-color)'
              }}
            >
              {loading ? 'Procesando...' : 'Registrar Abono'}
            </button>
          </div>
          
          <ConfirmModal
            isOpen={showConfirm}
            title="Confirmar Abono Mayor al Pendiente"
            message={`El abono (${formatCurrency(currentAmount, formData.currency)}) es mayor al monto pendiente (${formatCurrency(remaining, debtCurrency)}).\n\n¿Deseas registrarlo de todas formas?`}
            onConfirm={handleConfirmSubmit}
            onCancel={() => setShowConfirm(false)}
          />
        </form>
      </div>
    </div>
  );
};

export default DebtPaymentForm;
