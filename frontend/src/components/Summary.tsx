import React, { useState, useEffect } from 'react';
import type { RangeSummaryResponse, DateFilter, Category, MonthlyBudgetResponse } from '../types';
import { Eye, EyeOff, Coins, PieChart, Package } from 'lucide-react';
import { ICON_MAP } from './CategoryManager';

interface SummaryProps {
  summary: RangeSummaryResponse | null;
  dateFilter?: DateFilter;
  categories?: Category[];
  monthlyBudget?: MonthlyBudgetResponse | null;
}

const BALANCE_VISIBLE_KEY = 'gastosapp_balance_visible';

const Summary: React.FC<SummaryProps> = ({ summary, dateFilter, categories = [], monthlyBudget }) => {
  const [balanceVisible, setBalanceVisible] = useState<boolean>(() => {
    const stored = localStorage.getItem(BALANCE_VISIBLE_KEY);
    return stored !== null ? stored === 'true' : true;
  });

  // Auditor Fix #7: State hook declared unconditionally at the top
  const [showAllCategories, setShowAllCategories] = useState(false);

  useEffect(() => {
    localStorage.setItem(BALANCE_VISIBLE_KEY, String(balanceVisible));
  }, [balanceVisible]);

  if (!summary) return <div style={{ height: '200px', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />;

  const totalUsd = Number(summary.total_usd) || 0;
  const totalBs = Number(summary.total_bs) || 0;
  const totalEur = Number(summary.total_eur) || 0;
  const totalUsdt = Number(summary.total_usdt) || 0;
  const dailyAvg = Number(summary.daily_avg_usd) || 0;

  // Build map of budgeted category limits
  const budgetLimitsMap = new Map((monthlyBudget?.category_limits || []).map(cl => [cl.category_name, cl]));
  const globalLimitUsd = Number(monthlyBudget?.global_limit_usd) || 0;
  const globalLimitEff = Number(monthlyBudget?.effective_global_limit) || 0;
  const globalSpentPct = monthlyBudget?.global_spent_percentage || 0;
  const globalTrafficLight = monthlyBudget?.global_traffic_light || 'green';

  // 1. Only categories with actual spend from summary.by_category
  const spentSortedCategories = [...(summary.by_category || [])]
    .map(c => ({
      category: c.category,
      total_usd: Number(c.total_usd) || 0,
      total_bs: Number(c.total_bs) || 0,
      total_eur: Number(c.total_eur) || 0,
      total_usdt: Number(c.total_usdt) || 0,
    }))
    .sort((a, b) => b.total_usd - a.total_usd);

  // 2. Expanded categories: merges zero-spent monthlyBudget.category_limits
  const expandedCategoriesMap = new Map<string, { category: string; total_usd: number; total_bs: number; total_eur: number; total_usdt: number }>();
  for (const c of spentSortedCategories) {
    expandedCategoriesMap.set(c.category, c);
  }

  if (monthlyBudget?.exists && monthlyBudget.category_limits) {
    for (const cl of monthlyBudget.category_limits) {
      if (!expandedCategoriesMap.has(cl.category_name)) {
        expandedCategoriesMap.set(cl.category_name, {
          category: cl.category_name,
          total_usd: 0,
          total_bs: 0,
          total_eur: 0,
          total_usdt: 0,
        });
      }
    }
  }

  const expandedSortedCategories = Array.from(expandedCategoriesMap.values()).sort((a, b) => b.total_usd - a.total_usd);
  const displayedCategories = showAllCategories ? expandedSortedCategories : spentSortedCategories.slice(0, 3);

  // Conditions
  const shouldShowTopCard = spentSortedCategories.length > 0 || Boolean(monthlyBudget?.exists && monthlyBudget.category_limits.length > 0);
  const shouldShowToggle = spentSortedCategories.length > 3 || Boolean(monthlyBudget?.exists && (monthlyBudget.category_limits.length > 0 || globalLimitUsd > 0));

  let dailyAvgText = 'Promedio Diario';
  if (dateFilter) {
    if (dateFilter.preset === 'week') dailyAvgText = 'Promedio Diario (Esta semana)';
    else if (dateFilter.preset === 'month') dailyAvgText = 'Promedio Diario (Este mes)';
    else if (dateFilter.preset === 'year') dailyAvgText = 'Promedio Diario (Este año)';
    else if (dateFilter.preset === 'all') dailyAvgText = 'Promedio Diario (Histórico)';
    else if (dateFilter.preset === 'custom') dailyAvgText = 'Promedio Diario (Personalizado)';
  }

  const hiddenAmount = '••••••';

  return (
    <div className="summary-section mb-6">

      {/* Total Balance (Floating, no card) */}
      <div style={{ marginBottom: '2rem', marginTop: '1rem', padding: '0 0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
          Gastos totales (dolares tasa BCV)
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1 }}>
            {balanceVisible
              ? `$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `$${hiddenAmount}`
            }
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setBalanceVisible(!balanceVisible)}
              className="balance-toggle"
              aria-label={balanceVisible ? 'Ocultar balance' : 'Mostrar balance'}
            >
              {balanceVisible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.05)', padding: '0.2rem 0.6rem', borderRadius: '20px' }}>
              {summary.days_in_range}d
            </span>
          </div>
        </div>
      </div>

      {/* Exchange Rates / Currency Equivalents — Hidden when balance is hidden */}
      {balanceVisible && (
        <>
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
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}> $ {totalUsdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Tether (Crypto)</div>
            </div>
          </div>
        </>
      )}

      {/* Daily Average — Hidden when balance is hidden */}
      {balanceVisible && summary.days_in_range > 1 && (
        <div className="soft-card mt-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'var(--surface-muted)', padding: '0.5rem', borderRadius: '10px', color: 'var(--expense-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Coins size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-tertiary)' }}>{dailyAvgText}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>${dailyAvg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>
        </div>
      )}

      {/* Top Categorías — Displays traffic lights and expands to budget breakdown */}
      {shouldShowTopCard && (
        <div className="soft-card mt-4" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <PieChart size={18} color="var(--text-tertiary)" />
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                Top Categorías
              </h3>
            </div>
            {shouldShowToggle && (
              <button 
                onClick={() => setShowAllCategories(!showAllCategories)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                {showAllCategories ? 'Ver menos' : 'Ver todas'}
              </button>
            )}
          </div>

          {/* Expanded view: Compact Global Budget Header */}
          {showAllCategories && (globalLimitUsd > 0 || globalLimitEff > 0) && (
            <div style={{
              padding: '0.85rem',
              marginBottom: '1rem',
              background: 'var(--surface-muted)',
              borderRadius: 'var(--radius-md, 10px)',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Presupuesto Global ({monthlyBudget?.currency || 'USD'})
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '12px',
                  background: globalTrafficLight === 'red' ? 'rgba(239, 68, 68, 0.15)' : globalTrafficLight === 'yellow' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: globalTrafficLight === 'red' ? '#EF4444' : globalTrafficLight === 'yellow' ? '#F59E0B' : '#10B981'
                }}>
                  {globalSpentPct.toFixed(0)}%
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.4rem', fontWeight: 600 }}>
                <span>${Number(monthlyBudget?.total_spent_usd || 0).toFixed(2)} gastado</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>de ${globalLimitUsd.toFixed(2)}</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(0,0,0,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(globalSpentPct, 100)}%`,
                  background: globalTrafficLight === 'red' ? '#EF4444' : globalTrafficLight === 'yellow' ? '#F59E0B' : '#10B981',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}

          {/* Category List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {displayedCategories.map(c => {
              const val = Number(c.total_usd);
              const percentage = totalUsd > 0 ? ((val / totalUsd) * 100).toFixed(1) : '0.0';
              
              const categoryData = categories.find(cat => cat.name === c.category);
              const IconComponent = categoryData && categoryData.color && ICON_MAP[categoryData.color] ? ICON_MAP[categoryData.color] : Package;
              const cl = budgetLimitsMap.get(c.category);

              return (
                <div key={c.category} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)', flexShrink: 0 }}>
                        <IconComponent size={14} />
                      </div>
                      <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>{c.category}</span>
                      
                      {/* Collapsed dot & badge indicator for budgeted categories */}
                      {cl && (
                        <span style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          backgroundColor: cl.traffic_light === 'red' ? '#EF4444' : cl.traffic_light === 'yellow' ? '#F59E0B' : '#10B981',
                          display: 'inline-block',
                          flexShrink: 0
                        }} />
                      )}
                      {cl && !showAllCategories && cl.traffic_light !== 'green' && (
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.1rem 0.35rem',
                          borderRadius: '8px',
                          background: cl.traffic_light === 'red' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: cl.traffic_light === 'red' ? '#EF4444' : '#F59E0B',
                          lineHeight: 1
                        }}>
                          {cl.spent_percentage.toFixed(0)}%
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {showAllCategories && cl ? (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {balanceVisible ? `$${val.toFixed(2)} / $${Number(cl.limit_usd).toFixed(2)}` : `$${hiddenAmount}`}
                          </div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: cl.traffic_light === 'red' ? '#EF4444' : cl.traffic_light === 'yellow' ? '#F59E0B' : '#10B981' }}>
                            {cl.spent_percentage.toFixed(0)}%
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{percentage}%</span>
                          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {balanceVisible ? `$${val.toFixed(2)}` : `$${hiddenAmount}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded progress bar for budgeted categories */}
                  {showAllCategories && cl && (
                    <div style={{ height: '4px', background: 'rgba(0,0,0,0.06)', borderRadius: '2px', overflow: 'hidden', marginLeft: '34px' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(cl.spent_percentage, 100)}%`,
                        background: cl.traffic_light === 'red' ? '#EF4444' : cl.traffic_light === 'yellow' ? '#F59E0B' : '#10B981',
                        borderRadius: '2px',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  )}
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
