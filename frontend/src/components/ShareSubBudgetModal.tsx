import React, { useState, useEffect } from 'react';
import { X, Layers, Check, AlertCircle, PlusCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMonthlyBudget, updateMonthlyBudgetById } from '../api';
import type { SingleBudgetOut } from '../types';
import { EmptyState } from './ui/EmptyState';

export interface ShareSubBudgetModalProps {
  isOpen: boolean;
  partnerId: string;
  partnerName: string;
  onClose: () => void;
  onShared: () => void;
}

export const ShareSubBudgetModal: React.FC<ShareSubBudgetModalProps> = ({
  isOpen,
  partnerId,
  partnerName,
  onClose,
  onShared,
}) => {
  const navigate = useNavigate();
  const [subBudgets, setSubBudgets] = useState<SingleBudgetOut[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const fetchSubBudgets = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getMonthlyBudget(currentMonthStr);
      // Filter out primary and read-only sub-budgets to only allow user's own editable sub-budgets
      const available = (res.budgets || []).filter((b) => !b.is_primary && !b.is_read_only);
      setSubBudgets(available);

      // Select first available (not already shared) if any
      const firstAvailable = available.find(
        (b) => !b.shared_members?.some((m) => m.user_id === partnerId)
      );
      if (firstAvailable) {
        setSelectedBudgetId(firstAvailable.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al cargar los subpresupuestos del mes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedBudgetId(null);
      fetchSubBudgets();
    } else {
      setSubBudgets([]);
      setError(null);
    }
  }, [isOpen, partnerId]);

  if (!isOpen) return null;

  const handleShare = async () => {
    if (!selectedBudgetId) return;
    const selectedBudget = subBudgets.find((b) => b.id === selectedBudgetId);
    if (!selectedBudget) return;

    try {
      setSubmitting(true);
      setError(null);

      const existingPartnerIds = (selectedBudget.shared_members || [])
        .filter((m) => !m.is_owner && !m.is_me && m.user_id !== selectedBudget.owner_id)
        .map((m) => m.user_id);
      const sharedWithIds = Array.from(new Set([...existingPartnerIds, partnerId]));

      await updateMonthlyBudgetById(selectedBudget.id, {
        shared_with_ids: sharedWithIds,
      });

      onShared();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al compartir el subpresupuesto con tu pana');
    } finally {
      setSubmitting(false);
    }
  };

  const getCurrencySymbol = (curr?: string) => {
    if (curr === 'BS') return 'Bs';
    if (curr === 'EUR_BCV') return '€';
    return '$';
  };

  const selectedBudget = subBudgets.find((b) => b.id === selectedBudgetId);
  const selectedIsAlreadyShared = Boolean(
    selectedBudget?.shared_members?.some((m) => m.user_id === partnerId)
  );

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        zIndex: 1100,
      }}
    >
      <div
        className="expense-form-container soft-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '480px',
          width: '95%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.25rem',
          borderRadius: '20px',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            borderBottom: '1px solid var(--accent-light, rgba(0, 0, 0, 0.06))',
            paddingBottom: '0.85rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Compartir Subpresupuesto
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
              Selecciona un grupo para compartir con <strong>{partnerName}</strong> en modo solo lectura
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon"
            aria-label="Cerrar modal"
            style={{
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#EF4444',
              borderRadius: 'var(--radius-md, 12px)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
              fontSize: '0.85rem',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem', marginBottom: '1rem' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '160px' }}>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : subBudgets.length === 0 ? (
            <EmptyState
              icon={<Layers size={28} />}
              title="Sin subpresupuestos disponibles"
              description="Necesitas crear un subpresupuesto (grupo de gasto) en la sección de Presupuestos para poder compartirlo con tu pana."
              actionLabel="Ir a Presupuestos"
              actionIcon={<PlusCircle size={16} />}
              onAction={() => {
                onClose();
                navigate('/herramientas/presupuestos');
              }}
              compact
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {subBudgets.map((b) => {
                const isAlreadyShared = Boolean(
                  b.shared_members?.some((m) => m.user_id === partnerId)
                );
                const isSelected = selectedBudgetId === b.id;
                const currSymbol = getCurrencySymbol(b.currency);
                const limitAmount = b.effective_global_limit ?? b.manual_global_limit ?? 0;
                const catCount = b.categories_count ?? b.category_limits?.length ?? 0;

                return (
                  <div
                    key={b.id}
                    onClick={() => {
                      if (!isAlreadyShared) {
                        setSelectedBudgetId(b.id);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1rem',
                      borderRadius: '14px',
                      border: isSelected
                        ? '2px solid var(--primary-color, #6366F1)'
                        : '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
                      background: isSelected
                        ? 'rgba(99, 102, 241, 0.05)'
                        : isAlreadyShared
                        ? 'var(--surface-muted, rgba(0, 0, 0, 0.02))'
                        : 'var(--surface-color, #FFFFFF)',
                      cursor: isAlreadyShared ? 'not-allowed' : 'pointer',
                      opacity: isAlreadyShared ? 0.65 : 1,
                      transition: 'transform 150ms ease-out, border-color 150ms ease-out, background 150ms ease-out',
                    }}
                    onMouseDown={(e) => {
                      if (!isAlreadyShared) {
                        e.currentTarget.style.transform = 'scale(0.98)';
                      }
                    }}
                    onMouseUp={(e) => {
                      if (!isAlreadyShared) {
                        e.currentTarget.style.transform = 'scale(1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isAlreadyShared) {
                        e.currentTarget.style.transform = 'scale(1)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          background: isSelected
                            ? 'rgba(99, 102, 241, 0.15)'
                            : 'var(--surface-muted, rgba(0, 0, 0, 0.04))',
                          color: isSelected ? 'var(--primary-color, #6366F1)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Layers size={18} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: '0.9rem',
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {b.name}
                          </span>
                          {isAlreadyShared && (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '9999px',
                                background: 'rgba(16, 185, 129, 0.12)',
                                color: '#10B981',
                                fontWeight: 600,
                              }}
                            >
                              Ya compartido
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-tertiary)',
                            marginTop: '0.15rem',
                          }}
                        >
                          {catCount} {catCount === 1 ? 'categoría' : 'categorías'} • Límite:{' '}
                          <strong style={{ color: 'var(--text-secondary)' }}>
                            {limitAmount > 0 ? `${limitAmount.toFixed(2)} ${currSymbol}` : 'Sin tope'}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div style={{ flexShrink: 0, marginLeft: '0.5rem' }}>
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: isSelected
                            ? '2px solid var(--primary-color, #6366F1)'
                            : '2px solid var(--text-tertiary, #94A3B8)',
                          background: isSelected ? 'var(--primary-color, #6366F1)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 150ms ease-out',
                        }}
                      >
                        {isSelected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            borderTop: '1px solid var(--accent-light, rgba(0, 0, 0, 0.06))',
            paddingTop: '0.85rem',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn-cancel"
            disabled={submitting}
            style={{
              padding: '0.55rem 1rem',
              borderRadius: 'var(--radius-md, 12px)',
              border: '1px solid var(--accent-light, rgba(0, 0, 0, 0.1))',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={!selectedBudgetId || submitting || selectedIsAlreadyShared}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: 'var(--radius-md, 12px)',
              border: 'none',
              background:
                !selectedBudgetId || selectedIsAlreadyShared
                  ? 'var(--surface-muted, #94A3B8)'
                  : 'var(--primary-color, #6366F1)',
              color: '#FFFFFF',
              cursor: !selectedBudgetId || submitting || selectedIsAlreadyShared ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow:
                !selectedBudgetId || selectedIsAlreadyShared
                  ? 'none'
                  : '0 4px 14px rgba(99, 102, 241, 0.35)',
              transition: 'transform 150ms ease-out, box-shadow 150ms ease-out',
            }}
            onMouseDown={(e) => {
              if (selectedBudgetId && !submitting && !selectedIsAlreadyShared) {
                e.currentTarget.style.transform = 'scale(0.96)';
              }
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {submitting ? 'Compartiendo...' : `Compartir con ${partnerName}`}
          </button>
        </div>
      </div>
    </div>
  );
};
