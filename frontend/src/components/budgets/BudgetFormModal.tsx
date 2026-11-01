import React, { useState, useEffect, useMemo } from 'react';
import { X, Star, Lock, Check, Users } from 'lucide-react';
import type {
  MonthlyBudgetResponse,
  SingleBudgetOut,
  CurrencyType,
  Connection,
} from '../../types';
import {
  createMonthlyBudget,
  updateMonthlyBudgetById,
  getConnections,
} from '../../api';
import { useToast } from '../ui/Toast';
import { ParticipantPicker } from '../panas/ParticipantPicker';
import { CURRENCY_OPTIONS } from './constants';

export interface BudgetFormModalProps {
  isOpen: boolean;
  monthYear: string;
  budgetToEdit: SingleBudgetOut | null;
  hasExistingBudgets?: boolean;
  availableCategories?: string[];
  renderCategoryIcon?: (name: string) => React.ReactNode;
  panas?: Array<{ partner_id: string; partner_name: string }>;
  connections?: Connection[];
  onClose: () => void;
  onSaved: (response: MonthlyBudgetResponse) => void;
}

export const BudgetFormModal: React.FC<BudgetFormModalProps> = ({
  isOpen,
  monthYear,
  budgetToEdit,
  hasExistingBudgets: _hasExistingBudgets = false,
  availableCategories = [],
  renderCategoryIcon,
  panas = [],
  connections,
  onClose,
  onSaved,
}) => {
  const toast = useToast();
  const isEdit = Boolean(budgetToEdit);
  const isPrimary = Boolean(budgetToEdit?.is_primary);

  const [name, setName] = useState<string>(budgetToEdit?.name || '');
  const [currency, setCurrency] = useState<CurrencyType>(budgetToEdit?.currency || 'USD_BCV');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    if (budgetToEdit) {
      return budgetToEdit.category_limits
        ? budgetToEdit.category_limits.map((cl) => cl.category_name)
        : [];
    }
    return availableCategories || [];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Panas sharing state
  const [sharedWithIds, setSharedWithIds] = useState<string[]>(() => {
    if (budgetToEdit?.shared_members) {
      return budgetToEdit.shared_members
        .filter((m) => m.user_id !== budgetToEdit.owner_id && !m.is_owner)
        .map((m) => m.user_id);
    }
    return [];
  });

  const [adminIds, setAdminIds] = useState<string[]>(() => {
    if (budgetToEdit?.shared_members) {
      return budgetToEdit.shared_members
        .filter((m) => m.user_id !== budgetToEdit.owner_id && !m.is_owner && m.role === 'admin')
        .map((m) => m.user_id);
    }
    return [];
  });

  const [internalConnections, setInternalConnections] = useState<Connection[]>([]);

  // Resolve connections from connections prop, panas prop, or fallback fetched connections
  const resolvedConnections = useMemo<Connection[]>(() => {
    if (connections && connections.length > 0) {
      return connections;
    }
    if (panas && panas.length > 0) {
      return panas.map((p) => ({
        id: p.partner_id,
        requester_id: '',
        receiver_id: '',
        status: 'accepted' as const,
        created_at: '',
        updated_at: '',
        partner_id: p.partner_id,
        partner_name: p.partner_name,
        is_requester: false,
      }));
    }
    return internalConnections;
  }, [connections, panas, internalConnections]);

  // Sync state whenever modal opens or budgetToEdit changes
  useEffect(() => {
    if (isOpen) {
      if (budgetToEdit) {
        setName(budgetToEdit.name || '');
        setCurrency(budgetToEdit.currency || 'USD_BCV');
        setSelectedCategories(
          budgetToEdit.category_limits
            ? budgetToEdit.category_limits.map((cl) => cl.category_name)
            : []
        );
        if (budgetToEdit.shared_members) {
          setSharedWithIds(
            budgetToEdit.shared_members
              .filter((m) => m.user_id !== budgetToEdit.owner_id && !m.is_owner)
              .map((m) => m.user_id)
          );
          setAdminIds(
            budgetToEdit.shared_members
              .filter((m) => m.user_id !== budgetToEdit.owner_id && !m.is_owner && m.role === 'admin')
              .map((m) => m.user_id)
          );
        } else {
          setSharedWithIds([]);
          setAdminIds([]);
        }
      } else {
        setName('');
        setCurrency('USD_BCV');
        setSelectedCategories(availableCategories || []);
        setSharedWithIds([]);
        setAdminIds([]);
      }
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, budgetToEdit, availableCategories]);

  // Fallback fetch if connections/panas props were not provided
  useEffect(() => {
    if (
      isOpen &&
      !isPrimary &&
      (!connections || connections.length === 0) &&
      (!panas || panas.length === 0)
    ) {
      getConnections()
        .then((conns) => {
          const accepted = (conns || []).filter((c) => c.status === 'accepted' && c.partner_id);
          setInternalConnections(accepted);
        })
        .catch((err) => console.error('Error fetching connections in BudgetFormModal:', err));
    }
  }, [isOpen, isPrimary, connections, panas]);

  if (!isOpen) return null;

  const allSelected =
    availableCategories.length > 0 &&
    availableCategories.every((cat) =>
      selectedCategories.some((sc) => sc.toLowerCase() === cat.toLowerCase())
    );

  const toggleCategory = (catName: string) => {
    if (isSubmitting) return;
    setSelectedCategories((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === catName.toLowerCase());
      if (exists) {
        return prev.filter((c) => c.toLowerCase() !== catName.toLowerCase());
      } else {
        return [...prev, catName];
      }
    });
  };

  const handleSelectAllCategories = () => {
    if (isSubmitting || availableCategories.length === 0) return;
    if (allSelected) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories([...availableCategories]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Ingresa un nombre para el presupuesto');
      toast.warning('Ingresa un nombre');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (isEdit && budgetToEdit) {
        const res = await updateMonthlyBudgetById(budgetToEdit.id, {
          name: name.trim(),
          currency,
          is_primary: isPrimary,
          categories: isPrimary ? undefined : selectedCategories,
          shared_with_ids: isPrimary ? undefined : sharedWithIds,
        });
        onSaved(res);
        onClose();
      } else {
        const res = await createMonthlyBudget(monthYear, {
          name: name.trim(),
          currency,
          is_primary: false,
          categories: selectedCategories,
          shared_with_ids: sharedWithIds,
        });
        onSaved(res);
        onClose();
      }
    } catch (error: any) {
      console.error('Error saving budget:', error);
      const detail =
        error?.response?.data?.detail || error?.message || 'Error al guardar el presupuesto';
      const msg = typeof detail === 'string' ? detail : 'Error al guardar el presupuesto';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-form-title"
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
          maxWidth: '450px',
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
              id="budget-form-title"
              style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}
            >
              {isEdit ? (isPrimary ? 'Editar Plan Maestro' : 'Editar Grupo') : 'Nuevo Grupo de Categorías'}
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
              {isPrimary
                ? 'Configura el nombre y moneda base de tu Plan Maestro'
                : 'Agrupa categorías que heredarán sus límites del Principal'}
            </p>
          </div>
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

        {/* Error message banner */}
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
          {/* Banner */}
          {isPrimary ? (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-xs, 8px)',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                marginBottom: '1rem',
                fontSize: '0.75rem',
                color: '#92400E',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Star size={15} fill="#F59E0B" color="#F59E0B" style={{ flexShrink: 0 }} />
              <div>
                <strong>Plan Maestro:</strong> Es el presupuesto principal y la fuente de verdad de todos los límites de categorías.
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-xs, 8px)',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                marginBottom: '1rem',
                fontSize: '0.75rem',
                color: '#065F46',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Lock size={15} style={{ flexShrink: 0 }} />
              <div>
                <strong>Límites heredados:</strong> Los montos de cada categoría se toman automáticamente del Presupuesto Principal.
              </div>
            </div>
          )}

          {/* Name */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {isPrimary ? 'Nombre del Presupuesto Principal' : 'Nombre del grupo'}
            </label>
            <input
              type="text"
              required
              disabled={isSubmitting}
              placeholder={isPrimary ? 'Plan Maestro' : 'Ej. Hogar, Salidas, Pareja'}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              style={{ width: '100%', marginTop: '0.35rem' }}
            />
          </div>

          {/* Currency */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Moneda base
            </label>
            <select
              value={currency}
              disabled={isSubmitting}
              onChange={(e) => setCurrency(e.target.value as CurrencyType)}
              style={{ width: '100%', marginTop: '0.35rem' }}
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category selection for Sub-Budgets */}
          {!isPrimary && (
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.4rem',
                }}
              >
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Categorías a incluir ({selectedCategories.length})
                  </label>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                    Solo los gastos de estas categorías se sumarán a este grupo
                  </div>
                </div>
                {availableCategories.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllCategories}
                    disabled={isSubmitting}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--income-color, #10B981)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                      transition: 'transform 150ms ease-out, opacity 150ms ease-out',
                    }}
                  >
                    {allSelected ? 'Limpiar' : 'Seleccionar todas'}
                  </button>
                )}
              </div>

              {/* Chips Container */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.4rem',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  padding: '0.5rem',
                  borderRadius: '10px',
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {availableCategories.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', padding: '0.5rem' }}>
                    No hay categorías registradas.
                  </div>
                ) : (
                  availableCategories.map((cat) => {
                    const isChecked = selectedCategories.some(
                      (sc) => sc.toLowerCase() === cat.toLowerCase()
                    );
                    return (
                      <button
                        key={cat}
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => toggleCategory(cat)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.35rem 0.65rem',
                          borderRadius: 'var(--radius-full)',
                          border: `1.5px solid ${isChecked ? 'var(--income-color, #10B981)' : 'var(--border-color)'}`,
                          background: isChecked ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface-color)',
                          color: isChecked ? 'var(--income-color, #10B981)' : 'var(--text-secondary)',
                          fontSize: '0.75rem',
                          fontWeight: isChecked ? 600 : 500,
                          cursor: isSubmitting ? 'not-allowed' : 'pointer',
                          transition: 'all 150ms ease-out',
                          userSelect: 'none',
                        }}
                      >
                        {renderCategoryIcon && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', transform: 'scale(0.85)' }}>
                            {renderCategoryIcon(cat)}
                          </span>
                        )}
                        <span>{cat}</span>
                        {isChecked && <Check size={12} strokeWidth={2.5} />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Panas sharing with ParticipantPicker */}
          {!isPrimary && (
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <div style={{ marginBottom: '0.4rem' }}>
                <label
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <Users size={14} style={{ color: 'var(--income-color, #10B981)' }} />
                  Compartir con Panas (Solo lectura) {sharedWithIds.length > 0 && `(${sharedWithIds.length})`}
                </label>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                  Tus panas podrán ver el progreso de las categorías de este grupo en modo solo lectura.
                </div>
              </div>

              <ParticipantPicker
                connections={resolvedConnections}
                selectedIds={sharedWithIds}
                adminIds={adminIds}
                onChange={(selected, admins) => {
                  setSharedWithIds(selected);
                  setAdminIds(admins);
                }}
                disabled={isSubmitting}
                accentColor="var(--tool-budgets, #6366F1)"
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn-cancel"
              disabled={isSubmitting}
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
              {isSubmitting
                ? 'Guardando...'
                : isEdit
                ? 'Guardar Cambios'
                : isPrimary
                ? 'Crear Plan Maestro'
                : 'Crear Grupo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BudgetFormModal;
