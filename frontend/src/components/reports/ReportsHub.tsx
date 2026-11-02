import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Calendar,
  FileSpreadsheet,
  AlertTriangle,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { PageHeader } from '../ui/PageHeader';
import { SegmentedTabs } from '../ui/SegmentedTabs';
import { Skeleton, SkeletonCircle } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useCurrencyPreference } from '../../context/CurrencyPreferenceContext';
import {
  CategoryDonutChart,
  CashflowTrendChart,
  PeriodComparisonBarChart,
  type CategoryDonutItem,
  type PeriodSummaryKPI,
} from './ReportCharts';
import { ExportStudioPanel } from './ExportStudioPanel';

import {
  getReportAnalysis,
  getExpenses,
} from '../../api';

import type {
  PeriodComparisonResponse,
  ExportConfig,
  ExportSourceType,
  Expense,
} from '../../types';

import {
  formatCurrency,
  resolveCurrencyTotal,
  resolveIncomeTotal,
  resolveBalanceTotal,
  resolveCategoryTotal,
  resolveDailyAvg,
} from '../../utils/currencySummary';

// ---------------------------------------------------------------------------
// Date Helpers
// ---------------------------------------------------------------------------
const MONTH_NAMES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function padZero(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}

function formatShortDate(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length < 3) return isoDate;
  const day = parseInt(parts[2], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const monthName = MONTH_NAMES_ES[monthIdx] || parts[1];
  return `${day} ${monthName}`;
}

function formatReadableRange(fromStr: string, toStr: string, includeYear: boolean = true): string {
  if (!fromStr || !toStr) return '';
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return `${fromStr} – ${toStr}`;
  const date1 = new Date(y1, m1 - 1, d1);
  const date2 = new Date(y2, m2 - 1, d2);

  const cleanMonth1 = format(date1, 'MMM', { locale: es }).replace('.', '');
  const cleanMonth2 = format(date2, 'MMM', { locale: es }).replace('.', '');

  if (y1 === y2) {
    if (m1 === m2) {
      if (d1 === d2) {
        return includeYear ? `${d1} ${cleanMonth1} ${y1}` : `${d1} ${cleanMonth1}`;
      }
      return includeYear ? `${d1} – ${d2} ${cleanMonth1} ${y1}` : `${d1} – ${d2} ${cleanMonth1}`;
    }
    return includeYear ? `${d1} ${cleanMonth1} – ${d2} ${cleanMonth2} ${y1}` : `${d1} ${cleanMonth1} – ${d2} ${cleanMonth2}`;
  }
  return includeYear ? `${d1} ${cleanMonth1} ${y1} – ${d2} ${cleanMonth2} ${y2}` : `${d1} ${cleanMonth1} – ${d2} ${cleanMonth2}`;
}

function getRangeDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const d1 = new Date(from);
  const d2 = new Date(to);
  const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24)) + 1;
  return isNaN(diff) ? 0 : Math.max(0, diff);
}

function getSymmetricShortcuts() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  // Este mes vs. Mes anterior
  const thisMonthStart = new Date(y, m, 1);
  const thisMonthEnd = new Date(y, m + 1, 0);
  const lastMonthStart = new Date(y, m - 1, 1);
  const lastMonthEnd = new Date(y, m, 0);

  // 2 months ago (for last_month vs 2 months ago in comparison mode)
  const twoMonthsAgoStart = new Date(y, m - 2, 1);
  const twoMonthsAgoEnd = new Date(y, m - 1, 0);

  // Este mes vs. Mismo mes año pasado
  const sameMonthLastYearStart = new Date(y - 1, m, 1);
  const sameMonthLastYearEnd = new Date(y - 1, m + 1, 0);

  // Esta semana vs. Semana pasada (Monday-Sunday)
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const thisWeekMon = new Date(now);
  thisWeekMon.setDate(now.getDate() - dayOfWeek);
  const thisWeekSun = new Date(thisWeekMon);
  thisWeekSun.setDate(thisWeekMon.getDate() + 6);

  const lastWeekMon = new Date(thisWeekMon);
  lastWeekMon.setDate(thisWeekMon.getDate() - 7);
  const lastWeekSun = new Date(lastWeekMon);
  lastWeekSun.setDate(lastWeekMon.getDate() + 6);

  // Este año vs. Año anterior
  const thisYearStart = new Date(y, 0, 1);
  const thisYearEnd = new Date(y, 11, 31);
  const lastYearStart = new Date(y - 1, 0, 1);
  const lastYearEnd = new Date(y - 1, 11, 31);

  return {
    thisMonthStart: toIsoDate(thisMonthStart),
    thisMonthEnd: toIsoDate(thisMonthEnd),
    lastMonthStart: toIsoDate(lastMonthStart),
    lastMonthEnd: toIsoDate(lastMonthEnd),
    twoMonthsAgoStart: toIsoDate(twoMonthsAgoStart),
    twoMonthsAgoEnd: toIsoDate(twoMonthsAgoEnd),
    sameMonthLastYearStart: toIsoDate(sameMonthLastYearStart),
    sameMonthLastYearEnd: toIsoDate(sameMonthLastYearEnd),
    thisWeekMon: toIsoDate(thisWeekMon),
    thisWeekSun: toIsoDate(thisWeekSun),
    lastWeekMon: toIsoDate(lastWeekMon),
    lastWeekSun: toIsoDate(lastWeekSun),
    thisYearStart: toIsoDate(thisYearStart),
    thisYearEnd: toIsoDate(thisYearEnd),
    lastYearStart: toIsoDate(lastYearStart),
    lastYearEnd: toIsoDate(lastYearEnd),
    monthVsLastMonth: {
      dateFromA: toIsoDate(thisMonthStart),
      dateToA: toIsoDate(thisMonthEnd),
      dateFromB: toIsoDate(lastMonthStart),
      dateToB: toIsoDate(lastMonthEnd),
    },
    monthVsLastYear: {
      dateFromA: toIsoDate(thisMonthStart),
      dateToA: toIsoDate(thisMonthEnd),
      dateFromB: toIsoDate(sameMonthLastYearStart),
      dateToB: toIsoDate(sameMonthLastYearEnd),
    },
    weekVsLastWeek: {
      dateFromA: toIsoDate(thisWeekMon),
      dateToA: toIsoDate(thisWeekSun),
      dateFromB: toIsoDate(lastWeekMon),
      dateToB: toIsoDate(lastWeekSun),
    },
    yearVsLastYear: {
      dateFromA: toIsoDate(thisYearStart),
      dateToA: toIsoDate(thisYearEnd),
      dateFromB: toIsoDate(lastYearStart),
      dateToB: toIsoDate(lastYearEnd),
    },
  };
}

