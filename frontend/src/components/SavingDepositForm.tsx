import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { SavingDepositCreate, CurrencyType } from '../types';

interface SavingDepositFormProps {
  goalName: string;
  goalCurrency: string;
  goalTargetAmount: number;
  goalCurrentSaved: number;
  goalColor?: string;
  onSubmit: (data: SavingDepositCreate) => void;
  onCancel: () => void;
  loading: boolean;
}

const currencyLabels: Record<string, string> = {
  'USD_BCV': '$',
  'EUR_BCV': '€',
  'BS': 'Bs.',
  'USDT': 'USDT',
  'USD_CASH': '$ Cash',
};

const formatCurrency = (amount: number, currency: string) => {
  if (amount == null) return '';
  return `${currencyLabels[currency] || currency} ${Math.max(0, amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const SavingDepositForm: React.FC<SavingDepositFormProps> = ({
  goalName,
  goalCurrency,
  goalTargetAmount,
  goalCurrentSaved,
  goalColor = '#10B981',
  onSubmit,
  onCancel,
  loading,
}) => {
  const remaining = Math.max(goalTargetAmount - goalCurrentSaved, 0);

  const [formData, setFormData] = useState<SavingDepositCreate>({
    amount: '' as any,
    currency: goalCurrency as CurrencyType,
    deposit_date: new Date().toISOString().split('T')[0],
    note: '',
    manual_rate: '' as any,
    register_as_expense: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: any = { ...formData };
    submitData.amount = Number(submitData.amount);
    if (submitData.manual_rate) {
      submitData.manual_rate = Number(submitData.manual_rate);
    } else {
      delete submitData.manual_rate;
    }
    onSubmit(submitData);
  };

  const currentAmount = Number(formData.amount) || 0;
  const isSameCurrency = formData.currency === goalCurrency;
  const willComplete = isSameCurrency && currentAmount >= remaining && remaining > 0;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div 
        className="expense-form-container" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '460px', maxHeight: '92vh', overflowY: 'auto', padding: '1.25rem 1.4rem' }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.85rem',
          borderBottom: '1px solid var(--accent-light)',
          paddingBottom: '0.65rem'
        }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Aporte a &quot;{goalName}&quot;
          </h2>
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
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Target Progress Banner */}
          <div style={{
            background: 'var(--surface-muted)',
            borderRadius: 'var(--radius-md)',
            padding: '0.875rem 1rem',
            marginBottom: '1rem',
            border: '1px solid var(--accent-light)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Faltan para la meta:</span>
              <strong style={{ color: goalColor }}>
                {formatCurrency(remaining, goalCurrency)}
              </strong>
            </div>
            <div style={{
              width: '100%',
              height: '6px',
              background: 'var(--surface-color)',
              borderRadius: 'var(--radius-full)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (goalCurrentSaved / (goalTargetAmount || 1)) * 100)}%`,
                background: goalColor,
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>

          {willComplete && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10B981',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              fontWeight: 600,
              textAlign: 'center',
              marginBottom: '1rem',
            }}>
              🎉 ¡Con este aporte completarás el fondo al 100%!
            </div>
          )}

          {/* Monto y Moneda */}
          <div className="form-group row">
            <div className="form-group half">
              <label>Monto a Aportar *</label>
              <input
                type="number"
                step="any"
                min="0.01"
                name="amount"
                required
                autoFocus
                placeholder="0.00"
                value={formData.amount || ''}
                onChange={handleChange}
              />
            </div>
            <div className="form-group half">
              <label>Moneda</label>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
              >
                <option value="USD_BCV">USD (BCV)</option>
                <option value="BS">Bolívares (Bs.)</option>
                <option value="USDT">USDT (Binance)</option>
                <option value="EUR_BCV">EUR (BCV)</option>
                <option value="USD_CASH">USD Efectivo</option>
              </select>
            </div>
          </div>

          {/* Tasa manual si es USD_CASH */}
          {formData.currency === 'USD_CASH' && (
            <div className="form-group">
              <label>Tasa personalizada Bs./$ (opcional)</label>
              <input
                type="number"
                step="any"
                name="manual_rate"
                placeholder="Dejar vacío para usar tasa de mercado"
                value={formData.manual_rate || ''}
                onChange={handleChange}
              />
            </div>
          )}

          {/* Fecha del Aporte */}
          <div className="form-group">
            <label>Fecha del Aporte</label>
            <input
              type="date"
              name="deposit_date"
              value={formData.deposit_date || ''}
              onChange={handleChange}
            />
          </div>

          {/* Nota */}
          <div className="form-group">
            <label>Nota / Origen de los fondos (Opcional)</label>
            <input
              type="text"
              name="note"
              placeholder="Ej: Bono de trabajo, venta de garaje..."
              value={formData.note || ''}
              onChange={handleChange}
            />
          </div>

          {/* Registrar como Gasto en Dashboard */}
          <div style={{
            background: 'var(--surface-muted)',
            padding: '0.875rem 1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--accent-light)',
            marginBottom: '1rem',
          }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="register_as_expense"
                checked={formData.register_as_expense}
                onChange={handleChange}
                style={{ width: '18px', height: '18px', marginTop: '0.15rem', accentColor: goalColor }}
              />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                  Registrar como gasto en el Dashboard
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4, display: 'block', marginTop: '0.2rem' }}>
                  Descuenta este aporte de tu presupuesto general registrándolo en la categoría &quot;Ahorro&quot;.
                </span>
              </div>
            </label>
          </div>

          {/* Botones */}
          <div className="form-actions">
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
              disabled={loading || !formData.amount}
              className="btn-submit"
              style={{
                background: goalColor,
                boxShadow: `0 4px 14px ${goalColor}44`,
              }}
            >
              {loading ? 'Guardando...' : 'Aportar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SavingDepositForm;
