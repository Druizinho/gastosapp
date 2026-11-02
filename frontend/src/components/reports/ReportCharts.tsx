import React, { forwardRef, useState, useMemo } from 'react';
import type { MainCurrencyPreference, TimeSeriesBucket, CategoryComparisonItem } from '../../types';
import { formatCurrencyAmount, toNumeric } from '../../utils/currencyFormat';

// ============================================================================
// SHARED COLOR PALETTES & UTILITIES
// ============================================================================

export const CHART_PALETTE = [
  '#6366F1', // Indigo
  '#EC4899', // Pink
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#06B6D4', // Cyan
  '#EF4444', // Red
  '#84CC16', // Lime
  '#64748B', // Slate
];

const COLOR_INCOME = '#10B981';
const COLOR_EXPENSE = '#F43F5E';
const COLOR_PERIOD_A = '#64748B';
const COLOR_PERIOD_B = '#6366F1';

function formatCompactNumber(val: number): string {
  if (Math.abs(val) >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(val) >= 1_000) {
    return `${(val / 1_000).toFixed(1)}k`;
  }
  return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function getNiceMax(val: number): number {
  if (val <= 0) return 100;
  const exponent = Math.floor(Math.log10(val));
  const power = Math.pow(10, exponent);
  const fraction = val / power;
  let niceFraction: number;
  if (fraction <= 1.2) niceFraction = 1.2;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * power;
}

function formatBucketDate(label: string): string {
  if (!label) return '';
  // Format YYYY-MM-DD -> "DD/MM" or "D Mes"
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const [, month, day] = label.split('-');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const mIdx = parseInt(month, 10) - 1;
    return `${parseInt(day, 10)} ${months[mIdx] || month}`;
  }
  // Format YYYY-MM -> "Mes YY"
  if (/^\d{4}-\d{2}$/.test(label)) {
    const [year, month] = label.split('-');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const mIdx = parseInt(month, 10) - 1;
    return `${months[mIdx] || month} ${year.slice(2)}`;
  }
  return label;
}

function getBucketValues(b: TimeSeriesBucket, currency: MainCurrencyPreference): { income: number; expense: number } {
  let inc = 0;
  let exp = 0;
  switch (currency) {
    case 'BS':
      inc = toNumeric(b.income_bs);
      exp = toNumeric(b.expense_bs);
      break;
    case 'EUR':
      inc = toNumeric(b.income_eur);
      exp = toNumeric(b.expense_eur);
      break;
    case 'USDT':
      inc = toNumeric(b.income_usdt);
      exp = toNumeric(b.expense_usdt);
      break;
    case 'USD':
    default:
      inc = toNumeric(b.income_usd);
      exp = toNumeric(b.expense_usd);
      break;
  }
  return { income: Math.max(0, inc), expense: Math.max(0, exp) };
}

function getCategoryValues(item: CategoryComparisonItem, currency: MainCurrencyPreference): { amountA: number; amountB: number } {
  let a = 0;
  let b = 0;
  switch (currency) {
    case 'BS':
      a = toNumeric(item.period_a_bs);
      b = toNumeric(item.period_b_bs);
      break;
    case 'EUR':
      a = toNumeric(item.period_a_eur);
      b = toNumeric(item.period_b_eur);
      break;
    case 'USDT':
      a = toNumeric(item.period_a_usdt);
      b = toNumeric(item.period_b_usdt);
      break;
    case 'USD':
    default:
      a = toNumeric(item.period_a_usd);
      b = toNumeric(item.period_b_usd);
      break;
  }
  return { amountA: Math.max(0, a), amountB: Math.max(0, b) };
}

// ============================================================================
// 1. CATEGORY DONUT CHART WITH INTERACTIVE DRILL-DOWN
// ============================================================================

export interface CategoryTransactionItem {
  id?: string | number;
  date: string;
  description: string;
  amount: number;
  category?: string;
  currency?: string;
}

export interface CategoryDonutItem {
  category: string;
  amount: number;
  percentage: number;
  color?: string;
  transactions?: CategoryTransactionItem[];
}

