import React, { useState, useEffect } from 'react';
import { X, Lock, RotateCcw } from 'lucide-react';
import type {
  MonthlyBudgetResponse,
  CurrencyType,
  BudgetCategorySummaryOut,
} from '../../types';
import { upsertCategoryLimitByBudgetId } from '../../api';
import { CURRENCY_OPTIONS, currencyLabels } from './constants';

export interface CategoryLimitModalProps {
  isOpen: boolean;
  categoryName: string;
  budgetId?: string;
  existingLimit: BudgetCategorySummaryOut | null;
  initialLimitAmount?: string;
  initialCurrency?: CurrencyType;
  onClose: () => void;
  onSaved: (response: MonthlyBudgetResponse) => void;
  onResetLimit?: () => void;
}

export const CategoryLimitModal: React.FC<CategoryLimitModalProps> = ({
  isOpen,
  categoryName,
  budgetId,
  existingLimit,
  initialLimitAmount,
  initialCurrency,
  onClose,
  onSaved,
  onResetLimit,
}) => {
  const [limitAmount, setLimitAmount] = useState<string>(() => {
    if (initialLimitAmount !== undefined) return initialLimitAmount;
    if (existingLimit && Number(existingLimit.limit_amount) > 0) {
      return String(existingLimit.limit_amount);
    }
    return '';
  });

  const [currency, setCurrency] = useState<CurrencyType>(() => {
    return initialCurrency || existingLimit?.currency || 'USD_BCV';
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialLimitAmount !== undefined) {
        setLimitAmount(initialLimitAmount);
      } else if (existingLimit && Number(existingLimit.limit_amount) > 0) {
        setLimitAmount(String(existingLimit.limit_amount));
      } else {
        setLimitAmount('');
      }
      setCurrency(initialCurrency || existingLimit?.currency || 'USD_BCV');
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, categoryName, existingLimit, initialLimitAmount, initialCurrency]);

  if (!isOpen) return null;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const sanitized = raw.replace(/[^0-9.,]/g, '');
    setLimitAmount(sanitized);
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetId) {
      setErrorMessage('Presupuesto no encontrado para asignar el límite.');
      return;
    }

    const cleanAmount = limitAmount.replace(',', '.').trim();
    const amountNum = parseFloat(cleanAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      setErrorMessage('Ingresa un monto límite válido mayor o igual a 0');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const updated = await upsertCategoryLimitByBudgetId(budgetId, {
        category_name: categoryName,
        limit_amount: amountNum,
        currency,
      });
      onSaved(updated);
      onClose();
    } catch (err: any) {
      console.error('Error saving category limit:', err);
      const detail =
        err?.response?.data?.detail || err?.message || 'Error al guardar límite de categoría';
      setErrorMessage(typeof detail === 'string' ? detail : 'Error al guardar límite');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasExistingLimit = existingLimit && Number(existingLimit.limit_amount) > 0;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-limit-title"
      style={{ zIndex: 1000 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        className="expense-form-container soft-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '420px',
          width: '90%',
          padding: '1.5rem',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h2
              id="category-limit-title"
              style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}
            >
              {hasExistingLimit ? 'Editar Límite Mensual' : 'Asignar Límite Mensual'}
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
              {categoryName} • Plan Maestro
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {hasExistingLimit && onResetLimit && (
              <button
                type="button"
                onClick={onResetLimit}
                disabled={isSubmitting}
                title="Restablecer límite a 0"
                aria-label="Restablecer límite a 0"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--surface-muted)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  color: 'var(--text-tertiary)',
                  transition: 'transform 150ms ease-out, background-color 150ms ease-out',
                }}
              >
                <RotateCcw size={15} />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Cerrar modal"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                color: 'var(--text-secondary)',
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 150ms ease-out, color 150ms ease-out',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Sync explanation callout */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem',
            borderRadius: 'var(--radius-xs, 8px)',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            marginBottom: '1rem',
            fontSize: '0.75rem',
            color: '#065F46',
          }}
        >
          <Lock size={15} style={{ flexShrink: 0 }} />
          <div>
            El límite se define en el <strong>Plan Maestro</strong> y se sincroniza automáticamente con todos los grupos que incluyan esta categoría.
          </div>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div
            className="error-message"
            role="alert"
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              borderRadius: 'var(--radius-xs, 8px)',
              fontSize: '0.85rem',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="expense-form">
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Categoría
            </label>
            <input
              type="text"
              value={categoryName}
              disabled
              style={{ width: '100%', marginTop: '0.35rem', opacity: 0.7 }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Moneda del límite
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyType)}
              disabled={isSubmitting}
              style={{ width: '100%', marginTop: '0.35rem' }}
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Monto límite ({currencyLabels[currency] || '$'})
            </label>
            <input
              type="text"
              inputMode="decimal"
              step="any"
              min="0"
              required
              placeholder="0.00"
              disabled={isSubmitting}
              value={limitAmount}
              onChange={handleAmountChange}
              style={{ width: '100%', marginTop: '0.35rem', fontSize: '1.1rem', fontWeight: 600 }}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-cancel"
              style={{
                transition: 'transform 150ms ease-out, background-color 150ms ease-out',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-submit"
              style={{
                transition: 'transform 150ms ease-out, background-color 150ms ease-out, box-shadow 150ms ease-out',
              }}
            >
              {isSubmitting ? 'Guardando...' : 'Guardar Límite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CategoryLimitModal;
