import React from 'react';
import type { DateFilter, DatePreset } from '../types';

interface DateFilterBarProps {
  filter: DateFilter;
  onChange: (filter: DateFilter) => void;
}

export const DateFilterBar: React.FC<DateFilterBarProps> = ({ filter, onChange }) => {
  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = e.target.value as DatePreset;
    
    // Si cambia a algo distinto de custom, limpiamos las fechas
    if (preset !== 'custom') {
      onChange({ preset, from: undefined, to: undefined });
    } else {
      const today = new Date().toISOString().split('T')[0];
      onChange({ preset: 'custom', from: filter.from || today, to: filter.to || today });
    }
  };

  const handleDateChange = (field: 'from' | 'to', value: string) => {
    onChange({
      ...filter,
      preset: 'custom',
      [field]: value || undefined
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Período</label>
        <select 
          value={filter.preset} 
          onChange={handlePresetChange} 
          style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
        >
          <option value="today">Hoy</option>
          <option value="week">Esta Semana</option>
          <option value="month">Este Mes</option>
          <option value="year">Este Año</option>
          <option value="all">Todo</option>
          <option value="custom">Personalizado</option>
        </select>
      </div>

      {filter.preset === 'custom' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Desde</label>
            <input 
              type="date" 
              value={filter.from || ''} 
              max={filter.to || undefined}
              onChange={(e) => handleDateChange('from', e.target.value)}
              style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Hasta</label>
            <input 
              type="date" 
              value={filter.to || ''} 
              min={filter.from || undefined}
              onChange={(e) => handleDateChange('to', e.target.value)}
              style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
