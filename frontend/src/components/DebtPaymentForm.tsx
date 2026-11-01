import React, { useState, useEffect, useContext } from 'react';
import { Users, Receipt } from 'lucide-react';
import type { DebtPayment, DebtPaymentCreate, DebtPaymentUpdate, ExchangeRates, DebtTransactionType, CurrencyType } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import { getRates } from '../api';
import { formatRateForInput } from '../utils/currencyFormat';
import ConfirmModal from './ConfirmModal';
import CategorySelect from './CategorySelect';
import { ExchangeRateField, resolveRateForCurrency } from './ExchangeRateField';
import { ToastContext } from './ui/Toast';

const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface DebtPaymentFormProps {
  initialData?: DebtPayment;
  initialTransactionType?: DebtTransactionType;
  debtConcept?: string;
  debtCategory?: string | null;
  type: 'owed' | 'receivable';
  debtCurrency: string;
  debtTotalAmount: number;
  debtPaidAmount: number;
  onSubmit: (data: DebtPaymentCreate | DebtPaymentUpdate) => void | Promise<void>;
  onCancel: () => void;
  loading: boolean;
  isShared?: boolean;
  sharedPartnerName?: string | null;
}

const currencyLabels: Record<string, string> = {
  'USD_BCV': '$', 'EUR_BCV': '€', 'BS': 'Bs.', 'USDT': 'USDT', 'USD_CASH': '$ Cash',
};
const formatCurrency = (amount: number, currency: string = 'USD_BCV') => {
  if (amount == null) return '';
  return `${currencyLabels[currency] || currency} ${Math.max(0, amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const DebtPaymentForm: React.FC<DebtPaymentFormProps> = ({ 
  initialData,
  initialTransactionType = 'payment',
  debtConcept,
  debtCategory,
  type, 
  debtCurrency, 
  debtTotalAmount, 
  debtPaidAmount, 
  onSubmit, 
  onCancel, 
  loading,
  isShared = false,
  sharedPartnerName = null
}) => {
  const isEditing = !!initialData;
  const remaining = Math.max(debtTotalAmount - debtPaidAmount, 0);

  const toast = useContext(ToastContext);
  const [amount, setAmount] = useState<string>(() =>
    initialData?.amount != null ? String(initialData.amount) : ''
  );

  const defaultCatFallback = type === 'receivable' ? 'Otros ingresos' : 'Sin Categoría';
  const initialCategory = initialData?.category || debtCategory || (type === 'receivable' ? 'Otros ingresos' : '');
  const initialRegExpense = initialData
    ? (initialData.create_expense !== undefined ? Boolean(initialData.create_expense) : Boolean(initialData.expense_id))
    : type === 'owed';

  const defaultTxType: DebtTransactionType =
    initialData?.transaction_type || initialTransactionType || (remaining <= 0 ? 'increase' : 'payment');

  const [formData, setFormData] = useState<DebtPaymentCreate & { register_as_expense?: boolean; category?: string }>({
    amount: (initialData ? initialData.amount : '') as any,
    currency: (initialData?.currency || debtCurrency) as any,
    payment_date: initialData?.payment_date || getLocalToday(),
    note: initialData?.note || '',
    register_as_expense: initialRegExpense,
    category: initialCategory,
    transaction_type: defaultTxType,
  });
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [manualRate, setManualRate] = useState<string>('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isIncrease = formData.transaction_type === 'increase';

  useEffect(() => {
    if (initialData) {
      setAmount(initialData.amount != null ? String(initialData.amount) : '');
      setFormData({
        amount: initialData.amount,
        currency: initialData.currency,
        payment_date: initialData.payment_date,
        note: initialData.note || '',
        register_as_expense: initialData.create_expense !== undefined ? Boolean(initialData.create_expense) : Boolean(initialData.expense_id),
        category: initialData.category || debtCategory || (type === 'receivable' ? 'Otros ingresos' : ''),
        transaction_type: (initialData.transaction_type || initialTransactionType || 'payment') as DebtTransactionType,
      });

      if (initialData.currency === 'EUR_BCV' && initialData.rate_eur_bs) {
        setManualRate(formatRateForInput(initialData.rate_eur_bs));
      } else if (initialData.currency === 'USDT' && initialData.rate_usdt_bs) {
        setManualRate(formatRateForInput(initialData.rate_usdt_bs));
      } else if ((initialData.currency === 'USD_BCV' || initialData.currency === 'BS') && initialData.rate_usd_bs) {
        setManualRate(formatRateForInput(initialData.rate_usd_bs));
      } else if (initialData.currency === 'USD_CASH' && initialData.amount && initialData.amount_bs) {
        setManualRate(formatRateForInput(Number(initialData.amount_bs) / Number(initialData.amount)));
      } else {
        setManualRate('');
      }
    } else {
      setAmount('');
      setManualRate('');
      const targetTxType: DebtTransactionType = initialTransactionType || (remaining <= 0 ? 'increase' : 'payment');
      setFormData(prev => ({ ...prev, transaction_type: targetTxType }));
    }
  }, [initialData, debtCategory, remaining, initialTransactionType, type]);

  useEffect(() => {
    getRates(formData.payment_date || undefined)
      .then(setRates)
      .catch((err) => console.error('Failed to load exchange rates', err));
  }, [formData.payment_date]);

  const suggestedRate = resolveRateForCurrency(formData.currency, rates);

  // Decimal parsing and cross-currency conversion
  const parsedAmount = parseFloat(amount.replace(',', '.'));
  const currentAmount = !isNaN(parsedAmount) ? parsedAmount : 0;
  const isSameCurrency = formData.currency === debtCurrency;
  const isOverpaying = !isEditing && !isIncrease && isSameCurrency && currentAmount > remaining && remaining > 0;

  const manualRateNum = manualRate ? parseFloat(manualRate.replace(',', '.')) : 0;
  const effectiveRate = manualRateNum > 0 ? manualRateNum : (suggestedRate ? Number(suggestedRate) : 0);

  const amountInBs = formData.currency === 'BS'
    ? currentAmount
    : (effectiveRate > 0 ? currentAmount * effectiveRate : 0);

  let convertedEquivalent: number | null = null;
  if (debtCurrency === 'BS') {
    convertedEquivalent = amountInBs > 0 ? amountInBs : null;
  } else {
    const debtRate = resolveRateForCurrency(debtCurrency, rates);
    if (debtRate && Number(debtRate) > 0 && amountInBs > 0) {
      convertedEquivalent = amountInBs / Number(debtRate);
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const checked = (e.target as HTMLInputElement).checked;
    setError(null);

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

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

    const parsedRate = manualRate ? parseFloat(manualRate.replace(',', '.')) : undefined;

    const submitData: DebtPaymentCreate = {
      ...formData,
      amount: parsed,
      transaction_type: formData.transaction_type,
      register_as_expense: isIncrease ? false : Boolean(formData.register_as_expense),
      category: (!isIncrease && formData.register_as_expense) ? (formData.category || debtCategory || defaultCatFallback) : null,
      manual_rate: parsedRate && !isNaN(parsedRate) && parsedRate > 0 ? parsedRate : undefined,
    };
    
    if (!isEditing && !isIncrease && isSameCurrency && submitData.amount > remaining) {
      setShowConfirm(true);
      return;
    }
    
    try {
      await onSubmit(submitData);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Error al procesar el abono';
      const msg = typeof detail === 'string' ? detail : 'Error al procesar el abono';
      setError(msg);
      toast?.showToast(msg, 'error');
    }
  };

  const handleConfirmSubmit = async () => {
    setShowConfirm(false);
    setError(null);

    const parsed = parseFloat(amount.replace(',', '.'));
    const parsedRate = manualRate ? parseFloat(manualRate.replace(',', '.')) : undefined;

    const submitData: DebtPaymentCreate = {
      ...formData,
      amount: parsed,
      transaction_type: formData.transaction_type,
      register_as_expense: isIncrease ? false : Boolean(formData.register_as_expense),
      category: (!isIncrease && formData.register_as_expense) ? (formData.category || debtCategory || defaultCatFallback) : null,
      manual_rate: parsedRate && !isNaN(parsedRate) && parsedRate > 0 ? parsedRate : undefined,
    };

    try {
      await onSubmit(submitData);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Error al procesar el abono';
      const msg = typeof detail === 'string' ? detail : 'Error al procesar el abono';
      setError(msg);
      toast?.showToast(msg, 'error');
    }
  };

  const themeColor = type === 'owed' ? 'var(--expense-color)' : 'var(--income-color)';

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
      >
        <h2>{isEditing ? (isIncrease ? 'Editar Aumento' : 'Editar Abono') : (isIncrease ? 'Aumentar Deuda' : 'Registrar Abono')}</h2>
        {debtConcept && (
          <p style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            marginTop: '-0.5rem',
            marginBottom: '1.25rem'
          }}>
            {debtConcept}
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
                Este abono se sincronizará automáticamente con todos los miembros del grupo{sharedPartnerName ? ` (${sharedPartnerName})` : ''}.
              </span>
            </div>
          )}

          <div style={{
            background: 'var(--surface-muted, rgba(0,0,0,0.03))',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.9rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem'
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>Monto pendiente:</span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatCurrency(remaining, debtCurrency)}
            </span>
          </div>

          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            color: 'var(--accent-color, #3B82F6)',
            padding: '0.75rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
            lineHeight: 1.4,
            border: '1px solid rgba(59, 130, 246, 0.15)',
            marginBottom: '1rem'
          }}>
            💡 Puedes abonar en una moneda diferente a la original. El sistema guardará la tasa de cambio oficial automáticamente.
          </div>

          {isOverpaying && (
            <div style={{
              background: 'var(--warning-bg, rgba(245, 158, 11, 0.1))',
              color: 'var(--warning-color, #D97706)',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.82rem',
              lineHeight: 1.4,
              fontWeight: 500,
              marginBottom: '1rem'
            }}>
              ⚠️ El monto ingresado supera el saldo pendiente. Se te pedirá confirmación al enviar.
            </div>
          )}

          <div className="form-group row" style={{ marginBottom: (!isSameCurrency && currentAmount > 0 && convertedEquivalent != null && convertedEquivalent > 0) ? '0.5rem' : '1rem' }}>
            <div className="form-group half">
              <label>{isIncrease ? 'Monto a Aumentar *' : 'Monto a Abonar *'}</label>
              <input
                type="text"
                inputMode="decimal"
                name="amount"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setError(null);
                  setAmount(e.target.value.replace(/[^0-9.,]/g, ''));
                }}
              />
            </div>

            <div className="form-group half">
              <label>Moneda del Pago *</label>
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
                <span>≈ Equivale a {formatCurrency(convertedEquivalent, debtCurrency)}</span>
                {formData.currency !== 'BS' && debtCurrency !== 'BS' && amountInBs > 0 && (
                  <span style={{ opacity: 0.8, fontWeight: 400 }}>
                    (Bs. {amountInBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </span>
                )}
              </div>
            </div>
          )}

          <ExchangeRateField
            currency={(formData.currency || debtCurrency || 'USD_BCV') as CurrencyType}
            rates={rates}
            manualRate={manualRate}
            onManualRateChange={setManualRate}
            isEditing={Boolean(initialData)}
            hasDate={true}
          />

          <div className="form-group">
            <label>{isIncrease ? 'Fecha del Cargo *' : 'Fecha del Pago *'}</label>
            <input
              type="date"
              name="payment_date"
              required
              value={formData.payment_date || ''}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>{isIncrease ? 'Nota / Motivo del aumento' : 'Nota / Referencia'}</label>
            <input
              type="text"
              name="note"
              value={formData.note || ''}
              onChange={handleChange}
              placeholder={isIncrease ? 'Ej: Cargo extra por servicio, consumo adicional...' : 'Ej: Transferencia Mercantil, Zelle de Pedro...'}
            />
          </div>

          {!isIncrease && (
            <div
              className={`register-expense-card ${formData.register_as_expense ? (type === 'owed' ? 'active-expense' : 'active') : ''}`}
              style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem 0.875rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--surface-muted)', marginBottom: '1rem' }}
            >
              <div
                onClick={() => setFormData(prev => ({ ...prev, register_as_expense: !prev.register_as_expense }))}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', width: '100%', userSelect: 'none' }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '5px',
                    flexShrink: 0,
                    background: formData.register_as_expense ? themeColor : 'var(--surface-color)',
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
                    {type === 'owed' ? 'Registrar como gasto en el Dashboard' : 'Registrar como ingreso en el Dashboard'}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.35, marginTop: '0.15rem' }}>
                    {type === 'owed' ? 'Suma este pago a tus gastos del mes en la categoría que elijas.' : 'Suma este cobro a tus ingresos del mes en la categoría que elijas.'}
                  </div>
                </div>
                <Receipt size={18} style={{ color: formData.register_as_expense ? themeColor : 'var(--text-tertiary)', flexShrink: 0, marginTop: '2px' }} />
              </div>

              {Boolean(formData.register_as_expense) && (
                <div className="form-collapse-reveal" onClick={(e) => e.stopPropagation()} style={{ width: '100%', paddingTop: '0.65rem', borderTop: '1px solid var(--border-color)' }}>
                  <CategorySelect
                    value={formData.category || debtCategory || (type === 'receivable' ? 'Otros ingresos' : '')}
                    onChange={(cat) => setFormData({ ...formData, category: cat })}
                    kind={type === 'receivable' ? 'income' : 'expense'}
                    label={type === 'receivable' ? 'Categoría del ingreso' : 'Categoría del gasto'}
                    allowEmpty={type === 'owed'}
                    emptyLabel="Sin Categoría"
                  />
                </div>
              )}
            </div>
          )}

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
              disabled={loading}
              className="btn-submit"
              style={{
                background: type === 'owed' ? 'var(--expense-color)' : 'var(--income-color)'
              }}
            >
              {loading ? 'Procesando...' : (isEditing ? 'Guardar Cambios' : (isIncrease ? 'Aumentar Deuda' : 'Registrar Abono'))}
            </button>
          </div>
          
          <ConfirmModal
            isOpen={showConfirm}
            title="Confirmar Abono Mayor al Pendiente"
            message={`El abono (${formatCurrency(currentAmount, formData.currency)}) es mayor al monto pendiente (${formatCurrency(remaining, debtCurrency)}).\n\n¿Deseas registrarlo de todas formas?`}
            onConfirm={handleConfirmSubmit}
            onCancel={() => setShowConfirm(false)}
          />
        </form>
      </div>
    </div>
  );
};

export default DebtPaymentForm;
