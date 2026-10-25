import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { SavingDeposit, SavingDepositCreate, SavingDepositUpdate, CurrencyType, Category } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import { getCategories } from '../api';
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

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(err => console.error('Error fetching categories in SavingDepositForm:', err));
  }, []);

  const defaultCategory = initialData?.category || goalCategory || (isProject ? 'Proyectos' : 'Ahorro');

  const [formData, setFormData] = useState<SavingDepositCreate>({
    amount: (initialData ? initialData.amount : '') as any,
    currency: (initialData?.currency || goalCurrency) as CurrencyType,
    deposit_date: initialData?.deposit_date || new Date().toISOString().split('T')[0],
    note: initialData?.note || '',
    manual_rate: '' as any,
    register_as_expense: isProject,
    category: defaultCategory,
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        amount: initialData.amount,
        currency: initialData.currency,
        deposit_date: initialData.deposit_date,
        note: initialData.note || '',
        manual_rate: '' as any,
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
    const submitData: any = { ...formData };
    submitData.amount = Number(submitData.amount);
    if (submitData.manual_rate) {
      submitData.manual_rate = Number(submitData.manual_rate);
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
            {isEditing 
              ? (isProject ? `Editar Pago en "${goalName}"` : `Editar Aporte en "${goalName}"`)
              : (isProject ? `Registrar Pago en "${goalName}"` : `Abonar a "${goalName}"`)}
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
            <label>{isProject ? 'Nota / Concepto del pago (Opcional)' : 'Nota / Origen de los fondos (Opcional)'}</label>
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
