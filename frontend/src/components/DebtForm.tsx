import React, { useState, useEffect } from 'react';
import { Users, X, Wallet } from 'lucide-react';
import type { Debt, DebtCreate, DebtUpdate, Connection } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import { getConnections } from '../api';
import { ParticipantPicker } from './panas/ParticipantPicker';

interface DebtFormProps {
  initialData?: Debt;
  type: 'owed' | 'receivable';
  onSubmit: (data: DebtCreate | DebtUpdate) => void;
  onCancel: () => void;
  loading: boolean;
}

const DebtForm: React.FC<DebtFormProps> = ({ initialData, type, onSubmit, onCancel, loading }) => {
  const isEditing = !!initialData;
  const isSharedDebt = isEditing && !!initialData?.is_shared;

  const [connections, setConnections] = useState<Connection[]>([]);
  const [isSharedChecked, setIsSharedChecked] = useState(false);
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [adminPartnerIds, setAdminPartnerIds] = useState<string[]>([]);

  const [formData, setFormData] = useState<DebtCreate>({
    type,
    counterpart: '',
    concept: '',
    total_amount: '' as any,
    currency: 'USD_BCV',
    start_date: new Date().toISOString().split('T')[0],
    due_date: '',
    is_settled: false,
    notes: '',
    shared_with: null,
    shared_with_ids: [],
    admin_ids: []
  });

  useEffect(() => {
    if (!initialData?.is_shared) {
      // Load connections for sharing if debt is not already shared
      getConnections()
        .then(data => {
          const accepted = data.filter(c => c.status === 'accepted');
          setConnections(accepted);
        })
        .catch(err => console.error('Error fetching connections:', err));
    }

    if (initialData) {
      setFormData({
        ...initialData,
        due_date: initialData.due_date || '',
        notes: initialData.notes || '',
        shared_with: null
      });
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: any = { ...formData };
    submitData.total_amount = Number(submitData.total_amount);
    if (!submitData.due_date) submitData.due_date = null;
    if (isSharedChecked && selectedPartnerIds.length > 0) {
      submitData.shared_with_ids = selectedPartnerIds;
      submitData.admin_ids = adminPartnerIds;
      submitData.shared_with = selectedPartnerIds[0];
    } else {
      submitData.shared_with = null;
      submitData.shared_with_ids = [];
      submitData.admin_ids = [];
    }
    onSubmit(submitData);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem',
    background: 'var(--surface-color)',
    border: '1px solid var(--accent-light)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    marginTop: '0.25rem',
    boxSizing: 'border-box'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-secondary)'
  };

  const themeColor = type === 'owed' ? 'var(--expense-color)' : 'var(--income-color)';
  const themeBg = type === 'owed' ? 'var(--expense-bg)' : 'var(--income-bg)';

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="expense-form-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '480px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '1.35rem 1.4rem'
        }}
      >
        {/* Header con botón de cierre */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--accent-light)',
          paddingBottom: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: 'var(--radius-sm)',
              background: themeBg,
              color: themeColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Wallet size={18} />
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {isEditing 
                ? (type === 'owed' ? 'Editar Deuda Pendiente' : 'Editar Cuenta por Cobrar')
                : (type === 'owed' ? 'Nueva Deuda (Debo)' : 'Nueva Deuda (Me Deben)')}
            </h2>
          </div>
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
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isSharedDebt && (
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              color: '#3B82F6',
              padding: '0.75rem 0.9rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              border: '1px solid rgba(59, 130, 246, 0.2)'
            }}>
              <Users size={16} style={{ flexShrink: 0 }} />
              <span>
                Deuda compartida con <strong>{initialData.shared_partner_name}</strong>. El monto, concepto y contraparte están sincronizados y no se pueden modificar.
              </span>
            </div>
          )}

          <div>
            <label style={labelStyle}>
              {type === 'owed' ? '¿A quién le debes? *' : '¿Quién te debe? *'}
            </label>
            <input
              type="text"
              name="counterpart"
              required
              disabled={isSharedDebt}
              value={formData.counterpart}
              onChange={handleChange}
              style={{ ...inputStyle, ...(isSharedDebt ? { opacity: 0.65, cursor: 'not-allowed' } : {}) }}
              placeholder="Ej: Banco, María, Empresa XYZ..."
            />
          </div>

          <div>
            <label style={labelStyle}>Concepto *</label>
            <input
              type="text"
              name="concept"
              required
              disabled={isSharedDebt}
              value={formData.concept}
              onChange={handleChange}
              style={{ ...inputStyle, ...(isSharedDebt ? { opacity: 0.65, cursor: 'not-allowed' } : {}) }}
              placeholder="Ej: Préstamo personal, Compra de equipos..."
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Monto Total *</label>
              <input
                type="number"
                name="total_amount"
                required
                min="0.01"
                step="0.01"
                placeholder="0.00"
                disabled={isSharedDebt}
                value={formData.total_amount || ''}
                onChange={handleChange}
                style={{ ...inputStyle, ...(isSharedDebt ? { opacity: 0.65, cursor: 'not-allowed' } : {}) }}
              />
            </div>

            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Moneda *</label>
              <select
                name="currency"
                disabled={isSharedDebt}
                value={formData.currency}
                onChange={handleChange}
                style={{ ...inputStyle, ...(isSharedDebt ? { opacity: 0.65, cursor: 'not-allowed' } : {}) }}
              >
                {CURRENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {!isSharedDebt && (
            <div style={{
              background: 'var(--surface-muted)',
              padding: '0.875rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--accent-light)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  id="share_debt"
                  checked={isSharedChecked}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsSharedChecked(checked);
                    if (!checked) {
                      setSelectedPartnerIds([]);
                      setAdminPartnerIds([]);
                    }
                  }}
                  style={{ width: '18px', height: '18px', accentColor: themeColor, cursor: 'pointer' }}
                />
                <label htmlFor="share_debt" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Users size={16} /> Compartir con Panas (Grupos)
                </label>
              </div>

              {isSharedChecked && (
                <div style={{ marginTop: '0.75rem' }}>
                  <ParticipantPicker
                    connections={connections}
                    selectedIds={selectedPartnerIds}
                    adminIds={adminPartnerIds}
                    onChange={(s, a) => {
                      setSelectedPartnerIds(s);
                      setAdminPartnerIds(a);
                    }}
                    accentColor={themeColor}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.45rem', marginBottom: 0, lineHeight: 1.35 }}>
                    Todos los integrantes verán la deuda completa y sus abonos. Puedes asignar quién es Administrador o Miembro.
                  </p>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Fecha de Inicio *</label>
              <input
                type="date"
                name="start_date"
                required
                value={formData.start_date || ''}
                onChange={handleChange}
                style={inputStyle}
              />
            </div>

            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Fecha Límite (Opcional)</label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date || ''}
                onChange={handleChange}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notas Adicionales</label>
            <textarea
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Detalles sobre el pago, condiciones, etc."
            />
          </div>
          
          {isEditing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input
                type="checkbox"
                name="is_settled"
                id="is_settled"
                checked={formData.is_settled}
                onChange={(e) => setFormData(prev => ({ ...prev, is_settled: e.target.checked }))}
                style={{ width: '16px', height: '16px', accentColor: themeColor }}
              />
              <label htmlFor="is_settled" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                Marcar como liquidada (pagada)
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
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
                background: themeColor
              }}
            >
              {loading ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Crear Deuda')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DebtForm;
