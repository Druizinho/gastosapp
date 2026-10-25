import React, { useState, useEffect } from 'react';
import {
  Users,
  PiggyBank,
  SlidersHorizontal,
  FolderKanban,
  Info
} from 'lucide-react';
import type { SavingGoal, SavingGoalCreate, SavingGoalUpdate, Connection, Category } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import { getConnections, getCategories } from '../api';
import { ParticipantPicker } from './panas/ParticipantPicker';
import CategorySelect from './CategorySelect';
import { SegmentedTabs } from './ui/SegmentedTabs';
import { resolveCategoryVisuals } from '../utils/categoryVisuals';

interface SavingGoalFormProps {
  initialData?: SavingGoal;
  onSubmit: (data: SavingGoalCreate | SavingGoalUpdate) => void;
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
  const [goalType, setGoalType] = useState<'saving' | 'project'>(initialData?.type || 'saving');

  // Categories & Panas connections
  const [categories, setCategories] = useState<Category[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isSharedChecked, setIsSharedChecked] = useState(false);
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [adminPartnerIds, setAdminPartnerIds] = useState<string[]>([]);
  const [showManualRate, setShowManualRate] = useState(false);

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

    getConnections()
      .then((data) => {
        const accepted = data.filter(c => c.status === 'accepted');
        setConnections(accepted);
      })
      .catch((err) => console.error('Error fetching connections:', err));
  }, []);

  useEffect(() => {
    if (initialData) {
      setGoalType(initialData.type || 'saving');
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
      setIsSharedChecked(!!initialData.is_shared);
      if (initialData.rate_usd_bs || initialData.rate_eur_bs || initialData.rate_usdt_bs) {
        setShowManualRate(true);
      }
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: any = { ...formData };
    submitData.type = goalType;

    if (submitData.target_amount !== undefined && submitData.target_amount !== null && submitData.target_amount !== '') {
      submitData.target_amount = Number(submitData.target_amount);
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

    if (showManualRate && submitData.manual_rate) {
      submitData.manual_rate = Number(submitData.manual_rate);
    } else {
      delete submitData.manual_rate;
    }

    if (!initialData?.is_shared && isSharedChecked && selectedPartnerIds.length > 0) {
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
    <div className="modal-backdrop" onClick={onCancel}>
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
            <Users size={16} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
            <span>
              {isProject ? 'Proyecto compartido con' : 'Fondo compartido con'} <strong>{initialData.shared_partner_name}</strong>. Progreso sincronizado.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
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
                type="number"
                step="0.01"
                min="0.01"
                name="target_amount"
                required={false}
                placeholder={isProject ? "Dejar vacío si es abierto" : "Dejar vacío si es ahorro libre / fondo de emergencia"}
                value={formData.target_amount ?? ''}
                onChange={handleChange}
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

          {/* Compartir con un Pana (si aún no está compartido) */}
          {!initialData?.is_shared && (
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
                  style={{ width: '17px', height: '17px', accentColor: 'var(--primary-color)', cursor: 'pointer' }}
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
                  <Users size={15} style={{ color: 'var(--primary-color)' }} /> Compartir con Panas (Grupos)
                </label>
              </div>

              {isSharedChecked && (
                <div style={{ marginTop: '0.65rem' }}>
                  <ParticipantPicker
                    connections={connections}
                    selectedIds={selectedPartnerIds}
                    adminIds={adminPartnerIds}
                    onChange={(s, a) => {
                      setSelectedPartnerIds(s);
                      setAdminPartnerIds(a);
                    }}
                    accentColor="var(--primary-color)"
                  />
                  <p style={{ margin: '0.45rem 0 0', fontSize: '0.72rem', color: 'var(--text-tertiary)', lineHeight: 1.35 }}>
                    Todos los integrantes verán la meta y los aportes sumarán al objetivo común en tiempo real.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tasa Manual Opcional (Discreta / Desplegable) */}
          {formData.currency !== 'BS' && (
            <div style={{ marginBottom: '0.75rem' }}>
              {!showManualRate ? (
                <button
                  type="button"
                  onClick={() => setShowManualRate(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  <SlidersHorizontal size={12} />
                  <span>+ Agregar tasa de cambio manual (opcional)</span>
                </button>
              ) : (
                <div style={{
                  background: 'var(--surface-muted)',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--accent-light)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, margin: 0 }}>
                      Tasa Manual de Conversión
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowManualRate(false);
                        setFormData(prev => ({ ...prev, manual_rate: '' as any }));
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '0.72rem', cursor: 'pointer' }}
                    >
                      Quitar
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    name="manual_rate"
                    placeholder="Usar tasa oficial del día si se deja vacío"
                    value={formData.manual_rate || ''}
                    onChange={handleChange}
                    style={{ padding: '0.55rem 0.75rem', fontSize: '0.85rem' }}
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
