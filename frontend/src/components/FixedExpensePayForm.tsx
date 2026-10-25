import React, { useState, useEffect } from 'react';
import type { FixedExpense, FixedExpenseCheckCreate, CurrencyType, ExchangeRates } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import { getRates } from '../api';
import { CategorySelect } from './CategorySelect';
import { Receipt } from 'lucide-react';

interface FixedExpensePayFormProps {
  expense?: FixedExpense;
  fixedExpense?: FixedExpense;
  monthYear?: string;
  onSubmit?: (data: FixedExpenseCheckCreate) => Promise<void>;
  onPay?: (month: string, year: string, registerAsExpense: boolean, category?: string) => Promise<void> | void;
  onCancel: () => void;
}

const FixedExpensePayForm: React.FC<FixedExpensePayFormProps> = ({
  expense,
  fixedExpense,
  monthYear,
  onSubmit,
  onPay,
  onCancel,
}) => {
  const activeExpense = expense || fixedExpense;
  const [paidAmount, setPaidAmount] = useState<string>(activeExpense ? activeExpense.amount.toString() : '0');
  const [currency, setCurrency] = useState<CurrencyType>(activeExpense ? activeExpense.currency : 'USD_BCV');
  const [category, setCategory] = useState<string>(activeExpense?.category || 'Gastos Fijos');
  const [createExpense, setCreateExpense] = useState(true);
  const [notes, setNotes] = useState('');
  const [manualRate, setManualRate] = useState('');
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    getRates().then(setRates).catch(() => {});
  }, []);

  if (!activeExpense) return null;

  const effectiveMonthYear = monthYear || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paidAmount) return;

    setIsSubmitting(true);
    try {
      const chosenCategory = createExpense ? (category.trim() || undefined) : undefined;
      const [y, m] = effectiveMonthYear.split('-');

      if (onSubmit) {
        await onSubmit({
          month_year: effectiveMonthYear,
          paid_amount: parseFloat(paidAmount.replace(',', '.')),
          currency,
          paid_date: new Date().toISOString().split('T')[0],
          create_expense: createExpense,
          category: chosenCategory,
          notes: notes || undefined,
          manual_rate: manualRate ? parseFloat(manualRate.replace(',', '.')) : undefined,
        });
      }

      if (onPay) {
        await onPay(m, y, createExpense, chosenCategory);
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

  const currentRate = rates?.usd_bs;

  return (
    <div className="modal-backdrop">
      <div className="expense-form-container">
        <h2>Marcar como Pagado</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '-0.5rem 0 1rem' }}>
          {activeExpense.name} — {monthLabel}
        </p>
        <form onSubmit={handleSubmit}>

          <div className="form-group row">
            <div className="form-group half">
              <label>Monto Pagado</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
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

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tasa de Cambio</span>
              <span className="form-hint-inline">(Opcional)</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={manualRate}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.,]/g, '');
                setManualRate(val);
              }}
              placeholder={currentRate ? `Por defecto usa la del mercado` : "Ej. 36.50"}
            />
          </div>

          {/* Toggle: register as real expense */}
          <div
            onClick={() => setCreateExpense(!createExpense)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.875rem 1rem', borderRadius: 'var(--radius-sm)',
              background: createExpense ? 'rgba(16, 185, 129, 0.08)' : 'var(--surface-muted)',
              border: createExpense ? '1.5px solid rgba(16, 185, 129, 0.25)' : '1.5px solid transparent',
              cursor: 'pointer', transition: 'all 0.2s ease', marginBottom: '0.75rem',
              userSelect: 'none',
            }}
          >
            <div style={{
              width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
              background: createExpense ? 'var(--income-color)' : 'var(--surface-muted)',
              border: createExpense ? 'none' : '2px solid var(--accent-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s ease',
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
                Crea un gasto real para que se incluya en tus totales mensuales
              </div>
            </div>
            <Receipt size={18} style={{ color: createExpense ? 'var(--income-color)' : 'var(--text-tertiary)', flexShrink: 0 }} />
          </div>

          {/* Conditional Category Selector for the real expense */}
          {createExpense && (
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <CategorySelect
                value={category}
                onChange={setCategory}
                label="Categoría del gasto"
                allowEmpty={false}
                disabled={isSubmitting}
              />
            </div>
          )}

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
