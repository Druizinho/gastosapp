import React, { useState, useEffect } from 'react';
import type { RangeSummaryResponse, DateFilter, Category, MonthlyBudgetResponse } from '../types';
import { Eye, EyeOff, Coins, PieChart } from 'lucide-react';
import { SkeletonHeroCard } from './ui/Skeleton';
import { resolveCategoryVisuals } from '../utils/categoryVisuals';
import { useCurrencyPreference } from '../context/CurrencyPreferenceContext';
import {
  CURRENCY_CONFIGS,
  getFilteredSubCurrencies,
  formatCurrency,
  formatSignedCurrency,
  resolveCurrencyTotal,
  resolveIncomeTotal,
  resolveBalanceTotal,
  resolveCategoryTotal,
  resolveDailyAvg,
  resolveBudgetCategoryLimit
} from '../utils/currencySummary';

interface SummaryProps {
  summary: RangeSummaryResponse | null;
  dateFilter?: DateFilter;
  categories?: Category[];
  monthlyBudget?: MonthlyBudgetResponse | null;
}

const BALANCE_VISIBLE_KEY = 'gastosapp_balance_visible';

const Summary: React.FC<SummaryProps> = ({ summary, dateFilter, categories = [], monthlyBudget }) => {
  const { mainCurrency } = useCurrencyPreference();
  const [balanceVisible, setBalanceVisible] = useState<boolean>(() => {
    const stored = localStorage.getItem(BALANCE_VISIBLE_KEY);
    return stored !== null ? stored === 'true' : true;
  });

  // Auditor Fix #7: State hook declared unconditionally at the top
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [equivMode, setEquivMode] = useState<'expenses' | 'incomes'>('expenses');

  useEffect(() => {
    localStorage.setItem(BALANCE_VISIBLE_KEY, String(balanceVisible));
  }, [balanceVisible]);

  if (!summary) return <SkeletonHeroCard />;

  const currentConfig = CURRENCY_CONFIGS[mainCurrency] || CURRENCY_CONFIGS.USD;

  const mainTotal = resolveCurrencyTotal(summary, mainCurrency);
  const mainIncome = resolveIncomeTotal(summary, mainCurrency);
  const mainBalance = resolveBalanceTotal(summary, mainCurrency);
  const mainDailyAvg = resolveDailyAvg(summary, mainCurrency);
  const subCurrencies = getFilteredSubCurrencies(mainCurrency);

  // Resolve primary budget and active category limits
  const primaryBudget = monthlyBudget?.budgets?.find(b => b.is_primary)
    || monthlyBudget?.budgets?.[0]
    || null;
  const activeCategoryLimits = (
    primaryBudget
      ? (primaryBudget.category_limits || [])
      : (monthlyBudget?.category_limits || [])
  ).filter(cl => Number(cl.limit_amount) > 0);

  // Build map of budgeted category limits using case-insensitive trimmed keys
  const budgetLimitsMap = new Map(
    activeCategoryLimits.map(cl => [cl.category_name.trim().toLowerCase(), cl])
  );
  const globalLimitUsd = Number(primaryBudget ? primaryBudget.global_limit_usd : monthlyBudget?.global_limit_usd) || 0;
  const globalLimitEff = Number(primaryBudget ? primaryBudget.effective_global_limit : monthlyBudget?.effective_global_limit) || 0;
  const globalSpentPct = (primaryBudget ? primaryBudget.global_spent_percentage : monthlyBudget?.global_spent_percentage) || 0;
  const globalTrafficLight = (primaryBudget ? primaryBudget.global_traffic_light : monthlyBudget?.global_traffic_light) || 'green';
  const primarySpentUsd = Number(primaryBudget ? primaryBudget.total_spent_usd : monthlyBudget?.total_spent_usd) || 0;
  const primaryCurrency = primaryBudget?.currency || monthlyBudget?.currency || 'USD';
  const primaryName = primaryBudget?.name || monthlyBudget?.name || 'Presupuesto Principal';

  // 1. Only categories with actual spend from summary.by_category
  const spentSortedCategories = [...(summary.by_category || [])]
    .map(c => ({
      category: c.category,
      total_usd: Number(c.total_usd) || 0,
      total_bs: Number(c.total_bs) || 0,
      total_eur: Number(c.total_eur) || 0,
      total_usdt: Number(c.total_usdt) || 0,
    }))
    .sort((a, b) => resolveCategoryTotal(b, mainCurrency) - resolveCategoryTotal(a, mainCurrency));

  // 2. Expanded categories: merges zero-spent activeCategoryLimits
  const expandedCategoriesMap = new Map<string, { category: string; total_usd: number; total_bs: number; total_eur: number; total_usdt: number }>();
  for (const c of spentSortedCategories) {
    expandedCategoriesMap.set(c.category.trim().toLowerCase(), c);
  }

  if (monthlyBudget?.exists && activeCategoryLimits) {
    for (const cl of activeCategoryLimits) {
      const key = cl.category_name.trim().toLowerCase();
      if (!expandedCategoriesMap.has(key)) {
        expandedCategoriesMap.set(key, {
          category: cl.category_name,
          total_usd: 0,
          total_bs: 0,
          total_eur: 0,
          total_usdt: 0,
        });
      }
    }
  }

  const expandedSortedCategories = Array.from(expandedCategoriesMap.values()).sort((a, b) => resolveCategoryTotal(b, mainCurrency) - resolveCategoryTotal(a, mainCurrency));
  const displayedCategories = showAllCategories ? expandedSortedCategories : spentSortedCategories.slice(0, 3);

  // Conditions
  const shouldShowTopCard = spentSortedCategories.length > 0 || Boolean(monthlyBudget?.exists && activeCategoryLimits.length > 0);
  const shouldShowToggle = spentSortedCategories.length > 3 || Boolean(monthlyBudget?.exists && (activeCategoryLimits.length > 0 || globalLimitUsd > 0));

  let dailyAvgText = 'Promedio diario de gasto';
  if (dateFilter) {
    if (dateFilter.preset === 'week') dailyAvgText = 'Promedio diario de gasto (Esta semana)';
    else if (dateFilter.preset === 'month') dailyAvgText = 'Promedio diario de gasto (Este mes)';
    else if (dateFilter.preset === 'year') dailyAvgText = 'Promedio diario de gasto (Este año)';
    else if (dateFilter.preset === 'all') dailyAvgText = 'Promedio diario de gasto (Histórico)';
    else if (dateFilter.preset === 'custom') dailyAvgText = 'Promedio diario de gasto (Personalizado)';
  }

  const hiddenAmount = '••••••';

  return (
    <div className="summary-section mb-6">

      {/* Hero: Period Balance & Breakdown (Floating & Compact) */}
      <div
        style={{
          marginBottom: '1.25rem',
          marginTop: '0.25rem',
          padding: '0.25rem 0.25rem 0.5rem 0.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
            Balance del período
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setBalanceVisible(!balanceVisible)}
              className="balance-toggle"
              aria-label={balanceVisible ? 'Ocultar balance' : 'Mostrar balance'}
            >
              {balanceVisible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-tertiary)', background: 'var(--surface-muted, rgba(0,0,0,0.05))', padding: '0.18rem 0.5rem', borderRadius: '9999px' }}>
              {summary.days_in_range}d
            </span>
          </div>
        </div>

        {/* Main Balance Figure */}
        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          {balanceVisible
            ? formatSignedCurrency(mainBalance, mainCurrency)
            : `${currentConfig.symbol} ${hiddenAmount}`
          }
        </div>

        {/* Compact Sub-metrics: Ingresado & Gastado grouped together directly under the balance */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.3rem 0.7rem',
            borderRadius: 'var(--radius-full, 9999px)',
            background: 'var(--surface-muted, rgba(0, 0, 0, 0.04))',
            border: '1px solid var(--border-color, rgba(0, 0, 0, 0.06))',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--income-color, #10B981)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
              ↓ Ingresado
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {balanceVisible ? formatCurrency(mainIncome, mainCurrency) : `${currentConfig.symbol} ${hiddenAmount}`}
            </span>
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.3rem 0.7rem',
            borderRadius: 'var(--radius-full, 9999px)',
            background: 'var(--surface-muted, rgba(0, 0, 0, 0.04))',
            border: '1px solid var(--border-color, rgba(0, 0, 0, 0.06))',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--expense-color, #EF4444)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
              ↑ Gastado
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {balanceVisible ? formatCurrency(mainTotal, mainCurrency) : `${currentConfig.symbol} ${hiddenAmount}`}
            </span>
          </div>
        </div>
      </div>

      {/* Exchange Rates / Currency Equivalents — Hidden when balance is hidden */}
      {balanceVisible && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Equivalencias</h3>
            <div
              role="tablist"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'var(--surface-muted, rgba(0, 0, 0, 0.05))',
                padding: '3px',
                borderRadius: '9999px',
                gap: '2px',
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={equivMode === 'expenses'}
                onClick={() => setEquivMode('expenses')}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  border: 'none',
                  background: equivMode === 'expenses' ? 'var(--surface-color, #FFFFFF)' : 'transparent',
                  color: equivMode === 'expenses' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  fontWeight: equivMode === 'expenses' ? 700 : 500,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  boxShadow: equivMode === 'expenses' ? 'var(--shadow-sm)' : 'none',
                  transition: 'transform 150ms ease-out, background 150ms ease-out, color 150ms ease-out',
                }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                Gastos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={equivMode === 'incomes'}
                onClick={() => setEquivMode('incomes')}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  border: 'none',
                  background: equivMode === 'incomes' ? 'var(--surface-color, #FFFFFF)' : 'transparent',
                  color: equivMode === 'incomes' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  fontWeight: equivMode === 'incomes' ? 700 : 500,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  boxShadow: equivMode === 'incomes' ? 'var(--shadow-sm)' : 'none',
                  transition: 'transform 150ms ease-out, background 150ms ease-out, color 150ms ease-out',
                }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                Ingresos
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', paddingLeft: '0.5rem', paddingRight: '0.5rem', scrollSnapType: 'x mandatory' }} className="hide-scrollbar">
            {subCurrencies.map(currencyKey => {
              const config = CURRENCY_CONFIGS[currencyKey];
              const totalVal = equivMode === 'expenses'
                ? resolveCurrencyTotal(summary, currencyKey)
                : resolveIncomeTotal(summary, currencyKey);
              const formattedValue = formatCurrency(totalVal, currencyKey);
              const strLen = formattedValue.length;
              const fontSize = strLen > 11 ? '0.98rem' : strLen >= 9 ? '1.08rem' : '1.22rem';

              return (
                <div
                  key={currencyKey}
                  className="soft-card"
                  style={{
                    flex: '0 0 142px',
                    minWidth: '142px',
                    maxWidth: '142px',
                    minHeight: '128px',
                    padding: '1.15rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    scrollSnapAlign: 'start',
                    boxSizing: 'border-box'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.65rem'
                    }}
                  >
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: config.badgeBg,
                        color: config.badgeColor,
                        fontWeight: 'bold',
                        fontSize: config.badgeText.length > 1 ? '0.7rem' : '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {config.badgeText}
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {config.label}
                    </span>
                  </div>

                  <div>
                    <div
                      title={formattedValue}
                      style={{
                        fontSize,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: '0.25rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        letterSpacing: '-0.02em',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {formattedValue}
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-tertiary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {config.name}
                    </div>
                  </div>
                </div>
              );
            })}
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
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(mainDailyAvg, mainCurrency)}
              </div>
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
                Top categorías de gasto
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
                  Presupuesto Principal: {primaryName} ({primaryCurrency})
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
                <span>${primarySpentUsd.toFixed(2)} gastado</span>
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
              const val = resolveCategoryTotal(c, mainCurrency);
              const percentage = mainTotal > 0 ? ((val / mainTotal) * 100).toFixed(1) : '0.0';
              
              const categoryData = categories.find(cat => cat.name === c.category);
              const { IconComponent, hexColor } = resolveCategoryVisuals(categoryData, c.category);
              const cl = budgetLimitsMap.get(c.category.trim().toLowerCase());
              const limitVal = resolveBudgetCategoryLimit(cl, mainCurrency);

              return (
                <div key={c.category} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        background: `${hexColor}18`,
                        border: `1px solid ${hexColor}35`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: hexColor,
                        flexShrink: 0
                      }}>
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
                            {balanceVisible ? `${formatCurrency(val, mainCurrency)} / ${formatCurrency(limitVal, mainCurrency)}` : `${currentConfig.symbol} ${hiddenAmount}`}
                          </div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: cl.traffic_light === 'red' ? '#EF4444' : cl.traffic_light === 'yellow' ? '#F59E0B' : '#10B981' }}>
                            {cl.spent_percentage.toFixed(0)}%
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{percentage}%</span>
                          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {balanceVisible ? formatCurrency(val, mainCurrency) : `${currentConfig.symbol} ${hiddenAmount}`}
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
