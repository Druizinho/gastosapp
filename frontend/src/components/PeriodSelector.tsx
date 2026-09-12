import React from 'react';
import type { DateFilter, DatePreset } from '../types';

interface PeriodSelectorProps {
  filter: DateFilter;
  onChange: (filter: DateFilter) => void;
}

const PeriodSelector: React.FC<PeriodSelectorProps> = ({ filter, onChange }) => {
  const handlePresetChange = (preset: DatePreset) => {
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

  const presets: { value: DatePreset; label: string }[] = [
    { value: 'today', label: 'Hoy' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
    { value: 'year', label: 'Año' },
    { value: 'all', label: 'Todo' },
    { value: 'custom', label: 'Personalizado' },
  ];

  return (
    <div className="period-pills-container">
      <div className="period-pills">
        {presets.map((p) => (
          <button
            key={p.value}
            className={`period-pill ${filter.preset === p.value ? 'period-pill--active' : ''}`}
            onClick={() => handlePresetChange(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {filter.preset === 'custom' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem', padding: '0 0.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Desde</label>
            <input 
              type="date" 
              value={filter.from || ''} 
              max={filter.to || undefined}
              onChange={(e) => handleDateChange('from', e.target.value)}
              style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Hasta</label>
            <input 
              type="date" 
              value={filter.to || ''} 
              min={filter.from || undefined}
              onChange={(e) => handleDateChange('to', e.target.value)}
              style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PeriodSelector;
