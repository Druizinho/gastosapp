import React, { useState, useEffect } from 'react';
import { Tag, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { CategorySelect } from '../CategorySelect';
import { updateEntityLocalCategory } from '../../api';

export interface LocalCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  entityTitle: string;
  currentCategory?: string | null;
  onCategoryUpdated?: (newCategory: string) => void;
}

export const LocalCategoryModal: React.FC<LocalCategoryModalProps> = ({
  isOpen,
  onClose,
  entityId,
  entityTitle,
  currentCategory,
  onCategoryUpdated,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>(currentCategory || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedCategory(currentCategory || '');
      setError(null);
      setLoading(false);
    }
  }, [isOpen, currentCategory]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, loading]);

  if (!isOpen) return null;

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = selectedCategory.trim();
    if (!trimmed) {
      setError('Por favor selecciona o escribe una categoría');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await updateEntityLocalCategory(entityId, trimmed);
      if (onCategoryUpdated) {
        onCategoryUpdated(res.local_category || trimmed);
      }
      onClose();
    } catch (err: any) {
      console.error('Error updating local category:', err);
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'No se pudo actualizar la categoría personal. Intenta nuevamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        zIndex: 1050,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-category-title"
    >
      <div
        className="expense-form-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--accent-light)',
          background: 'var(--surface-color)',
          transform: 'scale(1)',
          transition: 'transform var(--transition-base)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(99, 102, 241, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4F46E5',
                flexShrink: 0,
              }}
            >
              <Tag size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3
                id="local-category-title"
                style={{
                  margin: 0,
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                }}
              >
                Personalizar mi categoría
              </h3>
              <p
                style={{
                  margin: '0.2rem 0 0 0',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '300px',
                }}
                title={entityTitle}
              >
                {entityTitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Cerrar"
            style={{
              background: 'var(--surface-muted)',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: '0.45rem',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'var(--transition-fast)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSave} style={{ margin: 0 }}>
          <div
            style={{
              padding: '1.25rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.45,
              }}
            >
              Ajusta la categoría en la que se registrarán tus abonos personales para{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{entityTitle}</strong>. Esto no
              afectará a los demás participantes.
            </p>

            {error && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#DC2626',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div>
              <CategorySelect
                value={selectedCategory}
                onChange={(cat) => {
                  setSelectedCategory(cat);
                  if (error) setError(null);
                }}
                allowEmpty={false}
                disabled={loading}
                label="Categoría para mis registros"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div
            style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              background: 'var(--surface-color)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border-color)',
                background: 'var(--surface-color)',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'var(--transition-fast)',
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading || !selectedCategory.trim()}
              style={{
                padding: '0.55rem 1.25rem',
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                background: 'var(--accent-color)',
                color: 'var(--text-inverse)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: loading || !selectedCategory.trim() ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                opacity: loading || !selectedCategory.trim() ? 0.6 : 1,
                transition: 'all var(--transition-fast)',
                transform: 'scale(1)',
                boxShadow: 'var(--shadow-sm)',
              }}
              onMouseDown={(e) => {
                if (!loading && selectedCategory.trim()) {
                  e.currentTarget.style.transform = 'scale(0.97)';
                }
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check size={15} />
                  <span>Guardar categoría</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LocalCategoryModal;
