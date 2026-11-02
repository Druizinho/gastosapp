import React, { useState, useEffect, useContext } from 'react';
import { Users } from 'lucide-react';
import type { Debt, DebtCreate, DebtUpdate, Connection } from '../../types';
import { CURRENCY_OPTIONS } from '../../types';
import { getConnections } from '../../api';
import { ParticipantPicker } from '../panas/ParticipantPicker';
import { CategorySelect } from '../common';
import { SegmentedTabs, type TabItem } from '../ui/SegmentedTabs';
import { ToastContext } from '../ui/Toast';

const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface DebtFormProps {
  initialData?: Debt;
  type: 'owed' | 'receivable';
  onSubmit: (data: DebtCreate | DebtUpdate) => void | Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

const typeTabs: TabItem<'owed' | 'receivable'>[] = [
  { id: 'owed', label: 'Debo', shortLabel: 'Debo' },
  { id: 'receivable', label: 'Me deben', shortLabel: 'Me deben' },
];

const DebtForm: React.FC<DebtFormProps> = ({ initialData, type, onSubmit, onCancel, loading }) => {
  const isEditing = !!initialData;
  const isSharedDebt = isEditing && !!initialData?.is_shared;
  const isReadOnlyMember = isSharedDebt && initialData?.my_role === 'member';

  const toast = useContext(ToastContext);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState<string>(() =>
    initialData?.total_amount != null ? String(initialData.total_amount) : ''
  );

  const [connections, setConnections] = useState<Connection[]>([]);
  const [isSharedChecked, setIsSharedChecked] = useState(() => Boolean(initialData?.is_shared));
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>(() =>
    (initialData?.shared_members || []).filter(m => (m as any).role !== 'owner' && !m.is_owner).map(m => String(m.user_id))
  );
  const [adminPartnerIds, setAdminPartnerIds] = useState<string[]>(() =>
    (initialData?.shared_members || []).filter(m => m.role === 'admin').map(m => String(m.user_id))
  );

  const [formData, setFormData] = useState<DebtCreate>({
    type,
    counterpart: '',
    concept: '',
    category: initialData?.category ?? (!initialData ? 'Deudas' : ''),
    total_amount: '' as any,
    currency: 'USD_BCV',
    start_date: getLocalToday(),
    due_date: '',
    is_settled: false,
    notes: '',
    shared_with: null,
    shared_with_ids: [],
    admin_ids: []
  });

  useEffect(() => {
    if (!isReadOnlyMember) {
      (getConnections as any)(true)
        .then((data: Connection[]) => {
          const accepted = data.filter(c => c.status === 'accepted');
          setConnections(accepted);
        })
        .catch((err: any) => console.error('Error fetching connections:', err));
    }

    if (initialData) {
      setFormData({
        ...initialData,
        category: initialData.category || '',
        due_date: initialData.due_date || '',
        notes: initialData.notes || '',
        shared_with: null
      });
      setTotalAmount(initialData.total_amount != null ? String(initialData.total_amount) : '');
      setIsSharedChecked(Boolean(initialData.is_shared));
      setSelectedPartnerIds(
        (initialData.shared_members || []).filter(m => (m as any).role !== 'owner' && !m.is_owner).map(m => String(m.user_id))
      );
      setAdminPartnerIds(
        (initialData.shared_members || []).filter(m => m.role === 'admin').map(m => String(m.user_id))
      );
    }
  }, [initialData, isReadOnlyMember]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSubmitError(null);

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const parsedAmount = parseFloat(totalAmount.replace(',', '.'));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      const msg = 'El monto total debe ser un número válido mayor a 0';
      setSubmitError(msg);
      toast?.showToast(msg, 'error');
      return;
    }

    const submitData: any = { ...formData };
    submitData.total_amount = parsedAmount;
    submitData.category = submitData.category || 'Sin Categoría';
    if (!submitData.due_date) submitData.due_date = null;
    if (!isReadOnlyMember) {
      if (isSharedChecked) {
        submitData.shared_with_ids = selectedPartnerIds;
        submitData.admin_ids = adminPartnerIds;
        submitData.shared_with = selectedPartnerIds.length > 0 ? selectedPartnerIds[0] : null;
      } else if (initialData?.is_shared && !isSharedChecked) {
        submitData.shared_with_ids = [];
        submitData.admin_ids = [];
        submitData.shared_with = null;
      } else {
        submitData.shared_with = null;
        submitData.shared_with_ids = [];
        submitData.admin_ids = [];
      }
    }

    try {
      await onSubmit(submitData);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Error al guardar la deuda';
      const msg = typeof detail === 'string' ? detail : 'Error al guardar la deuda';
      setSubmitError(msg);
      toast?.showToast(msg, 'error');
    }
  };

  const currentType = formData.type || type;
  const themeColor = currentType === 'owed' ? 'var(--expense-color)' : 'var(--income-color)';

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="expense-form-container"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>
          {isEditing 
            ? (currentType === 'owed' ? 'Editar Deuda Pendiente' : 'Editar Cuenta por Cobrar')
            : (currentType === 'owed' ? 'Nueva Deuda (Debo)' : 'Nueva Cuenta (Me Deben)')}
        </h2>

        {!isEditing && (
          <div style={{ marginBottom: '1.25rem' }}>
            <SegmentedTabs<'owed' | 'receivable'>
              tabs={typeTabs}
              activeTab={currentType}
              onChange={(tabId) => setFormData(prev => ({ ...prev, type: tabId }))}
              activeColor={themeColor}
            />
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {submitError && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                borderRadius: '8px',
                fontSize: '0.85rem',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              {submitError}
            </div>
          )}

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
              border: '1px solid rgba(59, 130, 246, 0.2)',
              marginBottom: '1rem'
            }}>
              <Users size={16} style={{ flexShrink: 0 }} />
              <span>
                {isReadOnlyMember
                  ? `Deuda compartida con ${initialData.shared_partner_name}. Solo los administradores pueden modificar los datos de la deuda.`
                  : `Deuda compartida con ${initialData.shared_partner_name}. Tus cambios se sincronizarán con todos los miembros del grupo.`}
              </span>
            </div>
          )}

          <div className="form-group">
            <label>
              {currentType === 'owed' ? '¿A quién le debes? (Acreedor) *' : '¿Quién te debe? (Deudor) *'}
            </label>
            <input
              type="text"
              name="counterpart"
              required
              disabled={isReadOnlyMember}
              value={formData.counterpart}
              onChange={handleChange}
              placeholder="Ej: Banco, María, Empresa XYZ..."
            />
          </div>

          <div className="form-group">
            <label>Concepto *</label>
            <input
              type="text"
              name="concept"
              required
              disabled={isReadOnlyMember}
              value={formData.concept}
              onChange={handleChange}
              placeholder="Ej: Préstamo personal, Compra de equipos..."
            />
          </div>

          <div className="form-group">
            <CategorySelect
              label="Categoría"
              value={formData.category || ''}
              onChange={(newCat) => setFormData(prev => ({ ...prev, category: newCat }))}
              disabled={isReadOnlyMember}
              allowEmpty={true}
              emptyLabel="Sin Categoría"
            />
          </div>

          <div className="form-group row">
            <div className="form-group half">
              <label>Monto Total *</label>
              <input
                type="text"
                inputMode="decimal"
                name="total_amount"
                required
                placeholder="0.00"
                disabled={isReadOnlyMember}
                value={totalAmount}
                onChange={(e) => {
                  setSubmitError(null);
                  setTotalAmount(e.target.value.replace(/[^0-9.,]/g, ''));
                }}
              />
            </div>

            <div className="form-group half">
              <label>Moneda *</label>
              <select
                name="currency"
                disabled={isReadOnlyMember}
                value={formData.currency}
                onChange={handleChange}
              >
                {CURRENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {!isReadOnlyMember && (
            <div className="form-group" style={{
              background: 'var(--surface-muted, rgba(0,0,0,0.03))',
              padding: '0.875rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color, rgba(0,0,0,0.08))'
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
                <label htmlFor="share_debt" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                  <Users size={16} style={{ color: themeColor }} /> Compartir con Panas
                </label>
              </div>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 1.65rem', lineHeight: 1.35 }}>
                Sincroniza el progreso y los movimientos en tiempo real con los participantes que elijas.
              </p>

              {isSharedChecked && (
                <div className="form-collapse-reveal" style={{ marginTop: '0.75rem' }}>
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
                </div>
              )}
            </div>
          )}

          <div className="form-group row">
            <div className="form-group half">
              <label>Fecha de Inicio *</label>
              <input
                type="date"
                name="start_date"
                required
                value={formData.start_date || ''}
                onChange={handleChange}
              />
            </div>

            <div className="form-group half">
              <label>Fecha Límite (Opcional)</label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date || ''}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Notas Adicionales</label>
            <textarea
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
              rows={2}
              placeholder="Detalles sobre el pago, condiciones, etc."
            />
          </div>
          
          {isEditing && (
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                name="is_settled"
                id="is_settled"
                checked={formData.is_settled}
                onChange={(e) => setFormData(prev => ({ ...prev, is_settled: e.target.checked }))}
                style={{ width: '16px', height: '16px', accentColor: themeColor }}
              />
              <label htmlFor="is_settled" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer', margin: 0 }}>
                Marcar como liquidada (pagada)
              </label>
            </div>
          )}

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
