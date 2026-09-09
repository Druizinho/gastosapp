import React, { useState, useEffect } from 'react';
import { DateFilterBar } from './DateFilterBar';
import type { DateFilter, RangeSummaryResponse } from '../types';
import { getSummaryRange } from '../api';
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export const PeriodComparison: React.FC = () => {
  const [filterA, setFilterA] = useState<DateFilter>({ preset: 'month' });
  const [filterB, setFilterB] = useState<DateFilter>({ preset: 'month' });
  
  const [summaryA, setSummaryA] = useState<RangeSummaryResponse | null>(null);
  const [summaryB, setSummaryB] = useState<RangeSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSummaries = async () => {
    if (filterA.preset === 'custom' && (!filterA.from || !filterA.to)) return;
    if (filterB.preset === 'custom' && (!filterB.from || !filterB.to)) return;
    
    setLoading(true);
    try {
      const resolveDates = (filter: DateFilter) => {
        const today = new Date();
        const yyyyMmDd = (d: Date) => d.toISOString().split('T')[0];
        
        let from = filter.from;
        let to = filter.to;
        
        if (filter.preset === 'today') {
          from = yyyyMmDd(today);
          to = from;
        } else if (filter.preset === 'week') {
          const firstDay = new Date(today.setDate(today.getDate() - today.getDay()));
          const lastDay = new Date(today.setDate(today.getDate() - today.getDay() + 6));
          from = yyyyMmDd(firstDay);
          to = yyyyMmDd(lastDay);
        } else if (filter.preset === 'month') {
          const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
          const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          from = yyyyMmDd(firstDay);
          to = yyyyMmDd(lastDay);
        } else if (filter.preset === 'year') {
          const firstDay = new Date(today.getFullYear(), 0, 1);
          const lastDay = new Date(today.getFullYear(), 11, 31);
          from = yyyyMmDd(firstDay);
          to = yyyyMmDd(lastDay);
        } else if (filter.preset === 'all') {
          from = '2000-01-01'; 
          to = yyyyMmDd(today);
        }
        
        return { from: from!, to: to! };
      };

      const datesA = resolveDates(filterA);
      const datesB = resolveDates(filterB);

      const [resA, resB] = await Promise.all([
        getSummaryRange(datesA.from, datesA.to),
        getSummaryRange(datesB.from, datesB.to)
      ]);
      
      setSummaryA(resA);
      setSummaryB(resB);
    } catch (error) {
      console.error('Error fetching summaries:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummaries();
  }, [filterA, filterB]);

  const renderComparison = (valA: number, valB: number, label: string, isDaily: boolean = false) => {
    const diff = valA - valB;
    const percentChange = valB !== 0 ? (diff / valB) * 100 : 0;
    
    let Icon = Minus;
    let colorClass = 'var(--text-tertiary)';
    
    if (diff > 0) {
      Icon = TrendingUp;
      colorClass = '#ef4444'; // More expenses is "bad" usually
    } else if (diff < 0) {
      Icon = TrendingDown;
      colorClass = '#10b981'; // Less expenses is "good"
    }

    return (
      <div className="soft-card" style={{ marginBottom: '1rem', padding: '1.25rem' }}>
        <h4 style={{ fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
          {label} {isDaily ? '(Promedio Diario)' : ''}
        </h4>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--info-color)', fontWeight: 500, marginBottom: '0.25rem' }}>Período B (Base)</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-secondary)' }}>${valB.toFixed(2)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: 500, marginBottom: '0.25rem' }}>Período A (Actual)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>${valA.toFixed(2)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', color: colorClass }}>
          <Icon size={16} />
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{diff > 0 ? '+' : ''}${diff.toFixed(2)}</span>
          {valB !== 0 && (
            <span style={{ fontSize: '0.8rem' }}>({percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%)</span>
          )}
        </div>
      </div>
    );
  };

  const durationWarning = summaryA && summaryB && summaryA.days_in_range !== summaryB.days_in_range;

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '800px', margin: '0 auto' }}>
      <header className="soft-card" style={{ marginBottom: '1.5rem', textAlign: 'center', padding: '2rem 1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Comparar Períodos</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Selecciona dos períodos para comparar tus gastos.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="soft-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', fontWeight: 600, color: 'var(--info-color)', fontSize: '0.95rem' }}>Período B (Base)</h3>
          <DateFilterBar filter={filterB} onChange={setFilterB} />
        </div>
        <div className="soft-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', fontWeight: 600, color: 'var(--accent-color)', fontSize: '0.95rem' }}>Período A (Actual)</h3>
          <DateFilterBar filter={filterA} onChange={setFilterA} />
        </div>
      </div>

      {durationWarning && (
        <div className="soft-card" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <AlertTriangle color="#f59e0b" size={24} style={{ flexShrink: 0 }} />
          <p style={{ fontSize: '0.85rem', color: '#b45309', margin: 0, lineHeight: 1.5 }}>
            <strong style={{ fontWeight: 600 }}>Atención:</strong> Los períodos tienen diferente duración 
            (Período A: {summaryA.days_in_range} días vs Período B: {summaryB.days_in_range} días). 
            Considera comparar el Promedio Diario para una métrica más precisa.
          </p>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-tertiary)' }}>Cargando comparación...</div>
      ) : summaryA && summaryB ? (
        <div className="soft-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.25rem', fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Totales</h3>
          {renderComparison(Number(summaryA.total_usd), Number(summaryB.total_usd), 'Total USD')}
          {renderComparison(Number(summaryA.total_bs), Number(summaryB.total_bs), 'Total BS')}
          {renderComparison(Number(summaryA.total_eur), Number(summaryB.total_eur), 'Total EUR')}
          {renderComparison(Number(summaryA.total_usdt), Number(summaryB.total_usdt), 'Total USDT')}

          {(summaryA.days_in_range > 1 || summaryB.days_in_range > 1) && (
            <>
              <h3 style={{ marginTop: '2rem', marginBottom: '1.25rem', fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Promedio Diario</h3>
              {renderComparison(Number(summaryA.daily_avg_usd), Number(summaryB.daily_avg_usd), 'USD', true)}
              {renderComparison(Number(summaryA.daily_avg_bs), Number(summaryB.daily_avg_bs), 'BS', true)}
            </>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-tertiary)' }}>Selecciona fechas válidas para comparar.</div>
      )}
    </div>
  );
};
