import { useState, useEffect } from 'react';
import type { FixedExpense, FixedExpenseCheckCreate, CurrencyType, ExchangeRates } from '../types';
import { getRates } from '../api';
import { Receipt } from 'lucide-react';

interface FixedExpensePayFormProps {
  expense: FixedExpense;
  monthYear: string;
  onSubmit: (data: FixedExpenseCheckCreate) => Promise<void>;
  onCancel: () => void;
}

const FixedExpensePayForm: React.FC<FixedExpensePayFormProps> = ({ expense, monthYear, onSubmit, onCancel }) => {
  const [paidAmount, setPaidAmount] = useState<string>(expense.amount.toString());
  const [currency, setCurrency] = useState<CurrencyType>(expense.currency);
  const [createExpense, setCreateExpense] = useState(true);
  const [notes, setNotes] = useState('');
  const [manualRate, setManualRate] = useState('');
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    getRates().then(setRates).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paidAmount) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        month_year: monthYear,
        paid_amount: parseFloat(paidAmount.replace(',', '.')),
        currency,
        paid_date: new Date().toISOString().split('T')[0],
        create_expense: createExpense,
        notes: notes || undefined,
        manual_rate: manualRate ? parseFloat(manualRate.replace(',', '.')) : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const monthLabel = (() => {
    const [y, m] = monthYear.split('-');
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${months[parseInt(m) - 1]} ${y}`;
  })();

  const currentRate = rates?.usd_bs;

  return (
    <div className="modal-backdrop">
      <div className="expense-form-container">
        <h2>Marcar como Pagado</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '-0.5rem 0 1rem' }}>
          {expense.name} — {monthLabel}
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
                <option value="USD_BCV">Dólar BCV</option>
                <option value="EUR_BCV">Euro BCV</option>
                <option value="BS">Bolívares</option>
                <option value="USDT">USDT (Binance)</option>
                <option value="USD_CASH">Dólares en Efectivo</option>
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
