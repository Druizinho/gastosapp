import React, { useMemo } from 'react';
import { Calendar, ArrowRight, RotateCcw } from 'lucide-react';
import type { DateFilter, DatePreset } from '../types';

interface PeriodSelectorProps {
  filter: DateFilter;
  onChange: (filter: DateFilter) => void;
}

const formatLocalDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const getDaysDifference = (fromStr: string, toStr: string): number => {
  const from = parseLocalDate(fromStr);
  const to = parseLocalDate(toStr);
  const diffTime = to.getTime() - from.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diffDays);
};

const MAIN_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' },
  { value: 'all', label: 'Todo' },
  { value: 'custom', label: 'Personalizado' },
];

const PeriodSelector: React.FC<PeriodSelectorProps> = ({ filter, onChange }) => {
  const handlePresetChange = (preset: DatePreset) => {
    if (preset !== 'custom') {
      onChange({ preset, from: undefined, to: undefined });
    } else {
      const today = formatLocalDate(new Date());
      onChange({
        preset: 'custom',
        from: filter.from || today,
        to: filter.to || today,
      });
    }
  };

  const handleDateChange = (field: 'from' | 'to', value: string) => {
    if (!value) {
      onChange({
        ...filter,
        preset: 'custom',
        [field]: undefined,
      });
      return;
    }

    const newFrom = field === 'from' ? value : filter.from;
    const newTo = field === 'to' ? value : filter.to;

    let finalFrom = newFrom;
    let finalTo = newTo;

    // Prevent inverted range:
    // If the user selects a from date that is greater than to, automatically adjust to = from
    if (field === 'from' && finalTo && finalFrom && finalFrom > finalTo) {
      finalTo = finalFrom;
    } else if (field === 'to' && finalFrom && finalTo && finalTo < finalFrom) {
      finalFrom = finalTo;
    }

    onChange({
      preset: 'custom',
      from: finalFrom,
      to: finalTo,
    });
  };

  const handleQuickPreset = (from: string, to: string) => {
    onChange({
      preset: 'custom',
      from,
      to,
    });
  };

  const handleReset = () => {
    const today = formatLocalDate(new Date());
    onChange({
      preset: 'custom',
      from: today,
      to: today,
    });
  };

  const quickPresets = useMemo(() => {
    const today = new Date();

    const d7 = new Date(today);
    d7.setDate(today.getDate() - 6);

    const d14 = new Date(today);
    d14.setDate(today.getDate() - 13);

    const d30 = new Date(today);
    d30.setDate(today.getDate() - 29);

    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    return [
      {
        id: '7d',
        label: '7 días',
        from: formatLocalDate(d7),
        to: formatLocalDate(today),
      },
      {
        id: '14d',
        label: '14 días',
        from: formatLocalDate(d14),
        to: formatLocalDate(today),
      },
      {
        id: '30d',
        label: '30 días',
        from: formatLocalDate(d30),
        to: formatLocalDate(today),
      },
      {
        id: 'prevMonth',
        label: 'Mes anterior',
        from: formatLocalDate(prevMonthStart),
        to: formatLocalDate(prevMonthEnd),
      },
    ];
  }, []);

  const daysCount = useMemo(() => {
    if (!filter.from || !filter.to) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filter.from) || !/^\d{4}-\d{2}-\d{2}$/.test(filter.to)) {
      return null;
    }
    return getDaysDifference(filter.from, filter.to);
  }, [filter.from, filter.to]);

  return (
    <div className="period-selector-surface">
      <div className="period-pills-container">
        <div className="period-pills">
          {MAIN_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`period-pill ${filter.preset === p.value ? 'period-pill--active' : ''}`}
              onClick={() => handlePresetChange(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {filter.preset === 'custom' && (
        <div className="custom-range-section">
          <div className="custom-range-chips-container">
            <div className="custom-range-chips">
              {quickPresets.map((qp) => {
                const isActive = filter.from === qp.from && filter.to === qp.to;
                return (
                  <button
                    key={qp.id}
                    type="button"
                    className={`period-chip ${isActive ? 'period-chip--active' : ''}`}
                    onClick={() => handleQuickPreset(qp.from, qp.to)}
                  >
                    {qp.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="custom-date-row">
            <div className="custom-date-field">
              <label htmlFor="custom-date-from" className="custom-date-label">
                Desde
              </label>
              <div className="custom-date-input-wrap">
                <Calendar size={14} className="custom-date-icon" aria-hidden="true" />
                <input
                  id="custom-date-from"
                  type="date"
                  value={filter.from || ''}
                  max={filter.to || undefined}
                  onChange={(e) => handleDateChange('from', e.target.value)}
                  className="custom-date-input"
                  aria-label="Fecha desde"
                />
              </div>
            </div>

            <div className="custom-date-connector" aria-hidden="true">
              <ArrowRight size={15} />
            </div>

            <div className="custom-date-field">
              <label htmlFor="custom-date-to" className="custom-date-label">
                Hasta
              </label>
              <div className="custom-date-input-wrap">
                <Calendar size={14} className="custom-date-icon" aria-hidden="true" />
                <input
                  id="custom-date-to"
                  type="date"
                  value={filter.to || ''}
                  min={filter.from || undefined}
                  onChange={(e) => handleDateChange('to', e.target.value)}
                  className="custom-date-input"
                  aria-label="Fecha hasta"
                />
              </div>
            </div>
          </div>

          <div className="custom-range-summary-row">
            <span className="custom-range-summary-text">
              {daysCount !== null ? (
                <>
                  <strong>{daysCount}</strong> {daysCount === 1 ? 'día seleccionado' : 'días seleccionados'}
                </>
              ) : (
                'Selecciona un rango'
              )}
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="custom-range-reset-btn"
              title="Restablecer fechas a hoy"
            >
              <RotateCcw size={12} aria-hidden="true" />
              <span>Restablecer</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PeriodSelector;
