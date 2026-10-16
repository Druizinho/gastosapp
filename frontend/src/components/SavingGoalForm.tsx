import React, { useState, useEffect } from 'react';
import { Users, Info, X, PiggyBank, SlidersHorizontal } from 'lucide-react';
import type { SavingGoal, SavingGoalCreate, SavingGoalUpdate, Category, Connection } from '../types';
import { getCategories, getConnections } from '../api';

interface SavingGoalFormProps {
  initialData?: SavingGoal;
  onSubmit: (data: SavingGoalCreate | SavingGoalUpdate) => void;
  onCancel: () => void;
  loading: boolean;
}

const COLOR_PRESETS = [
  { label: 'Esmeralda', value: '#10B981' },
  { label: 'Azul', value: '#3B82F6' },
  { label: 'Morado', value: '#8B5CF6' },
  { label: 'Ámbar', value: '#F59E0B' },
  { label: 'Rosa', value: '#EC4899' },
  { label: 'Cian', value: '#06B6D4' },
];

export const SavingGoalForm: React.FC<SavingGoalFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  loading,
}) => {
  const isEditing = !!initialData;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);

  // Panas connections
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isSharedChecked, setIsSharedChecked] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [showManualRate, setShowManualRate] = useState(false);

  const [formData, setFormData] = useState<SavingGoalCreate & { is_active?: boolean }>({
    name: '',
    target_amount: '' as any,
    currency: 'USD_BCV',
    target_date: '',
    category: '',
    color: '#10B981',
    icon: 'piggy-bank',
    notes: '',
    manual_rate: '' as any,
    is_active: true,
  });

  useEffect(() => {
    getCategories()
      .then((data) => setCategories(data))
      .catch((err) => console.error('Error fetching categories:', err))
      .finally(() => setLoadingCats(false));

    getConnections()
      .then((data) => {
        const accepted = data.filter(c => c.status === 'accepted');
        setConnections(accepted);
      })
      .catch((err) => console.error('Error fetching connections:', err));
  }, []);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        target_amount: initialData.target_amount,
        currency: initialData.currency,
        target_date: initialData.target_date || '',
        category: initialData.category || '',
        color: initialData.color || '#10B981',
        icon: initialData.icon || 'piggy-bank',
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
    submitData.target_amount = Number(submitData.target_amount);
    if (!submitData.target_date) submitData.target_date = null;
    if (!submitData.category) submitData.category = null;
    if (showManualRate && submitData.manual_rate) {
      submitData.manual_rate = Number(submitData.manual_rate);
    } else {
      delete submitData.manual_rate;
    }

    if (!isEditing && isSharedChecked && selectedPartnerId) {
      submitData.shared_with = selectedPartnerId;
    }

    onSubmit(submitData);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div 
        className="expense-form-container" 
        onClick={(e) => e.stopPropagation()}
        style={{ 
          maxWidth: '460px', 
          maxHeight: '92vh', 
          overflowY: 'auto',
          padding: '1.25rem 1.4rem'
        }}
      >
        {/* Header con botón de cierre */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.85rem',
          borderBottom: '1px solid var(--accent-light)',
          paddingBottom: '0.65rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              background: `${formData.color || '#10B981'}20`,
              color: formData.color || '#10B981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <PiggyBank size={18} />
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {isEditing ? 'Editar Fondo de Ahorro' : 'Nuevo Fondo de Ahorro'}
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
          >
            <X size={20} />
          </button>
        </div>

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
              Fondo compartido con <strong>{initialData.shared_partner_name}</strong>. Progreso sincronizado.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Nombre */}
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.82rem', marginBottom: '0.25rem', fontWeight: 600 }}>
              Nombre del Fondo *
            </label>
            <input
              type="text"
              name="name"
              required
              placeholder="Ej: Fondo de Emergencia, Vacaciones, Laptop..."
              value={formData.name}
              onChange={handleChange}
              style={{ padding: '0.65rem 0.75rem' }}
            />
          </div>

          {/* Fila: Meta y Moneda */}
          <div className="form-group row" style={{ gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="form-group half">
              <label style={{ fontSize: '0.82rem', marginBottom: '0.25rem', fontWeight: 600 }}>
                Monto Objetivo *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                name="target_amount"
                required
                placeholder="0.00"
                value={formData.target_amount || ''}
                onChange={handleChange}
                style={{ padding: '0.65rem 0.75rem' }}
              />
            </div>
            <div className="form-group half">
              <label style={{ fontSize: '0.82rem', marginBottom: '0.25rem', fontWeight: 600 }}>
                Moneda *
              </label>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
                style={{ padding: '0.65rem 0.75rem' }}
              >
                <option value="USD_BCV">USD (BCV)</option>
                <option value="USD_CASH">USD (Efectivo)</option>
                <option value="BS">Bolívares (Bs)</option>
                <option value="EUR_BCV">Euros (BCV)</option>
                <option value="USDT">USDT (Crypto)</option>
              </select>
            </div>
          </div>

          {/* Fila: Categoría y Fecha Límite */}
          <div className="form-group row" style={{ gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="form-group half">
              <label style={{ fontSize: '0.82rem', marginBottom: '0.25rem', fontWeight: 600 }}>
                Categoría
              </label>
              <select
                name="category"
                value={formData.category || ''}
                onChange={handleChange}
                disabled={loadingCats}
                style={{ padding: '0.65rem 0.75rem' }}
              >
                <option value="">(Sin categoría)</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group half">
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.25rem', fontWeight: 600 }}>
                <span>Fecha Límite</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>(Opcional)</span>
              </label>
              <input
                type="date"
                name="target_date"
                value={formData.target_date || ''}
                onChange={handleChange}
                style={{ padding: '0.65rem 0.75rem' }}
              />
            </div>
          </div>

          {/* Color del Fondo (Inline compacto) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.45rem 0.65rem',
            background: 'var(--surface-muted)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '0.75rem',
            border: '1px solid var(--accent-light)'
          }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Color distintivo:
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, color: preset.value }))}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: preset.value,
                    border: formData.color === preset.value ? '2px solid white' : 'none',
                    boxShadow: formData.color === preset.value ? `0 0 0 2px ${preset.value}` : 'none',
                    cursor: 'pointer',
                    transition: 'transform 0.15s',
                    transform: formData.color === preset.value ? 'scale(1.15)' : 'scale(1)',
                  }}
                  title={preset.label}
                />
              ))}
            </div>
          </div>

          {/* Notas / Propósito */}
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.25rem', fontWeight: 600 }}>
              <span>Nota / Propósito</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>(Opcional)</span>
            </label>
            <input
              type="text"
              name="notes"
              maxLength={120}
              placeholder="¿Para qué es este fondo? Ej: Viaje a Margarita, inicial de carro..."
              value={formData.notes || ''}
              onChange={handleChange}
              style={{ padding: '0.65rem 0.75rem' }}
            />
          </div>

          {/* Compartir con un Pana (solo al crear) */}
          {!isEditing && (
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
                    if (checked && connections.length > 0 && !selectedPartnerId) {
                      setSelectedPartnerId(connections[0].partner_id);
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
                  <Users size={15} style={{ color: 'var(--primary-color)' }} /> Compartir con un Pana
                </label>
              </div>

              {isSharedChecked && (
                <div style={{ marginTop: '0.5rem' }}>
                  {connections.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                      <Info size={13} style={{ flexShrink: 0 }} />
                      <span>No tienes panas conectados aún. Ve a <strong>Panas</strong> para conectar.</span>
                    </div>
                  ) : (
                    <div>
                      <select
                        value={selectedPartnerId}
                        onChange={(e) => setSelectedPartnerId(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--accent-light)',
                          background: 'var(--surface-color)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      >
                        {connections.map(c => (
                          <option key={c.partner_id} value={c.partner_id}>
                            👤 {c.partner_name}
                          </option>
                        ))}
                      </select>
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                        Ambos compartirán la meta y los aportes sumarán al objetivo común en tiempo real.
                      </p>
                    </div>
                  )}
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
          <div className="form-actions" style={{ marginTop: '1rem', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="btn-cancel"
              style={{ padding: '0.75rem 1.25rem', fontSize: '0.9rem' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-submit"
              style={{
                background: formData.color || 'var(--income-color)',
                boxShadow: `0 4px 14px ${(formData.color || '#10B981')}44`,
                padding: '0.75rem 1.25rem',
                fontSize: '0.9rem',
                fontWeight: 700
              }}
            >
              {loading ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Crear Fondo')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SavingGoalForm;
