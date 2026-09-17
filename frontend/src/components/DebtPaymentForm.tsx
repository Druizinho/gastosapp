import React, { useState } from 'react';
import type { DebtPaymentCreate } from '../types';

interface DebtPaymentFormProps {
  debtCurrency: string;
  onSubmit: (data: DebtPaymentCreate) => void;
  onCancel: () => void;
  loading: boolean;
}

const DebtPaymentForm: React.FC<DebtPaymentFormProps> = ({ debtCurrency, onSubmit, onCancel, loading }) => {
  const [formData, setFormData] = useState<DebtPaymentCreate>({
    amount: 0,
    currency: debtCurrency as any,
    payment_date: new Date().toISOString().split('T')[0],
    note: ''
  });

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
    onSubmit(formData);
  };

  const inputStyle = {
    width: '100%', padding: '0.75rem',
    background: 'var(--surface-color)', border: '1px solid var(--accent-light)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    fontSize: '0.95rem', fontFamily: 'inherit',
    marginTop: '0.25rem'
  };

  const labelStyle = {
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
            style={inputStyle}
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
