import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import type { DebtPayment, DebtPaymentCreate, DebtPaymentUpdate } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import ConfirmModal from './ConfirmModal';
import CategorySelect from './CategorySelect';

interface DebtPaymentFormProps {
  initialData?: DebtPayment;
  debtConcept?: string;
  debtCategory?: string | null;
  type: 'owed' | 'receivable';
  debtCurrency: string;
  debtTotalAmount: number;
  debtPaidAmount: number;
  onSubmit: (data: DebtPaymentCreate | DebtPaymentUpdate) => void;
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

  const initialRegExpense = initialData
    ? Boolean(initialData.create_expense || initialData.expense_id)
    : type === 'owed';
  const initialCategory = initialData?.category || debtCategory || '';

  const [formData, setFormData] = useState<DebtPaymentCreate & { register_as_expense?: boolean; category?: string }>({
    amount: (initialData ? initialData.amount : '') as any,
    currency: (initialData?.currency || debtCurrency) as any,
    payment_date: initialData?.payment_date || new Date().toISOString().split('T')[0],
    note: initialData?.note || '',
    register_as_expense: initialRegExpense,
    category: initialCategory,
  });
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        amount: initialData.amount,
        currency: initialData.currency,
        payment_date: initialData.payment_date,
        note: initialData.note || '',
        register_as_expense: Boolean(initialData.create_expense || initialData.expense_id),
        category: initialData.category || debtCategory || '',
      });
    }
  }, [initialData, debtCategory]);

  // Check if user is paying in the same currency as the debt
  const isSameCurrency = formData.currency === debtCurrency;
  const currentAmount = Number(formData.amount) || 0;
  const isOverpaying = !isEditing && isSameCurrency && currentAmount > remaining && remaining > 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: any = { ...formData };
    submitData.amount = Number(submitData.amount);
    submitData.category = submitData.register_as_expense ? (submitData.category || debtCategory || 'Sin Categoría') : null;
    
    if (!isEditing && isSameCurrency && submitData.amount > remaining) {
      setShowConfirm(true);
      return;
    }
    
    onSubmit(submitData);
  };

  const handleConfirmSubmit = () => {
    setShowConfirm(false);
    const submitData: any = { ...formData };
    submitData.amount = Number(submitData.amount);
    submitData.category = submitData.register_as_expense ? (submitData.category || debtCategory || 'Sin Categoría') : null;
    onSubmit(submitData);
  };

  const themeColor = type === 'owed' ? 'var(--expense-color)' : 'var(--income-color)';

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="expense-form-container"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{isEditing ? 'Editar Abono' : 'Registrar Abono'}</h2>
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

          <div className="form-group row">
            <div className="form-group half">
              <label>Monto a Abonar *</label>
              <input
                type="number"
                name="amount"
                required
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={formData.amount || ''}
                onChange={handleChange}
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

          <div className="form-group">
            <label>Fecha del Pago *</label>
            <input
              type="date"
              name="payment_date"
              required
              value={formData.payment_date || ''}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Nota Adicional (Opcional)</label>
            <input
              type="text"
              name="note"
              value={formData.note || ''}
              onChange={handleChange}
              placeholder="Ej: Transferencia Mercantil, Zelle de Pedro..."
            />
          </div>

          {type === 'owed' && (
            <div className="form-group" style={{
              background: 'var(--surface-muted, rgba(0,0,0,0.03))',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  id="register_as_expense"
                  name="register_as_expense"
                  checked={Boolean(formData.register_as_expense)}
                  onChange={handleChange}
                  style={{ width: '18px', height: '18px', accentColor: themeColor, cursor: 'pointer' }}
                />
                <label htmlFor="register_as_expense" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none', margin: 0 }}>
                  Registrar como gasto del mes
                </label>
              </div>

              {Boolean(formData.register_as_expense) && (
                <div style={{ paddingTop: '0.75rem' }}>
                  <CategorySelect
                    label="Categoría del gasto"
                    value={formData.category || debtCategory || ''}
                    onChange={(newCat) => setFormData(prev => ({ ...prev, category: newCat }))}
                    allowEmpty={true}
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
                background: 'var(--income-color)'
              }}
            >
              {loading ? 'Procesando...' : (isEditing ? 'Guardar Cambios' : 'Registrar Abono')}
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
