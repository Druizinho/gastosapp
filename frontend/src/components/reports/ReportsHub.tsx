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
  FileText,
  Share2,
} from 'lucide-react';

import { PageHeader } from '../ui/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useCurrencyPreference } from '../../context/CurrencyPreferenceContext';
import { useToast } from '../ui/Toast';
import { useReportExport } from '../../hooks/useReportExport';
import { TOOL_COLORS } from '../../utils/toolColors';
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
  MainCurrencyPreference,
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
  ORDERED_CURRENCIES,
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
      <span
        style={{
          display: 'inline-block',
          padding: '2px 6px',
          borderRadius: '5px',
          fontSize: '0.69rem',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          background: 'rgba(148, 163, 184, 0.15)',
          color: '#64748B',
        }}
      >
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
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 6px',
        borderRadius: '5px',
        fontSize: '0.69rem',
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        background: isGood ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
        color: isGood ? '#059669' : '#DC2626',
        maxWidth: '100%',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      title={`Variación total: ${pctTotal.toFixed(1)}% | Por día: ${(pctDaily || 0).toFixed(1)}%`}
    >
      {totalPart}{dailyPart}
    </span>
  );
}

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
  const { mainCurrency: userDefaultCurrency } = useCurrencyPreference();
  const toast = useToast();

  const shortcuts = useMemo(() => getSymmetricShortcuts(), []);

  // Top header state (URL deep-linking initialized)
  const [activeTab, setActiveTab] = useState<'analysis' | 'export'>(() => {
    return searchParams.get('tab') === 'export' ? 'export' : 'analysis';
  });
  const [reportCurrency, setReportCurrency] = useState<MainCurrencyPreference>(() => userDefaultCurrency || 'USD');

  // SVG Chart refs for embedding in PDF
  const donutChartRef = useRef<SVGSVGElement | null>(null);
  const trendChartRef = useRef<SVGSVGElement | null>(null);
  const compChartRef = useRef<SVGSVGElement | null>(null);

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

  // -------------------------------------------------------------------------
  // Native Share support detection
  // -------------------------------------------------------------------------
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      setCanShare(true);
    }
  }, []);

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
      currency: userDefaultCurrency || 'USD',
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
  // Centralized useReportExport Hook
  // -------------------------------------------------------------------------
  const { exportDocument, isExporting, exportActionLoading } = useReportExport({
    getSvgElements: () => {
      const svgs: SVGSVGElement[] = [];
      if (donutChartRef.current) svgs.push(donutChartRef.current);
      if (trendChartRef.current) svgs.push(trendChartRef.current);
      if (isComparisonMode && compChartRef.current) svgs.push(compChartRef.current);
      return svgs;
    },
    onSuccess: (msg) => {
      toast.success(msg || 'Reporte generado con éxito');
    },
    onError: (err) => {
      toast.error(err || 'Error al generar el reporte');
    },
  });

  const [quickExportFormat, setQuickExportFormat] = useState<'pdf' | 'xlsx' | null>(null);

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

  // Keep currency synced if user changes top switcher
  const handleCurrencyChange = (newCur: MainCurrencyPreference) => {
    setReportCurrency(newCur);
    setExportConfig((prev) => ({ ...prev, currency: newCur }));
  };

  // -------------------------------------------------------------------------
  // Fetch Analysis Data (Tab 1)
  // -------------------------------------------------------------------------
  const fetchAnalysis = useCallback(async () => {
    if (!dateFromA || !dateToA) return;

    const daysA = getRangeDays(dateFromA, dateToA);
    if (dateFromA > dateToA) {
      setAnalysisError('La fecha inicial del Periodo A no puede ser posterior a la fecha final.');
      return;
    }
    if (daysA > 366) {
      setAnalysisError('El Periodo A supera los 366 días (máximo permitido).');
      return;
    }

    if (isComparisonMode) {
      if (!dateFromB || !dateToB) return;
      const daysB = getRangeDays(dateFromB, dateToB);
      if (dateFromB > dateToB) {
        setAnalysisError('La fecha inicial del Periodo B no puede ser posterior a la fecha final.');
        return;
      }
      if (daysB > 366) {
        setAnalysisError('El Periodo B supera los 366 días (máximo permitido).');
        return;
      }
    }

    setLoadingAnalysis(true);
    setAnalysisError(null);

    try {
      getExpenses(dateFromA, dateToA).then(setExpensesA).catch(() => setExpensesA([]));
      const data = await getReportAnalysis({
        date_from_a: dateFromA,
        date_to_a: dateToA,
        date_from_b: isComparisonMode ? dateFromB : undefined,
        date_to_b: isComparisonMode ? dateToB : undefined,
      });
      setAnalysisData(data);
    } catch (err: any) {
      console.error('Failed to fetch report analysis:', err);
      const msg = err?.response?.data?.detail || err?.message || 'Error al obtener el análisis del periodo';
      setAnalysisError(msg);
    } finally {
      setLoadingAnalysis(false);
    }
  }, [dateFromA, dateToA, dateFromB, dateToB, isComparisonMode]);

  useEffect(() => {
    fetchAnalysis();
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
    if (activePreset !== 'custom') {
      applyPresetDates(activePreset, nextCompare);
    } else if (nextCompare && (!dateFromB || !dateToB)) {
      setDateFromB(shortcuts.lastMonthStart);
      setDateToB(shortcuts.lastMonthEnd);
    }
  };

  // -------------------------------------------------------------------------
  // 1-Click Quick Export Handler
  // -------------------------------------------------------------------------
  const handleQuickExport = async (format: 'pdf' | 'xlsx', action: 'download' | 'share' = 'download') => {
    setQuickExportFormat(format);
    try {
      const currentConfig: ExportConfig = {
        ...exportConfig,
        source: isComparisonMode ? 'comparison' : 'summary',
        format,
        currency: reportCurrency,
        dateFromA,
        dateToA,
        dateFromB: isComparisonMode ? dateFromB : undefined,
        dateToB: isComparisonMode ? dateToB : undefined,
        includeCharts: true,
        includeHeaderCard: true,
        includeCategories: true,
        includeTransactions: true,
        includeOriginalCurrency: true,
      };

      await exportDocument({
        action,
        format,
        config: currentConfig,
      });
    } finally {
      setQuickExportFormat(null);
    }
  };

  // -------------------------------------------------------------------------
  // Tab 1 KPI Aggregations
  // -------------------------------------------------------------------------
  const pA = analysisData?.period_a;
  const pB = analysisData?.period_b;

  const incomeA = useMemo(() => resolveIncomeTotal(pA, reportCurrency), [pA, reportCurrency]);
  const incomeB = useMemo(() => (pB ? resolveIncomeTotal(pB, reportCurrency) : 0), [pB, reportCurrency]);
  const deltaIncome = useMemo(() => computeDelta(incomeA, incomeB), [incomeA, incomeB]);

  const expenseA = useMemo(() => resolveCurrencyTotal(pA, reportCurrency), [pA, reportCurrency]);
  const expenseB = useMemo(() => (pB ? resolveCurrencyTotal(pB, reportCurrency) : 0), [pB, reportCurrency]);
  const deltaExpense = useMemo(() => computeDelta(expenseA, expenseB), [expenseA, expenseB]);

  const balanceA = useMemo(() => resolveBalanceTotal(pA, reportCurrency), [pA, reportCurrency]);
  const balanceB = useMemo(() => (pB ? resolveBalanceTotal(pB, reportCurrency) : 0), [pB, reportCurrency]);
  const deltaBalance = useMemo(() => computeDelta(balanceA, balanceB), [balanceA, balanceB]);

  const dailyAvgA = useMemo(() => resolveDailyAvg(pA, reportCurrency), [pA, reportCurrency]);
  const dailyAvgB = useMemo(() => (pB ? resolveDailyAvg(pB, reportCurrency) : 0), [pB, reportCurrency]);
  const deltaDailyAvg = useMemo(() => computeDelta(dailyAvgA, dailyAvgB), [dailyAvgA, dailyAvgB]);

  // Donut chart categories
  const donutCategories: CategoryDonutItem[] = useMemo(() => {
    if (!analysisData?.period_a?.by_category) return [];
    const expTotal = resolveCurrencyTotal(analysisData.period_a, reportCurrency);
    return analysisData.period_a.by_category.map((cat) => {
      const amount = resolveCategoryTotal(cat, reportCurrency);
      const percentage = expTotal > 0 ? (amount / expTotal) * 100 : 0;
      return {
        category: cat.category,
        amount,
        percentage,
      };
    });
  }, [analysisData?.period_a, reportCurrency]);

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

  // -------------------------------------------------------------------------
  // Transition from Tab 1 to Tab 2 ("Exportar este análisis")
  // -------------------------------------------------------------------------
  const handleExportThisAnalysis = () => {
    const source = isComparisonMode ? 'comparison' : 'summary';
    setExportConfig((prev) => ({
      ...prev,
      source,
      currency: reportCurrency,
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
  // Header Controls (Tabs + Currency Switcher)
  // -------------------------------------------------------------------------
  const headerControls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        {/* 2 Tabs Segmented Control */}
        <div
          role="tablist"
          style={{
            display: 'inline-flex',
            background: 'var(--bg-secondary, #F1F5F9)',
            padding: '3px',
            borderRadius: '9999px',
            border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'analysis'}
            onClick={() => handleTabChange('analysis')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'analysis' ? 'var(--surface-color, #FFFFFF)' : 'transparent',
              color: activeTab === 'analysis' ? 'var(--tool-reports, #06B6D4)' : 'var(--text-secondary, #64748B)',
              boxShadow: activeTab === 'analysis' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'background-color 150ms ease, color 150ms ease, transform 150ms ease',
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <BarChart3 size={16} />
            <span>Resumen y Comparador</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'export'}
            onClick={() => handleTabChange('export')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'export' ? 'var(--surface-color, #FFFFFF)' : 'transparent',
              color: activeTab === 'export' ? 'var(--tool-reports, #06B6D4)' : 'var(--text-secondary, #64748B)',
              boxShadow: activeTab === 'export' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'background-color 150ms ease, color 150ms ease, transform 150ms ease',
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <FileSpreadsheet size={16} />
            <span>Exportar Archivos</span>
          </button>
        </div>

        {/* Currency Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary, #94A3B8)', marginRight: '4px' }}>
            Moneda:
          </span>
          {ORDERED_CURRENCIES.map((cur) => {
            const isSelected = reportCurrency === cur;
            return (
              <button
                key={cur}
                type="button"
                onClick={() => handleCurrencyChange(cur)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: isSelected
                    ? '1.5px solid var(--tool-reports, #06B6D4)'
                    : '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  background: isSelected ? 'var(--tool-reports-bg, rgba(6, 182, 212, 0.12))' : 'var(--surface-color, #FFFFFF)',
                  color: isSelected ? 'var(--tool-reports, #06B6D4)' : 'var(--text-secondary, #64748B)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 150ms ease',
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {cur}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

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
        subtitle="Analiza tendencias, compara periodos y exporta reportes ejecutivos"
        onBack={() => navigate('/herramientas')}
        controls={headerControls}
        actionColor={TOOL_COLORS.reports.solid}
      />

      {/* =================================================================== */}
      {/* TAB 1: RESUMEN Y COMPARADOR                                         */}
      {/* =================================================================== */}
      {activeTab === 'analysis' && (
        <section aria-label="Análisis y Comparación de Periodos" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {/* Ultra-Compact Filter Bar with Progressive Disclosure & 1-Click Export */}
          <div
            style={{
              background: 'var(--surface-color, #FFFFFF)',
              borderRadius: '16px',
              padding: '0.75rem',
              border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.625rem',
            }}
          >
            {/* Row 1: 1-line control bar with horizontal scrollable presets + toggle chip */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'nowrap',
              }}
            >
              {/* Horizontal scrollable preset pills */}
              <div className="reports-filter-scroll" style={{ flex: 1, minWidth: 0 }}>
                {PRESET_OPTIONS.map((pill) => {
                  const isSel = activePreset === pill.id;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => handlePresetSelect(pill.id)}
                      style={{
                        flexShrink: 0,
                        padding: '5px 12px',
                        borderRadius: '9999px',
                        border: isSel
                          ? '1.5px solid var(--tool-reports, #06B6D4)'
                          : '1px solid var(--border-color, rgba(0,0,0,0.08))',
                        background: isSel
                          ? 'var(--tool-reports-bg, rgba(6, 182, 212, 0.12))'
                          : 'var(--bg-secondary, #F8FAFC)',
                        color: isSel ? 'var(--tool-reports, #06B6D4)' : 'var(--text-secondary, #64748B)',
                        fontSize: '0.78rem',
                        fontWeight: isSel ? 700 : 500,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 150ms ease',
                      }}
                      onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
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
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 11px',
                  borderRadius: '9999px',
                  border: isComparisonMode
                    ? '1.5px solid var(--tool-reports, #06B6D4)'
                    : '1px solid var(--border-color, rgba(0,0,0,0.1))',
                  background: isComparisonMode
                    ? 'var(--tool-reports, #06B6D4)'
                    : 'var(--bg-secondary, #F8FAFC)',
                  color: isComparisonMode ? '#FFFFFF' : 'var(--text-secondary, #64748B)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: isComparisonMode ? '0 1px 3px rgba(6, 182, 212, 0.3)' : 'none',
                  transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 150ms ease',
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                title={isComparisonMode ? 'Desactivar comparación de periodos' : 'Activar comparador A vs B'}
              >
                <ArrowLeftRight size={13} strokeWidth={2.5} />
                <span>Comparar</span>
              </button>
            </div>

            {/* Row 2: Progressive Disclosure Summary Chip + 1-Click Direct Export Group */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                paddingTop: '0.35rem',
                borderTop: '1px solid var(--border-color, rgba(0, 0, 0, 0.05))',
              }}
            >
              {/* Progressive Disclosure Date Summary Chip */}
              <button
                type="button"
                onClick={() => setIsDatePickersOpen((prev) => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
                  background: isDatePickersOpen
                    ? 'var(--tool-reports-bg, rgba(6, 182, 212, 0.08))'
                    : 'var(--surface-color, #FFFFFF)',
                  color: 'var(--text-primary, #0F172A)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontVariantNumeric: 'tabular-nums',
                  transition: 'background-color 150ms ease, border-color 150ms ease, transform 150ms ease',
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                title="Mostrar u ocultar selectores de fecha exactos"
              >
                <Calendar size={13} color="var(--tool-reports, #06B6D4)" />
                <span>{dateSummaryText}</span>
                <span style={{ color: 'var(--text-tertiary, #94A3B8)', fontSize: '0.72rem', fontWeight: 500 }}>
                  · {isDatePickersOpen ? 'Ocultar' : 'Editar fechas'}
                </span>
                {isDatePickersOpen ? (
                  <ChevronUp size={13} color="var(--text-tertiary, #94A3B8)" />
                ) : (
                  <ChevronDown size={13} color="var(--text-tertiary, #94A3B8)" />
                )}
              </button>

              {/* 1-Click Direct Export Group */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                {/* PDF Rápido Button */}
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleQuickExport('pdf', 'download')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 9px',
                    borderRadius: '8px',
                    border: '1px solid rgba(6, 182, 212, 0.35)',
                    background: 'var(--tool-reports-bg, rgba(6, 182, 212, 0.08))',
                    color: 'var(--tool-reports, #06B6D4)',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                    opacity: isExporting ? 0.6 : 1,
                    transition: 'background-color 150ms ease, transform 150ms ease',
                  }}
                  onMouseDown={(e) => !isExporting && (e.currentTarget.style.transform = 'scale(0.96)')}
                  onMouseUp={(e) => !isExporting && (e.currentTarget.style.transform = 'scale(1)')}
                  onMouseLeave={(e) => !isExporting && (e.currentTarget.style.transform = 'scale(1)')}
                  title="Descargar análisis del periodo en PDF"
                >
                  {isExporting && quickExportFormat === 'pdf' && exportActionLoading === 'download' ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <FileText size={13} />
                  )}
                  <span>PDF Rápido</span>
                </button>

                {/* Excel Button */}
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleQuickExport('xlsx', 'download')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 9px',
                    borderRadius: '8px',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    background: 'rgba(16, 185, 129, 0.08)',
                    color: '#059669',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                    opacity: isExporting ? 0.6 : 1,
                    transition: 'background-color 150ms ease, transform 150ms ease',
                  }}
                  onMouseDown={(e) => !isExporting && (e.currentTarget.style.transform = 'scale(0.96)')}
                  onMouseUp={(e) => !isExporting && (e.currentTarget.style.transform = 'scale(1)')}
                  onMouseLeave={(e) => !isExporting && (e.currentTarget.style.transform = 'scale(1)')}
                  title="Descargar análisis del periodo en Excel"
                >
                  {isExporting && quickExportFormat === 'xlsx' && exportActionLoading === 'download' ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <FileSpreadsheet size={13} />
                  )}
                  <span>Excel</span>
                </button>

                {/* Share Button (on mobile/supported browsers) */}
                {canShare && (
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => handleQuickExport('pdf', 'share')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, rgba(0, 0, 0, 0.1))',
                      background: 'var(--surface-color, #FFFFFF)',
                      color: 'var(--text-secondary, #64748B)',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: isExporting ? 'not-allowed' : 'pointer',
                      opacity: isExporting ? 0.6 : 1,
                      transition: 'background-color 150ms ease, transform 150ms ease',
                    }}
                    onMouseDown={(e) => !isExporting && (e.currentTarget.style.transform = 'scale(0.96)')}
                    onMouseUp={(e) => !isExporting && (e.currentTarget.style.transform = 'scale(1)')}
                    onMouseLeave={(e) => !isExporting && (e.currentTarget.style.transform = 'scale(1)')}
                    title="Compartir reporte PDF"
                  >
                    {isExporting && exportActionLoading === 'share' ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Share2 size={13} />
                    )}
                    <span>Compartir</span>
                  </button>
                )}
              </div>
            </div>

            {/* Collapsible Exact Date Pickers (Shown when custom or when chip is toggled) */}
            {isDatePickersOpen && (
              <div
                style={{
                  marginTop: '0.25rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--border-color, rgba(0, 0, 0, 0.06))',
                  display: 'grid',
                  gridTemplateColumns: isComparisonMode ? 'repeat(auto-fit, minmax(240px, 1fr))' : '1fr',
                  gap: '0.75rem',
                }}
              >
                {/* Period A */}
                <div
                  style={{
                    background: isComparisonMode ? 'rgba(6, 182, 212, 0.04)' : 'transparent',
                    padding: isComparisonMode ? '0.625rem' : '0',
                    borderRadius: '8px',
                    border: isComparisonMode ? '1px dashed rgba(6, 182, 212, 0.3)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                      {isComparisonMode ? 'Periodo A (Referencia)' : 'Rango Personalizado'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary, #94A3B8)', fontVariantNumeric: 'tabular-nums' }}>
                      {getRangeDays(dateFromA, dateToA)} días
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="date"
                      aria-label="Periodo A Desde"
                      value={dateFromA}
                      onChange={(e) => {
                        setDateFromA(e.target.value);
                        setActivePreset('custom');
                      }}
                      style={{
                        flex: 1,
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, rgba(0, 0, 0, 0.12))',
                        fontSize: '0.8rem',
                        background: 'var(--surface-color, #FFFFFF)',
                        color: 'var(--text-primary, #0F172A)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary, #94A3B8)' }}>al</span>
                    <input
                      type="date"
                      aria-label="Periodo A Hasta"
                      value={dateToA}
                      onChange={(e) => {
                        setDateToA(e.target.value);
                        setActivePreset('custom');
                      }}
                      style={{
                        flex: 1,
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, rgba(0, 0, 0, 0.12))',
                        fontSize: '0.8rem',
                        background: 'var(--surface-color, #FFFFFF)',
                        color: 'var(--text-primary, #0F172A)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    />
                  </div>
                </div>

                {/* Period B (When comparison mode is active) */}
                {isComparisonMode && (
                  <div
                    style={{
                      background: 'rgba(99, 102, 241, 0.04)',
                      padding: '0.625rem',
                      borderRadius: '8px',
                      border: '1px dashed rgba(99, 102, 241, 0.3)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                        Periodo B (Comparación)
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary, #94A3B8)', fontVariantNumeric: 'tabular-nums' }}>
                        {getRangeDays(dateFromB, dateToB)} días
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="date"
                        aria-label="Periodo B Desde"
                        value={dateFromB}
                        onChange={(e) => {
                          setDateFromB(e.target.value);
                          setActivePreset('custom');
                        }}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, rgba(0, 0, 0, 0.12))',
                          fontSize: '0.8rem',
                          background: 'var(--surface-color, #FFFFFF)',
                          color: 'var(--text-primary, #0F172A)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary, #94A3B8)' }}>al</span>
                      <input
                        type="date"
                        aria-label="Periodo B Hasta"
                        value={dateToB}
                        onChange={(e) => {
                          setDateToB(e.target.value);
                          setActivePreset('custom');
                        }}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, rgba(0, 0, 0, 0.12))',
                          fontSize: '0.8rem',
                          background: 'var(--surface-color, #FFFFFF)',
                          color: 'var(--text-primary, #0F172A)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error Banner */}
          {analysisError && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '12px',
                padding: '0.875rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                color: '#B91C1C',
                fontSize: '0.85rem',
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{analysisError}</span>
              <button
                type="button"
                onClick={fetchAnalysis}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #B91C1C',
                  background: 'transparent',
                  color: '#B91C1C',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease, transform 150ms ease',
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Analytical Integrity Warning Banner */}
          {isComparisonMode && analysisData?.is_asymmetric && (
            <div
              style={{
                background: '#FEF3C7',
                border: '1px solid #F59E0B',
                borderRadius: '12px',
                padding: '0.875rem 1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
              }}
            >
              <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.85rem', color: '#92400E', lineHeight: 1.45 }}>
                <strong>Aviso de integridad:</strong> Estás comparando un periodo de{' '}
                <strong>{analysisData.period_a?.days_in_range || getRangeDays(dateFromA, dateToA)} días</strong> contra uno de{' '}
                <strong>{analysisData.period_b?.days_in_range || getRangeDays(dateFromB, dateToB)} días</strong>. Además del total
                bruto, revisa la variación del Promedio Diario (<strong>Δ% / día</strong>) para una comparación proporcional.
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {loadingAnalysis && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '2rem',
                color: 'var(--text-secondary, #64748B)',
                fontSize: '0.9rem',
              }}
            >
              <Loader2 size={20} className="animate-spin" />
              <span>Cargando análisis financiero...</span>
            </div>
          )}

          {/* Comparative KPI Cards Grid (Strict 2x2 on mobile, 4 columns on desktop) */}
          {!loadingAnalysis && analysisData && (
            <div className="reports-kpi-grid">
              {/* Card 1: Ingresos Totales */}
              <div
                style={{
                  background: 'var(--surface-color, #FFFFFF)',
                  borderRadius: '14px',
                  padding: '0.85rem',
                  border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--text-tertiary, #94A3B8)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Ingresos
                  </span>
                  <ArrowUpRight size={15} color="#10B981" />
                </div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: 'var(--text-primary, #0F172A)',
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatCurrency(incomeA, reportCurrency)}
                </div>
                {isComparisonMode ? (
                  <>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-tertiary, #94A3B8)',
                        fontVariantNumeric: 'tabular-nums',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      vs. {formatCurrency(incomeB, reportCurrency)}
                    </div>
                    <div style={{ marginTop: '3px' }}>
                      {renderDeltaBadge(deltaIncome.pct, deltaDailyAvg.pct, false)}
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-tertiary, #94A3B8)',
                      marginTop: 'auto',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {analysisData.period_a.days_in_range} días en periodo
                  </div>
                )}
              </div>

              {/* Card 2: Gastos Totales */}
              <div
                style={{
                  background: 'var(--surface-color, #FFFFFF)',
                  borderRadius: '14px',
                  padding: '0.85rem',
                  border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--text-tertiary, #94A3B8)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Gastos
                  </span>
                  <ArrowDownRight size={15} color="#EF4444" />
                </div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: 'var(--text-primary, #0F172A)',
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatCurrency(expenseA, reportCurrency)}
                </div>
                {isComparisonMode ? (
                  <>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-tertiary, #94A3B8)',
                        fontVariantNumeric: 'tabular-nums',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      vs. {formatCurrency(expenseB, reportCurrency)}
                    </div>
                    <div style={{ marginTop: '3px' }}>
                      {renderDeltaBadge(deltaExpense.pct, deltaDailyAvg.pct, true)}
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-tertiary, #94A3B8)',
                      marginTop: 'auto',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    Promedio: {formatCurrency(dailyAvgA, reportCurrency)}/día
                  </div>
                )}
              </div>

              {/* Card 3: Balance Neto */}
              <div
                style={{
                  background: 'var(--surface-color, #FFFFFF)',
                  borderRadius: '14px',
                  padding: '0.85rem',
                  border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--text-tertiary, #94A3B8)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Balance Neto
                  </span>
                  <Sparkles size={15} color="var(--tool-reports, #06B6D4)" />
                </div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: balanceA >= 0 ? '#059669' : '#DC2626',
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatCurrency(balanceA, reportCurrency)}
                </div>
                {isComparisonMode ? (
                  <>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-tertiary, #94A3B8)',
                        fontVariantNumeric: 'tabular-nums',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      vs. {formatCurrency(balanceB, reportCurrency)}
                    </div>
                    <div style={{ marginTop: '3px' }}>
                      {renderDeltaBadge(deltaBalance.pct, deltaDailyAvg.pct, false)}
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-tertiary, #94A3B8)',
                      marginTop: 'auto',
                    }}
                  >
                    {balanceA >= 0 ? 'Superávit del periodo' : 'Déficit del periodo'}
                  </div>
                )}
              </div>

              {/* Card 4: Promedio Diario */}
              <div
                style={{
                  background: 'var(--surface-color, #FFFFFF)',
                  borderRadius: '14px',
                  padding: '0.85rem',
                  border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--text-tertiary, #94A3B8)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Promedio Diario
                  </span>
                  <BarChart3 size={15} color="var(--tool-reports, #06B6D4)" />
                </div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: 'var(--text-primary, #0F172A)',
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatCurrency(dailyAvgA, reportCurrency)}/d
                </div>
                {isComparisonMode ? (
                  <>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-tertiary, #94A3B8)',
                        fontVariantNumeric: 'tabular-nums',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      vs. {formatCurrency(dailyAvgB, reportCurrency)}/d
                    </div>
                    <div style={{ marginTop: '3px' }}>
                      {renderDeltaBadge(deltaDailyAvg.pct, null, true)}
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-tertiary, #94A3B8)',
                      marginTop: 'auto',
                    }}
                  >
                    Gasto medio estimado
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action CTA: "Exportar este análisis" with Studio customization */}
          {!loadingAnalysis && analysisData && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                background: 'var(--tool-reports-bg, rgba(6, 182, 212, 0.08))',
                border: '1px solid var(--tool-reports, rgba(6, 182, 212, 0.3))',
                borderRadius: '12px',
                padding: '0.75rem 1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="var(--tool-reports, #06B6D4)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary, #0F172A)' }}>
                  ¿Deseas enviar este reporte por correo o personalizar filtros?
                </span>
              </div>
              <button
                type="button"
                onClick={handleExportThisAnalysis}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--tool-reports, #06B6D4)',
                  color: '#FFFFFF',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(6, 182, 212, 0.25)',
                  transition: 'background-color 150ms ease, transform 150ms ease',
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <FileSpreadsheet size={14} />
                <span>Abrir en Estudio de Exportación</span>
              </button>
            </div>
          )}

          {/* SVG Charts Section */}
          {!loadingAnalysis && analysisData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Chart 1: Donut Distribution */}
              <CategoryDonutChart
                ref={donutChartRef}
                categories={donutCategories}
                total={expenseA}
                currency={reportCurrency}
                transactions={expensesA}
                title="Distribución de Gastos por Categoría (Periodo A)"
              />

              {/* Chart 2: Cashflow Trend */}
              <CashflowTrendChart
                ref={trendChartRef}
                series={analysisData.series_a || []}
                currency={reportCurrency}
                title="Flujo de Caja: Ingresos vs. Gastos (Periodo A)"
              />

              {/* Chart 3: Period Comparison Bar Chart (Only in comparison mode) */}
              {isComparisonMode && (
                <PeriodComparisonBarChart
                  ref={compChartRef}
                  periodA={periodAKpi}
                  periodB={periodBKpi}
                  categoryComparison={analysisData.category_comparison || []}
                  currency={reportCurrency}
                  title="Comparativa Visual: Periodo A vs. Periodo B"
                />
              )}
            </div>
          )}
        </section>
      )}

      {/* =================================================================== */}
      {/* TAB 2: CONFIGURADOR DE EXPORTACIÓN (ExportStudioPanel)              */}
      {/* =================================================================== */}
      {activeTab === 'export' && (
        <ExportStudioPanel
          initialConfig={exportConfig}
          onConfigChange={setExportConfig}
          getSvgElements={() => {
            const svgs: SVGSVGElement[] = [];
            if (donutChartRef.current) svgs.push(donutChartRef.current);
            if (trendChartRef.current) svgs.push(trendChartRef.current);
            if (isComparisonMode && compChartRef.current) svgs.push(compChartRef.current);
            return svgs;
          }}
          defaultEmail={user?.email}
          reportCurrency={reportCurrency}
          onReportCurrencyChange={handleCurrencyChange}
        />
      )}
    </div>
  );
};

export default ReportsHub;