export interface CategoryDonutChartProps {
  categories: CategoryDonutItem[];
  total: number;
  currency: MainCurrencyPreference;
  title?: string;
  transactions?: Array<{
    id?: string | number;
    date: string;
    description: string;
    amount: number;
    category?: string;
    currency?: string;
    amount_usd?: number | null;
    amount_bs?: number | null;
    amount_eur?: number | null;
    amount_usdt?: number | null;
  }>;
  selectedCategory?: string | null;
  onSelectCategory?: (category: string | null) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const CategoryDonutChart = forwardRef<SVGSVGElement, CategoryDonutChartProps>(
  (
    {
      categories,
      total,
      currency,
      title = 'Distribución por Categorías',
      transactions = [],
      selectedCategory,
      onSelectCategory,
      className,
      style,
    },
    ref
  ) => {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const [internalSelectedCategory, setInternalSelectedCategory] = useState<string | null>(null);

    const activeCategory = selectedCategory !== undefined ? selectedCategory : internalSelectedCategory;

    const handleToggleCategory = (catName: string) => {
      const nextVal = activeCategory === catName ? null : catName;
      if (selectedCategory === undefined) {
        setInternalSelectedCategory(nextVal);
      }
      onSelectCategory?.(nextVal);
    };

    // Normalize and enrich categories with fallback colors
    const enrichedCategories = useMemo(() => {
      const safeTotal = Math.max(0, total);
      return categories.map((cat, idx) => {
        const safeAmount = Math.max(0, toNumeric(cat.amount));
        const computedPct = safeTotal > 0 ? (safeAmount / safeTotal) * 100 : toNumeric(cat.percentage);
        const color = cat.color || CHART_PALETTE[idx % CHART_PALETTE.length];
        return {
          ...cat,
          amount: safeAmount,
          percentage: Number(computedPct.toFixed(1)),
          color,
        };
      });
    }, [categories, total]);

    // Active drill-down category item
    const selectedItem = useMemo(() => {
      if (!activeCategory) return null;
      return enrichedCategories.find((c) => c.category === activeCategory) || null;
    }, [enrichedCategories, activeCategory]);

    // Filter matching transactions for drilldown
    const matchingTransactions = useMemo(() => {
      if (!selectedItem) return [];
      if (selectedItem.transactions && selectedItem.transactions.length > 0) {
        return selectedItem.transactions;
      }
      if (transactions && transactions.length > 0) {
        return transactions
          .filter((t) => (t.category || '').trim().toLowerCase() === selectedItem.category.trim().toLowerCase())
          .map((t) => {
            let amt = t.amount;
            if (currency === 'BS' && t.amount_bs !== undefined && t.amount_bs !== null) amt = toNumeric(t.amount_bs);
            else if (currency === 'EUR' && t.amount_eur !== undefined && t.amount_eur !== null) amt = toNumeric(t.amount_eur);
            else if (currency === 'USDT' && t.amount_usdt !== undefined && t.amount_usdt !== null) amt = toNumeric(t.amount_usdt);
            else if (currency === 'USD' && t.amount_usd !== undefined && t.amount_usd !== null) amt = toNumeric(t.amount_usd);
            return {
              id: t.id,
              date: t.date,
              description: t.description,
              amount: amt,
            };
          });
      }
      return [];
    }, [selectedItem, transactions, currency]);

    // Donut Geometry Parameters
    const size = 220;
    const center = size / 2;
    const radius = 78;
    const strokeWidth = 26;
    const circumference = 2 * Math.PI * radius;

    // Build segments
    let cumulativePercent = 0;
    const segments = enrichedCategories.map((item, idx) => {
      const pct = Math.max(0, item.percentage) / 100;
      const strokeLength = pct * circumference;
      const gap = enrichedCategories.length > 1 ? Math.min(2.5, strokeLength * 0.15) : 0;
      const dashArray = `${Math.max(0, strokeLength - gap)} ${circumference}`;
      const strokeDashoffset = -(cumulativePercent * circumference);
      cumulativePercent += pct;
      return {
        ...item,
        idx,
        dashArray,
        strokeDashoffset,
      };
    });

    const isTotalZero = total <= 0 || enrichedCategories.length === 0;

    // Center display logic
    const centerDisplayItem = hoveredIdx !== null && enrichedCategories[hoveredIdx]
      ? enrichedCategories[hoveredIdx]
      : selectedItem;

    return (
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          background: 'var(--surface-color, #FFFFFF)',
          borderRadius: '16px',
          border: '1px solid var(--border-color, #E5E7EB)',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
          padding: '1.25rem',
          ...style,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary, #111827)', margin: 0 }}>
              {title}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #6B7280)', margin: '2px 0 0 0' }}>
              {enrichedCategories.length} {enrichedCategories.length === 1 ? 'categoría registrada' : 'categorías registradas'}
              {activeCategory ? ` • Seleccionada: ${activeCategory}` : ' • Toca una para ver desglose'}
            </p>
          </div>
          <span
            style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              padding: '0.25rem 0.65rem',
              borderRadius: '8px',
              background: 'var(--surface-muted, #F3F4F6)',
              color: 'var(--text-primary, #111827)',
            }}
          >
            {formatCurrencyAmount(total, currency)}
          </span>
        </div>

        {/* Content Area: SVG Donut + Breakdown List */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            alignItems: 'center',
            gap: '1.5rem',
          }}
        >
          {/* SVG Donut */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: `${size}px`, height: `${size}px`, position: 'relative' }}>
              <svg
                ref={ref}
                xmlns="http://www.w3.org/2000/svg"
                viewBox={`0 0 ${size} ${size}`}
                width="100%"
                height="100%"
                style={{ overflow: 'visible', display: 'block' }}
              >
                {/* Background Ring */}
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth={strokeWidth}
                />

                {/* Donut Segments */}
                {!isTotalZero && (
                  <g transform={`rotate(-90 ${center} ${center})`}>
                    {segments.map((seg) => {
                      const isHovered = hoveredIdx === seg.idx;
                      const isSelected = activeCategory === seg.category;
                      const isOtherSelected = activeCategory !== null && !isSelected;
                      const isOtherHovered = hoveredIdx !== null && !isHovered && activeCategory === null;

                      return (
                        <circle
                          key={seg.idx}
                          cx={center}
                          cy={center}
                          r={radius}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth={isSelected ? strokeWidth + 6 : isHovered ? strokeWidth + 3 : strokeWidth}
                          strokeDasharray={seg.dashArray}
                          strokeDashoffset={seg.strokeDashoffset}
                          strokeLinecap="round"
                          opacity={isOtherSelected ? 0.35 : isOtherHovered ? 0.45 : 1}
                          style={{
                            transition: 'stroke-width 150ms ease-out, opacity 150ms ease-out',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={() => setHoveredIdx(seg.idx)}
                          onMouseLeave={() => setHoveredIdx(null)}
                          onClick={() => handleToggleCategory(seg.category)}
                        />
                      );
                    })}
                  </g>
                )}

                {/* Center KPI Text */}
                <g style={{ pointerEvents: 'none' }}>
                  <text
                    x={center}
                    y={center - 8}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--text-primary, #111827)"
                    style={{
                      fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                      fontSize: '17px',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {centerDisplayItem
                      ? formatCurrencyAmount(centerDisplayItem.amount, currency)
                      : formatCurrencyAmount(total, currency)}
                  </text>
                  <text
                    x={center}
                    y={center + 14}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--text-secondary, #6B7280)"
                    style={{
                      fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                      fontSize: '10px',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {centerDisplayItem ? centerDisplayItem.category : 'TOTAL GASTOS'}
                  </text>
                  {centerDisplayItem && (
                    <text
                      x={center}
                      y={center + 30}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={centerDisplayItem.color}
                      style={{
                        fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                        fontSize: '11px',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {centerDisplayItem.percentage}%
                    </text>
                  )}
                </g>
              </svg>
            </div>
          </div>

          {/* Breakdown List of Categories */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              maxHeight: '260px',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              paddingRight: '0.25rem',
            }}
          >
            {isTotalZero ? (
              <div
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  color: 'var(--text-tertiary, #9CA3AF)',
                  fontSize: '0.875rem',
                }}
              >
                No se registraron gastos en las categorías para este periodo.
              </div>
            ) : (
              enrichedCategories.map((item, idx) => {
                const isHovered = hoveredIdx === idx;
                const isSelected = activeCategory === item.category;

                return (
                  <div
                    key={item.category + idx}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onClick={() => handleToggleCategory(item.category)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '0.5rem 0.65rem',
                      borderRadius: '8px',
                      background: isSelected
                        ? 'rgba(99, 102, 241, 0.08)'
                        : isHovered
                        ? 'var(--surface-hover, #FAFAF9)'
                        : 'transparent',
                      border: isSelected
                        ? '1px solid rgba(99, 102, 241, 0.35)'
                        : isHovered
                        ? '1px solid var(--border-color, #E5E7EB)'
                        : '1px solid transparent',
                      transition: 'transform 150ms ease-out, background-color 150ms ease-out, border-color 150ms ease-out',
                      cursor: 'pointer',
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    onMouseLeave={(e) => {
                      setHoveredIdx(null);
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '9999px',
                            backgroundColor: item.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '0.85rem',
                            fontWeight: isSelected ? 700 : 600,
                            color: isSelected ? 'var(--text-primary, #0F172A)' : 'var(--text-primary, #111827)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.category}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: '0.725rem',
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            padding: '1px 6px',
                            borderRadius: '8px',
                            background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'var(--surface-muted, #F3F4F6)',
                            color: isSelected ? '#4F46E5' : 'var(--text-secondary, #6B7280)',
                          }}
                        >
                          {item.percentage}%
                        </span>
                        <span
                          style={{
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            color: 'var(--text-primary, #111827)',
                          }}
                        >
                          {formatCurrencyAmount(item.amount, currency)}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar Track */}
                    <div
                      style={{
                        width: '100%',
                        height: '4px',
                        borderRadius: '2px',
                        background: 'var(--surface-muted, #F3F4F6)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, item.percentage))}%`,
                          height: '100%',
                          borderRadius: '2px',
                          backgroundColor: item.color,
                          transition: 'width 250ms ease-out',
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Drill-Down Sub-Card */}
        {selectedItem && (
          <div
            style={{
              marginTop: '0.25rem',
              padding: '0.875rem 1rem',
              borderRadius: '12px',
              background: 'var(--surface-muted, #F8FAFC)',
              border: '1px solid var(--border-color, #E2E8F0)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {/* Sub-Card Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '3px',
                    backgroundColor: selectedItem.color,
                    flexShrink: 0,
                  }}
                />
                <h4
                  style={{
                    margin: 0,
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: 'var(--text-primary, #0F172A)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  Detalle: {selectedItem.category}
                </h4>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.08)',
                    color: '#4F46E5',
                  }}
                >
                  {selectedItem.percentage}% del total
                </span>
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--text-primary, #0F172A)',
                  }}
                >
                  {formatCurrencyAmount(selectedItem.amount, currency)}
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleCategory(selectedItem.category)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'var(--surface-color, #FFFFFF)',
                    border: '1px solid var(--border-color, #CBD5E1)',
                    borderRadius: '8px',
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary, #64748B)',
                    cursor: 'pointer',
                    transition: 'transform 150ms ease-out, background-color 150ms ease-out, color 150ms ease-out',
                  }}
                  onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                  onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  Cerrar desglose ✕
                </button>
              </div>
            </div>

            {/* Sub-Card Content: Transaction List */}
            {matchingTransactions.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  paddingRight: '0.25rem',
                }}
              >
                {matchingTransactions.map((tx, idx) => (
                  <div
                    key={tx.id ? String(tx.id) : `tx-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '8px',
                      background: 'var(--surface-color, #FFFFFF)',
                      border: '1px solid var(--border-color, #F1F5F9)',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-tertiary, #94A3B8)',
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {tx.date}
                      </span>
                      <span
                        style={{
                          color: 'var(--text-primary, #1E293B)',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {tx.description || 'Gasto registrado'}
                      </span>
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        color: 'var(--text-primary, #0F172A)',
                        fontVariantNumeric: 'tabular-nums',
                        flexShrink: 0,
                      }}
                    >
                      {formatCurrencyAmount(tx.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: '0.75rem',
                  textAlign: 'center',
                  color: 'var(--text-secondary, #64748B)',
                  fontSize: '0.8rem',
                  background: 'var(--surface-color, #FFFFFF)',
                  borderRadius: '8px',
                  border: '1px dashed var(--border-color, #CBD5E1)',
                }}
              >
                Gasto consolidado de <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrencyAmount(selectedItem.amount, currency)}</strong> ({selectedItem.percentage}% del total). No hay transacciones individuales adicionales cargadas en este desglose.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

CategoryDonutChart.displayName = 'CategoryDonutChart';

// ============================================================================
// 2. CASHFLOW TREND CHART (DUAL BARS: INCOME VS EXPENSE)
// ============================================================================

export interface CashflowTrendChartProps {
  series: TimeSeriesBucket[];
  currency: MainCurrencyPreference;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const CashflowTrendChart = forwardRef<SVGSVGElement, CashflowTrendChartProps>(
  ({ series, currency, title = 'Flujo de Caja: Ingresos vs. Gastos', className, style }, ref) => {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    // Aggregate totals and parsed values
    const { parsedSeries, totalIncome, totalExpense, maxVal } = useMemo(() => {
      let totInc = 0;
      let totExp = 0;
      let peak = 0;

      const parsed = series.map((b) => {
        const { income, expense } = getBucketValues(b, currency);
        totInc += income;
        totExp += expense;
        if (income > peak) peak = income;
        if (expense > peak) peak = expense;
        return {
          ...b,
          income,
          expense,
          net: income - expense,
          formattedDate: formatBucketDate(b.bucket_label),
        };
      });

      return {
        parsedSeries: parsed,
        totalIncome: totInc,
        totalExpense: totExp,
        maxVal: getNiceMax(peak),
      };
    }, [series, currency]);

    const netTotal = totalIncome - totalExpense;

    // Compact Key Insight Pill
    const trendInsight = useMemo(() => {
      if (parsedSeries.length === 0) return null;
      if (netTotal > 0) {
        return {
          icon: '✨',
          badge: 'Balance neto positivo',
          detail: `+${formatCurrencyAmount(netTotal, currency)}`,
          color: COLOR_INCOME,
          bg: 'rgba(16, 185, 129, 0.09)',
          border: 'rgba(16, 185, 129, 0.25)',
        };
      }
      if (netTotal < 0) {
        const maxExpBucket = [...parsedSeries].sort((a, b) => b.expense - a.expense)[0];
        if (maxExpBucket && maxExpBucket.expense > 0) {
          return {
            icon: '⚡',
            badge: 'Mayor salida',
            detail: `${maxExpBucket.formattedDate}: ${formatCurrencyAmount(maxExpBucket.expense, currency)}`,
            color: COLOR_EXPENSE,
            bg: 'rgba(244, 63, 94, 0.09)',
            border: 'rgba(244, 63, 94, 0.25)',
          };
        }
        return {
          icon: '⚠️',
          badge: 'Déficit neto',
          detail: formatCurrencyAmount(netTotal, currency),
          color: COLOR_EXPENSE,
          bg: 'rgba(244, 63, 94, 0.09)',
          border: 'rgba(244, 63, 94, 0.25)',
        };
      }
      return {
        icon: '⚖️',
        badge: 'Flujo balanceado',
        detail: 'Ingresos = Gastos',
        color: 'var(--text-secondary, #6B7280)',
        bg: 'var(--surface-muted, #F3F4F6)',
        border: 'var(--border-color, #E5E7EB)',
      };
    }, [parsedSeries, netTotal, currency]);

    // SVG Layout Dimensions
    const svgWidth = 640;
    const svgHeight = 280;
    const padLeft = 60;
    const padRight = 20;
    const padTop = 35;
    const padBottom = 45;
    const innerWidth = svgWidth - padLeft - padRight;
    const innerHeight = svgHeight - padTop - padBottom;

    const count = parsedSeries.length;
    const slotWidth = count > 0 ? innerWidth / count : innerWidth;
    const barWidth = Math.min(22, Math.max(5, (slotWidth - 8) / 2));

    // Y Axis Ticks (4 levels: 0, 33%, 66%, 100%)
    const yTicks = [
      { ratio: 0, val: 0 },
      { ratio: 0.333, val: maxVal * 0.333 },
      { ratio: 0.666, val: maxVal * 0.666 },
      { ratio: 1, val: maxVal },
    ];

    return (
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          background: 'var(--surface-color, #FFFFFF)',
          borderRadius: '16px',
          border: '1px solid var(--border-color, #E5E7EB)',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
          padding: '1.25rem',
          ...style,
        }}
      >
        {/* Header with Title and KPI Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary, #111827)', margin: 0 }}>
                {title}
              </h3>
              {trendInsight && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '8px',
                    background: trendInsight.bg,
                    border: `1px solid ${trendInsight.border}`,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: trendInsight.color,
                  }}
                >
                  <span>{trendInsight.icon}</span>
                  <span style={{ fontWeight: 700 }}>Insight Clave:</span>
                  <span>{trendInsight.badge}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>({trendInsight.detail})</span>
                </div>
              )}
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #6B7280)', margin: '2px 0 0 0' }}>
              {count} {count === 1 ? 'intervalo temporal' : 'intervalos temporales'}
            </p>
          </div>

          {/* Quick Legend / Totals */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: COLOR_INCOME }} />
              <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary, #6B7280)' }}>Ingresos:</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: COLOR_INCOME }}>
                {formatCurrencyAmount(totalIncome, currency)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: COLOR_EXPENSE }} />
              <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary, #6B7280)' }}>Gastos:</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: COLOR_EXPENSE }}>
                {formatCurrencyAmount(totalExpense, currency)}
              </span>
            </div>

            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                padding: '0.2rem 0.55rem',
                borderRadius: '8px',
                background: netTotal >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                color: netTotal >= 0 ? COLOR_INCOME : COLOR_EXPENSE,
              }}
            >
              Neto: {formatCurrencyAmount(netTotal, currency)}
            </span>
          </div>
        </div>

        {/* SVG Chart - Fluid & Responsive without forced horizontal scroll */}
        <div style={{ width: '100%', position: 'relative' }}>
          <svg
            ref={ref}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            width="100%"
            height="auto"
            style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}
          >
            {/* Grid Lines & Y-Axis Scale */}
            {yTicks.map((tick) => {
              const y = padTop + innerHeight - tick.ratio * innerHeight;
              return (
                <g key={tick.ratio}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgWidth - padRight}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeDasharray={tick.ratio === 0 ? undefined : '3 3'}
                    strokeWidth={tick.ratio === 0 ? '1.5' : '1'}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3}
                    textAnchor="end"
                    fill="var(--text-tertiary, #9CA3AF)"
                    style={{
                      fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                      fontSize: '10px',
                      fontWeight: 500,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatCompactNumber(tick.val)}
                  </text>
                </g>
              );
            })}

            {/* Zero State Notice */}
            {count === 0 ? (
              <text
                x={svgWidth / 2}
                y={svgHeight / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--text-tertiary, #9CA3AF)"
                style={{
                  fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                No hay datos en el rango seleccionado
              </text>
            ) : (
              /* Bucket Bars */
              parsedSeries.map((item, idx) => {
                const centerX = padLeft + (idx + 0.5) * slotWidth;
                const incHeight = maxVal > 0 ? (item.income / maxVal) * innerHeight : 0;
                const expHeight = maxVal > 0 ? (item.expense / maxVal) * innerHeight : 0;

                const incY = padTop + innerHeight - Math.max(item.income > 0 ? 3 : 0, incHeight);
                const expY = padTop + innerHeight - Math.max(item.expense > 0 ? 3 : 0, expHeight);

                const incX = centerX - barWidth - 1;
                const expX = centerX + 1;

                const isHovered = hoveredIdx === idx;

                // Stride logic for X labels to prevent overlap
                const stride = count > 14 ? Math.ceil(count / 8) : 1;
                const showLabel = idx === 0 || idx === count - 1 || idx % stride === 0;

                return (
                  <g
                    key={item.bucket_label + idx}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {/* Hover Column Background Shading */}
                    {isHovered && (
                      <rect
                        x={centerX - slotWidth / 2}
                        y={padTop}
                        width={slotWidth}
                        height={innerHeight}
                        fill="rgba(99, 102, 241, 0.06)"
                        rx="4"
                      />
                    )}

                    {/* Income Bar */}
                    <rect
                      x={incX}
                      y={incY}
                      width={barWidth}
                      height={Math.max(item.income > 0 ? 3 : 0, incHeight)}
                      fill={COLOR_INCOME}
                      rx="3"
                      ry="3"
                      opacity={hoveredIdx !== null && !isHovered ? 0.45 : 1}
                      style={{ transition: 'opacity 150ms ease-out' }}
                    />

                    {/* Expense Bar */}
                    <rect
                      x={expX}
                      y={expY}
                      width={barWidth}
                      height={Math.max(item.expense > 0 ? 3 : 0, expHeight)}
                      fill={COLOR_EXPENSE}
                      rx="3"
                      ry="3"
                      opacity={hoveredIdx !== null && !isHovered ? 0.45 : 1}
                      style={{ transition: 'opacity 150ms ease-out' }}
                    />

                    {/* X-Axis Label */}
                    {showLabel && (
                      <text
                        x={centerX}
                        y={padTop + innerHeight + 16}
                        textAnchor="middle"
                        fill={isHovered ? 'var(--text-primary, #111827)' : 'var(--text-secondary, #6B7280)'}
                        style={{
                          fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                          fontSize: isHovered ? '10.5px' : '9.5px',
                          fontWeight: isHovered ? 700 : 500,
                          fontVariantNumeric: 'tabular-nums',
                          transition: 'fill 150ms ease-out',
                        }}
                      >
                        {item.formattedDate}
                      </text>
                    )}
                  </g>
                );
              })
            )}

            {/* Hover Tooltip Rendered Directly in SVG for Clean Printability */}
            {hoveredIdx !== null && parsedSeries[hoveredIdx] && (
              (() => {
                const item = parsedSeries[hoveredIdx];
                const rawCenterX = padLeft + (hoveredIdx + 0.5) * slotWidth;
                const tooltipWidth = 140;
                const tooltipHeight = 60;
                // Clamp X inside bounds
                const tipX = Math.max(padLeft, Math.min(svgWidth - padRight - tooltipWidth, rawCenterX - tooltipWidth / 2));
                const tipY = Math.max(5, padTop - 12);

                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={tipX}
                      y={tipY}
                      width={tooltipWidth}
                      height={tooltipHeight}
                      rx="8"
                      fill="#1E293B"
                      opacity="0.95"
                      filter="drop-shadow(0 4px 6px rgba(0,0,0,0.15))"
                    />
                    <text
                      x={tipX + tooltipWidth / 2}
                      y={tipY + 16}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      style={{
                        fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                        fontSize: '10px',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {item.formattedDate || item.bucket_label}
                    </text>
                    <text
                      x={tipX + 10}
                      y={tipY + 34}
                      fill={COLOR_INCOME}
                      style={{
                        fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                        fontSize: '10px',
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      +{formatCompactNumber(item.income)}
                    </text>
                    <text
                      x={tipX + tooltipWidth - 10}
                      y={tipY + 34}
                      textAnchor="end"
                      fill={COLOR_EXPENSE}
                      style={{
                        fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                        fontSize: '10px',
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      -{formatCompactNumber(item.expense)}
                    </text>
                    <text
                      x={tipX + tooltipWidth / 2}
                      y={tipY + 50}
                      textAnchor="middle"
                      fill={item.net >= 0 ? '#34D399' : '#FB7185'}
                      style={{
                        fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                        fontSize: '9.5px',
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      Neto: {formatCurrencyAmount(item.net, currency)}
                    </text>
                  </g>
                );
              })()
            )}
          </svg>
        </div>
      </div>
    );
  }
);

CashflowTrendChart.displayName = 'CashflowTrendChart';

// ============================================================================
// 3. PERIOD COMPARISON BAR CHART (PERIOD A VS PERIOD B)
// ============================================================================

export interface PeriodSummaryKPI {
  label: string;
  income: number;
  expense: number;
  net: number;
}

export interface PeriodComparisonBarChartProps {
  periodA: PeriodSummaryKPI;
  periodB: PeriodSummaryKPI;
  categoryComparison?: CategoryComparisonItem[];
  currency: MainCurrencyPreference;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const PeriodComparisonBarChart = forwardRef<SVGSVGElement, PeriodComparisonBarChartProps>(
  (
    {
      periodA,
      periodB,
      categoryComparison = [],
      currency,
      title = 'Comparativa de Periodos (A vs. B)',
      className,
      style,
    },
    ref
  ) => {
    // Process comparison data
    const comparisonData = useMemo(() => {
      // 1. Global KPIs
      const kpis = [
        {
          label: 'Ingresos',
          valA: Math.max(0, toNumeric(periodA.income)),
          valB: Math.max(0, toNumeric(periodB.income)),
          type: 'income' as const,
        },
        {
          label: 'Gastos',
          valA: Math.max(0, toNumeric(periodA.expense)),
          valB: Math.max(0, toNumeric(periodB.expense)),
          type: 'expense' as const,
        },
        {
          label: 'Balance Neto',
          valA: toNumeric(periodA.net),
          valB: toNumeric(periodB.net),
          type: 'net' as const,
        },
      ];

      // 2. Top 6 Categories
      const topCats = categoryComparison
        .map((item) => {
          const { amountA, amountB } = getCategoryValues(item, currency);
          return {
            label: item.category,
            valA: amountA,
            valB: amountB,
            type: 'category' as const,
          };
        })
        .filter((c) => c.valA > 0 || c.valB > 0)
        .sort((x, y) => Math.max(y.valA, y.valB) - Math.max(x.valA, x.valB))
        .slice(0, 6);

      // Find max positive value to scale bars
      const allVals = [
        ...kpis.map((k) => Math.max(Math.abs(k.valA), Math.abs(k.valB))),
        ...topCats.map((c) => Math.max(c.valA, c.valB)),
      ];
      const peak = Math.max(...allVals, 1);

      return {
        kpis,
        topCats,
        maxVal: getNiceMax(peak),
      };
    }, [periodA, periodB, categoryComparison, currency]);

    // Geometry
    const svgWidth = 650;
    const rowHeight = 48;
    const headerHeight = 44;
    const sectionTitleHeight = 28;

    const totalHeight =
      headerHeight +
      sectionTitleHeight +
      comparisonData.kpis.length * rowHeight +
      (comparisonData.topCats.length > 0 ? sectionTitleHeight + comparisonData.topCats.length * rowHeight : 0) +
      24;

    const barAreaX = 175;
    const barAreaWidth = 350;
    const badgeX = 545;

    // Helper to calculate delta percentage
    const getDeltaInfo = (valA: number, valB: number, type: 'income' | 'expense' | 'net' | 'category') => {
      let deltaPct: number;
      if (valA === 0 && valB === 0) {
        deltaPct = 0;
      } else if (valA === 0) {
        deltaPct = valB > 0 ? 100 : 0;
      } else {
        deltaPct = ((valB - valA) / Math.abs(valA)) * 100;
      }

      const sign = deltaPct > 0 ? '+' : '';
      const text = `${sign}${deltaPct.toFixed(1)}%`;

      // Determine positive or negative color based on metric semantics
      let isFavorable = false;
      if (type === 'income' || type === 'net') {
        isFavorable = deltaPct >= 0;
      } else {
        // For expense & category: lower is favorable
        isFavorable = deltaPct <= 0;
      }

      const color = isFavorable ? COLOR_INCOME : COLOR_EXPENSE;
      const bg = isFavorable ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)';

      return { text, color, bg, deltaPct };
    };

    // Compact Key Insight Pill
    const comparisonInsight = useMemo(() => {
      // Find category with largest increase (valB > valA)
      const catIncreases = comparisonData.topCats
        .map((cat) => {
          const delta = getDeltaInfo(cat.valA, cat.valB, 'category');
          return { label: cat.label, deltaPct: delta.deltaPct, text: delta.text, valB: cat.valB };
        })
        .filter((c) => c.deltaPct > 0)
        .sort((a, b) => b.deltaPct - a.deltaPct);

      if (catIncreases.length > 0 && catIncreases[0].deltaPct > 0) {
        return {
          icon: '🔥',
          title: 'Insight Clave',
          label: `Mayor incremento: ${catIncreases[0].label}`,
          delta: catIncreases[0].text,
          color: '#D97706',
          bg: 'rgba(245, 158, 11, 0.1)',
          border: 'rgba(245, 158, 11, 0.25)',
        };
      }

      // Check expense reduction
      const expDelta = getDeltaInfo(comparisonData.kpis[1].valA, comparisonData.kpis[1].valB, 'expense');
      if (expDelta.deltaPct < 0) {
        return {
          icon: '🌱',
          title: 'Insight Clave',
          label: 'Gasto global reducido vs Periodo A',
          delta: expDelta.text,
          color: COLOR_INCOME,
          bg: 'rgba(16, 185, 129, 0.1)',
          border: 'rgba(16, 185, 129, 0.25)',
        };
      }

      // Net balance check
      if (comparisonData.kpis[2].valB >= 0) {
        return {
          icon: '✨',
          title: 'Insight Clave',
          label: 'Balance neto positivo en Periodo B',
          delta: formatCurrencyAmount(comparisonData.kpis[2].valB, currency),
          color: COLOR_INCOME,
          bg: 'rgba(16, 185, 129, 0.1)',
          border: 'rgba(16, 185, 129, 0.25)',
        };
      }

      const netDelta = getDeltaInfo(comparisonData.kpis[2].valA, comparisonData.kpis[2].valB, 'net');
      return {
        icon: '📊',
        title: 'Insight Clave',
        label: 'Variación neta en balance general',
        delta: netDelta.text,
        color: 'var(--text-secondary, #6B7280)',
        bg: 'var(--surface-muted, #F3F4F6)',
        border: 'var(--border-color, #E5E7EB)',
      };
    }, [comparisonData, currency]);

    let currentY = headerHeight;

    return (
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          background: 'var(--surface-color, #FFFFFF)',
          borderRadius: '16px',
          border: '1px solid var(--border-color, #E5E7EB)',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
          padding: '1.25rem',
          ...style,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary, #111827)', margin: 0 }}>
                {title}
              </h3>
              {comparisonInsight && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '8px',
                    background: comparisonInsight.bg,
                    border: `1px solid ${comparisonInsight.border}`,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: comparisonInsight.color,
                  }}
                >
                  <span>{comparisonInsight.icon}</span>
                  <span style={{ fontWeight: 700 }}>{comparisonInsight.title}:</span>
                  <span>{comparisonInsight.label}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>({comparisonInsight.delta})</span>
                </div>
              )}
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #6B7280)', margin: '2px 0 0 0' }}>
              Barras pareadas: {periodA.label || 'Periodo A'} vs. {periodB.label || 'Periodo B'}
            </p>
          </div>

          {/* Legend Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLOR_PERIOD_A }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #6B7280)' }}>
                {periodA.label || 'Periodo A'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLOR_PERIOD_B }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                {periodB.label || 'Periodo B'}
              </span>
            </div>
          </div>
        </div>

        {/* SVG Container - Fluid & Responsive without forced horizontal scroll */}
        <div style={{ width: '100%', position: 'relative' }}>
          <svg
            ref={ref}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${svgWidth} ${totalHeight}`}
            width="100%"
            height="auto"
            style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}
          >
            {/* Legend / Info Top Banner inside SVG */}
            <g>
              <rect x="0" y="0" width={svgWidth} height="36" rx="8" fill="var(--surface-muted, #F8FAFC)" />
              <circle cx="20" cy="18" r="5" fill={COLOR_PERIOD_A} />
              <text
                x="32"
                y="22"
                fill="var(--text-secondary, #6B7280)"
                style={{
                  fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                  fontSize: '11px',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Periodo A: {periodA.label || 'A'}
              </text>

              <circle cx="200" cy="18" r="5" fill={COLOR_PERIOD_B} />
              <text
                x="212"
                y="22"
                fill="var(--text-primary, #111827)"
                style={{
                  fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                  fontSize: '11px',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Periodo B: {periodB.label || 'B'}
              </text>

              <text
                x={svgWidth - 20}
                y="22"
                textAnchor="end"
                fill="var(--text-tertiary, #9CA3AF)"
                style={{
                  fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                  fontSize: '10px',
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Δ% = Variación B vs A
              </text>
            </g>

            {/* Section 1: Métricas Globales */}
            <text
              x="10"
              y={currentY + 16}
              fill="var(--text-secondary, #6B7280)"
              style={{
                fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Métricas Globales
            </text>
            {(currentY += sectionTitleHeight)}

            {comparisonData.kpis.map((row) => {
              const y = currentY;
              currentY += rowHeight;

              const delta = getDeltaInfo(row.valA, row.valB, row.type);
              const maxVal = comparisonData.maxVal;

              const barWidthA = Math.max(row.valA !== 0 ? 3 : 0, (Math.abs(row.valA) / maxVal) * barAreaWidth);
              const barWidthB = Math.max(row.valB !== 0 ? 3 : 0, (Math.abs(row.valB) / maxVal) * barAreaWidth);

              return (
                <g key={row.label}>
                  {/* Row Separator */}
                  <line x1="10" y1={y + rowHeight - 2} x2={svgWidth - 10} y2={y + rowHeight - 2} stroke="#F1F5F9" />

                  {/* Metric Label */}
                  <text
                    x="15"
                    y={y + 25}
                    fill="var(--text-primary, #111827)"
                    style={{
                      fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                      fontSize: '12.5px',
                      fontWeight: 600,
                    }}
                  >
                    {row.label}
                  </text>

                  {/* Bar A (Slate) */}
                  <rect x={barAreaX} y={y + 8} width={barWidthA} height="12" rx="3" fill={COLOR_PERIOD_A} />
                  <text
                    x={barWidthA > 220 ? barAreaX + barWidthA - 6 : barAreaX + barWidthA + 6}
                    y={y + 18}
                    textAnchor={barWidthA > 220 ? 'end' : 'start'}
                    fill={barWidthA > 220 ? '#FFFFFF' : COLOR_PERIOD_A}
                    style={{
                      fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                      fontSize: '10px',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatCompactNumber(row.valA)}
                  </text>

                  {/* Bar B (Indigo) */}
                  <rect x={barAreaX} y={y + 24} width={barWidthB} height="12" rx="3" fill={COLOR_PERIOD_B} />
                  <text
                    x={barWidthB > 220 ? barAreaX + barWidthB - 6 : barAreaX + barWidthB + 6}
                    y={y + 34}
                    textAnchor={barWidthB > 220 ? 'end' : 'start'}
                    fill={barWidthB > 220 ? '#FFFFFF' : COLOR_PERIOD_B}
                    style={{
                      fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                      fontSize: '10px',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatCompactNumber(row.valB)}
                  </text>

                  {/* Delta Badge */}
                  <rect x={badgeX} y={y + 12} width="85" height="22" rx="8" fill={delta.bg} />
                  <text
                    x={badgeX + 42.5}
                    y={y + 27}
                    textAnchor="middle"
                    fill={delta.color}
                    style={{
                      fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                      fontSize: '10.5px',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {delta.text}
                  </text>
                </g>
              );
            })}

            {/* Section 2: Top Categorías (if available) */}
            {comparisonData.topCats.length > 0 && (
              <>
                <text
                  x="10"
                  y={currentY + 16}
                  fill="var(--text-secondary, #6B7280)"
                  style={{
                    fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Top Categorías Comparadas
                </text>
                {(currentY += sectionTitleHeight)}

                {comparisonData.topCats.map((row) => {
                  const y = currentY;
                  currentY += rowHeight;

                  const delta = getDeltaInfo(row.valA, row.valB, row.type);
                  const maxVal = comparisonData.maxVal;

                  const barWidthA = Math.max(row.valA !== 0 ? 3 : 0, (Math.abs(row.valA) / maxVal) * barAreaWidth);
                  const barWidthB = Math.max(row.valB !== 0 ? 3 : 0, (Math.abs(row.valB) / maxVal) * barAreaWidth);

                  return (
                    <g key={row.label}>
                      {/* Row Separator */}
                      <line x1="10" y1={y + rowHeight - 2} x2={svgWidth - 10} y2={y + rowHeight - 2} stroke="#F1F5F9" />

                      {/* Category Name */}
                      <text
                        x="15"
                        y={y + 25}
                        fill="var(--text-primary, #111827)"
                        style={{
                          fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        {row.label.length > 20 ? `${row.label.slice(0, 18)}…` : row.label}
                      </text>

                      {/* Bar A */}
                      <rect x={barAreaX} y={y + 8} width={barWidthA} height="12" rx="3" fill={COLOR_PERIOD_A} />
                      <text
                        x={barWidthA > 220 ? barAreaX + barWidthA - 6 : barAreaX + barWidthA + 6}
                        y={y + 18}
                        textAnchor={barWidthA > 220 ? 'end' : 'start'}
                        fill={barWidthA > 220 ? '#FFFFFF' : COLOR_PERIOD_A}
                        style={{
                          fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                          fontSize: '10px',
                          fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatCompactNumber(row.valA)}
                      </text>

                      {/* Bar B */}
                      <rect x={barAreaX} y={y + 24} width={barWidthB} height="12" rx="3" fill={COLOR_PERIOD_B} />
                      <text
                        x={barWidthB > 220 ? barAreaX + barWidthB - 6 : barAreaX + barWidthB + 6}
                        y={y + 34}
                        textAnchor={barWidthB > 220 ? 'end' : 'start'}
                        fill={barWidthB > 220 ? '#FFFFFF' : COLOR_PERIOD_B}
                        style={{
                          fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                          fontSize: '10px',
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatCompactNumber(row.valB)}
                      </text>

                      {/* Delta Badge */}
                      <rect x={badgeX} y={y + 12} width="85" height="22" rx="8" fill={delta.bg} />
                      <text
                        x={badgeX + 42.5}
                        y={y + 27}
                        textAnchor="middle"
                        fill={delta.color}
                        style={{
                          fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
                          fontSize: '10.5px',
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {delta.text}
                      </text>
                    </g>
                  );
                })}
              </>
            )}
          </svg>
        </div>
      </div>
    );
  }
);

PeriodComparisonBarChart.displayName = 'PeriodComparisonBarChart';
