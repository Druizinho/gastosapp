import React, { useState, useEffect } from 'react';
import type { SavingDeposit, SavingDepositCreate, SavingDepositUpdate, CurrencyType, Category, ExchangeRates } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import { getCategories, getRates } from '../api';
import { formatRateForInput } from '../utils/currencyFormat';
import CategorySelect from './CategorySelect';

interface SavingDepositFormProps {
  initialData?: SavingDeposit;
  goalName: string;
  goalCurrency: string;
  goalTargetAmount?: number | null;
  goalCurrentSaved: number;
  goalColor?: string;
  goalType?: 'saving' | 'project';
  goalCategory?: string | null;
  onSubmit: (data: SavingDepositCreate | SavingDepositUpdate) => void;
  onCancel: () => void;
  loading: boolean;
}

const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getInitialDepositRate = (data?: SavingDeposit): string => {
  if (!data) return '';
  if (data.currency === 'EUR_BCV' && data.rate_eur_bs) {
    return formatRateForInput(data.rate_eur_bs);
  }
  if (data.currency === 'USDT' && data.rate_usdt_bs) {
    return formatRateForInput(data.rate_usdt_bs);
  }
  if ((data.currency === 'USD_BCV' || data.currency === 'BS') && data.rate_usd_bs) {
    return formatRateForInput(data.rate_usd_bs);
  }
  if (data.currency === 'USD_CASH' && Number(data.amount_bs) > 0 && Number(data.amount) > 0) {
    return formatRateForInput(Number(data.amount_bs) / Number(data.amount));
  }
  return '';
};

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
  initialData,
  goalName,
  goalCurrency,
  goalTargetAmount,
  goalCurrentSaved,
  goalColor = '#10B981',
  goalType = 'saving',
  goalCategory,
  onSubmit,
  onCancel,
  loading,
}) => {
  const isEditing = !!initialData;
  const isProject = goalType === 'project';
  const hasTarget = goalTargetAmount != null && Number(goalTargetAmount) > 0;
  const targetNum = hasTarget ? Number(goalTargetAmount) : 0;
  const remaining = hasTarget ? Math.max(targetNum - goalCurrentSaved, 0) : null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(err => console.error('Error fetching categories in SavingDepositForm:', err));
  }, []);

  const defaultCategory = initialData?.category || goalCategory || (isProject ? 'Proyectos' : 'Ahorro');

  const [formData, setFormData] = useState<SavingDepositCreate>({
    amount: (initialData ? initialData.amount : '') as any,
    currency: (initialData?.currency || goalCurrency) as CurrencyType,
    deposit_date: initialData?.deposit_date || getLocalToday(),
    note: initialData?.note || '',
    manual_rate: getInitialDepositRate(initialData) as any,
    register_as_expense: isProject,
    category: defaultCategory,
  });

  useEffect(() => {
    getRates(formData.deposit_date || undefined)
      .then(setRates)
      .catch((err) => console.error('Failed to load exchange rates', err));
  }, [formData.deposit_date]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        amount: initialData.amount,
        currency: initialData.currency,
        deposit_date: initialData.deposit_date,
        note: initialData.note || '',
        manual_rate: getInitialDepositRate(initialData) as any,
        register_as_expense: Boolean(initialData.create_expense || initialData.expense_id),
        category: initialData.category || goalCategory || (isProject ? 'Proyectos' : 'Ahorro'),
      });
    } else {
      setFormData(prev => ({
        ...prev,
        register_as_expense: isProject,
        category: prev.category || goalCategory || (isProject ? 'Proyectos' : 'Ahorro'),
      }));
    }
  }, [initialData, isProject, goalCategory]);

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
    setError(null);

    const submitData: any = { ...formData };
    submitData.amount = Number(submitData.amount);
    if (submitData.manual_rate) {
      const parsed = parseFloat(String(submitData.manual_rate).replace(',', '.'));
      submitData.manual_rate = !isNaN(parsed) && parsed > 0 ? parsed : undefined;
    } else {
      delete submitData.manual_rate;
    }
    submitData.category = formData.category || (isProject ? 'Proyectos' : 'Ahorro');
    submitData.register_as_expense = formData.register_as_expense;
    if (isEditing) {
      delete submitData.register_as_expense;
    }
    onSubmit(submitData);
  };

  const currentAmount = Number(formData.amount) || 0;
  const isSameCurrency = formData.currency === goalCurrency;
  const willComplete = !isProject && !isEditing && isSameCurrency && remaining !== null && currentAmount >= remaining && remaining > 0;
  const isUsdtRateMissing = formData.currency === 'USDT' && rates !== null && (rates.usdt_bs === null || rates.usdt_bs === undefined || rates.usdt_bs <= 0);
  const suggestedRate = formData.currency === 'EUR_BCV' ? rates?.eur_bs : formData.currency === 'USDT' ? rates?.usdt_bs : rates?.usd_bs;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div 
        className="expense-form-container" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '460px', maxHeight: '92vh', overflowY: 'auto' }}
      >
        <h2>
          {isEditing 
            ? (isProject ? 'Editar Pago' : 'Editar Aporte')
            : (isProject ? 'Registrar Pago' : 'Abonar a Fondo')}
        </h2>
        {goalName && (
          <p style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            marginTop: '-1rem',
            marginBottom: '1.25rem',
            fontWeight: 500,
          }}>
            {goalName}
          </p>
        )}

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Target Progress Banner */}
          {hasTarget && remaining !== null ? (
            <div style={{
              background: 'var(--surface-muted)',
              borderRadius: 'var(--radius-md)',
              padding: '0.875rem 1rem',
              marginBottom: '1rem',
              border: '1px solid var(--accent-light)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {isProject ? 'Restante del presupuesto:' : 'Faltan para la meta:'}
                </span>
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
                  width: `${Math.min(100, (goalCurrentSaved / (targetNum || 1)) * 100)}%`,
                  background: goalColor,
                  borderRadius: 'var(--radius-full)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          ) : isProject ? (
            <div style={{
              background: 'var(--surface-muted)',
              borderRadius: 'var(--radius-md)',
              padding: '0.875rem 1rem',
              marginBottom: '1rem',
              border: '1px solid var(--accent-light)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total invertido / pagado hasta ahora:</span>
                <strong style={{ color: goalColor }}>
                  {formatCurrency(goalCurrentSaved, goalCurrency)}
                </strong>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                Cuenta abierta · Acumulando pagos continuos
              </div>
            </div>
          ) : null}

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
              <label>{isProject ? 'Monto del Pago *' : 'Monto a Aportar *'}</label>
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
                {CURRENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tasa manual */}
          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tasa de Cambio</span>
              <span className="form-hint-inline">(Opcional)</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              name="manual_rate"
              placeholder={isUsdtRateMissing ? "No hay precio en esta fecha — tasa manual opcional" : (suggestedRate && suggestedRate > 0 ? `Por defecto: Bs. ${Number(suggestedRate).toFixed(2)}` : "Dejar vacío para usar tasa del día")}
              value={formData.manual_rate || ''}
              onChange={handleChange}
            />
            {isUsdtRateMissing && !formData.manual_rate && (
              <p style={{ fontSize: '0.8rem', color: 'var(--warning-color, #D97706)', marginTop: '0.35rem' }}>
                No hay precio de USDT en esta fecha. Puedes ingresar una tasa manual (opcional).
              </p>
            )}
          </div>

          {/* Fecha del Aporte / Pago */}
          <div className="form-group">
            <label>{isProject ? 'Fecha del Pago' : 'Fecha del Aporte'}</label>
            <input
              type="date"
              name="deposit_date"
              value={formData.deposit_date || ''}
              onChange={handleChange}
            />
          </div>

          {/* Nota */}
          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{isProject ? 'Nota / Concepto del pago' : 'Nota / Origen de los fondos'}</span>
              <span className="form-hint-inline">(Opcional)</span>
            </label>
            <input
              type="text"
              name="note"
              placeholder={isProject ? "Ej: Repuestos de bomba, refrigerante, mano de obra..." : "Ej: Bono de trabajo, venta de garaje..."}
              value={formData.note || ''}
              onChange={handleChange}
            />
          </div>

          {/* Registrar como Gasto en Dashboard */}
          {!isEditing && (
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
                    {isProject
                      ? 'Descuenta este pago en tus gastos del Dashboard en la categoría seleccionada (por defecto "Proyectos") para reflejar la salida de dinero real.'
                      : 'Descuenta este aporte en tus gastos del Dashboard en la categoría seleccionada (por defecto "Ahorro").'}
                  </span>
                </div>
              </label>

              {Boolean(formData.register_as_expense) && (
                <div style={{ paddingTop: '0.75rem' }}>
                  <CategorySelect
                    label="Categoría del gasto"
                    value={formData.category || (isProject ? 'Proyectos' : 'Ahorro')}
                    onChange={(val) => setFormData(prev => ({ ...prev, category: val || (isProject ? 'Proyectos' : 'Ahorro') }))}
                    categories={categories}
                    onCategoryCreated={(cat) => setCategories(prev => [...prev, cat])}
                  />
                </div>
              )}
            </div>
          )}

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
              {loading ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : (isProject ? 'Registrar Pago' : 'Aportar'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SavingDepositForm;
