import React, { useState, useEffect, useContext } from 'react';
import type { SavingDeposit, SavingDepositCreate, SavingDepositUpdate, SavingTransactionType, CurrencyType, Category, ExchangeRates } from '../../types';
import { CURRENCY_OPTIONS } from '../../types';
import { getCategories, getRates } from '../../api';
import { formatRateForInput } from '../../utils/currencyFormat';
import { CategorySelect, ExchangeRateField, resolveRateForCurrency } from '../common';
import { ToastContext } from '../ui/Toast';
import { Users, Receipt } from 'lucide-react';

interface SavingDepositFormProps {
  initialData?: SavingDeposit;
  initialTransactionType?: SavingTransactionType;
  goalName: string;
  goalCurrency: string;
  goalTargetAmount?: number | null;
  goalCurrentSaved: number;
  goalColor?: string;
  goalType?: 'saving' | 'project';
  goalCategory?: string;
  isShared?: boolean;
  sharedPartnerName?: string | null;
  onSubmit: (data: SavingDepositCreate | SavingDepositUpdate) => void | Promise<void>;
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
  initialTransactionType = 'deposit',
  goalName,
  goalCurrency,
  goalTargetAmount,
  goalCurrentSaved,
  goalColor = '#10B981',
  goalType = 'saving',
  goalCategory,
  isShared = false,
  sharedPartnerName = null,
  onSubmit,
  onCancel,
  loading,
}) => {
  const isEditing = !!initialData;
  const isProject = goalType === 'project';
  const hasTarget = goalTargetAmount != null && Number(goalTargetAmount) > 0;
  const targetNum = hasTarget ? Number(goalTargetAmount) : 0;
  const remaining = hasTarget ? Math.max(targetNum - goalCurrentSaved, 0) : null;

  const toast = useContext(ToastContext);
  const [amount, setAmount] = useState<string>(() =>
    initialData?.amount != null ? String(initialData.amount) : ''
  );
  const [manualRate, setManualRate] = useState<string>(() => getInitialDepositRate(initialData));

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
    transaction_type: (initialData?.transaction_type || initialTransactionType || 'deposit') as SavingTransactionType,
  });

  useEffect(() => {
    getRates(formData.deposit_date || undefined)
      .then(setRates)
      .catch((err) => console.error('Failed to load exchange rates', err));
  }, [formData.deposit_date]);

  useEffect(() => {
    if (initialData) {
      setAmount(initialData.amount != null ? String(initialData.amount) : '');
      setManualRate(getInitialDepositRate(initialData));
      setFormData({
        amount: initialData.amount,
        currency: initialData.currency,
        deposit_date: initialData.deposit_date,
        note: initialData.note || '',
        manual_rate: getInitialDepositRate(initialData) as any,
        register_as_expense: Boolean(initialData.create_expense || initialData.expense_id),
        category: initialData.category || goalCategory || (isProject ? 'Proyectos' : 'Ahorro'),
        transaction_type: (initialData.transaction_type || initialTransactionType || 'deposit') as SavingTransactionType,
      });
    } else {
      setAmount('');
      setManualRate('');
      setFormData(prev => ({
        ...prev,
        register_as_expense: isProject,
        category: prev.category || goalCategory || (isProject ? 'Proyectos' : 'Ahorro'),
        transaction_type: (isProject ? 'deposit' : (initialTransactionType || 'deposit')) as SavingTransactionType,
      }));
    }
  }, [initialData, isProject, goalCategory, initialTransactionType]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setError(null);

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const isWithdrawal = !isProject && formData.transaction_type === 'withdrawal';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = parseFloat(amount.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) {
      const msg = 'El monto debe ser un número válido mayor a 0';
      setError(msg);
      toast?.showToast(msg, 'error');
      return;
    }

    const submitData: any = { ...formData };
    submitData.amount = parsed;
    if (manualRate.trim()) {
      const parsedRate = parseFloat(manualRate.replace(',', '.'));
      submitData.manual_rate = !isNaN(parsedRate) && parsedRate > 0 ? parsedRate : undefined;
    } else {
      delete submitData.manual_rate;
    }
    submitData.category = formData.category || (isProject ? 'Proyectos' : 'Ahorro');
    submitData.transaction_type = isProject ? 'deposit' : (formData.transaction_type || 'deposit');

    if (isWithdrawal) {
      submitData.register_as_expense = false;
      const effectiveAvailable = !isEditing
        ? goalCurrentSaved
        : goalCurrentSaved + (initialData?.transaction_type === 'withdrawal' ? Number(initialData.amount) : -Number(initialData?.amount || 0));

      if (isSameCurrency && Number(submitData.amount) > effectiveAvailable + 0.009) {
        const msg = 'El monto del retiro supera el saldo disponible en el ahorro';
        setError(msg);
        toast?.showToast(msg, 'error');
        return;
      }
    } else {
      submitData.register_as_expense = formData.register_as_expense;
      if (isEditing) {
        delete submitData.register_as_expense;
      }
    }

    try {
      await onSubmit(submitData);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Error al guardar el movimiento';
      const msg = typeof detail === 'string' ? detail : 'Error al guardar el movimiento';
      setError(msg);
      toast?.showToast(msg, 'error');
    }
  };

  const suggestedRate = resolveRateForCurrency(formData.currency, rates);

  const parsedAmount = parseFloat(amount.replace(',', '.'));
  const currentAmount = !isNaN(parsedAmount) ? parsedAmount : 0;
  const isSameCurrency = formData.currency === goalCurrency;
  const willComplete = !isWithdrawal && !isProject && !isEditing && isSameCurrency && remaining !== null && currentAmount >= remaining && remaining > 0;

  const manualRateNum = manualRate ? parseFloat(manualRate.replace(',', '.')) : 0;
  const effectiveRate = manualRateNum > 0 ? manualRateNum : (suggestedRate ? Number(suggestedRate) : 0);

  const amountInBs = formData.currency === 'BS'
    ? currentAmount
    : (effectiveRate > 0 ? currentAmount * effectiveRate : 0);

  let convertedEquivalent: number | null = null;
  if (goalCurrency === 'BS') {
    convertedEquivalent = amountInBs > 0 ? amountInBs : null;
  } else {
    const targetGoalRate = resolveRateForCurrency(goalCurrency, rates);
    if (targetGoalRate && Number(targetGoalRate) > 0 && amountInBs > 0) {
      convertedEquivalent = amountInBs / Number(targetGoalRate);
    }
  }

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
            ? (isWithdrawal ? 'Editar Retiro' : (isProject ? 'Editar Pago' : 'Editar Aporte'))
            : (isWithdrawal ? 'Retirar de Fondo' : (isProject ? 'Registrar Pago' : 'Abonar a Fondo'))}
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

        <form onSubmit={handleSubmit}>
          {error && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                borderRadius: '8px',
                fontSize: '0.85rem',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              {error}
            </div>
          )}

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
              border: '1px solid rgba(59, 130, 246, 0.2)',
              marginBottom: '1rem'
            }}>
              <Users size={16} style={{ flexShrink: 0 }} />
              <span>
                Este movimiento se sincronizará automáticamente con todos los miembros del grupo{sharedPartnerName ? ` (${sharedPartnerName})` : ''}.
              </span>
            </div>
          )}

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
          <div className="form-group row" style={{ marginBottom: (!isSameCurrency && currentAmount > 0 && convertedEquivalent != null && convertedEquivalent > 0) ? '0.5rem' : '1rem' }}>
            <div className="form-group half">
              <label>{isWithdrawal ? 'Monto a Retirar *' : (isProject ? 'Monto del Pago *' : 'Monto a Aportar *')}</label>
              <input
                type="text"
                inputMode="decimal"
                name="amount"
                required
                autoFocus
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setError(null);
                  setAmount(e.target.value.replace(/[^0-9.,]/g, ''));
                }}
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

          {!isSameCurrency && currentAmount > 0 && convertedEquivalent != null && convertedEquivalent > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div
                className="conversion-preview-pill"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: 'var(--radius-full, 9999px)',
                  background: 'rgba(59, 130, 246, 0.1)',
                  color: 'var(--accent-color, #3B82F6)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                }}
              >
                <span>≈ Equivale a {formatCurrency(convertedEquivalent, goalCurrency)}</span>
                {formData.currency !== 'BS' && goalCurrency !== 'BS' && amountInBs > 0 && (
                  <span style={{ opacity: 0.8, fontWeight: 400 }}>
                    (Bs. {amountInBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </span>
                )}
              </div>
            </div>
          )}

          <ExchangeRateField
            currency={(formData.currency || goalCurrency || 'USD_BCV') as CurrencyType}
            rates={rates}
            manualRate={manualRate}
            onManualRateChange={setManualRate}
            isEditing={Boolean(initialData)}
            hasDate={true}
          />

          {/* Fecha del Aporte / Pago */}
          <div className="form-group">
            <label>{isWithdrawal ? 'Fecha del Retiro' : (isProject ? 'Fecha del Pago' : 'Fecha del Aporte')}</label>
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
              <span>{isWithdrawal ? 'Nota / Destino del retiro' : (isProject ? 'Nota / Concepto del pago' : 'Nota / Origen de los fondos')}</span>
              <span className="form-hint-inline">(Opcional)</span>
            </label>
            <input
              type="text"
              name="note"
              placeholder={isProject ? "Ej: Repuestos de bomba, refrigerante, mano de obra..." : (isWithdrawal ? "Ej: Emergencia médica, reparación imprevista..." : "Ej: Bono de trabajo, venta de garaje...")}
              value={formData.note || ''}
              onChange={handleChange}
            />
          </div>

          {/* Registrar como Gasto en Dashboard */}
          {!isEditing && !isWithdrawal && (
            <div
              className={`register-expense-card ${formData.register_as_expense ? 'active' : ''}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                padding: '0.75rem 0.875rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'var(--surface-muted)',
                marginBottom: '1rem',
              }}
            >
              <div
                onClick={() => setFormData(prev => ({ ...prev, register_as_expense: !prev.register_as_expense }))}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  cursor: 'pointer',
                  width: '100%',
                  userSelect: 'none',
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '5px',
                    flexShrink: 0,
                    background: formData.register_as_expense ? goalColor : 'var(--surface-color)',
                    border: formData.register_as_expense ? 'none' : '2px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    marginTop: '2px',
                  }}
                >
                  {formData.register_as_expense && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Registrar como gasto en el Dashboard
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.35, marginTop: '0.15rem' }}>
                    Suma este pago a tus gastos del mes en la categoría que elijas.
                  </div>
                </div>
                <Receipt
                  size={18}
                  style={{
                    color: formData.register_as_expense ? goalColor : 'var(--text-tertiary)',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                />
              </div>

              {Boolean(formData.register_as_expense) && (
                <div
                  className="form-collapse-reveal"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    paddingTop: '0.65rem',
                    width: '100%',
                    borderTop: '1px solid var(--border-color)',
                  }}
                >
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
              disabled={loading || !amount.trim()}
              className="btn-submit"
              style={{
                background: isWithdrawal ? '#F59E0B' : goalColor,
                boxShadow: `0 4px 14px ${isWithdrawal ? '#F59E0B' : goalColor}44`,
              }}
            >
              {loading ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : (isWithdrawal ? 'Retirar' : (isProject ? 'Registrar Pago' : 'Aportar')))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SavingDepositForm;
