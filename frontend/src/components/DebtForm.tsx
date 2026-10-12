import React, { useState, useEffect } from 'react';
import { Users, Info } from 'lucide-react';
import type { Debt, DebtCreate, DebtUpdate, Connection } from '../types';
import { getConnections } from '../api';

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
  const [selectedPartnerId, setSelectedPartnerId] = useState('');

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
    shared_with: null
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
    const submitData = { ...formData };
    submitData.total_amount = Number(submitData.total_amount);
    if (!submitData.due_date) submitData.due_date = null;
    if (!isSharedChecked) submitData.shared_with = null;
    onSubmit(submitData);
  };

  const inputStyle = {
    width: '100%', padding: '0.75rem',
    background: 'var(--surface-color)', border: '1px solid var(--accent-light)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    fontSize: '0.95rem', fontFamily: 'inherit',
    marginTop: '0.25rem'
  };

  const labelStyle = {
    display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)'
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {isSharedDebt && (
        <div style={{
          background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6',
          padding: '0.875rem 1rem', borderRadius: 'var(--radius-md)',
          fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.6rem',
          border: '1px solid rgba(59, 130, 246, 0.2)'
        }}>
          <Users size={18} style={{ flexShrink: 0 }} />
          <span>
            Deuda compartida con <strong>{initialData.shared_partner_name}</strong>. El monto, concepto y contraparte están sincronizados y no se pueden modificar.
          </span>
        </div>
      )}

      <div>
        <label style={labelStyle}>
          {type === 'owed' ? '¿A quién le debemos?' : '¿Quién nos debe?'}
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
        <label style={labelStyle}>Concepto</label>
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

      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Monto Total</label>
          <input
            type="number"
            name="total_amount"
            required
            min="0.01"
            step="0.01"
            disabled={isSharedDebt}
            value={formData.total_amount || ''}
            onChange={handleChange}
            style={{ ...inputStyle, ...(isSharedDebt ? { opacity: 0.65, cursor: 'not-allowed' } : {}) }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Moneda</label>
          <select
            name="currency"
            disabled={isSharedDebt}
            value={formData.currency}
            onChange={handleChange}
            style={{ ...inputStyle, ...(isSharedDebt ? { opacity: 0.65, cursor: 'not-allowed' } : {}) }}
          >
            <option value="BS">BS</option>
            <option value="USD_BCV">USD (BCV)</option>
            <option value="EUR_BCV">EUR (BCV)</option>
            <option value="USDT">USDT</option>
            <option value="USD_CASH">USD (Efectivo)</option>
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
                  setSelectedPartnerId('');
                  setFormData(prev => ({ ...prev, shared_with: null }));
                } else if (connections.length > 0) {
                  const first = connections[0];
                  setSelectedPartnerId(first.partner_id);
                  setFormData(prev => ({
                    ...prev,
                    shared_with: first.partner_id
                  }));
                }
              }}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-color)', cursor: 'pointer' }}
            />
            <label htmlFor="share_debt" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Users size={16} /> Compartir con una conexión
            </label>
          </div>

          {isSharedChecked && (
            <div style={{ marginTop: '0.75rem' }}>
              {connections.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                  <Info size={14} />
                  <span>
                    No tienes conexiones aceptadas. Ve a <strong>Ajustes &gt; Mis Conexiones</strong> para conectar con otros perfiles.
                  </span>
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Seleccionar conexión
                  </label>
                  <select
                    value={selectedPartnerId}
                    onChange={(e) => {
                      const partnerId = e.target.value;
                      setSelectedPartnerId(partnerId);
                      setFormData(prev => ({
                        ...prev,
                        shared_with: partnerId
                      }));
                    }}
                    style={inputStyle}
                  >
                    {connections.map(c => (
                      <option key={c.id} value={c.partner_id}>
                        👤 {c.partner_name}
                      </option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.35rem', marginBottom: 0 }}>
                    Ambos compartirán la misma deuda frente a la contraparte ({type === 'owed' ? 'ambos la deben' : 'a ambos les deben'}). Los abonos de cualquiera reducirán el saldo pendiente.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Fecha de Inicio</label>
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
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>
      
      {isEditing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input
            type="checkbox"
            name="is_settled"
            id="is_settled"
            checked={formData.is_settled}
            onChange={(e) => setFormData(prev => ({ ...prev, is_settled: e.target.checked }))}
            style={{ width: '16px', height: '16px', accentColor: 'var(--accent-color)' }}
          />
          <label htmlFor="is_settled" style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            Marcar como liquidada (pagada)
          </label>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          style={{
            flex: 1, padding: '0.875rem', borderRadius: 'var(--radius-full)',
            background: 'var(--surface-muted)', color: 'var(--text-secondary)',
            border: 'none', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer'
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          style={{
            flex: 1, padding: '0.875rem', borderRadius: 'var(--radius-full)',
            background: 'var(--accent-color)', color: 'white',
            border: 'none', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer'
          }}
        >
          {loading ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Crear Deuda')}
        </button>
      </div>
    </form>
  );
};

export default DebtForm;
