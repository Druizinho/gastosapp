import React, { useState, useEffect } from 'react';
import { Users, X, Wallet } from 'lucide-react';
import type { Debt, DebtCreate, DebtUpdate, Connection } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import { getConnections } from '../api';
import { ParticipantPicker } from './panas/ParticipantPicker';
import CategorySelect from './CategorySelect';

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
  const isReadOnlyMember = isSharedDebt && initialData?.my_role === 'member';

  const [connections, setConnections] = useState<Connection[]>([]);
  const [isSharedChecked, setIsSharedChecked] = useState(false);
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [adminPartnerIds, setAdminPartnerIds] = useState<string[]>([]);

  const [formData, setFormData] = useState<DebtCreate>({
    type,
    counterpart: '',
    concept: '',
    category: initialData?.category || '',
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
        category: initialData.category || '',
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
    submitData.category = submitData.category || 'Sin Categoría';
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

  const currentType = formData.type || type;
  const themeColor = currentType === 'owed' ? 'var(--expense-color)' : 'var(--income-color)';
  const themeBg = currentType === 'owed' ? 'var(--expense-bg)' : 'var(--income-bg)';

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
                ? (currentType === 'owed' ? 'Editar Deuda Pendiente' : 'Editar Cuenta por Cobrar')
                : (currentType === 'owed' ? 'Nueva Deuda (Debo)' : 'Nueva Cuenta (Me Deben)')}
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

        {!isEditing && (
          <div style={{
            display: 'flex',
            background: 'var(--surface-muted, rgba(255,255,255,0.06))',
            padding: '0.25rem',
            borderRadius: 'var(--radius-md)',
            gap: '0.35rem',
            marginBottom: '1rem'
          }}>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: 'owed' }))}
              style={{
                flex: 1,
                padding: '0.55rem',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: currentType === 'owed' ? 'var(--expense-color)' : 'transparent',
                color: currentType === 'owed' ? '#fff' : 'var(--text-secondary)',
                fontWeight: currentType === 'owed' ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Debo dinero
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: 'receivable' }))}
              style={{
                flex: 1,
                padding: '0.55rem',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: currentType === 'receivable' ? 'var(--income-color)' : 'transparent',
                color: currentType === 'receivable' ? '#fff' : 'var(--text-secondary)',
                fontWeight: currentType === 'receivable' ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Me deben dinero
            </button>
          </div>
        )}

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
                {isReadOnlyMember
                  ? `Deuda compartida con ${initialData.shared_partner_name}. Solo los administradores pueden modificar los datos de la deuda.`
                  : `Deuda compartida con ${initialData.shared_partner_name}. Tus cambios se sincronizarán con todos los miembros del grupo.`}
              </span>
            </div>
          )}

          <div>
            <label style={labelStyle}>
              {currentType === 'owed' ? '¿A quién le debes? (Acreedor) *' : '¿Quién te debe? (Deudor) *'}
            </label>
            <input
              type="text"
              name="counterpart"
              required
              disabled={isReadOnlyMember}
              value={formData.counterpart}
              onChange={handleChange}
              style={{ ...inputStyle, ...(isReadOnlyMember ? { opacity: 0.65, cursor: 'not-allowed' } : {}) }}
              placeholder="Ej: Banco, María, Empresa XYZ..."
            />
          </div>

          <div>
            <label style={labelStyle}>Concepto *</label>
            <input
              type="text"
              name="concept"
              required
              disabled={isReadOnlyMember}
              value={formData.concept}
              onChange={handleChange}
              style={{ ...inputStyle, ...(isReadOnlyMember ? { opacity: 0.65, cursor: 'not-allowed' } : {}) }}
              placeholder="Ej: Préstamo personal, Compra de equipos..."
            />
          </div>

          <div>
            <CategorySelect
              label="Categoría"
              value={formData.category || ''}
              onChange={(newCat) => setFormData(prev => ({ ...prev, category: newCat }))}
              disabled={isReadOnlyMember}
              allowEmpty={true}
              emptyLabel="Sin Categoría"
            />
          </div>

          <div className="form-group row" style={{ gap: '0.75rem' }}>
            <div className="form-group half" style={{ flex: 1 }}>
              <label style={labelStyle}>Monto Total *</label>
              <input
                type="number"
                name="total_amount"
                required
                min="0.01"
                step="0.01"
                placeholder="0.00"
                disabled={isReadOnlyMember}
                value={formData.total_amount || ''}
                onChange={handleChange}
                style={{ ...inputStyle, ...(isReadOnlyMember ? { opacity: 0.65, cursor: 'not-allowed' } : {}) }}
              />
            </div>

            <div className="form-group half" style={{ flex: 1 }}>
              <label style={labelStyle}>Moneda *</label>
              <select
                name="currency"
                disabled={isReadOnlyMember}
                value={formData.currency}
                onChange={handleChange}
                style={{ ...inputStyle, ...(isReadOnlyMember ? { opacity: 0.65, cursor: 'not-allowed' } : {}) }}
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

          <div className="form-group row" style={{ gap: '0.75rem' }}>
            <div className="form-group half" style={{ flex: 1 }}>
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

            <div className="form-group half" style={{ flex: 1 }}>
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