function computeDelta(valA: number, valB: number): { abs: number; pct: number | null } {
  const abs = valA - valB;
  if (valB === 0) {
    return { abs, pct: valA === 0 ? 0 : null };
  }
  return { abs, pct: (abs / Math.abs(valB)) * 100 };
}

function renderDeltaBadge(pctTotal: number | null, pctDaily: number | null, isExpense: boolean = false) {
  if (pctTotal === null || isNaN(pctTotal)) {
    return (
      <span className="reports-delta-badge reports-delta-badge--neutral">
        N/A
      </span>
    );
  }

  const isGood = isExpense ? pctTotal <= 0 : pctTotal >= 0;
  const arrow = pctTotal > 0 ? '↑' : pctTotal < 0 ? '↓' : '';
  const totalPart = `${arrow} ${Math.abs(pctTotal).toFixed(1)}%`.trim();
  const dailySign = (pctDaily || 0) >= 0 ? '+' : '';
  const dailyPart = pctDaily !== null && !isNaN(pctDaily) ? ` · ${dailySign}${pctDaily.toFixed(1)}%/día` : '';

  return (
    <span
      className={`reports-delta-badge ${isGood ? 'reports-delta-badge--good' : 'reports-delta-badge--bad'}`}
      title={`Variación total: ${pctTotal.toFixed(1)}% | Por día: ${(pctDaily || 0).toFixed(1)}%`}
    >
      {totalPart}{dailyPart}
    </span>
  );
}

const ReportsSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Cargando análisis financiero">
    {/* 4 KPI Skeletons in .reports-kpi-grid */}
    <div className="reports-kpi-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="reports-kpi-card" style={{ gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Skeleton width="45%" height={12} borderRadius={4} />
            <Skeleton width={16} height={16} borderRadius={4} />
          </div>
          <Skeleton width="75%" height={24} borderRadius={6} />
          <Skeleton width="50%" height={11} borderRadius={4} style={{ marginTop: 'auto' }} />
        </div>
      ))}
    </div>

    {/* Donut Chart Skeleton */}
    <div
      style={{
        background: 'var(--surface-color, #FFFFFF)',
        border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
        borderRadius: '16px',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      <div style={{ alignSelf: 'flex-start', width: '100%' }}>
        <Skeleton width="40%" height={16} borderRadius={4} />
      </div>
      <div style={{ padding: '1rem 0' }}>
        <SkeletonCircle size={180} />
      </div>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '16px' }}>
        <Skeleton width={80} height={12} borderRadius={4} />
        <Skeleton width={80} height={12} borderRadius={4} />
        <Skeleton width={80} height={12} borderRadius={4} />
      </div>
    </div>

    {/* Trend Chart Skeleton */}
    <div
      style={{
        background: 'var(--surface-color, #FFFFFF)',
        border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
        borderRadius: '16px',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <Skeleton width="45%" height={16} borderRadius={4} />
      <Skeleton width="100%" height={180} borderRadius={8} />
    </div>
  </div>
);

const PRESET_OPTIONS = [
  { id: 'month', label: 'Este mes' },
  { id: 'last_month', label: 'Mes anterior' },
  { id: 'week', label: 'Esta semana' },
  { id: 'year', label: 'Este año' },
  { id: 'custom', label: 'Personalizado' },
] as const;

type PresetId = (typeof PRESET_OPTIONS)[number]['id'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const ReportsHub: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { mainCurrency } = useCurrencyPreference();

  const shortcuts = useMemo(() => getSymmetricShortcuts(), []);

  // Top header state (URL deep-linking initialized)
  const [activeTab, setActiveTab] = useState<'analysis' | 'export'>(() => {
    return searchParams.get('tab') === 'export' ? 'export' : 'analysis';
  });

  // SVG Chart refs for embedding in PDF
  const donutChartRef = useRef<SVGSVGElement | null>(null);
  const trendChartRef = useRef<SVGSVGElement | null>(null);
  const compChartRef = useRef<SVGSVGElement | null>(null);
  const analysisRequestIdRef = useRef(0);

  // -------------------------------------------------------------------------
  // TAB 1: Ultra-Compact Filter & Analysis State
  // -------------------------------------------------------------------------
  const [isComparisonMode, setIsComparisonMode] = useState<boolean>(() => {
    const compareParam = searchParams.get('compare');
    const sourceParam = searchParams.get('source');
    const fromBParam = searchParams.get('from_b');
    const toBParam = searchParams.get('to_b');
    return compareParam === 'true' || sourceParam === 'comparison' || Boolean(fromBParam && toBParam);
  });

  const [activePreset, setActivePreset] = useState<PresetId>(() => {
    return searchParams.get('from') && searchParams.get('to') ? 'custom' : 'month';
  });
  const [isDatePickersOpen, setIsDatePickersOpen] = useState(false);

  const [dateFromA, setDateFromA] = useState<string>(() => {
    return searchParams.get('from') || shortcuts.thisMonthStart;
  });
  const [dateToA, setDateToA] = useState<string>(() => {
    return searchParams.get('to') || shortcuts.thisMonthEnd;
  });
  const [dateFromB, setDateFromB] = useState<string>(() => {
    return searchParams.get('from_b') || shortcuts.lastMonthStart;
  });
  const [dateToB, setDateToB] = useState<string>(() => {
    return searchParams.get('to_b') || shortcuts.lastMonthEnd;
  });

  const [analysisData, setAnalysisData] = useState<PeriodComparisonResponse | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [expensesA, setExpensesA] = useState<Expense[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const expensesFetchedRangeRef = useRef<{ from: string; to: string } | null>(null);

  const handleSelectCategory = useCallback(
    async (cat: string | null) => {
      setSelectedCategory(cat);
      if (!cat) return;

      if (
        expensesFetchedRangeRef.current?.from === dateFromA &&
        expensesFetchedRangeRef.current?.to === dateToA
      ) {
        return;
      }

      try {
        const data = await getExpenses(dateFromA, dateToA);
        setExpensesA(data);
        expensesFetchedRangeRef.current = { from: dateFromA, to: dateToA };
      } catch (err) {
        console.warn('Failed to fetch transactions for category drill-down:', err);
        setExpensesA([]);
      }
    },
    [dateFromA, dateToA]
  );

  // -------------------------------------------------------------------------
  // TAB 2: Configurador de Exportación State
  // -------------------------------------------------------------------------
  const [exportConfig, setExportConfig] = useState<ExportConfig>(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}`;
    const sourceParam = (searchParams.get('source') as ExportSourceType) || 'summary';

    return {
      source: sourceParam,
      format: 'pdf',
      currency: mainCurrency || 'USD',
      dateFromA: searchParams.get('from') || shortcuts.thisMonthStart,
      dateToA: searchParams.get('to') || shortcuts.thisMonthEnd,
      dateFromB: searchParams.get('from_b') || shortcuts.lastMonthStart,
      dateToB: searchParams.get('to_b') || shortcuts.lastMonthEnd,
      monthYear: ym,
      selectedDebtId: 'all',
      debtFilterType: 'all',
      selectedSavingId: 'all',
      selectedProjectId: 'all',
      selectedBudgetId: 'all',
      includeHeaderCard: true,
      includeCharts: true,
      includeCategories: true,
      includeTransactions: true,
      includeOriginalCurrency: true,
    };
  });

  // -------------------------------------------------------------------------
  // URL Deep-linking Synchronizer
  // -------------------------------------------------------------------------
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const sourceParam = searchParams.get('source') as ExportSourceType | null;
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const fromBParam = searchParams.get('from_b');
    const toBParam = searchParams.get('to_b');
    const compareParam = searchParams.get('compare');

    if (tabParam === 'export' && activeTab !== 'export') {
      setActiveTab('export');
    }

    if (compareParam === 'true' || sourceParam === 'comparison') {
      setIsComparisonMode(true);
    }

    if (fromParam && toParam && (fromParam !== dateFromA || toParam !== dateToA)) {
      setDateFromA(fromParam);
      setDateToA(toParam);
      setActivePreset('custom');
    }

    if (fromBParam && toBParam && (fromBParam !== dateFromB || toBParam !== dateToB)) {
      setDateFromB(fromBParam);
      setDateToB(toBParam);
      setIsComparisonMode(true);
    }

    if (sourceParam) {
      setExportConfig((prev) => ({
        ...prev,
        source: sourceParam,
        ...(fromParam && toParam ? { dateFromA: fromParam, dateToA: toParam } : {}),
        ...(fromBParam && toBParam ? { dateFromB: fromBParam, dateToB: toBParam } : {}),
      }));
    }
  }, [searchParams]);

  // Tab change handler updating URL
  const handleTabChange = (newTab: 'analysis' | 'export') => {
    setActiveTab(newTab);
    if (newTab === 'export') {
      setExportConfig((prev) => ({
        ...prev,
        source: isComparisonMode ? 'comparison' : 'summary',
        dateFromA,
        dateToA,
        dateFromB: isComparisonMode ? dateFromB : undefined,
        dateToB: isComparisonMode ? dateToB : undefined,
        currency: prev.currency || mainCurrency,
      }));
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newTab === 'export') {
          next.set('tab', 'export');
        } else {
          next.delete('tab');
        }
        return next;
      },
      { replace: true }
    );
  };

  const handleExportConfigChange = useCallback((nextConfig: ExportConfig) => {
    setExportConfig(nextConfig);

    if (nextConfig.dateFromA && nextConfig.dateFromA !== dateFromA) {
      setDateFromA(nextConfig.dateFromA);
    }
    if (nextConfig.dateToA && nextConfig.dateToA !== dateToA) {
      setDateToA(nextConfig.dateToA);
    }
    if (nextConfig.dateFromB && nextConfig.dateFromB !== dateFromB) {
      setDateFromB(nextConfig.dateFromB);
    }
    if (nextConfig.dateToB && nextConfig.dateToB !== dateToB) {
      setDateToB(nextConfig.dateToB);
    }
    if (nextConfig.source === 'comparison' && !isComparisonMode) {
      setIsComparisonMode(true);
    } else if (nextConfig.source === 'summary' && isComparisonMode) {
      setIsComparisonMode(false);
    }
  }, [dateFromA, dateToA, dateFromB, dateToB, isComparisonMode]);

  // -------------------------------------------------------------------------
  // Fetch Analysis Data (Tab 1)
  // -------------------------------------------------------------------------
  const fetchAnalysis = useCallback(async () => {
    if (!dateFromA || !dateToA) {
      ++analysisRequestIdRef.current;
      setLoadingAnalysis(false);
      return;
    }

    const daysA = getRangeDays(dateFromA, dateToA);
    if (dateFromA > dateToA) {
      ++analysisRequestIdRef.current;
      setLoadingAnalysis(false);
      setAnalysisError('La fecha inicial del Periodo A no puede ser posterior a la fecha final.');
      return;
    }
    if (daysA > 366) {
      ++analysisRequestIdRef.current;
      setLoadingAnalysis(false);
      setAnalysisError('El Periodo A supera los 366 días (máximo permitido).');
      return;
    }

    if (isComparisonMode) {
      if (!dateFromB || !dateToB) {
        ++analysisRequestIdRef.current;
        setLoadingAnalysis(false);
        return;
      }
      const daysB = getRangeDays(dateFromB, dateToB);
      if (dateFromB > dateToB) {
        ++analysisRequestIdRef.current;
        setLoadingAnalysis(false);
        setAnalysisError('La fecha inicial del Periodo B no puede ser posterior a la fecha final.');
        return;
      }
      if (daysB > 366) {
        ++analysisRequestIdRef.current;
        setLoadingAnalysis(false);
        setAnalysisError('El Periodo B supera los 366 días (máximo permitido).');
        return;
      }
    }

    const currentRequestId = ++analysisRequestIdRef.current;
    setLoadingAnalysis(true);
    setAnalysisError(null);

    // Reset drilldown transactions cache on filter changes (lazy fetch on slice click)
    setExpensesA([]);
    setSelectedCategory(null);
    expensesFetchedRangeRef.current = null;

    try {
      const data = await getReportAnalysis({
        date_from_a: dateFromA,
        date_to_a: dateToA,
        date_from_b: isComparisonMode ? dateFromB : undefined,
        date_to_b: isComparisonMode ? dateToB : undefined,
      });
      if (analysisRequestIdRef.current === currentRequestId) {
        setAnalysisData(data);
      }
    } catch (err: any) {
      if (analysisRequestIdRef.current === currentRequestId) {
        console.error('Failed to fetch report analysis:', err);
        const msg = err?.response?.data?.detail || err?.message || 'Error al obtener el análisis del periodo';
        setAnalysisError(msg);
      }
    } finally {
      if (analysisRequestIdRef.current === currentRequestId) {
        setLoadingAnalysis(false);
      }
    }
  }, [dateFromA, dateToA, dateFromB, dateToB, isComparisonMode]);

  useEffect(() => {
    fetchAnalysis();
    const reqRef = analysisRequestIdRef;
    return () => {
      reqRef.current++;
    };
  }, [fetchAnalysis]);

  // -------------------------------------------------------------------------
  // Preset Selection & Comparison Toggle Handlers
  // -------------------------------------------------------------------------
  const applyPresetDates = (preset: PresetId, compareMode: boolean) => {
    setActivePreset(preset);
    if (preset === 'custom') {
      setIsDatePickersOpen(true);
      return;
    }
    setIsDatePickersOpen(false);

    if (!compareMode) {
      if (preset === 'month') {
        setDateFromA(shortcuts.thisMonthStart);
        setDateToA(shortcuts.thisMonthEnd);
      } else if (preset === 'last_month') {
        setDateFromA(shortcuts.lastMonthStart);
        setDateToA(shortcuts.lastMonthEnd);
      } else if (preset === 'week') {
        setDateFromA(shortcuts.thisWeekMon);
        setDateToA(shortcuts.thisWeekSun);
      } else if (preset === 'year') {
        setDateFromA(shortcuts.thisYearStart);
        setDateToA(shortcuts.thisYearEnd);
      }
    } else {
      if (preset === 'month') {
        setDateFromA(shortcuts.thisMonthStart);
        setDateToA(shortcuts.thisMonthEnd);
        setDateFromB(shortcuts.lastMonthStart);
        setDateToB(shortcuts.lastMonthEnd);
      } else if (preset === 'last_month') {
        setDateFromA(shortcuts.lastMonthStart);
        setDateToA(shortcuts.lastMonthEnd);
        setDateFromB(shortcuts.twoMonthsAgoStart);
        setDateToB(shortcuts.twoMonthsAgoEnd);
      } else if (preset === 'week') {
        setDateFromA(shortcuts.thisWeekMon);
        setDateToA(shortcuts.thisWeekSun);
        setDateFromB(shortcuts.lastWeekMon);
        setDateToB(shortcuts.lastWeekSun);
      } else if (preset === 'year') {
        setDateFromA(shortcuts.thisYearStart);
        setDateToA(shortcuts.thisYearEnd);
        setDateFromB(shortcuts.lastYearStart);
        setDateToB(shortcuts.lastYearEnd);
      }
    }
  };

  const handlePresetSelect = (preset: PresetId) => {
    applyPresetDates(preset, isComparisonMode);
  };

  const handleToggleComparison = () => {
    const nextCompare = !isComparisonMode;
    setIsComparisonMode(nextCompare);
    if (nextCompare) {
      setIsDatePickersOpen(true);
    }
    if (activePreset !== 'custom') {
      applyPresetDates(activePreset, nextCompare);
    } else if (nextCompare && (!dateFromB || !dateToB)) {
      setDateFromB(shortcuts.lastMonthStart);
      setDateToB(shortcuts.lastMonthEnd);
    }
  };

  // -------------------------------------------------------------------------
  // Tab 1 KPI Aggregations
  // -------------------------------------------------------------------------
  const effectiveCurrency = (activeTab === 'export' && exportConfig.currency) ? exportConfig.currency : mainCurrency;

  const pA = analysisData?.period_a;
  const pB = analysisData?.period_b;

  const incomeA = useMemo(() => resolveIncomeTotal(pA, effectiveCurrency), [pA, effectiveCurrency]);
  const incomeB = useMemo(() => (pB ? resolveIncomeTotal(pB, effectiveCurrency) : 0), [pB, effectiveCurrency]);
  const deltaIncome = useMemo(() => computeDelta(incomeA, incomeB), [incomeA, incomeB]);

  const expenseA = useMemo(() => resolveCurrencyTotal(pA, effectiveCurrency), [pA, effectiveCurrency]);
  const expenseB = useMemo(() => (pB ? resolveCurrencyTotal(pB, effectiveCurrency) : 0), [pB, effectiveCurrency]);
  const deltaExpense = useMemo(() => computeDelta(expenseA, expenseB), [expenseA, expenseB]);

  const balanceA = useMemo(() => resolveBalanceTotal(pA, effectiveCurrency), [pA, effectiveCurrency]);
  const balanceB = useMemo(() => (pB ? resolveBalanceTotal(pB, effectiveCurrency) : 0), [pB, effectiveCurrency]);
  const deltaBalance = useMemo(() => computeDelta(balanceA, balanceB), [balanceA, balanceB]);

  const dailyAvgA = useMemo(() => resolveDailyAvg(pA, effectiveCurrency), [pA, effectiveCurrency]);
  const dailyAvgB = useMemo(() => (pB ? resolveDailyAvg(pB, effectiveCurrency) : 0), [pB, effectiveCurrency]);
  const deltaDailyAvg = useMemo(() => computeDelta(dailyAvgA, dailyAvgB), [dailyAvgA, dailyAvgB]);

  // Donut chart categories
  const donutCategories: CategoryDonutItem[] = useMemo(() => {
    if (!analysisData?.period_a?.by_category) return [];
    const expTotal = resolveCurrencyTotal(analysisData.period_a, effectiveCurrency);
    return analysisData.period_a.by_category.map((cat) => {
      const amount = resolveCategoryTotal(cat, effectiveCurrency);
      const percentage = expTotal > 0 ? (amount / expTotal) * 100 : 0;
      return {
        category: cat.category,
        amount,
        percentage,
      };
    });
  }, [analysisData, effectiveCurrency]);

  // Bar chart KPI periods
  const periodAKpi: PeriodSummaryKPI = useMemo(
    () => ({
      label: 'Periodo A',
      income: incomeA,
      expense: expenseA,
      net: balanceA,
    }),
    [incomeA, expenseA, balanceA]
  );

  const periodBKpi: PeriodSummaryKPI = useMemo(
    () => ({
      label: 'Periodo B',
      income: incomeB,
      expense: expenseB,
      net: balanceB,
    }),
    [incomeB, expenseB, balanceB]
  );

  // Progressive disclosure date summary text
  const dateSummaryText = useMemo(() => {
    const aText = `${formatShortDate(dateFromA)} – ${formatShortDate(dateToA)}`;
    if (!isComparisonMode) {
      const days = getRangeDays(dateFromA, dateToA);
      return `${aText} (${days} d)`;
    }
    const bText = `${formatShortDate(dateFromB)} – ${formatShortDate(dateToB)}`;
    return `${aText} vs ${bText}`;
  }, [dateFromA, dateToA, dateFromB, dateToB, isComparisonMode]);

  const showDateInputs = activePreset === 'custom' || isComparisonMode || isDatePickersOpen;

  // -------------------------------------------------------------------------
  // Transition from Tab 1 to Tab 2 ("Exportar este análisis")
  // -------------------------------------------------------------------------
  const handleExportThisAnalysis = () => {
    const source = isComparisonMode ? 'comparison' : 'summary';
    setExportConfig((prev) => ({
      ...prev,
      source,
      currency: prev.currency || mainCurrency,
      dateFromA,
      dateToA,
      dateFromB: isComparisonMode ? dateFromB : undefined,
      dateToB: isComparisonMode ? dateToB : undefined,
    }));
    setActiveTab('export');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'export');
        next.set('source', source);
        next.set('from', dateFromA);
        next.set('to', dateToA);
        if (isComparisonMode && dateFromB && dateToB) {
          next.set('from_b', dateFromB);
          next.set('to_b', dateToB);
        }
        return next;
      },
      { replace: true }
    );
  };

  // -------------------------------------------------------------------------
  // Header Tabs & Date Range Subtitle
  // -------------------------------------------------------------------------
  const hubTabs = useMemo(
    () => [
      {
        id: 'analysis' as const,
        label: 'Resumen y Comparador',
        shortLabel: 'Resumen',
        icon: <BarChart3 size={16} />,
      },
      {
        id: 'export' as const,
        label: 'Exportar Archivos',
        shortLabel: 'Exportar',
        icon: <FileSpreadsheet size={16} />,
      },
    ],
    []
  );

  const headerControls = (
    <SegmentedTabs
      tabs={hubTabs}
      activeTab={activeTab}
      onChange={handleTabChange}
      activeColor="var(--tool-reports, #06B6D4)"
    />
  );

  const headerSubtitle = useMemo(() => {
    if (isComparisonMode && dateFromB && dateToB) {
      const yA = dateFromA?.slice(0, 4);
      const yB = dateFromB?.slice(0, 4);
      if (yA === yB) {
        return `${formatReadableRange(dateFromA, dateToA, false)} vs. ${formatReadableRange(dateFromB, dateToB, true)}`;
      }
      return `${formatReadableRange(dateFromA, dateToA, true)} vs. ${formatReadableRange(dateFromB, dateToB, true)}`;
    }
    return formatReadableRange(dateFromA, dateToA, true);
  }, [isComparisonMode, dateFromA, dateToA, dateFromB, dateToB]);

  return (
    <div
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        padding: '1rem',
        paddingBottom: '5rem',
        minHeight: '100vh',
      }}
    >
      {/* Header */}
      <PageHeader
        title="Resúmenes y Exportación"
        subtitle={headerSubtitle}
        onBack={() => navigate('/herramientas')}
        controls={headerControls}
        controlsBorder={false}
        actionColor="var(--tool-reports, #06B6D4)"
      />

      {/* =================================================================== */}
      {/* TAB 1: RESUMEN Y COMPARADOR (kept mounted so SVG charts remain accessible) */}
      {/* =================================================================== */}
      <div
        style={
          activeTab === 'analysis'
            ? undefined
            : {
                position: 'absolute',
                left: '-9999px',
                top: '-9999px',
                width: '1000px',
                height: '1000px',
                opacity: 0,
                pointerEvents: 'none',
                visibility: 'hidden',
              }
        }
        aria-hidden={activeTab !== 'analysis'}
      >
        <section aria-label="Análisis y Comparación de Periodos" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {/* Floating Control Bar without Nested Cards */}
          <div className="reports-filter-card reports-filter-floating">
            {/* Row 1: 1-line control bar with horizontal scrollable presets + toggle chip */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
              }}
            >
              {/* Horizontal scrollable preset pills */}
              <div
                className="reports-filter-scroll"
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  padding: '4px 2rem 4px 2px',
                  gap: '8px',
                }}
              >
                {PRESET_OPTIONS.map((pill) => {
                  const isSel = activePreset === pill.id;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => handlePresetSelect(pill.id)}
                      className={`reports-preset-btn ${isSel ? 'reports-preset-btn--active' : ''}`}
                    >
                      {pill.label}
                    </button>
                  );
                })}
              </div>

              {/* Toggle chip: ⇄ Comparar */}
              <button
                type="button"
                onClick={handleToggleComparison}
                aria-pressed={isComparisonMode}
                className={`reports-compare-btn ${isComparisonMode ? 'reports-compare-btn--active' : ''}`}
                style={{ flexShrink: 0 }}
                title={isComparisonMode ? 'Desactivar comparación de periodos' : 'Activar comparador A vs B'}
              >
                <ArrowLeftRight size={13} strokeWidth={2.5} />
                <span>Comparar</span>
              </button>
            </div>

            {/* Row 2: Progressive Disclosure Summary Chip + small reloading spinner (No dividers) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              {/* Progressive Disclosure Date Summary Chip */}
              <button
                type="button"
                onClick={() => setIsDatePickersOpen((prev) => !prev)}
                className={`reports-date-chip ${showDateInputs ? 'reports-date-chip--open' : ''}`}
                title="Mostrar u ocultar selectores de fecha exactos"
              >
                <Calendar size={13} color="var(--tool-reports, #06B6D4)" />
                <span>{dateSummaryText}</span>
                {!isComparisonMode && activePreset !== 'custom' && (
                  <>
                    <span style={{ color: 'var(--text-tertiary, #94A3B8)', fontSize: '0.72rem', fontWeight: 500 }}>
                      · {showDateInputs ? 'Ocultar' : 'Editar fechas'}
                    </span>
                    {showDateInputs ? (
                      <ChevronUp size={13} color="var(--text-tertiary, #94A3B8)" />
                    ) : (
                      <ChevronDown size={13} color="var(--text-tertiary, #94A3B8)" />
                    )}
                  </>
                )}
              </button>

              {/* Small spinner indicator during refetch when previous data is visible */}
              {loadingAnalysis && analysisData && (
                <span className="reports-reloading-badge" aria-live="polite">
                  <Loader2 size={13} className="animate-spin" />
                  <span>Actualizando...</span>
                </span>
              )}
            </div>

            {/* Clean floating date inputs container (Shown when custom or comparison or open) */}
            {showDateInputs && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isComparisonMode ? 'repeat(auto-fit, minmax(260px, 1fr))' : '1fr',
                  gap: '0.75rem',
                  paddingTop: '0.25rem',
                }}
              >
                {/* Period A */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isComparisonMode && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--tool-reports, #06B6D4)',
                            display: 'inline-block',
                          }}
                        />
                      )}
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                        {isComparisonMode ? 'Periodo A (Referencia)' : 'Rango Personalizado'}
                      </span>
                    </div>
                    <span className="reports-day-badge">
                      {getRangeDays(dateFromA, dateToA)} días
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div className="reports-date-input-chip">
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary, #94A3B8)' }}>
                        Desde
                      </span>
                      <input
                        type="date"
                        aria-label="Periodo A Desde"
                        value={dateFromA}
                        onChange={(e) => {
                          setDateFromA(e.target.value);
                          setActivePreset('custom');
                        }}
                        className="reports-date-input-native"
                      />
                    </div>
                    <div className="reports-date-input-chip">
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary, #94A3B8)' }}>
                        Hasta
                      </span>
                      <input
                        type="date"
                        aria-label="Periodo A Hasta"
                        value={dateToA}
                        onChange={(e) => {
                          setDateToA(e.target.value);
                          setActivePreset('custom');
                        }}
                        className="reports-date-input-native"
                      />
                    </div>
                  </div>
                </div>

                {/* Period B (When comparison mode is active) */}
                {isComparisonMode && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--tool-budgets, #6366F1)',
                            display: 'inline-block',
                          }}
                        />
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                          Periodo B (Comparación)
                        </span>
                      </div>
                      <span className="reports-day-badge">
                        {getRangeDays(dateFromB, dateToB)} días
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div className="reports-date-input-chip">
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary, #94A3B8)' }}>
                          Desde
                        </span>
                        <input
                          type="date"
                          aria-label="Periodo B Desde"
                          value={dateFromB}
                          onChange={(e) => {
                            setDateFromB(e.target.value);
                            setActivePreset('custom');
                          }}
                          className="reports-date-input-native"
                        />
                      </div>
                      <div className="reports-date-input-chip">
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary, #94A3B8)' }}>
                          Hasta
                        </span>
                        <input
                          type="date"
                          aria-label="Periodo B Hasta"
                          value={dateToB}
                          onChange={(e) => {
                            setDateToB(e.target.value);
                            setActivePreset('custom');
                          }}
                          className="reports-date-input-native"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error Banner */}
          {analysisError && (
            <div className="reports-error-banner" role="alert">
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{analysisError}</span>
              <button
                type="button"
                onClick={fetchAnalysis}
                className="reports-retry-btn"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Analytical Integrity Warning Banner */}
          {isComparisonMode && analysisData?.is_asymmetric && (
            <div className="reports-warning-banner" role="status">
              <AlertTriangle size={20} color="var(--warning-color, #F59E0B)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div className="reports-warning-banner-text">
                <strong>Aviso de integridad:</strong> Estás comparando un periodo de{' '}
                <strong>{analysisData.period_a?.days_in_range || getRangeDays(dateFromA, dateToA)} días</strong> contra uno de{' '}
                <strong>{analysisData.period_b?.days_in_range || getRangeDays(dateFromB, dateToB)} días</strong>. Además del total
                bruto, revisa la variación del Promedio Diario (<strong>Δ% / día</strong>) para una comparación proporcional.
              </div>
            </div>
          )}

          {/* Initial Loading Skeleton */}
          {loadingAnalysis && !analysisData && (
            <ReportsSkeleton />
          )}

          {/* Empty State when no data is returned and not loading */}
          {!loadingAnalysis && !analysisData && !analysisError && (
            <EmptyState
              icon={<BarChart3 size={28} />}
              title="Sin datos disponibles"
              description="No encontramos registros para el rango de fechas seleccionado."
              actionColor="var(--tool-reports, #06B6D4)"
            />
          )}

          {/* Main Content: Keep previous data visible with reduced opacity while reloading */}
          {analysisData && (
            <div
              className="reports-content-container"
              data-loading={loadingAnalysis}
              aria-busy={loadingAnalysis}
            >
              {/* Comparative KPI Cards Grid */}
              <div className="reports-kpi-grid">
                {/* Card 1: Ingresos Totales */}
                <div className="reports-kpi-card reports-enter" style={{ '--i': 0 } as React.CSSProperties}>
                  <div className="reports-kpi-top">
                    <span className="reports-kpi-label">Ingresos</span>
                    <ArrowUpRight size={15} color="var(--income-color, #10B981)" />
                  </div>
                  <div className="reports-kpi-value">
                    {formatCurrency(incomeA, effectiveCurrency)}
                  </div>
                  {isComparisonMode ? (
                    <>
                      <div className="reports-kpi-compare-text">
                        vs. {formatCurrency(incomeB, effectiveCurrency)}
                      </div>
                      <div style={{ marginTop: '3px' }}>
                        {renderDeltaBadge(deltaIncome.pct, deltaDailyAvg.pct, false)}
                      </div>
                    </>
                  ) : (
                    <div className="reports-kpi-subtext">
                      {analysisData.period_a.days_in_range} días en periodo
                    </div>
                  )}
                </div>

                {/* Card 2: Gastos Totales */}
                <div className="reports-kpi-card reports-enter" style={{ '--i': 1 } as React.CSSProperties}>
                  <div className="reports-kpi-top">
                    <span className="reports-kpi-label">Gastos</span>
                    <ArrowDownRight size={15} color="var(--expense-color, #EF4444)" />
                  </div>
                  <div className="reports-kpi-value">
                    {formatCurrency(expenseA, effectiveCurrency)}
                  </div>
                  {isComparisonMode ? (
                    <>
                      <div className="reports-kpi-compare-text">
                        vs. {formatCurrency(expenseB, effectiveCurrency)}
                      </div>
                      <div style={{ marginTop: '3px' }}>
                        {renderDeltaBadge(deltaExpense.pct, deltaDailyAvg.pct, true)}
                      </div>
                    </>
                  ) : (
                    <div className="reports-kpi-subtext">
                      Promedio: {formatCurrency(dailyAvgA, effectiveCurrency)}/día
                    </div>
                  )}
                </div>

                {/* Card 3: Balance Neto */}
                <div className="reports-kpi-card reports-enter" style={{ '--i': 2 } as React.CSSProperties}>
                  <div className="reports-kpi-top">
                    <span className="reports-kpi-label">Balance Neto</span>
                    <Sparkles size={15} color="var(--tool-reports, #06B6D4)" />
                  </div>
                  <div className={`reports-kpi-value ${balanceA >= 0 ? 'reports-kpi-value--positive' : 'reports-kpi-value--negative'}`}>
                    {formatCurrency(balanceA, effectiveCurrency)}
                  </div>
                  {isComparisonMode ? (
                    <>
                      <div className="reports-kpi-compare-text">
                        vs. {formatCurrency(balanceB, effectiveCurrency)}
                      </div>
                      <div style={{ marginTop: '3px' }}>
                        {renderDeltaBadge(deltaBalance.pct, deltaDailyAvg.pct, false)}
                      </div>
                    </>
                  ) : (
                    <div className="reports-kpi-subtext">
                      {balanceA >= 0 ? 'Superávit del periodo' : 'Déficit del periodo'}
                    </div>
                  )}
                </div>

                {/* Card 4: Promedio Diario */}
                <div className="reports-kpi-card reports-enter" style={{ '--i': 3 } as React.CSSProperties}>
                  <div className="reports-kpi-top">
                    <span className="reports-kpi-label">Promedio Diario</span>
                    <BarChart3 size={15} color="var(--tool-reports, #06B6D4)" />
                  </div>
                  <div className="reports-kpi-value">
                    {formatCurrency(dailyAvgA, effectiveCurrency)}/d
                  </div>
                  {isComparisonMode ? (
                    <>
                      <div className="reports-kpi-compare-text">
                        vs. {formatCurrency(dailyAvgB, effectiveCurrency)}/d
                      </div>
                      <div style={{ marginTop: '3px' }}>
                        {renderDeltaBadge(deltaDailyAvg.pct, null, true)}
                      </div>
                    </>
                  ) : (
                    <div className="reports-kpi-subtext">
                      Gasto medio estimado
                    </div>
                  )}
                </div>
              </div>

              {/* SVG Charts Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Chart 1: Donut Distribution */}
                <div className="reports-enter" style={{ '--i': 4 } as React.CSSProperties}>
                  <CategoryDonutChart
                    ref={donutChartRef}
                    categories={donutCategories}
                    total={expenseA}
                    currency={effectiveCurrency}
                    transactions={expensesA}
                    selectedCategory={selectedCategory}
                    onSelectCategory={handleSelectCategory}
                    title="Distribución de Gastos por Categoría (Periodo A)"
                  />
                </div>

                {/* Chart 2: Cashflow Trend */}
                <div className="reports-enter" style={{ '--i': 5 } as React.CSSProperties}>
                  <CashflowTrendChart
                    ref={trendChartRef}
                    series={analysisData.series_a || []}
                    currency={effectiveCurrency}
                    title="Flujo de Caja: Ingresos vs. Gastos (Periodo A)"
                  />
                </div>

                {/* Chart 3: Period Comparison Bar Chart (Only in comparison mode) */}
                {isComparisonMode && (
                  <div className="reports-enter" style={{ '--i': 6 } as React.CSSProperties}>
                    <PeriodComparisonBarChart
                      ref={compChartRef}
                      periodA={periodAKpi}
                      periodB={periodBKpi}
                      categoryComparison={analysisData.category_comparison || []}
                      currency={effectiveCurrency}
                      title="Comparativa Visual: Periodo A vs. Periodo B"
                    />
                  </div>
                )}

                {/* Bottom CTA Card */}
                <div className="reports-cta-card reports-enter" style={{ '--i': isComparisonMode ? 7 : 6 } as React.CSSProperties}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <div className="reports-cta-icon">
                      <FileSpreadsheet size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Exportar este periodo en PDF/Excel
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Configura columnas, desglose por categorías y formato personalizado.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportThisAnalysis}
                    className="reports-cta-btn"
                  >
                    <span>Configurar Exportación</span>
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* =================================================================== */}
      {/* TAB 2: CONFIGURADOR DE EXPORTACIÓN (ExportStudioPanel)              */}
      {/* =================================================================== */}
      {activeTab === 'export' && (
        <ExportStudioPanel
          initialConfig={exportConfig}
          onConfigChange={handleExportConfigChange}
          defaultCurrency={mainCurrency}
          defaultEmail={user?.email}
          getSvgElements={() => {
            const svgs: SVGSVGElement[] = [];
            if (donutChartRef.current) svgs.push(donutChartRef.current);
            if (trendChartRef.current) svgs.push(trendChartRef.current);
            if (isComparisonMode && compChartRef.current) svgs.push(compChartRef.current);
            return svgs;
          }}
        />
      )}
    </div>
  );
};

export default ReportsHub;
