import React, { useState, useEffect, useContext } from 'react';
import {
  Users,
  PiggyBank,
  FolderKanban,
  Info
} from 'lucide-react';
import type { SavingGoal, SavingGoalCreate, SavingGoalUpdate, Connection, Category, ExchangeRates, CurrencyType } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import { getConnections, getCategories, getRates } from '../api';
import { ParticipantPicker } from './panas/ParticipantPicker';
import CategorySelect from './CategorySelect';
import { SegmentedTabs } from './ui/SegmentedTabs';
import { resolveCategoryVisuals } from '../utils/categoryVisuals';
import { formatRateForInput } from '../utils/currencyFormat';
import { ExchangeRateField } from './ExchangeRateField';
import { ToastContext } from './ui/Toast';

interface SavingGoalFormProps {
  initialData?: SavingGoal;
  onSubmit: (data: SavingGoalCreate | SavingGoalUpdate) => void | Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

export const SavingGoalForm: React.FC<SavingGoalFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  loading,
}) => {
  const isEditing = !!initialData;
  const isReadOnlyMember = Boolean(initialData?.is_shared && initialData?.my_role === 'member');
  const [goalType, setGoalType] = useState<'saving' | 'project'>(initialData?.type || 'saving');

  const toast = useContext(ToastContext);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [targetAmount, setTargetAmount] = useState<string>(() =>
    initialData?.target_amount != null ? String(initialData.target_amount) : ''
  );
  const [manualRate, setManualRate] = useState<string>('');

  // Categories & Panas connections
  const [categories, setCategories] = useState<Category[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isSharedChecked, setIsSharedChecked] = useState(() => Boolean(initialData?.is_shared));
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>(() =>
    (initialData?.shared_members || []).filter(m => (m as any).role !== 'owner' && !m.is_owner).map(m => String(m.user_id))
  );
  const [adminPartnerIds, setAdminPartnerIds] = useState<string[]>(() =>
    (initialData?.shared_members || []).filter(m => m.role === 'admin').map(m => String(m.user_id))
  );

  const initialCategory = initialData?.category || (initialData?.type === 'project' ? 'Proyectos' : 'Ahorro');

  const [formData, setFormData] = useState<SavingGoalCreate & { is_active?: boolean }>({
    name: '',
    type: 'saving',
    target_amount: '' as any,
    currency: 'USD_BCV',
    target_date: '',
    category: initialCategory,
    color: '#10B981',
    icon: 'piggy-bank',
    notes: '',
    manual_rate: '' as any,
    is_active: true,
  });

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch((err) => console.error('Error fetching categories:', err));

    getRates()
      .then(setRates)
      .catch((err) => console.error('Error fetching rates in SavingGoalForm:', err));

    if (!isReadOnlyMember) {
      (getConnections as any)(true)
        .then((data: Connection[]) => {
          const accepted = data.filter(c => c.status === 'accepted');
          setConnections(accepted);
        })
        .catch((err: any) => console.error('Error fetching connections:', err));
    }
  }, [isReadOnlyMember]);

  useEffect(() => {
    if (initialData) {
      setGoalType(initialData.type || 'saving');
      setTargetAmount(initialData.target_amount != null ? String(initialData.target_amount) : '');
      setFormData({
        name: initialData.name,
        type: initialData.type || 'saving',
        target_amount: initialData.target_amount ?? ('' as any),
        currency: initialData.currency,
        target_date: initialData.target_date || '',
        category: initialData.category || (initialData.type === 'project' ? 'Proyectos' : 'Ahorro'),
        color: initialData.color || (initialData.type === 'project' ? '#3B82F6' : '#10B981'),
        icon: initialData.icon || (initialData.type === 'project' ? 'wrench' : 'piggy-bank'),
        notes: initialData.notes || '',
        is_active: initialData.is_active,
        manual_rate: '' as any,
      });
      setIsSharedChecked(Boolean(initialData.is_shared));
      setSelectedPartnerIds(
        (initialData.shared_members || []).filter(m => (m as any).role !== 'owner' && !m.is_owner).map(m => String(m.user_id))
      );
      setAdminPartnerIds(
        (initialData.shared_members || []).filter(m => m.role === 'admin').map(m => String(m.user_id))
      );

      if (initialData.currency === 'EUR_BCV' && initialData.rate_eur_bs) {
        setManualRate(formatRateForInput(initialData.rate_eur_bs));
      } else if (initialData.currency === 'USDT' && initialData.rate_usdt_bs) {
        setManualRate(formatRateForInput(initialData.rate_usdt_bs));
      } else if ((initialData.currency === 'USD_BCV' || initialData.currency === 'BS') && initialData.rate_usd_bs) {
        setManualRate(formatRateForInput(initialData.rate_usd_bs));
      } else {
        setManualRate('');
      }
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setSubmitError(null);

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const submitData: any = { ...formData };
    submitData.type = goalType;

    const targetStr = targetAmount.trim();
    if (targetStr !== '') {
      const parsed = parseFloat(targetStr.replace(',', '.'));
      if (isNaN(parsed) || parsed < 0) {
        const msg = 'El monto objetivo debe ser un número válido';
        setSubmitError(msg);
        toast?.showToast(msg, 'error');
        return;
      }
      submitData.target_amount = parsed;
    } else {
      submitData.target_amount = null;
    }

    if (!submitData.target_date) submitData.target_date = null;

    const finalCategory = formData.category || (goalType === 'project' ? 'Proyectos' : 'Ahorro');
    submitData.category = finalCategory;

    const matchedCategory = categories.find(
      (c) => c.name.trim().toLowerCase() === finalCategory.trim().toLowerCase()
    );
    const visuals = resolveCategoryVisuals(matchedCategory, finalCategory);
    submitData.color = visuals.hexColor;
    submitData.icon = visuals.iconName;

    if (manualRate.trim()) {
      const parsedRate = parseFloat(manualRate.replace(',', '.'));
      if (!isNaN(parsedRate) && parsedRate > 0) {
        submitData.manual_rate = parsedRate;
      } else {
        delete submitData.manual_rate;
      }
    } else {
      delete submitData.manual_rate;
    }

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
      const detail = err?.response?.data?.detail || err?.message || 'Error al guardar la meta';
      const msg = typeof detail === 'string' ? detail : 'Error al guardar la meta';
      setSubmitError(msg);
      toast?.showToast(msg, 'error');
    }
  };

  const isProject = goalType === 'project';
  const activeCategoryName = formData.category || (isProject ? 'Proyectos' : 'Ahorro');
  const matchedCategory = categories.find(
    (c) => c.name.trim().toLowerCase() === activeCategoryName.trim().toLowerCase()
  );
  const { hexColor: headerColor } = resolveCategoryVisuals(
    matchedCategory,
    activeCategoryName
  );

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
        style={{ 
          maxWidth: '480px', 
          maxHeight: '92vh', 
          overflowY: 'auto'
        }}
      >
        <h2>
          {isEditing
            ? (isProject ? 'Editar Proyecto / Cuenta' : 'Editar Fondo de Ahorro')
            : (isProject ? 'Nuevo Proyecto / Cuenta' : 'Nuevo Fondo de Ahorro')}
        </h2>

        {/* Selector de Tipo: Ahorro vs Proyecto */}
        {!isEditing && (
          <div style={{ marginBottom: '1.25rem' }}>
            <SegmentedTabs
              tabs={[
                { id: 'saving', label: 'Meta de Ahorro', icon: <PiggyBank size={16} /> },
                { id: 'project', label: 'Proyecto / Caja', icon: <FolderKanban size={16} /> },
              ]}
              activeTab={goalType}
              onChange={(tabId) => {
                setGoalType(tabId as 'saving' | 'project');
                setFormData(prev => ({
                  ...prev,
                  type: tabId as 'saving' | 'project',
                  category: (!prev.category || prev.category === 'Proyectos' || prev.category === 'Ahorro')
                    ? (tabId === 'project' ? 'Proyectos' : 'Ahorro')
                    : prev.category,
                }));
              }}
              activeColor={goalType === 'saving' ? '#10B981' : '#3B82F6'}
            />
          </div>
        )}

        {/* Nota contextual */}
        {isProject ? (
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            color: 'var(--text-secondary)',
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.78rem',
            lineHeight: 1.4,
            marginBottom: '0.85rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.45rem'
          }}>
            <Info size={15} style={{ color: '#3B82F6', flexShrink: 0, marginTop: '0.1rem' }} />
            <span>
              Diseñado para pagos acumulados (reparaciones, vehículo, remodelación, eventos). Puedes dejar el presupuesto abierto y cada pago se podrá reflejar como gasto en el Dashboard.
            </span>
          </div>
        ) : (
          <div style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            color: 'var(--text-secondary)',
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.78rem',
            lineHeight: 1.4,
            marginBottom: '0.85rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.45rem'
          }}>
            <Info size={15} style={{ color: '#10B981', flexShrink: 0, marginTop: '0.1rem' }} />
            <span>
              Dinero que vas guardando (con meta fija o como fondo continuo sin límite).
            </span>
          </div>
        )}

        {/* Banner compartido en edición */}
        {isEditing && initialData?.is_shared && (
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            color: 'var(--text-primary)',
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8rem',
            border: '1px solid rgba(99, 102, 241, 0.2)'
          }}>
            <Users size={16} style={{ color: headerColor, flexShrink: 0 }} />
            <span>
              {isProject ? 'Proyecto compartido con' : 'Fondo compartido con'} <strong>{initialData.shared_partner_name}</strong>. Progreso sincronizado.
            </span>
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

          {/* Nombre */}
          <div className="form-group">
            <label>
              {isProject ? 'Nombre del Proyecto / Cuenta *' : 'Nombre del Fondo *'}
            </label>
            <input
              type="text"
              name="name"
              required
              placeholder={isProject ? 'Ej: Reparación de Motor, Remodelación Cocina, Boda...' : 'Ej: Fondo de Emergencia, Vacaciones, Laptop...'}
              value={formData.name}
              onChange={handleChange}
            />
          </div>

          {/* Fila: Meta / Presupuesto y Moneda */}
          <div className="form-group row">
            <div className="form-group half">
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{isProject ? 'Presupuesto Estimado' : 'Monto Objetivo'}</span>
                <span className="form-hint-inline">(Opcional)</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                name="target_amount"
                required={false}
                placeholder={isProject ? "Dejar vacío si es abierto" : "Dejar vacío si es ahorro libre / fondo de emergencia"}
                value={targetAmount}
                onChange={(e) => {
                  setSubmitError(null);
                  setTargetAmount(e.target.value.replace(/[^0-9.,]/g, ''));
                }}
              />
            </div>
            <div className="form-group half">
              <label>
                Moneda *
              </label>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
              >
                {CURRENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tasa de Cambio (Referencia / Manual) */}
          {(targetAmount.trim() !== '' || formData.currency !== 'BS') && (
            <ExchangeRateField
              currency={(formData.currency || 'USD_BCV') as CurrencyType}
              rates={rates}
              manualRate={manualRate}
              onManualRateChange={setManualRate}
              isEditing={isEditing}
              hasDate={false}
            />
          )}

          {/* Fila: Categoría y Fecha Límite */}
          <div className="form-group row">
            <div className="form-group half">
              <CategorySelect
                label="Categoría"
                value={activeCategoryName}
                onChange={(newCat) => setFormData(prev => ({ ...prev, category: newCat }))}
                categories={categories}
                onCategoryCreated={(newCat) => setCategories(prev => [...prev, newCat])}
              />
            </div>
            <div className="form-group half">
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Fecha Límite</span>
                <span className="form-hint-inline">(Opcional)</span>
              </label>
              <input
                type="date"
                name="target_date"
                value={formData.target_date || ''}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Notas / Propósito */}
          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Nota / Propósito</span>
              <span className="form-hint-inline">(Opcional)</span>
            </label>
            <input
              type="text"
              name="notes"
              maxLength={120}
              placeholder="¿Para qué es este fondo? Ej: Viaje a Margarita, inicial de carro..."
              value={formData.notes || ''}
              onChange={handleChange}
            />
          </div>

          {/* Compartir con un Pana */}
          {!isReadOnlyMember && (
            <div style={{
              background: 'var(--surface-muted)',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--accent-light)',
              marginBottom: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="share_saving_goal"
                  checked={isSharedChecked}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsSharedChecked(checked);
                    if (!checked) {
                      setSelectedPartnerIds([]);
                      setAdminPartnerIds([]);
                    }
                  }}
                  style={{ width: '17px', height: '17px', accentColor: headerColor, cursor: 'pointer' }}
                />
                <label 
                  htmlFor="share_saving_goal" 
                  style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: 600, 
                    color: 'var(--text-primary)', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.35rem',
                    margin: 0
                  }}
                >
                  <Users size={16} style={{ color: headerColor }} /> Compartir con Panas
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
                    accentColor={headerColor}
                  />
                </div>
              )}
            </div>
          )}

          {/* Toggle Activo (solo al editar) */}
          {isEditing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0 0.75rem' }}>
              <input
                type="checkbox"
                id="is_active"
                name="is_active"
                checked={formData.is_active ?? true}
                onChange={handleChange}
                style={{ width: '16px', height: '16px', accentColor: 'var(--income-color)', cursor: 'pointer' }}
              />
              <label htmlFor="is_active" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                Fondo activo
              </label>
            </div>
          )}

          {/* Botones de acción */}
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
                background: headerColor,
                boxShadow: `0 4px 14px ${headerColor}44`,
              }}
            >
              {loading ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : (isProject ? 'Crear Proyecto' : 'Crear Fondo'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SavingGoalForm;
