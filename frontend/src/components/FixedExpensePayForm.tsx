import React, { useState, useEffect, useContext } from 'react';
import type { FixedExpense, FixedExpenseCheckCreate, CurrencyType, ExchangeRates } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import { getRates } from '../api';
import { CategorySelect } from './CategorySelect';
import { Receipt, Users } from 'lucide-react';
import { ExchangeRateField, resolveRateForCurrency } from './ExchangeRateField';
import { ToastContext } from './ui/Toast';

interface FixedExpensePayFormProps {
  expense?: FixedExpense;
  fixedExpense?: FixedExpense;
  monthYear?: string;
  onSubmit?: (data: FixedExpenseCheckCreate) => Promise<void>;
  onPay?: (month: string, year: string, registerAsExpense: boolean, category?: string) => Promise<void> | void;
  onCancel: () => void;
}

const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const FixedExpensePayForm: React.FC<FixedExpensePayFormProps> = ({
  expense,
  fixedExpense,
  monthYear,
  onSubmit,
  onPay,
  onCancel,
}) => {
  const activeExpense = expense || fixedExpense;
  const toast = useContext(ToastContext);
  const [paidDate, setPaidDate] = useState<string>(getLocalToday());
  const [paidAmount, setPaidAmount] = useState<string>(activeExpense ? activeExpense.amount.toString() : '0');
  const [currency, setCurrency] = useState<CurrencyType>(activeExpense ? activeExpense.currency : 'USD_BCV');
  const [category, setCategory] = useState<string>(activeExpense?.category || 'Gastos Fijos');
  const [createExpense, setCreateExpense] = useState(true);
  const [notes, setNotes] = useState('');
  const [manualRate, setManualRate] = useState('');
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRates(paidDate || undefined).then(setRates).catch(console.error);
  }, [paidDate]);

  if (!activeExpense) return null;

  const effectiveMonthYear = monthYear || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!paidAmount) return;

    const parsedPaidAmount = parseFloat(paidAmount.replace(',', '.'));
    if (isNaN(parsedPaidAmount) || parsedPaidAmount <= 0) {
      const err = 'Por favor, ingresa un monto válido.';
      setError(err);
      if (toast) toast.error(err);
      return;
    }

    const parsedRate = manualRate ? parseFloat(manualRate.replace(',', '.')) : undefined;

    setIsSubmitting(true);
    try {
      const chosenCategory = createExpense ? (category.trim() || undefined) : undefined;
      const [y, m] = effectiveMonthYear.split('-');

      if (onSubmit) {
        await onSubmit({
          month_year: effectiveMonthYear,
          paid_amount: parsedPaidAmount,
          currency,
          paid_date: paidDate,
          create_expense: createExpense,
          category: chosenCategory,
          notes: notes || undefined,
          manual_rate: parsedRate,
        });
      }

      if (onPay) {
        await onPay(m, y, createExpense, chosenCategory);
      }
    } catch (err: any) {
      console.error('Error paying fixed expense:', err);
      const msg = err?.response?.data?.detail || err?.message || 'Error al registrar el pago.';
      const errorMsg = typeof msg === 'string' ? msg : 'Error al registrar el pago.';
      setError(errorMsg);
      if (toast) {
        toast.error(errorMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const monthLabel = (() => {
    const [y, m] = effectiveMonthYear.split('-');
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  })();

  const parsedAmount = parseFloat(paidAmount.replace(',', '.'));
  const currentAmount = !isNaN(parsedAmount) ? parsedAmount : 0;
  const isSameCurrency = currency === activeExpense.currency;
  const suggestedRate = resolveRateForCurrency(currency, rates);
  const manualRateNum = manualRate ? parseFloat(manualRate.replace(',', '.')) : 0;
  const effectiveRate = manualRateNum > 0 ? manualRateNum : (suggestedRate ? Number(suggestedRate) : 0);
  const amountInBs = currency === 'BS' ? currentAmount : (effectiveRate > 0 ? currentAmount * effectiveRate : 0);
  const targetCurrencyRate = resolveRateForCurrency(activeExpense.currency, rates);
  const targetRate = targetCurrencyRate ? Number(targetCurrencyRate) : 0;
  const convertedEquivalent = isSameCurrency
    ? currentAmount
    : activeExpense.currency === 'BS'
      ? (amountInBs > 0 ? amountInBs : null)
      : (targetRate > 0 && amountInBs > 0 ? amountInBs / targetRate : null);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="expense-form-container" onClick={(e) => e.stopPropagation()}>
        <h2>Marcar como Pagado</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '-0.5rem 0 1rem' }}>
          {activeExpense.name} — {monthLabel}
        </p>

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
          {activeExpense.is_shared && (
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              color: '#3B82F6',
              padding: '0.75rem 0.9rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              marginBottom: '1rem'
            }}>
              <Users size={16} style={{ flexShrink: 0 }} />
              <span>
                Este pago se sincronizará automáticamente con todos los miembros del grupo{activeExpense.shared_partner_name ? ` (${activeExpense.shared_partner_name})` : ''}.
              </span>
            </div>
          )}

          <div className="form-group row">
            <div className="form-group half">
              <label>Monto Pagado</label>
              <input
                type="text"
                inputMode="decimal"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                required
                placeholder="0.00"
              />
            </div>
            <div className="form-group half">
              <label>Moneda</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyType)} required>
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
                Equivalente en moneda del gasto fijo ({activeExpense.currency === 'USD_CASH' ? '$ Efectivo' : activeExpense.currency}):
              </span>
              <strong style={{ color: 'var(--income-color)', fontSize: '0.9rem' }}>
                {activeExpense.currency === 'BS' ? 'Bs.' : ((activeExpense.currency as string) === 'EUR' || (activeExpense.currency as string) === 'EUR_BCV') ? '€' : '$'}{' '}
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
          />

          <div className="form-group">
            <label>Fecha de Pago</label>
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              required
            />
          </div>

          {/* Toggle: register as real expense */}
          <div
            className={`register-expense-card ${createExpense ? 'active' : ''}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              padding: '0.75rem 0.875rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              background: 'var(--surface-muted)',
              marginBottom: '1rem'
            }}
          >
            <div
              onClick={() => setCreateExpense(!createExpense)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', width: '100%', userSelect: 'none' }}
            >
              <div style={{
                width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0,
                background: createExpense ? 'var(--income-color)' : 'var(--surface-muted)',
                border: createExpense ? 'none' : '2px solid var(--accent-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s ease',
                marginTop: '2px',
              }}>
                {createExpense && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Registrar como gasto en el Dashboard
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  Suma este pago a tus gastos del mes en la categoría que elijas.
                </div>
              </div>
              <Receipt size={18} style={{ color: createExpense ? 'var(--income-color)' : 'var(--text-tertiary)', flexShrink: 0, marginTop: '2px' }} />
            </div>

            {createExpense && (
              <div
                className="form-collapse-reveal"
                onClick={(e) => e.stopPropagation()}
                style={{ paddingTop: '0.65rem', width: '100%', borderTop: '1px solid var(--border-color)' }}
              >
                <CategorySelect
                  value={category}
                  onChange={setCategory}
                  label="Categoría del gasto"
                  allowEmpty={false}
                  disabled={isSubmitting}
                />
              </div>
            )}
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Nota</span>
              <span className="form-hint-inline">(Opcional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={100}
              placeholder="Notas del pago..."
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="btn-cancel"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-submit"
            >
              {isSubmitting ? 'Guardando...' : 'Confirmar Pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FixedExpensePayForm;
