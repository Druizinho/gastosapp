import React, { useState, useEffect } from 'react';

import { checkIncome } from '../api';
import type { EstimatedIncome, IncomeCheckCreate, CurrencyType } from '../types';

interface IncomeCheckFormProps {
  income: EstimatedIncome;
  monthYear: string;
  onClose: () => void;
  onSaved: () => void;
}

const IncomeCheckForm: React.FC<IncomeCheckFormProps> = ({ income, monthYear, onClose, onSaved }) => {
  const [isPartial, setIsPartial] = useState(false);
  const [realAmount, setRealAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyType>(income.currency);
  const [pendingDate, setPendingDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPartial) {
      setRealAmount(income.expected_amount.toString());
      setCurrency(income.currency);
    } else {
      setRealAmount('');
    }
  }, [isPartial, income]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(realAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Por favor, ingresa un monto válido.');
      return;
    }

    if (isPartial && !pendingDate) {
      setError('Debes especificar una fecha de promesa para el resto del pago.');
      return;
    }

    setIsSubmitting(true);
    try {
      const checkData: IncomeCheckCreate = {
        month_year: monthYear,
        real_amount: amountNum,
        currency,
        is_partial: isPartial,
        pending_date: isPartial ? pendingDate : undefined,
        notes: notes || undefined,
      };

      await checkIncome(income.id, checkData);
      onSaved();
    } catch (err: any) {
      console.error('Error checking income:', err);
      setError(err.response?.data?.detail || 'Error al confirmar el ingreso.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="expense-form-container">
        <h2>Confirmar Ingreso: {income.name}</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, color: !isPartial ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              <input
                type="radio"
                checked={!isPartial}
                onChange={() => setIsPartial(false)}
                style={{ width: '18px', height: '18px', accentColor: '#10B981' }}
              />
              Pago Completo
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, color: isPartial ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              <input
                type="radio"
                checked={isPartial}
                onChange={() => setIsPartial(true)}
                style={{ width: '18px', height: '18px', accentColor: '#F59E0B' }}
              />
              Pago Incompleto
            </label>
          </div>

          <div className="form-group row">
            <div className="form-group half">
              <label>Monto Recibido</label>
              <input
                type="number"
                value={realAmount}
                onChange={(e) => setRealAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0.01"
                required
              />
            </div>
            <div className="form-group half">
              <label>Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyType)}
                required
              >
                <option value="USD_CASH">Dólares Efectivo</option>
                <option value="USDT">USDT (Binance)</option>
                <option value="USD_BCV">Dólar BCV</option>
                <option value="EUR_BCV">Euro BCV</option>
                <option value="BS">Bolívares</option>
              </select>
            </div>
          </div>

          {isPartial && (
            <div className="form-group">
              <label>Promesa de pago para el restante (Nueva Fecha)</label>
              <input
                type="date"
                value={pendingDate}
                onChange={(e) => setPendingDate(e.target.value)}
                required={isPartial}
              />
            </div>
          )}

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Notas</span>
              <span className="form-hint-inline">(Opcional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Por qué se pagó incompleto..."
              maxLength={100}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-cancel"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-submit"
              style={{ backgroundColor: isPartial ? '#F59E0B' : '#10B981', borderColor: 'transparent' }}
            >
              {isSubmitting ? 'Confirmando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IncomeCheckForm;
// Force IDE refresh
