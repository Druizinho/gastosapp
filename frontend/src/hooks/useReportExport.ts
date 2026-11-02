import { useState, useCallback, useMemo } from 'react';
import type {
  ExportConfig,
  ExportFormatType,
  ExportSourceType,
  MainCurrencyPreference,
  Debt,
  SavingGoal,
  MonthlyBudgetResponse,
  FixedExpense,
  EstimatedIncome,
} from '../types';
import {
  buildSummaryDocument,
  buildComparisonDocument,
  buildDebtsDocument,
  buildSavingsDocument,
  buildProjectsDocument,
  buildBudgetDocument,
  buildFixedExpensesDocument,
  buildEstimatedIncomeDocument,
  buildFixedAndIncomeDocument,
  type NormalizedExportDocument,
} from '../utils/exporters/entityTemplates';
import {
  exportToExcel,
  exportToCsv,
  triggerDownload,
  triggerNativeShare,
  blobToBase64,
} from '../utils/exporters/spreadsheetExporter';
import { exportToPdf } from '../utils/exporters/pdfExporter';
import {
  getReportAnalysis,
  getSummaryRange,
  getExpenses,
  getIncomes,
  getRates,
  getDebts,
  getSavingGoals,
  getMonthlyBudget,
  getMonthlyFixedExpenses,
  getFixedExpenses,
  getMonthlyIncomes,
  getEstimatedIncomes,
  sendReportEmail,
} from '../api';

// =============================================================================
// Helper Functions
// =============================================================================

export function padZero(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}

export function getRangeDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const d1 = new Date(from);
  const d2 = new Date(to);
  const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24)) + 1;
  return isNaN(diff) ? 0 : Math.max(0, diff);
}

export function getSymmetricShortcuts() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  // Este mes vs. Mes anterior
  const thisMonthStart = new Date(y, m, 1);
  const thisMonthEnd = new Date(y, m + 1, 0);
  const lastMonthStart = new Date(y, m - 1, 1);
  const lastMonthEnd = new Date(y, m, 0);

  // Este mes vs. Mismo mes año pasado
  const sameMonthLastYearStart = new Date(y - 1, m, 1);
  const sameMonthLastYearEnd = new Date(y - 1, m + 1, 0);

  // Esta semana vs. Semana pasada (Monday-Sunday)
  const dayOfWeek = (now.getDay() + 6) % 7;
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

