import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  loading = false,
}) => {
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loadingRef.current) {
        onCancelRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Mobile hardware back button support (popstate)
  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ modal: 'confirm' }, '');
    let isPopped = false;

    const handlePopState = () => {
      isPopped = true;
      onCancelRef.current();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!isPopped && window.history.state?.modal === 'confirm') {
        window.history.back();
      }
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const modalContent = (
    <div
      className="modal-backdrop"
      style={{ zIndex: 1000 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onCancel();
        }
      }}
    >
      <div
        className="soft-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '350px',
          width: '90%',
          textAlign: 'center',
          padding: '2rem',
          animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        }}
      >
        <h3
          style={{
            marginTop: 0,
            color: 'var(--expense-color)',
            fontSize: '1.25rem',
            fontWeight: 600,
          }}
        >
          {title}
        </h3>
        <p
          style={{
            color: 'var(--text-secondary)',
            marginBottom: '2rem',
            fontSize: '0.95rem',
          }}
        >
          {message}
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1,
              padding: '0.875rem',
              borderRadius: '12px',
              border: 'none',
              background: 'var(--surface-muted)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1,
              padding: '0.875rem',
              borderRadius: '12px',
              border: 'none',
              background: 'var(--expense-color)',
              color: 'white',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Procesando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ConfirmModal;
