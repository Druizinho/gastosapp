import React from 'react';
import type { RangeSummaryResponse, DateFilter } from '../types';
import { TrendingDown, PieChart } from 'lucide-react';

interface SummaryProps {
  summary: RangeSummaryResponse | null;
  dateFilter?: DateFilter;
}

const Summary: React.FC<SummaryProps> = ({ summary, dateFilter }) => {
  if (!summary) return <div style={{ height: '200px', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />;

  const totalUsd = Number(summary.total_usd) || 0;
  const totalBs = Number(summary.total_bs) || 0;
  const totalEur = Number(summary.total_eur) || 0;
  const totalUsdt = Number(summary.total_usdt) || 0;
  const dailyAvg = Number(summary.daily_avg_usd) || 0;

  // Calculate Top Categories (using USD for sorting)
  const sortedCategories = [...(summary.by_category || [])].sort((a, b) => {
    const valA = Number(a.total_usd);
    const valB = Number(b.total_usd);
    return valB - valA;
  }).slice(0, 3); // Top 3

  let dailyAvgText = 'Promedio Diario';
  if (dateFilter) {
    if (dateFilter.preset === 'week') dailyAvgText = 'Promedio Diario (Esta semana)';
    else if (dateFilter.preset === 'month') dailyAvgText = 'Promedio Diario (Este mes)';
    else if (dateFilter.preset === 'year') dailyAvgText = 'Promedio Diario (Este año)';
    else if (dateFilter.preset === 'all') dailyAvgText = 'Promedio Diario (Histórico)';
    else if (dateFilter.preset === 'custom') dailyAvgText = 'Promedio Diario (Personalizado)';
  }

  return (
    <div className="summary-section mb-6">
      
      {/* Total Balance (Floating, no card) */}
      <div style={{ marginBottom: '2rem', marginTop: '1rem', padding: '0 0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
          Total Balance
        </h2>
        <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.05)', padding: '0.2rem 0.6rem', borderRadius: '20px', marginLeft: '0.5rem' }}>
            {summary.days_in_range}d
          </span>
        </div>
      </div>

      {/* Exchange Rates / Currency Equivalents */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 0.5rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Equivalencias</h3>
      </div>
      
      <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', paddingLeft: '0.5rem', paddingRight: '0.5rem', scrollSnapType: 'x mandatory' }} className="hide-scrollbar">
        <div className="soft-card" style={{ flex: '0 0 140px', scrollSnapAlign: 'start', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#FCD34D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold' }}>Bs</div>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>VES</span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Bs {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Bolívares</div>
        </div>

        <div className="soft-card" style={{ flex: '0 0 140px', scrollSnapAlign: 'start', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold', color: 'white' }}>€</div>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>EUR</span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>€ {totalEur.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Euros</div>
        </div>

        <div className="soft-card" style={{ flex: '0 0 140px', scrollSnapAlign: 'start', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 'bold', color: 'white' }}>₮</div>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>USDT</span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{totalUsdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Tether (Crypto)</div>
        </div>
      </div>

      {/* Daily Average */}
      {summary.days_in_range > 1 && (
        <div className="soft-card mt-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'var(--surface-muted)', padding: '0.5rem', borderRadius: '10px', color: 'var(--expense-color)' }}>
              <TrendingDown size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-tertiary)' }}>{dailyAvgText}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>${dailyAvg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>
        </div>
      )}

      {/* Top Categories */}
      {sortedCategories.length > 0 && (
        <div className="soft-card mt-4" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <PieChart size={18} color="var(--text-tertiary)" />
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Top Categorías
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sortedCategories.map(c => {
              const val = Number(c.total_usd);
              const percentage = totalUsd > 0 ? ((val / totalUsd) * 100).toFixed(1) : '0.0';
              return (
                <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-color)' }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>{c.category}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{percentage}%</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>${val.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Summary;
