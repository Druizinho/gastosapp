import React, { useState } from 'react';
import type { DebtPaymentCreate } from '../types';

interface DebtPaymentFormProps {
  debtCurrency: string;
  debtTotalAmount: number;
  debtPaidAmount: number;
  onSubmit: (data: DebtPaymentCreate) => void;
  onCancel: () => void;
  loading: boolean;
}

const currencyLabels: Record<string, string> = {
  'USD_BCV': '$', 'EUR_BCV': '€', 'BS': 'Bs.', 'USDT': 'USDT', 'USD_CASH': '$ Cash',
};
const formatCurrency = (amount: number, currency: string) => {
  if (amount == null) return '';
  return `${currencyLabels[currency] || currency} ${Math.max(0, amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const DebtPaymentForm: React.FC<DebtPaymentFormProps> = ({ debtCurrency, debtTotalAmount, debtPaidAmount, onSubmit, onCancel, loading }) => {
  const remaining = Math.max(debtTotalAmount - debtPaidAmount, 0);
  const [formData, setFormData] = useState<DebtPaymentCreate>({
    amount: '' as any,
    currency: debtCurrency as any,
    payment_date: new Date().toISOString().split('T')[0],
    note: ''
  });

  // Check if user is paying in the same currency as the debt
  const isSameCurrency = formData.currency === debtCurrency;
  const currentAmount = Number(formData.amount) || 0;
  const isOverpaying = isSameCurrency && currentAmount > remaining && remaining > 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let parsedValue: any = value;
    
    if (type === 'number') {
      parsedValue = value === '' ? '' : parseFloat(value);
    }

    setFormData(prev => ({
      ...prev,
      [name]: parsedValue
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = { ...formData };
    submitData.amount = Number(submitData.amount);
    
    if (isSameCurrency && submitData.amount > remaining) {
      const confirmOverpay = window.confirm(
        `El abono (${formatCurrency(submitData.amount, debtCurrency)}) es mayor al monto pendiente (${formatCurrency(remaining, debtCurrency)}).\n\n¿Deseas registrarlo de todas formas?`
      );
      if (!confirmOverpay) return;
    }
    
    onSubmit(submitData);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.75rem',
    background: 'var(--surface-color)', border: '1px solid var(--accent-light)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    fontSize: '0.95rem', fontFamily: 'inherit',
    marginTop: '0.25rem'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)'
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{
        background: 'var(--info-bg)', color: 'var(--info-color)',
        padding: '1rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem',
        lineHeight: 1.4
      }}>
        Puedes abonar en una moneda diferente a la de la deuda original. 
        El sistema guardará automáticamente la tasa de cambio del día.
      </div>

      <div style={{
        background: 'var(--surface-muted)', padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-md)', fontSize: '0.9rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ color: 'var(--text-secondary)' }}>Monto pendiente:</span>
        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
          {formatCurrency(remaining, debtCurrency)}
        </span>
      </div>

      {isOverpaying && (
        <div style={{
          background: 'var(--warning-bg)', color: 'var(--warning-color)',
          padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem',
          lineHeight: 1.4, fontWeight: 500
        }}>
          ⚠️ El monto ingresado supera el saldo pendiente. Se te pedirá confirmación al enviar.
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Monto a Abonar</label>
          <input
            type="number"
            name="amount"
            required
            min="0.01"
            step="0.01"
            value={formData.amount}
            onChange={handleChange}
            style={{
              ...inputStyle,
              ...(isOverpaying ? { borderColor: 'var(--warning-color)', boxShadow: '0 0 0 2px var(--warning-bg)' } : {})
            }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Moneda del Pago</label>
          <select
            name="currency"
            value={formData.currency}
            onChange={handleChange}
            style={inputStyle}
          >
            <option value="BS">BS</option>
            <option value="USD_BCV">USD (BCV)</option>
            <option value="EUR_BCV">EUR (BCV)</option>
            <option value="USDT">USDT</option>
            <option value="USD_CASH">USD (Efectivo)</option>
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Fecha del Pago</label>
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

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          style={{
            flex: 1, padding: '0.875rem', borderRadius: 'var(--radius-full)',
            background: 'var(--surface-muted)', color: 'var(--text-secondary)',
            border: 'none', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer'
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          style={{
            flex: 1, padding: '0.875rem', borderRadius: 'var(--radius-full)',
            background: 'var(--income-color)', color: 'white',
            border: 'none', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer'
          }}
        >
          {loading ? 'Procesando...' : 'Registrar Abono'}
        </button>
      </div>
    </form>
  );
};

export default DebtPaymentForm;
