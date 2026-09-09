import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" style={{ zIndex: 1000 }}>
      <div className="soft-card" style={{ maxWidth: '350px', width: '90%', textAlign: 'center', padding: '2rem', animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards' }}>
        <h3 style={{ marginTop: 0, color: 'var(--expense-color)', fontSize: '1.25rem', fontWeight: 600 }}>{title}</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.95rem' }}>{message}</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button 
            onClick={onCancel} 
            style={{ flex: 1, padding: '0.875rem', borderRadius: '12px', border: 'none', background: 'var(--surface-muted)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button 
            onClick={onConfirm} 
            style={{ flex: 1, padding: '0.875rem', borderRadius: '12px', border: 'none', background: 'var(--expense-color)', color: 'white', fontWeight: 600, cursor: 'pointer' }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
