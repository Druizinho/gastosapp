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
      <div className="expense-form-container glass-panel" style={{ maxWidth: '350px', width: '100%', textAlign: 'center' }}>
        <h3 style={{ marginTop: 0, color: '#f87171' }}>{title}</h3>
        <p style={{ color: '#cbd5e1', marginBottom: '2rem', fontSize: '0.95rem' }}>{message}</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button onClick={onCancel} className="btn-cancel" style={{ flex: 1 }}>Cancelar</button>
          <button onClick={onConfirm} className="btn-submit" style={{ flex: 1, backgroundColor: '#ef4444' }}>Confirmar</button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
