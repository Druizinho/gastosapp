import React, { useState, useEffect } from 'react';
import type { Debt, DebtCreate, DebtUpdate } from '../types';

interface DebtFormProps {
  initialData?: Debt;
  type: 'owed' | 'receivable';
  onSubmit: (data: DebtCreate | DebtUpdate) => void;
  onCancel: () => void;
  loading: boolean;
}

const DebtForm: React.FC<DebtFormProps> = ({ initialData, type, onSubmit, onCancel, loading }) => {
  const isEditing = !!initialData;
  const [formData, setFormData] = useState<DebtCreate>({
    type,
    counterpart: '',
    concept: '',
    total_amount: 0,
    currency: 'USD_BCV',
    start_date: new Date().toISOString().split('T')[0],
    due_date: '',
    is_settled: false,
    notes: ''
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        due_date: initialData.due_date || '',
        notes: initialData.notes || ''
      });
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let parsedValue: any = value;
    
    if (type === 'number') {
      parsedValue = value === '' ? '' : parseFloat(value);
    }

    setFormData(prev => ({
      ...prev,
      [name]: parsedValue
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = { ...formData };
    if (!submitData.due_date) submitData.due_date = null;
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
      <div>
        <label style={labelStyle}>
          {type === 'owed' ? '¿A quién le debemos?' : '¿Quién nos debe?'}
        </label>
        <input
          type="text"
          name="counterpart"
          required
          value={formData.counterpart}
          onChange={handleChange}
          style={inputStyle}
          placeholder="Ej: Banco, María, Empresa XYZ..."
        />
      </div>

      <div>
        <label style={labelStyle}>Concepto</label>
        <input
          type="text"
          name="concept"
          required
          value={formData.concept}
          onChange={handleChange}
          style={inputStyle}
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
            value={formData.total_amount}
            onChange={handleChange}
            style={inputStyle}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Moneda</label>
          <select
            name="currency"
            value={formData.currency}
            onChange={handleChange}
            style={inputStyle}
          >
            <option value="BS">BS</option>
            <option value="USD_BCV">USD (BCV)</option>
            <option value="EUR_BCV">EUR (BCV)</option>
            <option value="USDT">USDT</option>
            <option value="USD_CASH">USD (Efectivo)</option>
          </select>
        </div>
      </div>

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