export function getDefaultExportConfig(defaultCurrency: MainCurrencyPreference = 'USD'): ExportConfig {
  const sc = getSymmetricShortcuts();
  const now = new Date();
  const ym = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}`;

  return {
    source: 'summary',
    format: 'pdf',
    currency: defaultCurrency,
    dateFromA: sc.monthVsLastMonth.dateFromA,
    dateToA: sc.monthVsLastMonth.dateToA,
    dateFromB: sc.monthVsLastMonth.dateFromB,
    dateToB: sc.monthVsLastMonth.dateToB,
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
}

// =============================================================================
// Interfaces
// =============================================================================

export interface ReportPreviewKPI {
  label: string;
  value: string;
  highlight?: 'positive' | 'negative' | 'warning' | 'neutral';
}

export interface ReportPreviewMetadata {
  title: string;
  subtitle: string;
  recordsCount: number;
  recordsLabel: string;
  currency: MainCurrencyPreference;
  kpis: [ReportPreviewKPI, ReportPreviewKPI, ReportPreviewKPI];
  hasRecords: boolean;
  emptyWarning?: string;
}

export interface ExportEntitiesCache {
  debts?: Debt[];
  savings?: SavingGoal[];
  budgetData?: MonthlyBudgetResponse | null;
  fixedExpenses?: FixedExpense[];
  estimatedIncomes?: EstimatedIncome[];
}

export interface UseReportExportOptions {
  config?: ExportConfig;
  entities?: ExportEntitiesCache;
  getSvgElements?: () => SVGSVGElement[];
  onSuccess?: (message: string) => void;
  onError?: (error: string) => void;
}

export interface ExportDocumentOptions {
  action: 'download' | 'share' | 'email';
  format?: ExportFormatType;
  config?: ExportConfig;
  emailRecipient?: string;
  svgElements?: SVGSVGElement[];
}

// =============================================================================
// Document Generation & Serialization Core
// =============================================================================

export async function generateNormalizedDocument(
  cfg: ExportConfig,
  options?: {
    svgElements?: SVGSVGElement[];
    debts?: Debt[];
    savings?: SavingGoal[];
    budgetData?: MonthlyBudgetResponse | null;
    fixedExpenses?: FixedExpense[];
    estimatedIncomes?: EstimatedIncome[];
  }
): Promise<NormalizedExportDocument> {
  const rates = await getRates().catch(() => null);
  const svgs = options?.svgElements || [];

  if (cfg.source === 'summary') {
    const summary = await getSummaryRange(cfg.dateFromA, cfg.dateToA);
    let expenses: any[] = [];
    let incomes: any[] = [];
    if (cfg.includeTransactions) {
      expenses = await getExpenses(cfg.dateFromA, cfg.dateToA).catch(() => []);
      incomes = await getIncomes(cfg.dateFromA, cfg.dateToA).catch(() => []);
    }
    return buildSummaryDocument({
      config: cfg,
      summary,
      expenses,
      incomes,
      rates,
      svgElements: svgs,
    });
  }

  if (cfg.source === 'comparison') {
    const comparison = await getReportAnalysis({
      date_from_a: cfg.dateFromA,
      date_to_a: cfg.dateToA,
      date_from_b: cfg.dateFromB,
      date_to_b: cfg.dateToB,
    });
    let expensesA: any[] = [];
    let expensesB: any[] = [];
    if (cfg.includeTransactions) {
      expensesA = await getExpenses(cfg.dateFromA, cfg.dateToA).catch(() => []);
      if (cfg.dateFromB && cfg.dateToB) {
        expensesB = await getExpenses(cfg.dateFromB, cfg.dateToB).catch(() => []);
      }
    }
    return buildComparisonDocument({
      config: cfg,
      comparison,
      expensesA,
      expensesB,
      rates,
      svgElements: svgs,
    });
  }

  if (cfg.source === 'debts') {
    const debts =
      options?.debts && options.debts.length > 0
        ? options.debts
        : await getDebts().catch(() => []);
    return buildDebtsDocument({
      config: cfg,
      debts,
      rates,
      svgElements: svgs,
    });
  }

  if (cfg.source === 'savings') {
    const allGoals =
      options?.savings && options.savings.length > 0
        ? options.savings
        : await getSavingGoals().catch(() => []);
    const savings = allGoals.filter((g) => g.type !== 'project');
    return buildSavingsDocument({
      config: cfg,
      savings,
      rates,
      svgElements: svgs,
    });
  }

  if (cfg.source === 'projects') {
    const allGoals =
      options?.savings && options.savings.length > 0
        ? options.savings
        : await getSavingGoals().catch(() => []);
    const projects = allGoals.filter((g) => g.type === 'project');
    return buildProjectsDocument({
      config: cfg,
      projects,
      rates,
      svgElements: svgs,
    });
  }

  if (cfg.source === 'budgets') {
    const mb =
      options?.budgetData ||
      (await getMonthlyBudget(cfg.monthYear).catch(() => null));
    if (!mb) {
      throw new Error(`No se pudo obtener el presupuesto para ${cfg.monthYear}`);
    }
    let expenses: any[] = [];
    if (cfg.includeTransactions) {
      const [yearStr, monthStr] = cfg.monthYear.split('-');
      const yNum = parseInt(yearStr, 10);
      const mNum = parseInt(monthStr, 10);
      const fromDate = toIsoDate(new Date(yNum, mNum - 1, 1));
      const toDate = toIsoDate(new Date(yNum, mNum, 0));
      expenses = await getExpenses(fromDate, toDate).catch(() => []);
    }
    return buildBudgetDocument({
      config: cfg,
      monthlyBudget: mb,
      expenses,
      rates,
      svgElements: svgs,
    });
  }

  if (cfg.source === 'fixed_expenses') {
    const ym = cfg.monthYear;
    const fixedExpenses =
      options?.fixedExpenses ||
      (await getMonthlyFixedExpenses(ym).catch(() => getFixedExpenses()));
    return buildFixedExpensesDocument({
      config: cfg,
      fixedExpenses,
      rates,
      monthYear: ym,
      svgElements: svgs,
    });
  }

  if (cfg.source === 'estimated_incomes') {
    const ym = cfg.monthYear;
    const estimatedIncomes =
      options?.estimatedIncomes ||
      (await getMonthlyIncomes(ym).catch(() => getEstimatedIncomes()));
    return buildEstimatedIncomeDocument({
      config: cfg,
      estimatedIncomes,
      rates,
      monthYear: ym,
      svgElements: svgs,
    });
  }

  if (cfg.source === 'fixed_and_income') {
    const ym = cfg.monthYear;
    const [yearStr, monthStr] = ym.split('-');
    const yNum = parseInt(yearStr, 10);
    const mNum = parseInt(monthStr, 10);
    const fromDate = toIsoDate(new Date(yNum, mNum - 1, 1));
    const toDate = toIsoDate(new Date(yNum, mNum, 0));

    const fixedExpenses =
      options?.fixedExpenses ||
      (await getMonthlyFixedExpenses(ym).catch(() => getFixedExpenses()));
    const estimatedIncomes =
      options?.estimatedIncomes ||
      (await getMonthlyIncomes(ym).catch(() => getEstimatedIncomes()));
    let realIncomes: any[] = [];
    if (cfg.includeTransactions) {
      realIncomes = await getIncomes(fromDate, toDate).catch(() => []);
    }
    return buildFixedAndIncomeDocument({
      config: cfg,
      fixedExpenses,
      estimatedIncomes,
      realIncomes,
      rates,
      monthYear: ym,
      svgElements: svgs,
    });
  }

  throw new Error(`Origen de datos no soportado: ${cfg.source}`);
}

export async function exportDocToBlob(
  doc: NormalizedExportDocument,
  format: ExportFormatType,
  includeCharts = false
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  if (format === 'pdf') {
    return exportToPdf(doc, includeCharts);
  }
  if (format === 'xlsx') {
    return exportToExcel(doc);
  }
  if (format === 'csv') {
    return exportToCsv(doc);
  }
  throw new Error(`Formato no soportado: ${format}`);
}

// =============================================================================
// Preview Metadata Calculation
// =============================================================================

export function calculatePreviewMetadata(
  config: ExportConfig,
  entities?: ExportEntitiesCache
): ReportPreviewMetadata {
  const { source, currency } = config;

  if (source === 'summary') {
    const days = getRangeDays(config.dateFromA, config.dateToA);
    const hasDates = Boolean(config.dateFromA && config.dateToA);
    return {
      title: 'Resumen Financiero del Periodo',
      subtitle: `${config.dateFromA || 'Inicio'} — ${config.dateToA || 'Fin'}`,
      recordsCount: days,
      recordsLabel: 'días en rango',
      currency,
      hasRecords: hasDates,
      emptyWarning: hasDates ? undefined : 'Selecciona un rango de fechas válido.',
      kpis: [
        { label: 'Rango Temporal', value: `${days} días`, highlight: 'neutral' },
        { label: 'Moneda Consolidada', value: currency, highlight: 'neutral' },
        {
          label: 'Nivel de Detalle',
          value: config.includeTransactions ? 'Con transacciones' : 'Solo agregados',
          highlight: 'positive',
        },
      ],
    };
  }

  if (source === 'comparison') {
    const hasA = Boolean(config.dateFromA && config.dateToA);
    const hasB = Boolean(config.dateFromB && config.dateToB);
    const hasRecords = hasA && hasB;
    return {
      title: 'Comparativa de Periodos (A vs B)',
      subtitle: `Análisis comparativo de variaciones en ${currency}`,
      recordsCount: 2,
      recordsLabel: 'periodos comparados',
      currency,
      hasRecords,
      emptyWarning: !hasB ? 'Configura las fechas del Periodo B para generar la comparativa.' : undefined,
      kpis: [
        { label: 'Periodo A', value: `${config.dateFromA} a ${config.dateToA}`, highlight: 'neutral' },
        {
          label: 'Periodo B',
          value: hasB ? `${config.dateFromB} a ${config.dateToB}` : 'Pendiente',
          highlight: hasB ? 'neutral' : 'warning',
        },
        {
          label: 'Gráficos Comparativos',
          value: config.includeCharts ? 'Incrustados en PDF' : 'Desactivados',
          highlight: config.includeCharts ? 'positive' : 'neutral',
        },
      ],
    };
  }

  if (source === 'debts') {
    const debts = entities?.debts || [];
    const filter = config.debtFilterType || 'all';
    const filteredDebts = debts.filter((d) => {
      if (filter === 'owed') return d.type === 'owed';
      if (filter === 'receivable') return d.type === 'receivable';
      return true;
    });

    if (config.selectedDebtId !== 'all') {
      const selected = debts.find((d) => d.id === config.selectedDebtId);
      const hasRecords = Boolean(selected);
      return {
        title: selected
          ? `Estado de Cuenta: ${selected.counterpart}`
          : 'Deuda Específica',
        subtitle: selected ? (selected.concept || 'Compromiso registrado') : 'No seleccionada',
        recordsCount: selected ? 1 : 0,
        recordsLabel: 'registro individual',
        currency,
        hasRecords,
        emptyWarning: !hasRecords ? 'No se encontró la deuda seleccionada.' : undefined,
        kpis: [
          { label: 'Contraparte', value: selected?.counterpart || 'N/A' },
          {
            label: 'Monto Original',
            value: selected ? `${selected.currency} ${Number(selected.total_amount).toLocaleString()}` : '-',
          },
          {
            label: 'Estado',
            value: selected ? (selected.is_settled ? 'Saldada' : 'Pendiente') : '-',
            highlight: selected?.is_settled ? 'positive' : 'warning',
          },
        ],
      };
    }

    const title =
      filter === 'owed'
        ? 'Reporte: Cuentas por Pagar (Pasivos)'
        : filter === 'receivable'
        ? 'Reporte: Préstamos por Cobrar (Activos)'
        : 'Cartera Consolidada de Deudas';

    const count = filteredDebts.length;
    const owedCount = debts.filter((d) => d.type === 'owed').length;
    const recCount = debts.filter((d) => d.type === 'receivable').length;

    return {
      title,
      subtitle: `Consolidación de compromisos y créditos en ${currency}`,
      recordsCount: count,
      recordsLabel: 'deudas registradas',
      currency,
      hasRecords: count > 0 || debts.length === 0, // avoid early warning before debts fetch
      emptyWarning: debts.length > 0 && count === 0 ? 'No hay deudas que coincidan con este filtro.' : undefined,
      kpis: [
        { label: 'Total en Grupo', value: `${count}`, highlight: count > 0 ? 'positive' : 'warning' },
        { label: 'Por Pagar (Pasivos)', value: `${owedCount} cuentas` },
        { label: 'Por Cobrar (Activos)', value: `${recCount} cuentas` },
      ],
    };
  }

  if (source === 'savings') {
    const allGoals = entities?.savings || [];
    const pureSavings = allGoals.filter((g) => g.type !== 'project');

    if (config.selectedSavingId && config.selectedSavingId !== 'all') {
      const selected = pureSavings.find((g) => g.id === config.selectedSavingId);
      const hasRecords = Boolean(selected);
      const savedAmount = (selected?.deposits || []).reduce((acc, d) => {
        const amt = Number(d.amount || 0);
        return d.transaction_type === 'withdrawal' ? acc - amt : acc + amt;
      }, 0);
      return {
        title: selected ? `Meta de Ahorro: ${selected.name}` : 'Meta Específica',
        subtitle: `Seguimiento individual de fondo en ${currency}`,
        recordsCount: selected ? 1 : 0,
        recordsLabel: 'meta individual',
        currency,
        hasRecords,
        emptyWarning: !hasRecords ? 'No se encontró la meta seleccionada.' : undefined,
        kpis: [
          { label: 'Meta', value: selected?.name || 'N/A' },
          {
            label: 'Objetivo',
            value: selected ? `${selected.currency} ${Number(selected.target_amount || 0).toLocaleString()}` : '-',
          },
          {
            label: 'Ahorrado',
            value: selected ? `${selected.currency} ${Number(savedAmount).toLocaleString()}` : '-',
            highlight: 'positive',
          },
        ],
      };
    }

    const count = pureSavings.length;
    return {
      title: 'Reporte de Metas de Ahorro Personal',
      subtitle: `Fondos y reservas financieras consolidadas en ${currency}`,
      recordsCount: count,
      recordsLabel: 'metas registradas',
      currency,
      hasRecords: count > 0 || allGoals.length === 0,
      emptyWarning: allGoals.length > 0 && count === 0 ? 'No hay metas de ahorro personal registradas.' : undefined,
      kpis: [
        { label: 'Total Metas', value: `${count}`, highlight: count > 0 ? 'positive' : 'warning' },
        { label: 'Moneda Consolidación', value: currency },
        {
          label: 'Desglose Detallado',
          value: config.includeCategories ? 'Activado' : 'Solo totales',
          highlight: 'neutral',
        },
      ],
    };
  }

  if (source === 'projects') {
    const allGoals = entities?.savings || [];
    const projects = allGoals.filter((g) => g.type === 'project');

    if (config.selectedProjectId && config.selectedProjectId !== 'all') {
      const selected = projects.find((p) => p.id === config.selectedProjectId);
      const hasRecords = Boolean(selected);
      return {
        title: selected ? `Proyecto: ${selected.name}` : 'Proyecto Específico',
        subtitle: `Costos y ejecución presupuestaria en ${currency}`,
        recordsCount: selected ? 1 : 0,
        recordsLabel: 'proyecto individual',
        currency,
        hasRecords,
        emptyWarning: !hasRecords ? 'No se encontró el proyecto seleccionado.' : undefined,
        kpis: [
          { label: 'Proyecto', value: selected?.name || 'N/A' },
          {
            label: 'Presupuesto',
            value: selected ? `${selected.currency} ${Number(selected.target_amount || 0).toLocaleString()}` : '-',
          },
          {
            label: 'Estado',
            value: selected ? (selected.is_completed ? 'Completado' : 'En ejecución') : '-',
            highlight: selected?.is_completed ? 'positive' : 'warning',
          },
        ],
      };
    }

    const count = projects.length;
    const completedCount = projects.filter((p) => p.is_completed).length;
    const activeCount = projects.filter((p) => !p.is_completed).length;

    return {
      title: 'Portafolio de Proyectos y Presupuestos',
      subtitle: `Control y ejecución de iniciativas en ${currency}`,
      recordsCount: count,
      recordsLabel: 'proyectos registrados',
      currency,
      hasRecords: count > 0 || allGoals.length === 0,
      emptyWarning: allGoals.length > 0 && count === 0 ? 'No hay proyectos registrados.' : undefined,
      kpis: [
        { label: 'Total Proyectos', value: `${count}`, highlight: count > 0 ? 'positive' : 'warning' },
        { label: 'En Ejecución', value: `${activeCount}` },
        { label: 'Concluidos', value: `${completedCount}`, highlight: 'positive' },
      ],
    };
  }

  if (source === 'budgets') {
    const mb = entities?.budgetData;
    const count = (mb?.category_limits?.length || 0) + (mb?.budgets?.length || 0);

    if (config.selectedBudgetId === 'primary_only') {
      return {
        title: `Plan Presupuestario Maestro (${config.monthYear})`,
        subtitle: `Control de techos globales y gastos del mes en ${currency}`,
        recordsCount: 1,
        recordsLabel: 'plan maestro',
        currency,
        hasRecords: true,
        kpis: [
          { label: 'Mes Presupuestado', value: config.monthYear },
          { label: 'Alcance', value: 'Plan Maestro' },
          {
            label: 'Detalle Transacciones',
            value: config.includeTransactions ? 'Incluido' : 'Omitido',
            highlight: 'neutral',
          },
        ],
      };
    }

    if (config.selectedBudgetId && config.selectedBudgetId !== 'all') {
      const sub = mb?.budgets?.find((b) => b.id === config.selectedBudgetId);
      const cat = mb?.category_limits?.find((c) => c.category_name === config.selectedBudgetId);
      const label = sub?.name || cat?.category_name || config.selectedBudgetId;
      return {
        title: `Subpresupuesto: ${label} (${config.monthYear})`,
        subtitle: `Seguimiento específico en ${currency}`,
        recordsCount: 1,
        recordsLabel: 'subpresupuesto',
        currency,
        hasRecords: true,
        kpis: [
          { label: 'Identificador', value: label },
          { label: 'Mes', value: config.monthYear },
          { label: 'Moneda', value: currency },
        ],
      };
    }

    return {
      title: `Presupuesto Integral y Subpresupuestos (${config.monthYear})`,
      subtitle: `Plan maestro, límites por categoría y presupuestos compartidos en ${currency}`,
      recordsCount: count,
      recordsLabel: 'categorías y subpresupuestos',
      currency,
      hasRecords: count > 0 || !mb,
      emptyWarning: mb && count === 0 ? 'No se encontraron límites presupuestarios en este mes.' : undefined,
      kpis: [
        { label: 'Mes Evaluado', value: config.monthYear },
        { label: 'Subpresupuestos', value: `${mb?.budgets?.length || 0}` },
        { label: 'Categorías Límite', value: `${mb?.category_limits?.length || 0}` },
      ],
    };
  }

  if (source === 'fixed_expenses') {
    const list = entities?.fixedExpenses;
    const count = list?.length ?? 0;
    return {
      title: `Reporte de Gastos Fijos (${config.monthYear})`,
      subtitle: `Compromisos y recurrencias mensuales consolidadas en ${currency}`,
      recordsCount: count,
      recordsLabel: 'gastos fijos',
      currency,
      hasRecords: !list || count > 0,
      emptyWarning: list && count === 0 ? 'No hay gastos fijos registrados para este mes.' : undefined,
      kpis: [
        { label: 'Mes Programado', value: config.monthYear },
        { label: 'Conceptos Registrados', value: list ? `${count}` : 'Consultando...' },
        { label: 'Moneda Consolidación', value: currency },
      ],
    };
  }

  if (source === 'estimated_incomes') {
    const list = entities?.estimatedIncomes;
    const count = list?.length ?? 0;
    return {
      title: `Reporte de Ingresos Mensuales (${config.monthYear})`,
      subtitle: `Ingresos proyectados y devengados consolidados en ${currency}`,
      recordsCount: count,
      recordsLabel: 'fuentes de ingreso',
      currency,
      hasRecords: !list || count > 0,
      emptyWarning: list && count === 0 ? 'No hay ingresos estimados registrados para este mes.' : undefined,
      kpis: [
        { label: 'Mes Programado', value: config.monthYear },
        { label: 'Fuentes Estimadas', value: list ? `${count}` : 'Consultando...' },
        { label: 'Moneda Consolidación', value: currency },
      ],
    };
  }

  // fallback fixed_and_income
  return {
    title: `Compromisos y Flujo Mensual (${config.monthYear})`,
    subtitle: `Gastos fijos e ingresos estimados en ${currency}`,
    recordsCount: 0,
    recordsLabel: 'conceptos',
    currency,
    hasRecords: true,
    kpis: [
      { label: 'Mes', value: config.monthYear },
      { label: 'Moneda', value: currency },
      { label: 'Secciones', value: 'Fijos + Ingresos' },
    ],
  };
}

// =============================================================================
// Hook Return Interface
// =============================================================================

export interface UseReportExportReturn {
  // Generation & Actions
  exportDocument: (params: ExportDocumentOptions) => Promise<{ success: boolean; filename?: string; error?: string }>;
  generateNormalizedDocument: (cfg: ExportConfig) => Promise<NormalizedExportDocument>;
  exportDocToBlob: (doc: NormalizedExportDocument, format: ExportFormatType, includeCharts?: boolean) => Promise<{ blob: Blob; filename: string; mimeType: string }>;

  // Live Blueprint Preview
  previewData: ReportPreviewMetadata;

  // State Management
  isExporting: boolean;
  exportProgress: number;
  exportProgressStage: string;
  exportError: string | null;
  exportSuccessMessage: string | null;
  exportActionLoading: 'download' | 'share' | 'email' | null;

  // Cached Entities
  entities: ExportEntitiesCache;
  loadingEntities: boolean;
  loadEntitiesForSource: (source: ExportSourceType, monthYear?: string) => Promise<void>;

  // Clear helpers
  clearExportStatus: () => void;
}

// =============================================================================
// Main Hook Implementation
// =============================================================================

export function useReportExport(options: UseReportExportOptions = {}): UseReportExportReturn {
  const { config: callerConfig, entities: callerEntities, getSvgElements, onSuccess, onError } = options;

  const [activeConfig, setActiveConfig] = useState<ExportConfig>(() => callerConfig || getDefaultExportConfig());
  const [internalEntities, setInternalEntities] = useState<ExportEntitiesCache>({});
  const [loadingEntities, setLoadingEntities] = useState<boolean>(false);

  // Export progress & execution state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportProgressStage, setExportProgressStage] = useState<string>('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [exportActionLoading, setExportActionLoading] = useState<'download' | 'share' | 'email' | null>(null);

  // Sync when caller updates config
  if (callerConfig && callerConfig !== activeConfig) {
    // Only update if fundamentally different reference/source
    if (
      callerConfig.source !== activeConfig.source ||
      callerConfig.format !== activeConfig.format ||
      callerConfig.currency !== activeConfig.currency ||
      callerConfig.monthYear !== activeConfig.monthYear ||
      callerConfig.dateFromA !== activeConfig.dateFromA ||
      callerConfig.dateToA !== activeConfig.dateToA
    ) {
      setActiveConfig(callerConfig);
    }
  }

  // Merged entities (caller provides priority)
  const mergedEntities = useMemo<ExportEntitiesCache>(() => ({
    debts: callerEntities?.debts ?? internalEntities.debts,
    savings: callerEntities?.savings ?? internalEntities.savings,
    budgetData: callerEntities?.budgetData ?? internalEntities.budgetData,
    fixedExpenses: callerEntities?.fixedExpenses ?? internalEntities.fixedExpenses,
    estimatedIncomes: callerEntities?.estimatedIncomes ?? internalEntities.estimatedIncomes,
  }), [callerEntities, internalEntities]);

  // Live Blueprint Preview memo
  const previewData = useMemo<ReportPreviewMetadata>(() => {
    const cfg = callerConfig || activeConfig;
    return calculatePreviewMetadata(cfg, mergedEntities);
  }, [callerConfig, activeConfig, mergedEntities]);

  // Lazy entity loader for sources requiring pre-cached options
  const loadEntitiesForSource = useCallback(async (source: ExportSourceType, monthYear?: string) => {
    const ym = monthYear || activeConfig.monthYear;
    try {
      setLoadingEntities(true);
      if (source === 'debts' && (!mergedEntities.debts || mergedEntities.debts.length === 0)) {
        const debts = await getDebts().catch(() => []);
        setInternalEntities((prev) => ({ ...prev, debts: debts || [] }));
      } else if ((source === 'savings' || source === 'projects') && (!mergedEntities.savings || mergedEntities.savings.length === 0)) {
        const goals = await getSavingGoals().catch(() => []);
        setInternalEntities((prev) => ({ ...prev, savings: goals || [] }));
      } else if (source === 'budgets') {
        const mb = await getMonthlyBudget(ym).catch(() => null);
        setInternalEntities((prev) => ({ ...prev, budgetData: mb }));
      } else if (source === 'fixed_expenses') {
        const fixed = await getMonthlyFixedExpenses(ym).catch(() => getFixedExpenses());
        setInternalEntities((prev) => ({ ...prev, fixedExpenses: fixed || [] }));
      } else if (source === 'estimated_incomes') {
        const incomes = await getMonthlyIncomes(ym).catch(() => getEstimatedIncomes());
        setInternalEntities((prev) => ({ ...prev, estimatedIncomes: incomes || [] }));
      }
    } catch (e) {
      console.warn('Error loading entities for report export:', e);
    } finally {
      setLoadingEntities(false);
    }
  }, [activeConfig.monthYear, mergedEntities]);

  // Wrapper for document generator
  const handleGenerateDoc = useCallback(
    async (cfg: ExportConfig): Promise<NormalizedExportDocument> => {
      const svgs = getSvgElements ? getSvgElements() : [];
      return generateNormalizedDocument(cfg, {
        svgElements: svgs,
        debts: mergedEntities.debts,
        savings: mergedEntities.savings,
        budgetData: mergedEntities.budgetData,
        fixedExpenses: mergedEntities.fixedExpenses,
        estimatedIncomes: mergedEntities.estimatedIncomes,
      });
    },
    [getSvgElements, mergedEntities]
  );

  // Main Export Dispatcher
  const exportDocument = useCallback(
    async (params: ExportDocumentOptions): Promise<{ success: boolean; filename?: string; error?: string }> => {
      const { action, format, config, emailRecipient, svgElements } = params;
      const targetConfig: ExportConfig = config || callerConfig || activeConfig;
      const targetFormat: ExportFormatType = format || targetConfig.format;
      const effectiveConfig: ExportConfig = { ...targetConfig, format: targetFormat };

      // Validation for email action
      if (action === 'email') {
        const trimmedEmail = (emailRecipient || '').trim();
        if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
          const err = 'Por favor ingresa un correo electrónico válido.';
          setExportError(err);
          onError?.(err);
          return { success: false, error: err };
        }
      }

      setIsExporting(true);
      setExportActionLoading(action);
      setExportError(null);
      setExportSuccessMessage(null);
      setExportProgress(10);
      setExportProgressStage('Recopilando registros y tasas...');

      try {
        // Step 1: Generate Document
        const svgs = svgElements || (getSvgElements ? getSvgElements() : []);
        setExportProgress(35);
        setExportProgressStage('Estructurando documento normalizado...');
        const doc = await generateNormalizedDocument(effectiveConfig, {
          svgElements: svgs,
          debts: mergedEntities.debts,
          savings: mergedEntities.savings,
          budgetData: mergedEntities.budgetData,
          fixedExpenses: mergedEntities.fixedExpenses,
          estimatedIncomes: mergedEntities.estimatedIncomes,
        });

        // Step 2: Render to binary blob
        setExportProgress(65);
        setExportProgressStage(`Renderizando archivo ${effectiveConfig.format.toUpperCase()}...`);
        const { blob, filename, mimeType } = await exportDocToBlob(
          doc,
          effectiveConfig.format,
          effectiveConfig.includeCharts
        );

        // Step 3: Perform delivery action
        setExportProgress(85);
        if (action === 'download') {
          setExportProgressStage('Iniciando descarga en el navegador...');
          triggerDownload(blob, filename);
          const msg = `Reporte "${filename}" descargado con éxito.`;
          setExportSuccessMessage(msg);
          onSuccess?.(msg);
        } else if (action === 'share') {
          setExportProgressStage('Abriendo menú de compartir...');
          const shared = await triggerNativeShare(blob, filename);
          if (shared) {
            const msg = 'Reporte compartido con éxito.';
            setExportSuccessMessage(msg);
            onSuccess?.(msg);
          } else {
            // Graceful fallback: download directly
            triggerDownload(blob, filename);
            const msg = `Compartir no soportado en este navegador. Se descargó "${filename}".`;
            setExportSuccessMessage(msg);
            onSuccess?.(msg);
          }
        } else if (action === 'email') {
          setExportProgressStage('Codificando y transmitiendo por correo...');
          const trimmedEmail = (emailRecipient || '').trim();
          const base64Content = await blobToBase64(blob);
          const highlights = (doc.headerCards || []).map((c) => `${c.label}: ${c.value}`);

          await sendReportEmail({
            recipient_email: trimmedEmail,
            subject: `Estado de Cuenta / Reporte: ${doc.title} - GastosApp`,
            report_title: doc.title,
            report_subtitle: doc.subtitle,
            summary_highlights: highlights,
            filename,
            mime_type: mimeType,
            file_base64: base64Content,
          });

          const msg = `Reporte enviado exitosamente a ${trimmedEmail}`;
          setExportSuccessMessage(msg);
          onSuccess?.(msg);
        }

        setExportProgress(100);
        setExportProgressStage('Completado');
        return { success: true, filename };
      } catch (err: any) {
        console.error('Export execution failed:', err);
        const errMsg =
          err?.response?.data?.detail ||
          err?.message ||
          'Ocurrió un error inesperado al generar el reporte.';
        setExportError(errMsg);
        onError?.(errMsg);
        return { success: false, error: errMsg };
      } finally {
        setIsExporting(false);
        setExportActionLoading(null);
      }
    },
    [callerConfig, activeConfig, getSvgElements, mergedEntities, onSuccess, onError]
  );

  const clearExportStatus = useCallback(() => {
    setExportError(null);
    setExportSuccessMessage(null);
    setExportProgress(0);
    setExportProgressStage('');
  }, []);

  return {
    exportDocument,
    generateNormalizedDocument: handleGenerateDoc,
    exportDocToBlob,
    previewData,
    isExporting,
    exportProgress,
    exportProgressStage,
    exportError,
    exportSuccessMessage,
    exportActionLoading,
    entities: mergedEntities,
    loadingEntities,
    loadEntitiesForSource,
    clearExportStatus,
  };
}
