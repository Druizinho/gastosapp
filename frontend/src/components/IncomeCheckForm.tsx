import React, { useState, useEffect, useContext } from 'react';

import { checkIncome, getRates } from '../api';
import type { EstimatedIncome, IncomeCheckCreate, CurrencyType, ExchangeRates } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import { ExchangeRateField, resolveRateForCurrency } from './ExchangeRateField';
import { ToastContext } from './ui/Toast';

interface IncomeCheckFormProps {
  income: EstimatedIncome;
  monthYear: string;
  onClose: () => void;
  onSaved: () => void;
}

const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const IncomeCheckForm: React.FC<IncomeCheckFormProps> = ({ income, monthYear, onClose, onSaved }) => {
  const toast = useContext(ToastContext);
  const isPreviouslyPartial = Boolean(income.checks?.[0]?.is_partial);
  const remainingAmount = isPreviouslyPartial
    ? Math.max(Number(income.expected_amount) - Number(income.checks![0].real_amount), 0).toString()
    : income.expected_amount.toString();

  const [isPartial, setIsPartial] = useState(false);
  const [realAmount, setRealAmount] = useState(remainingAmount);
  const [currency, setCurrency] = useState<CurrencyType>(income.currency);
  const [paymentDate, setPaymentDate] = useState<string>(getLocalToday());
  const [manualRate, setManualRate] = useState<string>('');
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [pendingDate, setPendingDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRates(paymentDate || undefined).then(setRates).catch(console.error);
  }, [paymentDate]);

  useEffect(() => {
    if (!isPartial) {
      const defaultAmount = income.checks?.[0]?.is_partial
        ? Math.max(Number(income.expected_amount) - Number(income.checks[0].real_amount), 0).toString()
        : income.expected_amount.toString();
      setRealAmount(defaultAmount);
      setCurrency(income.currency);
    } else if (income.checks?.[0]?.is_partial) {
      const remaining = Math.max(Number(income.expected_amount) - Number(income.checks[0].real_amount), 0).toString();
      setRealAmount(remaining);
    }
  }, [isPartial, income]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(realAmount.replace(',', '.'));
    if (isNaN(amountNum) || amountNum <= 0) {
      const err = 'Por favor, ingresa un monto válido.';
      setError(err);
      if (toast) toast.error(err);
      return;
    }

    setIsSubmitting(true);
    try {
      const checkData: IncomeCheckCreate = {
        month_year: monthYear,
        real_amount: amountNum,
        currency,
        payment_date: paymentDate,
        manual_rate: manualRate ? parseFloat(manualRate.replace(',', '.')) : undefined,
        is_partial: isPartial,
        pending_date: isPartial && pendingDate ? pendingDate : null,
        notes: notes || undefined,
      };

      await checkIncome(income.id, checkData);
      onSaved();
    } catch (err: any) {
      console.error('Error checking income:', err);
      const msg = err?.response?.data?.detail || err?.message || 'Error al confirmar el ingreso.';
      const errorMsg = typeof msg === 'string' ? msg : 'Error al confirmar el ingreso.';
      setError(errorMsg);
      if (toast) {
        toast.error(errorMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const receivedAmount = realAmount;
  const parsedAmount = parseFloat(receivedAmount.replace(',', '.'));
  const currentAmount = !isNaN(parsedAmount) ? parsedAmount : 0;
  const isSameCurrency = currency === income.currency;
  const suggestedRate = resolveRateForCurrency(currency, rates);
  const manualRateNum = manualRate ? parseFloat(manualRate.replace(',', '.')) : 0;
  const effectiveRate = manualRateNum > 0 ? manualRateNum : (suggestedRate ? Number(suggestedRate) : 0);
  const amountInBs = currency === 'BS' ? currentAmount : (effectiveRate > 0 ? currentAmount * effectiveRate : 0);
  const targetCurrencyRate = resolveRateForCurrency(income.currency, rates);
  const targetRate = targetCurrencyRate ? Number(targetCurrencyRate) : 0;
  const convertedEquivalent = isSameCurrency
    ? currentAmount
    : income.currency === 'BS'
      ? (amountInBs > 0 ? amountInBs : null)
      : (targetRate > 0 && amountInBs > 0 ? amountInBs / targetRate : null);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="expense-form-container" onClick={(e) => e.stopPropagation()}>
        <h2>{income.checks?.[0]?.is_partial ? `Completar Cobro: ${income.name}` : `Confirmar Ingreso: ${income.name}`}</h2>

        {error && (
          <div
            className="error-message"
            style={{
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md, 8px)',
              color: '#ef4444',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

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
                type="text"
                inputMode="decimal"
                value={realAmount}
                onChange={(e) => setRealAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0.00"
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
                {CURRENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {!isSameCurrency && currentAmount > 0 && convertedEquivalent !== null && convertedEquivalent > 0 && (
            <div
              className="conversion-preview-pill"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 0.85rem',
                marginBottom: '0.85rem',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                fontSize: '0.82rem',
                color: 'var(--text-primary)'
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>
                Equivalente en moneda del ingreso ({income.currency === 'USD_CASH' ? '$ Efectivo' : income.currency}):
              </span>
              <strong style={{ color: 'var(--income-color)', fontSize: '0.9rem' }}>
                {income.currency === 'BS' ? 'Bs.' : ((income.currency as string) === 'EUR' || (income.currency as string) === 'EUR_BCV') ? '€' : '$'}{' '}
                {convertedEquivalent.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
          )}

          <ExchangeRateField
            currency={currency}
            rates={rates}
            manualRate={manualRate}
            onManualRateChange={setManualRate}
            hasDate={true}
            mode="income"
          />

          <div className="form-group">
            <label>Fecha de Cobro</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
            />
          </div>

          {isPartial && (
            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Promesa de pago para el restante (Nueva Fecha)</span>
                <span className="form-hint-inline">(Opcional)</span>
              </label>
              <input
                type="date"
                value={pendingDate}
                onChange={(e) => setPendingDate(e.target.value)}
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
