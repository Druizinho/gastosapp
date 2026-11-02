import type {
  ExportConfig,
  MainCurrencyPreference,
  RangeSummaryResponse,
  PeriodComparisonResponse,
  Expense,
  Income,
  Debt,
  SavingGoal,
  MonthlyBudgetResponse,
  FixedExpense,
  EstimatedIncome,
  ExchangeRates,
  CurrencyType,
} from '../../types';
import { getCurrencyLabel } from '../../types';
import { formatCurrencyAmount, convertItemAmountToMainCurrency } from '../currencyFormat';
import {
  resolveCurrencyTotal,
  resolveIncomeTotal,
  resolveBalanceTotal,
  resolveCategoryTotal,
  resolveDailyAvg,
  resolveBudgetCategoryLimit,
} from '../currencySummary';

export interface ExportKeyValue {
  label: string;
  value: string;
  highlight?: 'positive' | 'negative' | 'warning' | 'neutral';
}

export interface ExportTableSpec {
  sheetName: string; // Max 31 chars for Excel
  title: string;
  headers: string[];
  rows: (string | number)[][];
  truncatedNote?: string;
}

export interface NormalizedExportDocument {
  filenameBase: string;
  title: string;
  subtitle: string;
  currency: MainCurrencyPreference;
  integrityWarning?: string;
  headerCards: ExportKeyValue[];
  tables: ExportTableSpec[];
  svgElements?: SVGSVGElement[];
}

// Helper to sanitize strings for filenames
export function sanitizeFilename(str: string): string {
  return (
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'reporte-gastosapp'
  );
}

// Helper to sanitize Excel sheet names (max 31 chars, no forbidden chars)
export function sanitizeSheetName(name: string, fallback = 'Hoja'): string {
  const sanitized = name.replace(/[:\\/?*[\]]/g, '').trim();
  return (sanitized.slice(0, 31) || fallback).trim();
}

// Helper to format deltas as percentage string
function formatDeltaPct(pct: number | null | undefined): string {
  if (pct == null || isNaN(pct)) return 'N/A';
  return pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
}

export function resolveItemRate(
  item: {
    currency?: string | CurrencyType | null;
    rate_usd_bs?: number | null;
    rate_eur_bs?: number | null;
    rate_usdt_bs?: number | null;
  },
  fallbackRates?: ExchangeRates | null
): number | null {
  const currency = item.currency;
  if (currency === 'USDT') {
    return item.rate_usdt_bs || fallbackRates?.usdt_bs || null;
  }
  if (currency === 'EUR_BCV') {
    return item.rate_eur_bs || fallbackRates?.eur_bs || null;
  }
  if (currency === 'USD_BCV' || currency === 'USD_CASH') {
    return item.rate_usd_bs || fallbackRates?.usd_bs || null;
  }
  if (currency === 'BS') {
    return null;
  }
  return item.rate_usdt_bs || item.rate_eur_bs || item.rate_usd_bs || null;
}

// -------------------------------------------------------------
// 1. SUMMARY DOCUMENT
// -------------------------------------------------------------
export interface BuildSummaryOptions {
  config: ExportConfig;
  summary: RangeSummaryResponse;
  expenses?: Expense[];
  incomes?: Income[];
  rates?: ExchangeRates | null;
  svgElements?: SVGSVGElement[];
}

export function buildSummaryDocument(
  arg1: BuildSummaryOptions | ExportConfig,
  arg2?: RangeSummaryResponse,
  arg3?: Expense[],
  arg4?: Income[],
  arg5?: ExchangeRates | null,
  arg6?: SVGSVGElement[]
): NormalizedExportDocument {
  const isOptions = 'summary' in arg1;
  const config = isOptions ? arg1.config : (arg1 as ExportConfig);
  const summary = isOptions ? arg1.summary : arg2!;
  const expenses = isOptions ? arg1.expenses : arg3;
  const incomes = isOptions ? arg1.incomes : arg4;
  const rates = isOptions ? arg1.rates : arg5;
  const svgElements = isOptions ? arg1.svgElements : arg6;

  const cur = config.currency;
  const incTotal = resolveIncomeTotal(summary, cur, rates);
  const expTotal = resolveCurrencyTotal(summary, cur, rates);
  const balTotal = resolveBalanceTotal(summary, cur, rates);
  const dailyAvg = resolveDailyAvg(summary, cur);
  const days = summary.days_in_range || 1;

  const headerCards: ExportKeyValue[] = [];
  if (config.includeHeaderCard !== false) {
    headerCards.push(
      { label: 'Ingresos Totales', value: formatCurrencyAmount(incTotal, cur), highlight: 'positive' },
      { label: 'Gastos Totales', value: formatCurrencyAmount(expTotal, cur), highlight: 'negative' },
      {
        label: 'Balance Neto',
        value: formatCurrencyAmount(balTotal, cur),
        highlight: balTotal >= 0 ? 'positive' : 'negative',
      },
      { label: 'Promedio Diario', value: `${formatCurrencyAmount(dailyAvg, cur)}/día`, highlight: 'neutral' },
      { label: 'Días en Periodo', value: `${days} días`, highlight: 'neutral' }
    );
  }

  const tables: ExportTableSpec[] = [];

  // Table 1: Category breakdown
  if (config.includeCategories !== false && summary.by_category?.length > 0) {
    const catRows: (string | number)[][] = summary.by_category.map((cat) => {
      const cTotal = resolveCategoryTotal(cat, cur);
      const pct = expTotal > 0 ? ((cTotal / expTotal) * 100).toFixed(1) + '%' : '0.0%';
      return [cat.category, formatCurrencyAmount(cTotal, cur), pct];
    });

    tables.push({
      sheetName: sanitizeSheetName('Categorías'),
      title: 'Desglose por Categorías',
      headers: ['Categoría', `Gasto (${cur})`, '% del Total'],
      rows: catRows,
    });
  }

  // Table 2: Transactions
  if (config.includeTransactions !== false && ((expenses && expenses.length > 0) || (incomes && incomes.length > 0))) {
    interface NormalizedTx {
      date: string;
      type: string;
      description: string;
      category: string;
      convertedAmount: number;
      origAmount: number;
      origCurrency: CurrencyType | string;
      rate: number | null;
      created_at: string;
    }

    const txs: NormalizedTx[] = [];

    (expenses || []).forEach((exp) => {
      const converted = convertItemAmountToMainCurrency(exp, cur, rates);
      const rateVal = resolveItemRate(exp, rates);
      txs.push({
        date: exp.date || exp.created_at?.slice(0, 10) || '',
        type: 'Gasto',
        description: exp.description || '-',
        category: exp.category || 'Sin categoría',
        convertedAmount: -Math.abs(converted),
        origAmount: exp.amount,
        origCurrency: exp.currency,
        rate: rateVal,
        created_at: exp.created_at || '',
      });
    });

    (incomes || []).forEach((inc) => {
      const converted = convertItemAmountToMainCurrency(inc, cur, rates);
      const rateVal = resolveItemRate(inc, rates);
      txs.push({
        date: inc.date || inc.created_at?.slice(0, 10) || '',
        type: 'Ingreso',
        description: inc.description || '-',
        category: inc.category || 'Ingreso',
        convertedAmount: Math.abs(converted),
        origAmount: inc.amount,
        origCurrency: inc.currency,
        rate: rateVal,
        created_at: inc.created_at || '',
      });
    });

    // Sort descending by date, then created_at
    txs.sort((a, b) => {
      const cmpDate = b.date.localeCompare(a.date);
      if (cmpDate !== 0) return cmpDate;
      return b.created_at.localeCompare(a.created_at);
    });

    const includeOrig = Boolean(config.includeOriginalCurrency);
    const headers = includeOrig
      ? ['Fecha', 'Tipo', 'Descripción / Concepto', 'Categoría', `Monto (${cur})`, 'Monto Original', 'Moneda Original', 'Tasa']
      : ['Fecha', 'Tipo', 'Descripción / Concepto', 'Categoría', `Monto (${cur})`];

    const rows: (string | number)[][] = txs.map((tx) => {
      const formattedConverted = formatCurrencyAmount(tx.convertedAmount, cur);
      if (!includeOrig) {
        return [tx.date, tx.type, tx.description, tx.category, formattedConverted];
      }
      const formattedOrig = formatCurrencyAmount(tx.origAmount, tx.origCurrency);
      const origCurLabel = getCurrencyLabel(tx.origCurrency) || tx.origCurrency;
      const rateStr = tx.rate != null && tx.rate > 0 ? Number(tx.rate).toFixed(2) : '-';
      return [tx.date, tx.type, tx.description, tx.category, formattedConverted, formattedOrig, origCurLabel, rateStr];
    });

    tables.push({
      sheetName: sanitizeSheetName('Movimientos'),
      title: 'Historial de Movimientos',
      headers,
      rows,
    });
  }

  const filenameBase = sanitizeFilename(`resumen-${config.dateFromA}-al-${config.dateToA}`);

  return {
    filenameBase,
    title: 'Resumen Financiero',
    subtitle: `Periodo del ${config.dateFromA} al ${config.dateToA}`,
    currency: cur,
    headerCards,
    tables,
    svgElements,
  };
}

// -------------------------------------------------------------
// 2. COMPARISON DOCUMENT
// -------------------------------------------------------------
export interface BuildComparisonOptions {
  config: ExportConfig;
  comparison: PeriodComparisonResponse;
  expensesA?: Expense[];
  expensesB?: Expense[];
  rates?: ExchangeRates | null;
  svgElements?: SVGSVGElement[];
}

export function buildComparisonDocument(
  arg1: BuildComparisonOptions | ExportConfig,
  arg2?: PeriodComparisonResponse,
  arg3?: Expense[],
  arg4?: Expense[],
  arg5?: ExchangeRates | null,
  arg6?: SVGSVGElement[]
): NormalizedExportDocument {
  const isOptions = 'comparison' in arg1;
  const config = isOptions ? arg1.config : (arg1 as ExportConfig);
  const comparison = isOptions ? arg1.comparison : arg2!;
  const expensesA = isOptions ? arg1.expensesA : arg3;
  const expensesB = isOptions ? arg1.expensesB : arg4;
  const rates = isOptions ? arg1.rates : arg5;
  const svgElements = isOptions ? arg1.svgElements : arg6;

  const cur = config.currency;
  const pA = comparison.period_a;
  const pB = comparison.period_b;

  const daysA = pA?.days_in_range || 1;
  const daysB = pB?.days_in_range || 0;
  const isAsymmetric = comparison.is_asymmetric || (pB != null && daysA !== daysB);

  const integrityWarning = isAsymmetric
    ? `Aviso de integridad: Estás comparando un periodo de ${daysA} días contra uno de ${daysB} días. Además del total bruto, revisa la variación del Promedio Diario (Δ% / día) para una comparación proporcional.`
    : undefined;

  const incA = resolveIncomeTotal(pA, cur, rates);
  const incB = pB ? resolveIncomeTotal(pB, cur, rates) : 0;
  const expA = resolveCurrencyTotal(pA, cur, rates);
  const expB = pB ? resolveCurrencyTotal(pB, cur, rates) : 0;
  const balA = resolveBalanceTotal(pA, cur, rates);
  const balB = pB ? resolveBalanceTotal(pB, cur, rates) : 0;
  const dailyA = resolveDailyAvg(pA, cur);
  const dailyB = pB ? resolveDailyAvg(pB, cur) : 0;

  const calcDelta = (a: number, b: number) => {
    const diff = b - a;
    const pct = a > 0 ? ((b - a) / a) * 100 : null;
    return { diff, pct };
  };

  const deltaInc = calcDelta(incA, incB);
  const deltaExp = calcDelta(expA, expB);
  const deltaDaily = calcDelta(dailyA, dailyB);
  const deltaBal = balB - balA;

  const headerCards: ExportKeyValue[] = [];
  if (config.includeHeaderCard !== false) {
    headerCards.push(
      {
        label: 'Ingresos (A vs B)',
        value: `${formatCurrencyAmount(incA, cur)} vs ${formatCurrencyAmount(incB, cur)} (${formatDeltaPct(deltaInc.pct)})`,
        highlight: deltaInc.diff >= 0 ? 'positive' : 'negative',
      },
      {
        label: 'Gastos (A vs B)',
        value: `${formatCurrencyAmount(expA, cur)} vs ${formatCurrencyAmount(expB, cur)} (${formatDeltaPct(deltaExp.pct)})`,
        highlight: deltaExp.diff <= 0 ? 'positive' : 'negative',
      },
      {
        label: 'Promedio Diario (A vs B)',
        value: `${formatCurrencyAmount(dailyA, cur)}/d vs ${formatCurrencyAmount(dailyB, cur)}/d (${formatDeltaPct(deltaDaily.pct)}/d)`,
        highlight: deltaDaily.diff <= 0 ? 'positive' : 'negative',
      },
      {
        label: 'Balance Neto (A vs B)',
        value: `${formatCurrencyAmount(balA, cur)} vs ${formatCurrencyAmount(balB, cur)} (Δ ${formatCurrencyAmount(deltaBal, cur)})`,
        highlight: deltaBal >= 0 ? 'positive' : 'negative',
      }
    );
  }

  const tables: ExportTableSpec[] = [];

  // Table 1: Category comparison
  if (config.includeCategories !== false && comparison.category_comparison?.length > 0) {
    const catRows: (string | number)[][] = comparison.category_comparison.map((item) => {
      const valA = resolveCategoryTotal(
        { total_usd: Number(item.period_a_usd), total_bs: Number(item.period_a_bs), total_eur: Number(item.period_a_eur), total_usdt: Number(item.period_a_usdt) },
        cur
      );
      const valB = resolveCategoryTotal(
        { total_usd: Number(item.period_b_usd), total_bs: Number(item.period_b_bs), total_eur: Number(item.period_b_eur), total_usdt: Number(item.period_b_usdt) },
        cur
      );
      const diff = valB - valA;
      const pct = valA > 0 ? ((valB - valA) / valA) * 100 : null;
      return [
        item.category,
        formatCurrencyAmount(valA, cur),
        formatCurrencyAmount(valB, cur),
        formatCurrencyAmount(diff, cur),
        formatDeltaPct(pct),
      ];
    });

    tables.push({
      sheetName: sanitizeSheetName('Comparativa'),
      title: 'Comparativa por Categoría (A vs B)',
      headers: ['Categoría', `Periodo A (${cur})`, `Periodo B (${cur})`, `Diferencia (${cur})`, 'Variación %'],
      rows: catRows,
    });
  }

  // Table 2: Movements Period A
  if (config.includeTransactions !== false && expensesA && expensesA.length > 0) {
    const includeOrig = Boolean(config.includeOriginalCurrency);
    const headers = includeOrig
      ? ['Fecha', 'Descripción', 'Categoría', `Monto (${cur})`, 'Monto Original', 'Moneda Original', 'Tasa']
      : ['Fecha', 'Descripción', 'Categoría', `Monto (${cur})`];

    const rows: (string | number)[][] = expensesA.map((exp) => {
      const converted = convertItemAmountToMainCurrency(exp, cur, rates);
      const formattedConverted = formatCurrencyAmount(converted, cur);
      if (!includeOrig) {
        return [exp.date || '', exp.description || '-', exp.category || '-', formattedConverted];
      }
      const formattedOrig = formatCurrencyAmount(exp.amount, exp.currency);
      const origCurLabel = getCurrencyLabel(exp.currency) || exp.currency;
      const rateVal = resolveItemRate(exp, rates);
      const rateStr = rateVal ? Number(rateVal).toFixed(2) : '-';
      return [exp.date || '', exp.description || '-', exp.category || '-', formattedConverted, formattedOrig, origCurLabel, rateStr];
    });

    tables.push({
      sheetName: sanitizeSheetName('Movimientos A'),
      title: `Movimientos Periodo A (${config.dateFromA} al ${config.dateToA})`,
      headers,
      rows,
    });
  }

  // Table 3: Movements Period B
  if (config.includeTransactions !== false && expensesB && expensesB.length > 0) {
    const includeOrig = Boolean(config.includeOriginalCurrency);
    const headers = includeOrig
      ? ['Fecha', 'Descripción', 'Categoría', `Monto (${cur})`, 'Monto Original', 'Moneda Original', 'Tasa']
      : ['Fecha', 'Descripción', 'Categoría', `Monto (${cur})`];

    const rows: (string | number)[][] = expensesB.map((exp) => {
      const converted = convertItemAmountToMainCurrency(exp, cur, rates);
      const formattedConverted = formatCurrencyAmount(converted, cur);
      if (!includeOrig) {
        return [exp.date || '', exp.description || '-', exp.category || '-', formattedConverted];
      }
      const formattedOrig = formatCurrencyAmount(exp.amount, exp.currency);
      const origCurLabel = getCurrencyLabel(exp.currency) || exp.currency;
      const rateVal = resolveItemRate(exp, rates);
      const rateStr = rateVal ? Number(rateVal).toFixed(2) : '-';
      return [exp.date || '', exp.description || '-', exp.category || '-', formattedConverted, formattedOrig, origCurLabel, rateStr];
    });

    tables.push({
      sheetName: sanitizeSheetName('Movimientos B'),
      title: `Movimientos Periodo B (${config.dateFromB || '-'} al ${config.dateToB || '-'})`,
      headers,
      rows,
    });
  }

  const filenameBase = sanitizeFilename(`comparativa-${config.dateFromA}-vs-${config.dateFromB || 'periodoB'}`);

  return {
    filenameBase,
    title: 'Comparativa de Periodos',
    subtitle: `Periodo A (${config.dateFromA} a ${config.dateToA}) vs Periodo B (${config.dateFromB || '-'} a ${config.dateToB || '-'})`,
    currency: cur,
    integrityWarning,
    headerCards,
    tables,
    svgElements,
  };
}

// -------------------------------------------------------------
// 3. DEBTS DOCUMENT
// -------------------------------------------------------------
export interface BuildDebtsOptions {
  config: ExportConfig;
  debts: Debt[];
  rates?: ExchangeRates | null;
  svgElements?: SVGSVGElement[];
}

export function buildDebtsDocument(
  arg1: BuildDebtsOptions | ExportConfig,
  arg2?: Debt[],
  arg3?: ExchangeRates | null,
  arg4?: SVGSVGElement[]
): NormalizedExportDocument {
  const isOptions = 'debts' in arg1;
  const config = isOptions ? arg1.config : (arg1 as ExportConfig);
  const debts = isOptions ? arg1.debts : (arg2 || []);
  const rates = isOptions ? arg1.rates : arg3;
  const svgElements = isOptions ? arg1.svgElements : arg4;

  const cur = config.currency;
  const isSingle = config.selectedDebtId && config.selectedDebtId !== 'all';

  if (isSingle) {
    const debt = debts.find((d) => d.id === config.selectedDebtId) || debts[0];
    if (!debt) {
      return {
        filenameBase: 'deuda-no-encontrada',
        title: 'Estado de Cuenta de Deuda',
        subtitle: 'Deuda no encontrada',
        currency: cur,
        headerCards: [],
        tables: [],
      };
    }

    const initAmt = convertItemAmountToMainCurrency({ amount: debt.total_amount, currency: debt.currency }, cur, rates);
    let totalPaid = 0;
    let totalIncreases = 0;

    (debt.payments || []).forEach((p) => {
      const pAmt = convertItemAmountToMainCurrency(p, cur, rates);
      if (p.transaction_type === 'increase') {
        totalIncreases += pAmt;
      } else {
        totalPaid += pAmt;
      }
    });

    const effectiveDebt = initAmt + totalIncreases;
    const remaining = Math.max(0, effectiveDebt - totalPaid);
    const pctPaid = effectiveDebt > 0 ? Math.min(100, (totalPaid / effectiveDebt) * 100) : 0;

    const headerCards: ExportKeyValue[] = [];
    if (config.includeHeaderCard !== false) {
      headerCards.push(
        { label: 'Contraparte', value: debt.counterpart || '-' },
        {
          label: 'Tipo de Deuda',
          value: debt.type === 'owed' ? 'Por Pagar (Debo)' : 'Por Cobrar (Me deben)',
          highlight: debt.type === 'owed' ? 'warning' : 'positive',
        },
        { label: 'Monto Inicial', value: formatCurrencyAmount(initAmt, cur) },
        { label: 'Total Abonado', value: formatCurrencyAmount(totalPaid, cur), highlight: 'positive' },
        {
          label: 'Saldo Pendiente',
          value: formatCurrencyAmount(remaining, cur),
          highlight: remaining > 0 ? 'negative' : 'positive',
        },
        { label: '% Pagado', value: `${pctPaid.toFixed(1)}%`, highlight: pctPaid >= 100 ? 'positive' : 'neutral' },
        {
          label: 'Estado',
          value: debt.is_settled ? 'Saldada' : 'Activa',
          highlight: debt.is_settled ? 'positive' : 'warning',
        },
        { label: 'Fecha Vencimiento', value: debt.due_date || 'Sin vencimiento' }
      );
    }

    const tables: ExportTableSpec[] = [];
    if (config.includeTransactions !== false && debt.payments && debt.payments.length > 0) {
      const includeOrig = Boolean(config.includeOriginalCurrency);
      const headers = includeOrig
        ? ['Fecha', 'Tipo', 'Nota / Detalle', `Monto (${cur})`, 'Monto Original', 'Moneda Original', 'Tasa']
        : ['Fecha', 'Tipo', 'Nota / Detalle', `Monto (${cur})`];

      const sortedPayments = [...debt.payments].sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''));

      const rows: (string | number)[][] = sortedPayments.map((p) => {
        const typeStr = p.transaction_type === 'increase' ? 'Aumento de Deuda' : 'Abono / Pago';
        const pAmt = convertItemAmountToMainCurrency(p, cur, rates);
        const formattedAmt = formatCurrencyAmount(pAmt, cur);

        if (!includeOrig) {
          return [p.payment_date || '', typeStr, p.note || '-', formattedAmt];
        }

        const formattedOrig = formatCurrencyAmount(p.amount, p.currency);
        const origCur = getCurrencyLabel(p.currency) || p.currency;
        const rateVal = resolveItemRate(p, rates);
        const rateStr = rateVal ? Number(rateVal).toFixed(2) : '-';

        return [p.payment_date || '', typeStr, p.note || '-', formattedAmt, formattedOrig, origCur, rateStr];
      });

      tables.push({
        sheetName: sanitizeSheetName('Abonos'),
        title: 'Historial de Abonos y Ajustes',
        headers,
        rows,
      });
    }

    return {
      filenameBase: sanitizeFilename(`estado-cuenta-deuda-${debt.concept || debt.counterpart}`),
      title: `Estado de Cuenta - Deuda: ${debt.concept || debt.counterpart}`,
      subtitle: `Contraparte: ${debt.counterpart} | Tipo: ${debt.type === 'owed' ? 'Por Pagar' : 'Por Cobrar'}`,
      currency: cur,
      headerCards,
      tables,
      svgElements,
    };
  }

  // Multiple debts (All)
  const filterType = config.debtFilterType || 'all';
  const filteredDebts = debts.filter((d) => {
    if (filterType === 'owed') return d.type === 'owed';
    if (filterType === 'receivable') return d.type === 'receivable';
    return true;
  });

  let totalOwedRemaining = 0;
  let totalReceivableRemaining = 0;
  let activeCount = 0;
  let settledCount = 0;

  const debtRows: (string | number)[][] = [];
  const allPayments: {
    payment_date: string;
    concept: string;
    counterpart: string;
    type: string;
    convertedAmount: number;
    note: string;
  }[] = [];

  filteredDebts.forEach((d) => {
    const initAmt = convertItemAmountToMainCurrency({ amount: d.total_amount, currency: d.currency }, cur, rates);
    let dPaid = 0;
    let dIncreases = 0;

    (d.payments || []).forEach((p) => {
      const pAmt = convertItemAmountToMainCurrency(p, cur, rates);
      if (p.transaction_type === 'increase') {
        dIncreases += pAmt;
      } else {
        dPaid += pAmt;
      }
      allPayments.push({
        payment_date: p.payment_date || '',
        concept: d.concept,
        counterpart: d.counterpart,
        type: p.transaction_type === 'increase' ? 'Aumento' : d.type === 'receivable' ? 'Cobro' : 'Abono',
        convertedAmount: pAmt,
        note: p.note || '-',
      });
    });

    const effDebt = initAmt + dIncreases;
    const rem = Math.max(0, effDebt - dPaid);
    const pct = effDebt > 0 ? Math.min(100, (dPaid / effDebt) * 100) : 0;

    if (d.is_settled) {
      settledCount++;
    } else {
      activeCount++;
      if (d.type === 'owed') totalOwedRemaining += rem;
      if (d.type === 'receivable') totalReceivableRemaining += rem;
    }

    if (filterType === 'owed') {
      debtRows.push([
        d.concept,
        d.counterpart,
        formatCurrencyAmount(initAmt, cur),
        formatCurrencyAmount(dPaid, cur),
        formatCurrencyAmount(rem, cur),
        `${pct.toFixed(1)}%`,
        d.is_settled ? 'Saldada' : 'Activa',
        d.due_date || 'Sin vencimiento',
      ]);
    } else if (filterType === 'receivable') {
      debtRows.push([
        d.concept,
        d.counterpart,
        formatCurrencyAmount(initAmt, cur),
        formatCurrencyAmount(dPaid, cur),
        formatCurrencyAmount(rem, cur),
        `${pct.toFixed(1)}%`,
        d.is_settled ? 'Cobrado' : 'Pendiente',
        d.due_date || 'Sin vencimiento',
      ]);
    } else {
      debtRows.push([
        d.concept,
        d.counterpart,
        d.type === 'owed' ? 'Por Pagar' : 'Por Cobrar',
        formatCurrencyAmount(initAmt, cur),
        formatCurrencyAmount(dPaid, cur),
        formatCurrencyAmount(rem, cur),
        `${pct.toFixed(1)}%`,
        d.is_settled ? 'Saldada' : 'Activa',
        d.due_date || 'Sin vencimiento',
      ]);
    }
  });

  const headerCards: ExportKeyValue[] = [];
  if (config.includeHeaderCard !== false) {
    if (filterType === 'owed') {
      headerCards.push(
        { label: 'Total Por Pagar (Pendiente)', value: formatCurrencyAmount(totalOwedRemaining, cur), highlight: 'negative' },
        { label: 'Deudas Activas', value: `${activeCount}`, highlight: 'warning' },
        { label: 'Deudas Saldadas', value: `${settledCount}`, highlight: 'positive' }
      );
    } else if (filterType === 'receivable') {
      headerCards.push(
        { label: 'Total Por Cobrar (Pendiente)', value: formatCurrencyAmount(totalReceivableRemaining, cur), highlight: 'positive' },
        { label: 'Préstamos Pendientes', value: `${activeCount}`, highlight: 'warning' },
        { label: 'Préstamos Cobrados', value: `${settledCount}`, highlight: 'positive' }
      );
    } else {
      headerCards.push(
        { label: 'Total Por Pagar (Pendiente)', value: formatCurrencyAmount(totalOwedRemaining, cur), highlight: 'negative' },
        { label: 'Total Por Cobrar (Pendiente)', value: formatCurrencyAmount(totalReceivableRemaining, cur), highlight: 'positive' },
        { label: 'Deudas / Préstamos Activos', value: `${activeCount}`, highlight: 'warning' },
        { label: 'Saldadas / Cobradas', value: `${settledCount}`, highlight: 'positive' }
      );
    }
  }

  const tableTitle =
    filterType === 'owed'
      ? 'Deudas por Pagar'
      : filterType === 'receivable'
      ? 'Préstamos por Cobrar'
      : 'Cartera Consolidada de Deudas';

  const tableHeaders =
    filterType === 'owed'
      ? ['Concepto', 'Acreedor / Contraparte', `Monto Inicial (${cur})`, `Abonado (${cur})`, `Saldo Pendiente (${cur})`, '% Pagado', 'Estado', 'Vencimiento']
      : filterType === 'receivable'
      ? ['Concepto', 'Deudor / Contraparte', `Monto Inicial (${cur})`, `Cobrado (${cur})`, `Saldo Pendiente (${cur})`, '% Cobrado', 'Estado', 'Vencimiento']
      : ['Concepto', 'Contraparte', 'Tipo', `Monto Inicial (${cur})`, `Abonado (${cur})`, `Saldo Pendiente (${cur})`, '% Pagado', 'Estado', 'Vencimiento'];

  const tables: ExportTableSpec[] = [
    {
      sheetName: sanitizeSheetName(filterType === 'owed' ? 'Por Pagar' : filterType === 'receivable' ? 'Por Cobrar' : 'Cartera'),
      title: tableTitle,
      headers: tableHeaders,
      rows: debtRows,
    },
  ];

  if (config.includeTransactions !== false && allPayments.length > 0) {
    allPayments.sort((a, b) => b.payment_date.localeCompare(a.payment_date));
    const paymentRows: (string | number)[][] = allPayments.map((p) => [
      p.payment_date,
      p.concept,
      p.counterpart,
      p.type,
      formatCurrencyAmount(p.convertedAmount, cur),
      p.note,
    ]);

    tables.push({
      sheetName: sanitizeSheetName('Movimientos'),
      title: filterType === 'receivable' ? 'Historial Consolidado de Cobros' : 'Historial Consolidado de Abonos',
      headers: ['Fecha', 'Deuda / Concepto', 'Contraparte', 'Tipo Transacción', `Monto (${cur})`, 'Nota'],
      rows: paymentRows,
    });
  }

  const docTitle =
    filterType === 'owed'
      ? 'Estado de Cuenta - Mis Deudas (Por Pagar)'
      : filterType === 'receivable'
      ? 'Estado de Cuenta - Préstamos a Favor (Por Cobrar)'
      : 'Reporte Consolidado de Deudas';

  const docSubtitle =
    filterType === 'owed'
      ? 'Cartera consolidada de deudas por pagar'
      : filterType === 'receivable'
      ? 'Cartera consolidada de préstamos por cobrar'
      : 'Cartera consolidada de deudas por pagar y préstamos a favor';

  const docFilename =
    filterType === 'owed'
      ? 'mis-deudas-por-pagar'
      : filterType === 'receivable'
      ? 'prestamos-por-cobrar'
      : 'cartera-deudas-consolidada';

  return {
    filenameBase: sanitizeFilename(docFilename),
    title: docTitle,
    subtitle: docSubtitle,
    currency: cur,
    headerCards,
    tables,
    svgElements,
  };
}

// -------------------------------------------------------------
// 4. SAVINGS DOCUMENT
// -------------------------------------------------------------
export interface BuildSavingsOptions {
  config: ExportConfig;
  savings: SavingGoal[];
  rates?: ExchangeRates | null;
  svgElements?: SVGSVGElement[];
}

export function buildSavingsDocument(
  arg1: BuildSavingsOptions | ExportConfig,
  arg2?: SavingGoal[],
  arg3?: ExchangeRates | null,
  arg4?: SVGSVGElement[]
): NormalizedExportDocument {
  const isOptions = 'savings' in arg1;
  const config = isOptions ? arg1.config : (arg1 as ExportConfig);
  const rawSavings = isOptions ? arg1.savings : (arg2 || []);
  const rates = isOptions ? arg1.rates : arg3;
  const svgElements = isOptions ? arg1.svgElements : arg4;

  const cur = config.currency;
  // Strictly filter out projects: only pure savings goals
  const savings = rawSavings.filter((g) => g.type !== 'project');
  const isSingle = config.selectedSavingId && config.selectedSavingId !== 'all';

  if (isSingle) {
    const goal = savings.find((g) => g.id === config.selectedSavingId) || savings[0];
    if (!goal) {
      return {
        filenameBase: 'meta-no-encontrada',
        title: 'Estado de Cuenta de Meta de Ahorro',
        subtitle: 'Meta no encontrada',
        currency: cur,
        headerCards: [],
        tables: [],
      };
    }

    const targetAmt = goal.target_amount
      ? convertItemAmountToMainCurrency({ amount: goal.target_amount, currency: goal.currency }, cur, rates)
      : null;

    let totalDeposited = 0;
    let totalWithdrawn = 0;

    (goal.deposits || []).forEach((d) => {
      const dAmt = convertItemAmountToMainCurrency(d, cur, rates);
      if (d.transaction_type === 'withdrawal') {
        totalWithdrawn += dAmt;
      } else {
        totalDeposited += dAmt;
      }
    });

    const currentSaved = totalDeposited - totalWithdrawn;
    const pct = targetAmt && targetAmt > 0 ? (currentSaved / targetAmt) * 100 : 0;

    const headerCards: ExportKeyValue[] = [];
    if (config.includeHeaderCard !== false) {
      headerCards.push(
        { label: 'Meta de Ahorro', value: goal.name },
        { label: 'Monto Objetivo', value: targetAmt != null ? formatCurrencyAmount(targetAmt, cur) : 'Sin límite' },
        { label: 'Total Depositado', value: formatCurrencyAmount(totalDeposited, cur), highlight: 'positive' },
        {
          label: 'Total Retirado',
          value: formatCurrencyAmount(totalWithdrawn, cur),
          highlight: totalWithdrawn > 0 ? 'warning' : 'neutral',
        },
        { label: 'Saldo Ahorrado Actual', value: formatCurrencyAmount(currentSaved, cur), highlight: 'positive' },
        { label: '% Progreso', value: targetAmt != null ? `${pct.toFixed(1)}%` : 'N/A', highlight: pct >= 100 ? 'positive' : 'neutral' },
        { label: 'Fecha Objetivo', value: goal.target_date || 'Sin fecha' },
        {
          label: 'Estado',
          value: goal.is_completed ? 'Completada' : 'En progreso',
          highlight: goal.is_completed ? 'positive' : 'neutral',
        }
      );
    }

    const tables: ExportTableSpec[] = [];
    if (config.includeTransactions !== false && goal.deposits && goal.deposits.length > 0) {
      const includeOrig = Boolean(config.includeOriginalCurrency);
      const headers = includeOrig
        ? ['Fecha', 'Tipo', 'Nota / Concepto', 'Categoría', `Monto (${cur})`, 'Monto Original', 'Moneda Original', 'Tasa']
        : ['Fecha', 'Tipo', 'Nota / Concepto', 'Categoría', `Monto (${cur})`];

      const sortedDeposits = [...goal.deposits].sort((a, b) => (b.deposit_date || '').localeCompare(a.deposit_date || ''));

      const rows: (string | number)[][] = sortedDeposits.map((d) => {
        const typeStr = d.transaction_type === 'withdrawal' ? 'Retiro' : 'Depósito';
        const dAmt = convertItemAmountToMainCurrency(d, cur, rates);
        const signedAmt = d.transaction_type === 'withdrawal' ? -Math.abs(dAmt) : Math.abs(dAmt);
        const formattedAmt = formatCurrencyAmount(signedAmt, cur);

        if (!includeOrig) {
          return [d.deposit_date || '', typeStr, d.note || '-', d.category || '-', formattedAmt];
        }

        const formattedOrig = formatCurrencyAmount(d.amount, d.currency);
        const origCur = getCurrencyLabel(d.currency) || d.currency;
        const rateVal = resolveItemRate(d, rates);
        const rateStr = rateVal ? Number(rateVal).toFixed(2) : '-';

        return [d.deposit_date || '', typeStr, d.note || '-', d.category || '-', formattedAmt, formattedOrig, origCur, rateStr];
      });

      tables.push({
        sheetName: sanitizeSheetName('Movimientos'),
        title: 'Historial de Depósitos y Retiros',
        headers,
        rows,
      });
    }

    return {
      filenameBase: sanitizeFilename(`meta-ahorro-${goal.name}`),
      title: `Estado de Cuenta - Meta: ${goal.name}`,
      subtitle: `Categoría: ${goal.category || 'General'} | Estado: ${goal.is_completed ? 'Completada' : 'En progreso'}`,
      currency: cur,
      headerCards,
      tables,
      svgElements,
    };
  }

  // Multiple savings goals (All)
  let totalSavedAll = 0;
  let totalTargetAll = 0;
  let activeGoals = 0;
  let completedGoals = 0;

  const goalRows: (string | number)[][] = [];
  const allDeposits: {
    deposit_date: string;
    goalName: string;
    type: string;
    convertedAmount: number;
    note: string;
  }[] = [];

  savings.forEach((g) => {
    const targetAmt = g.target_amount
      ? convertItemAmountToMainCurrency({ amount: g.target_amount, currency: g.currency }, cur, rates)
      : null;

    if (targetAmt) totalTargetAll += targetAmt;

    let gDep = 0;
    let gWith = 0;
    (g.deposits || []).forEach((d) => {
      const dAmt = convertItemAmountToMainCurrency(d, cur, rates);
      if (d.transaction_type === 'withdrawal') {
        gWith += dAmt;
      } else {
        gDep += dAmt;
      }
      allDeposits.push({
        deposit_date: d.deposit_date || '',
        goalName: g.name,
        type: d.transaction_type === 'withdrawal' ? 'Retiro' : 'Depósito',
        convertedAmount: d.transaction_type === 'withdrawal' ? -Math.abs(dAmt) : Math.abs(dAmt),
        note: d.note || '-',
      });
    });

    const currentSaved = gDep - gWith;
    totalSavedAll += currentSaved;
    if (g.is_completed) completedGoals++;
    else activeGoals++;

    const pct = targetAmt && targetAmt > 0 ? (currentSaved / targetAmt) * 100 : 0;

    goalRows.push([
      g.name,
      g.category || 'General',
      targetAmt != null ? formatCurrencyAmount(targetAmt, cur) : 'Sin límite',
      formatCurrencyAmount(currentSaved, cur),
      targetAmt != null ? `${pct.toFixed(1)}%` : 'N/A',
      g.target_date || 'Sin fecha',
      g.is_completed ? 'Completada' : 'En progreso',
    ]);
  });

  const headerCards: ExportKeyValue[] = [];
  if (config.includeHeaderCard !== false) {
    headerCards.push(
      { label: 'Total Ahorrado Actual', value: formatCurrencyAmount(totalSavedAll, cur), highlight: 'positive' },
      { label: 'Monto Objetivo Total', value: formatCurrencyAmount(totalTargetAll, cur), highlight: 'neutral' },
      { label: 'Metas Activas', value: `${activeGoals}`, highlight: 'neutral' },
      { label: 'Metas Completadas', value: `${completedGoals}`, highlight: 'positive' }
    );
  }

  const tables: ExportTableSpec[] = [
    {
      sheetName: sanitizeSheetName('Metas'),
      title: 'Resumen de Metas de Ahorro',
      headers: ['Meta', 'Categoría', `Objetivo (${cur})`, `Ahorrado (${cur})`, '% Progreso', 'Fecha Objetivo', 'Estado'],
      rows: goalRows,
    },
  ];

  if (config.includeTransactions !== false && allDeposits.length > 0) {
    allDeposits.sort((a, b) => b.deposit_date.localeCompare(a.deposit_date));
    const depositRows: (string | number)[][] = allDeposits.map((d) => [
      d.deposit_date,
      d.goalName,
      d.type,
      formatCurrencyAmount(d.convertedAmount, cur),
      d.note,
    ]);

    tables.push({
      sheetName: sanitizeSheetName('Movimientos'),
      title: 'Historial Consolidado de Depósitos y Retiros',
      headers: ['Fecha', 'Meta', 'Tipo', `Monto (${cur})`, 'Nota'],
      rows: depositRows,
    });
  }

  return {
    filenameBase: 'metas-de-ahorro-gastosapp',
    title: 'Reporte Consolidado de Metas de Ahorro',
    subtitle: 'Patrimonio y Progreso de Metas',
    currency: cur,
    headerCards,
    tables,
    svgElements,
  };
}

// -------------------------------------------------------------
// 4b. PROJECTS DOCUMENT
// -------------------------------------------------------------
export interface BuildProjectsOptions {
  config: ExportConfig;
  projects: SavingGoal[];
  rates?: ExchangeRates | null;
  svgElements?: SVGSVGElement[];
}

export function buildProjectsDocument(
  arg1: BuildProjectsOptions | ExportConfig,
  arg2?: SavingGoal[],
  arg3?: ExchangeRates | null,
  arg4?: SVGSVGElement[]
): NormalizedExportDocument {
  const isOptions = 'projects' in arg1;
  const config = isOptions ? arg1.config : (arg1 as ExportConfig);
  const rawProjects = isOptions ? arg1.projects : (arg2 || []);
  const rates = isOptions ? arg1.rates : arg3;
  const svgElements = isOptions ? arg1.svgElements : arg4;

  const cur = config.currency;
  // Projects are SavingGoals where type === 'project'
  const projects = rawProjects.filter((p) => p.type === 'project');
  const isSingle = config.selectedProjectId && config.selectedProjectId !== 'all';

  if (isSingle) {
    const project = projects.find((p) => p.id === config.selectedProjectId) || projects[0];
    if (!project) {
      return {
        filenameBase: 'proyecto-no-encontrado',
        title: 'Estado de Cuenta de Proyecto',
        subtitle: 'Proyecto no encontrado',
        currency: cur,
        headerCards: [],
        tables: [],
      };
    }

    const targetAmt = project.target_amount
      ? convertItemAmountToMainCurrency({ amount: project.target_amount, currency: project.currency }, cur, rates)
      : null;

    let totalDeposited = 0;
    let totalWithdrawn = 0;

    (project.deposits || []).forEach((d) => {
      const dAmt = convertItemAmountToMainCurrency(d, cur, rates);
      if (d.transaction_type === 'withdrawal') {
        totalWithdrawn += dAmt;
      } else {
        totalDeposited += dAmt;
      }
    });

    const currentExecuted = totalDeposited - totalWithdrawn;
    const remaining = targetAmt != null ? Math.max(0, targetAmt - currentExecuted) : 0;
    const pct = targetAmt && targetAmt > 0 ? (currentExecuted / targetAmt) * 100 : 0;

    const headerCards: ExportKeyValue[] = [];
    if (config.includeHeaderCard !== false) {
      headerCards.push(
        { label: 'Nombre del Proyecto', value: project.name },
        { label: 'Categoría', value: project.category || 'General' },
        { label: 'Presupuesto Asignado', value: targetAmt != null ? formatCurrencyAmount(targetAmt, cur) : 'Sin límite' },
        { label: 'Total Ejecutado / Pagado', value: formatCurrencyAmount(currentExecuted, cur), highlight: 'positive' },
        {
          label: 'Saldo Restante',
          value: formatCurrencyAmount(remaining, cur),
          highlight: remaining > 0 ? 'warning' : 'positive',
        },
        { label: '% Ejecución', value: targetAmt != null ? `${pct.toFixed(1)}%` : 'N/A', highlight: pct >= 100 ? 'positive' : 'neutral' },
        {
          label: 'Estado',
          value: project.is_completed ? 'Concluido' : 'En Ejecución',
          highlight: project.is_completed ? 'positive' : 'warning',
        }
      );
    }

    const tables: ExportTableSpec[] = [];
    if (config.includeTransactions !== false && project.deposits && project.deposits.length > 0) {
      const includeOrig = Boolean(config.includeOriginalCurrency);
      const headers = includeOrig
        ? ['Fecha', 'Categoría', 'Concepto / Nota', `Monto (${cur})`, 'Monto Original', 'Moneda Original', 'Tasa']
        : ['Fecha', 'Categoría', 'Concepto / Nota', `Monto (${cur})`];

      const sortedDeposits = [...project.deposits].sort((a, b) => (b.deposit_date || '').localeCompare(a.deposit_date || ''));

      const rows: (string | number)[][] = sortedDeposits.map((d) => {
        const dAmt = convertItemAmountToMainCurrency(d, cur, rates);
        const signedAmt = d.transaction_type === 'withdrawal' ? -Math.abs(dAmt) : Math.abs(dAmt);
        const formattedAmt = formatCurrencyAmount(signedAmt, cur);

        if (!includeOrig) {
          return [d.deposit_date || '', d.category || '-', d.note || '-', formattedAmt];
        }

        const formattedOrig = formatCurrencyAmount(d.amount, d.currency);
        const origCur = getCurrencyLabel(d.currency) || d.currency;
        const rateVal = resolveItemRate(d, rates);
        const rateStr = rateVal ? Number(rateVal).toFixed(2) : '-';

        return [d.deposit_date || '', d.category || '-', d.note || '-', formattedAmt, formattedOrig, origCur, rateStr];
      });

      tables.push({
        sheetName: sanitizeSheetName('Pagos'),
        title: 'Historial de Pagos y Aportes del Proyecto',
        headers,
        rows,
      });
    }

    return {
      filenameBase: sanitizeFilename(`proyecto-${project.name}`),
      title: `Estado de Cuenta - Proyecto: ${project.name}`,
      subtitle: `Categoría: ${project.category || 'General'} | Estado: ${project.is_completed ? 'Concluido' : 'En Ejecución'}`,
      currency: cur,
      headerCards,
      tables,
      svgElements,
    };
  }

  // All Projects
  let totalBudget = 0;
  let totalExecuted = 0;
  let activeProjects = 0;
  let completedProjects = 0;

  const projRows: (string | number)[][] = [];
  const allPayments: {
    deposit_date: string;
    projectName: string;
    category: string;
    note: string;
    convertedAmount: number;
  }[] = [];

  projects.forEach((p) => {
    const targetAmt = p.target_amount
      ? convertItemAmountToMainCurrency({ amount: p.target_amount, currency: p.currency }, cur, rates)
      : null;

    if (targetAmt) totalBudget += targetAmt;

    let pDep = 0;
    let pWith = 0;
    (p.deposits || []).forEach((d) => {
      const dAmt = convertItemAmountToMainCurrency(d, cur, rates);
      if (d.transaction_type === 'withdrawal') {
        pWith += dAmt;
      } else {
        pDep += dAmt;
      }
      allPayments.push({
        deposit_date: d.deposit_date || '',
        projectName: p.name,
        category: d.category || p.category || '-',
        note: d.note || '-',
        convertedAmount: d.transaction_type === 'withdrawal' ? -Math.abs(dAmt) : Math.abs(dAmt),
      });
    });

    const currentExec = pDep - pWith;
    totalExecuted += currentExec;
    if (p.is_completed) completedProjects++;
    else activeProjects++;

    const rem = targetAmt != null ? Math.max(0, targetAmt - currentExec) : 0;
    const pct = targetAmt && targetAmt > 0 ? (currentExec / targetAmt) * 100 : 0;

    projRows.push([
      p.name,
      p.category || 'General',
      targetAmt != null ? formatCurrencyAmount(targetAmt, cur) : 'Sin límite',
      formatCurrencyAmount(currentExec, cur),
      targetAmt != null ? formatCurrencyAmount(rem, cur) : '-',
      targetAmt != null ? `${pct.toFixed(1)}%` : 'N/A',
      p.is_completed ? 'Concluido' : 'En Ejecución',
    ]);
  });

  const remainingTotal = Math.max(0, totalBudget - totalExecuted);

  const headerCards: ExportKeyValue[] = [];
  if (config.includeHeaderCard !== false) {
    headerCards.push(
      { label: 'Total Proyectos Activos', value: `${activeProjects}`, highlight: 'warning' },
      { label: 'Proyectos Concluidos', value: `${completedProjects}`, highlight: 'positive' },
      { label: 'Presupuesto Total', value: formatCurrencyAmount(totalBudget, cur), highlight: 'neutral' },
      { label: 'Total Ejecutado', value: formatCurrencyAmount(totalExecuted, cur), highlight: 'positive' },
      { label: 'Saldo Restante', value: formatCurrencyAmount(remainingTotal, cur), highlight: remainingTotal > 0 ? 'warning' : 'positive' }
    );
  }

  const tables: ExportTableSpec[] = [
    {
      sheetName: sanitizeSheetName('Proyectos'),
      title: 'Cartera de Proyectos',
      headers: ['Nombre del Proyecto', 'Categoría', `Presupuesto (${cur})`, `Ejecutado (${cur})`, `Saldo Restante (${cur})`, '% Ejecución', 'Estado'],
      rows: projRows,
    },
  ];

  if (config.includeTransactions !== false && allPayments.length > 0) {
    allPayments.sort((a, b) => b.deposit_date.localeCompare(a.deposit_date));
    const paymentRows: (string | number)[][] = allPayments.map((p) => [
      p.deposit_date,
      p.projectName,
      p.category,
      p.note,
      formatCurrencyAmount(p.convertedAmount, cur),
    ]);

    tables.push({
      sheetName: sanitizeSheetName('Pagos'),
      title: 'Historial Consolidado de Pagos de Proyectos',
      headers: ['Fecha', 'Proyecto', 'Categoría', 'Concepto / Nota', `Monto (${cur})`],
      rows: paymentRows,
    });
  }

  return {
    filenameBase: 'cartera-proyectos',
    title: 'Reporte Consolidado de Proyectos',
    subtitle: 'Cartera de Proyectos y Presupuestos Asignados',
    currency: cur,
    headerCards,
    tables,
    svgElements,
  };
}

// -------------------------------------------------------------
// 5. BUDGET DOCUMENT
// -------------------------------------------------------------
export interface BuildBudgetOptions {
  config: ExportConfig;
  monthlyBudget: MonthlyBudgetResponse;
  expenses?: Expense[];
  rates?: ExchangeRates | null;
  svgElements?: SVGSVGElement[];
}

export function buildBudgetDocument(
  arg1: BuildBudgetOptions | ExportConfig,
  arg2?: MonthlyBudgetResponse,
  arg3?: Expense[],
  arg4?: ExchangeRates | null,
  arg5?: SVGSVGElement[]
): NormalizedExportDocument {
  const isOptions = 'monthlyBudget' in arg1;
  const config = isOptions ? arg1.config : (arg1 as ExportConfig);
  const mb = isOptions ? arg1.monthlyBudget : arg2!;
  const expenses = isOptions ? arg1.expenses : arg3;
  const rates = isOptions ? arg1.rates : arg4;
  const svgElements = isOptions ? arg1.svgElements : arg5;

  const cur = config.currency;
  const isPrimaryOnly = config.selectedBudgetId === 'primary_only';
  const isSingle = config.selectedBudgetId && config.selectedBudgetId !== 'all' && !isPrimaryOnly;

  if (isPrimaryOnly) {
    // Only Master Plan (No subbudgets table)
    const globalLimit =
      resolveCurrencyTotal(
        { total_usd: mb.global_limit_usd, total_bs: mb.global_limit_bs, total_eur: mb.global_limit_eur, total_usdt: mb.global_limit_usdt },
        cur,
        rates
      ) || Number(mb.effective_global_limit) || 0;

    const totalSpent =
      resolveCurrencyTotal(
        { total_usd: mb.total_spent_usd, total_bs: mb.total_spent_bs, total_eur: mb.total_spent_eur, total_usdt: mb.total_spent_usdt },
        cur,
        rates
      ) || Number(mb.total_spent_budget_currency) || 0;

    const unbudgeted =
      resolveCurrencyTotal(
        {
          total_usd: mb.unbudgeted_spent_usd,
          total_bs: mb.unbudgeted_spent_bs,
          total_eur: mb.unbudgeted_spent_eur,
          total_usdt: mb.unbudgeted_spent_usdt,
        },
        cur,
        rates
      ) || Number(mb.unbudgeted_spent_budget_currency) || 0;

    const available = globalLimit - totalSpent;
    const pctUsed = globalLimit > 0 ? (totalSpent / globalLimit) * 100 : 0;

    const headerCards: ExportKeyValue[] = [];
    if (config.includeHeaderCard !== false) {
      headerCards.push(
        { label: 'Mes', value: mb.month_year },
        { label: 'Techo Plan Maestro', value: formatCurrencyAmount(globalLimit, cur) },
        {
          label: 'Total Gastado',
          value: formatCurrencyAmount(totalSpent, cur),
          highlight: totalSpent > globalLimit ? 'negative' : 'neutral',
        },
        {
          label: 'Saldo Disponible',
          value: formatCurrencyAmount(available, cur),
          highlight: available >= 0 ? 'positive' : 'negative',
        },
        {
          label: '% Consumido',
          value: `${pctUsed.toFixed(1)}%`,
          highlight: pctUsed > 100 ? 'negative' : pctUsed > 85 ? 'warning' : 'positive',
        },
        {
          label: 'Gasto sin presupuestar',
          value: formatCurrencyAmount(unbudgeted, cur),
          highlight: unbudgeted > 0 ? 'warning' : 'neutral',
        }
      );
    }

    const tables: ExportTableSpec[] = [];

    // Table 1: Category Limits
    if (config.includeCategories !== false && mb.category_limits?.length > 0) {
      const catRows: (string | number)[][] = mb.category_limits.map((c) => {
        const cLim = resolveBudgetCategoryLimit(c, cur);
        const cSpent = resolveCategoryTotal(
          { total_usd: c.spent_usd, total_bs: c.spent_bs, total_eur: c.spent_eur, total_usdt: c.spent_usdt },
          cur
        );
        const cRem = cLim - cSpent;
        const cPct = cLim > 0 ? ((cSpent / cLim) * 100).toFixed(1) + '%' : '0.0%';
        const statusStr = c.traffic_light === 'red' ? 'Excedido' : c.traffic_light === 'yellow' ? 'Alerta' : 'En rango';

        return [
          c.category_name,
          formatCurrencyAmount(cLim, cur),
          formatCurrencyAmount(cSpent, cur),
          formatCurrencyAmount(cRem, cur),
          cPct,
          statusStr,
        ];
      });

      if (unbudgeted > 0 || (mb.unbudgeted_categories && mb.unbudgeted_categories.length > 0)) {
        const unbudgetedCats = mb.unbudgeted_categories?.join(', ') || 'Varios';
        catRows.push([
          `Sin Presupuestar (${unbudgetedCats})`,
          formatCurrencyAmount(0, cur),
          formatCurrencyAmount(unbudgeted, cur),
          formatCurrencyAmount(-unbudgeted, cur),
          'N/A',
          'Excedido',
        ]);
      }

      tables.push({
        sheetName: sanitizeSheetName('Categorías'),
        title: 'Límites y Ejecución por Categoría',
        headers: ['Categoría', `Límite (${cur})`, `Gastado (${cur})`, `Disponible (${cur})`, '% Usado', 'Estado'],
        rows: catRows,
      });
    }

    // Table 2: Month Expenses
    if (config.includeTransactions !== false && expenses && expenses.length > 0) {
      const includeOrig = Boolean(config.includeOriginalCurrency);
      const headers = includeOrig
        ? ['Fecha', 'Descripción', 'Categoría', `Monto (${cur})`, 'Monto Original', 'Moneda Original', 'Tasa']
        : ['Fecha', 'Descripción', 'Categoría', `Monto (${cur})`];

      const sortedExp = [...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      const rows: (string | number)[][] = sortedExp.map((exp) => {
        const converted = convertItemAmountToMainCurrency(exp, cur, rates);
        const formattedConverted = formatCurrencyAmount(converted, cur);
        if (!includeOrig) {
          return [exp.date || '', exp.description || '-', exp.category || '-', formattedConverted];
        }
        const formattedOrig = formatCurrencyAmount(exp.amount, exp.currency);
        const origCur = getCurrencyLabel(exp.currency) || exp.currency;
        const rateVal = resolveItemRate(exp, rates);
        const rateStr = rateVal ? Number(rateVal).toFixed(2) : '-';
        return [exp.date || '', exp.description || '-', exp.category || '-', formattedConverted, formattedOrig, origCur, rateStr];
      });

      tables.push({
        sheetName: sanitizeSheetName('Gastos Mes'),
        title: 'Gastos Registrados en el Mes',
        headers,
        rows,
      });
    }

    return {
      filenameBase: sanitizeFilename(`plan-maestro-${mb.month_year}`),
      title: `Plan Maestro de Presupuesto - ${mb.month_year}`,
      subtitle: 'Presupuesto Global y Límites de Categoría',
      currency: cur,
      headerCards,
      tables,
      svgElements,
    };
  }

  if (!isSingle) {
    // Master Plan + All Subbudgets
    const globalLimit =
      resolveCurrencyTotal(
        { total_usd: mb.global_limit_usd, total_bs: mb.global_limit_bs, total_eur: mb.global_limit_eur, total_usdt: mb.global_limit_usdt },
        cur,
        rates
      ) || Number(mb.effective_global_limit) || 0;

    const totalSpent =
      resolveCurrencyTotal(
        { total_usd: mb.total_spent_usd, total_bs: mb.total_spent_bs, total_eur: mb.total_spent_eur, total_usdt: mb.total_spent_usdt },
        cur,
        rates
      ) || Number(mb.total_spent_budget_currency) || 0;

    const unbudgeted =
      resolveCurrencyTotal(
        {
          total_usd: mb.unbudgeted_spent_usd,
          total_bs: mb.unbudgeted_spent_bs,
          total_eur: mb.unbudgeted_spent_eur,
          total_usdt: mb.unbudgeted_spent_usdt,
        },
        cur,
        rates
      ) || Number(mb.unbudgeted_spent_budget_currency) || 0;

    const available = globalLimit - totalSpent;
    const pctUsed = globalLimit > 0 ? (totalSpent / globalLimit) * 100 : 0;

    const headerCards: ExportKeyValue[] = [];
    if (config.includeHeaderCard !== false) {
      headerCards.push(
        { label: 'Mes', value: mb.month_year },
        { label: 'Techo Plan Maestro', value: formatCurrencyAmount(globalLimit, cur) },
        {
          label: 'Total Gastado',
          value: formatCurrencyAmount(totalSpent, cur),
          highlight: totalSpent > globalLimit ? 'negative' : 'neutral',
        },
        {
          label: 'Saldo Disponible',
          value: formatCurrencyAmount(available, cur),
          highlight: available >= 0 ? 'positive' : 'negative',
        },
        {
          label: '% Ejecución',
          value: `${pctUsed.toFixed(1)}%`,
          highlight: pctUsed > 100 ? 'negative' : pctUsed > 85 ? 'warning' : 'positive',
        },
        {
          label: 'Fuera de Presupuesto',
          value: formatCurrencyAmount(unbudgeted, cur),
          highlight: unbudgeted > 0 ? 'warning' : 'neutral',
        }
      );
    }

    const tables: ExportTableSpec[] = [];

    // Table 1: Subbudgets
    const subbudgets = [
      ...(mb.budgets?.filter((b) => !b.is_primary) || []),
      ...(mb.shared_with_me_budgets || []),
    ];

    if (subbudgets.length > 0) {
      const subRows: (string | number)[][] = subbudgets.map((b) => {
        const subType = b.is_shared ? `Compartido (${b.shared_partner_name || 'Pana'})` : 'Propio';
        const cats = b.category_limits?.map((c) => c.category_name).join(', ') || '-';
        const sLimit =
          resolveCurrencyTotal(
            { total_usd: b.global_limit_usd, total_bs: b.global_limit_bs, total_eur: b.global_limit_eur, total_usdt: b.global_limit_usdt },
            cur,
            rates
          ) || Number(b.effective_global_limit) || 0;
        const sSpent =
          resolveCurrencyTotal(
            { total_usd: b.total_spent_usd, total_bs: b.total_spent_bs, total_eur: b.total_spent_eur, total_usdt: b.total_spent_usdt },
            cur,
            rates
          ) || Number(b.total_spent_budget_currency) || 0;
        const sAvail = sLimit - sSpent;
        const sPct = sLimit > 0 ? ((sSpent / sLimit) * 100).toFixed(1) + '%' : '0.0%';

        return [
          b.name,
          subType,
          cats,
          formatCurrencyAmount(sLimit, cur),
          formatCurrencyAmount(sSpent, cur),
          formatCurrencyAmount(sAvail, cur),
          sPct,
        ];
      });

      tables.push({
        sheetName: sanitizeSheetName('Subpresupuestos'),
        title: 'Resumen de Subpresupuestos',
        headers: ['Nombre', 'Tipo', 'Categorías', `Techo (${cur})`, `Gastado (${cur})`, `Disponible (${cur})`, '% Consumido'],
        rows: subRows,
      });
    }

    // Table 2: Category Limits
    if (config.includeCategories !== false && mb.category_limits?.length > 0) {
      const catRows: (string | number)[][] = mb.category_limits.map((c) => {
        const cLim = resolveBudgetCategoryLimit(c, cur);
        const cSpent = resolveCategoryTotal(
          { total_usd: c.spent_usd, total_bs: c.spent_bs, total_eur: c.spent_eur, total_usdt: c.spent_usdt },
          cur
        );
        const cRem = cLim - cSpent;
        const cPct = cLim > 0 ? ((cSpent / cLim) * 100).toFixed(1) + '%' : '0.0%';
        const subName = c.also_in_budgets?.join(', ') || 'Plan Maestro';
        const statusStr = c.traffic_light === 'red' ? 'Excedido' : c.traffic_light === 'yellow' ? 'Alerta' : 'En rango';

        return [
          c.category_name,
          subName,
          formatCurrencyAmount(cLim, cur),
          formatCurrencyAmount(cSpent, cur),
          formatCurrencyAmount(cRem, cur),
          cPct,
          statusStr,
        ];
      });

      if (unbudgeted > 0 || (mb.unbudgeted_categories && mb.unbudgeted_categories.length > 0)) {
        const unbudgetedCats = mb.unbudgeted_categories?.join(', ') || 'Varios';
        catRows.push([
          `Sin Presupuestar (${unbudgetedCats})`,
          'Fuera de Plan',
          formatCurrencyAmount(0, cur),
          formatCurrencyAmount(unbudgeted, cur),
          formatCurrencyAmount(-unbudgeted, cur),
          'N/A',
          'Excedido',
        ]);
      }

      tables.push({
        sheetName: sanitizeSheetName('Categorías'),
        title: 'Límites y Ejecución por Categoría',
        headers: ['Categoría', 'Subpresupuesto', `Límite (${cur})`, `Gastado (${cur})`, `Restante (${cur})`, '% Usado', 'Estado'],
        rows: catRows,
      });
    }

    // Table 3: Month Expenses
    if (config.includeTransactions !== false && expenses && expenses.length > 0) {
      const includeOrig = Boolean(config.includeOriginalCurrency);
      const headers = includeOrig
        ? ['Fecha', 'Descripción', 'Categoría', `Monto (${cur})`, 'Monto Original', 'Moneda Original', 'Tasa']
        : ['Fecha', 'Descripción', 'Categoría', `Monto (${cur})`];

      const sortedExp = [...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      const rows: (string | number)[][] = sortedExp.map((exp) => {
        const converted = convertItemAmountToMainCurrency(exp, cur, rates);
        const formattedConverted = formatCurrencyAmount(converted, cur);
        if (!includeOrig) {
          return [exp.date || '', exp.description || '-', exp.category || '-', formattedConverted];
        }
        const formattedOrig = formatCurrencyAmount(exp.amount, exp.currency);
        const origCur = getCurrencyLabel(exp.currency) || exp.currency;
        const rateVal = resolveItemRate(exp, rates);
        const rateStr = rateVal ? Number(rateVal).toFixed(2) : '-';
        return [exp.date || '', exp.description || '-', exp.category || '-', formattedConverted, formattedOrig, origCur, rateStr];
      });

      tables.push({
        sheetName: sanitizeSheetName('Gastos Mes'),
        title: 'Gastos Registrados en el Mes',
        headers,
        rows,
      });
    }

    return {
      filenameBase: sanitizeFilename(`presupuesto-completo-${mb.month_year}`),
      title: `Plan de Presupuesto - ${mb.month_year}`,
      subtitle: 'Plan Maestro y Subpresupuestos Consolidados',
      currency: cur,
      headerCards,
      tables,
      svgElements,
    };
  }

  // Single Subbudget
  const allSubs = [...(mb.budgets || []), ...(mb.shared_with_me_budgets || [])];
  const b = allSubs.find((x) => x.id === config.selectedBudgetId || x.name === config.selectedBudgetId) || allSubs[0];

  if (!b) {
    return {
      filenameBase: 'subpresupuesto-no-encontrado',
      title: 'Reporte de Subpresupuesto',
      subtitle: 'Subpresupuesto no encontrado',
      currency: cur,
      headerCards: [],
      tables: [],
    };
  }

  const bLimit =
    resolveCurrencyTotal(
      { total_usd: b.global_limit_usd, total_bs: b.global_limit_bs, total_eur: b.global_limit_eur, total_usdt: b.global_limit_usdt },
      cur,
      rates
    ) || Number(b.effective_global_limit) || 0;

  const bSpent =
    resolveCurrencyTotal(
      { total_usd: b.total_spent_usd, total_bs: b.total_spent_bs, total_eur: b.total_spent_eur, total_usdt: b.total_spent_usdt },
      cur,
      rates
    ) || Number(b.total_spent_budget_currency) || 0;

  const bAvail = bLimit - bSpent;
  const bPct = bLimit > 0 ? (bSpent / bLimit) * 100 : 0;

  const headerCards: ExportKeyValue[] = [];
  if (config.includeHeaderCard !== false) {
    headerCards.push(
      { label: 'Subpresupuesto', value: b.name },
      { label: 'Mes', value: b.month_year },
      { label: 'Modalidad', value: b.is_shared ? `Compartido con ${b.shared_partner_name || 'Pana'}` : 'Personal' },
      { label: 'Techo Asignado', value: formatCurrencyAmount(bLimit, cur) },
      {
        label: 'Total Gastado',
        value: formatCurrencyAmount(bSpent, cur),
        highlight: bSpent > bLimit ? 'negative' : 'neutral',
      },
      {
        label: 'Saldo Disponible',
        value: formatCurrencyAmount(bAvail, cur),
        highlight: bAvail >= 0 ? 'positive' : 'negative',
      },
      {
        label: '% Consumido',
        value: `${bPct.toFixed(1)}%`,
        highlight: bPct > 100 ? 'negative' : bPct > 85 ? 'warning' : 'positive',
      }
    );
  }

  const tables: ExportTableSpec[] = [];

  // Table 1: Categories in subbudget
  const subCategoryNames = new Set((b.category_limits || []).map((c) => c.category_name));

  if (config.includeCategories !== false && b.category_limits?.length > 0) {
    const catRows: (string | number)[][] = b.category_limits.map((c) => {
      const cLim = resolveBudgetCategoryLimit(c, cur);
      const cSpent = resolveCategoryTotal(
        { total_usd: c.spent_usd, total_bs: c.spent_bs, total_eur: c.spent_eur, total_usdt: c.spent_usdt },
        cur
      );
      const cRem = cLim - cSpent;
      const cPct = cLim > 0 ? ((cSpent / cLim) * 100).toFixed(1) + '%' : '0.0%';
      const statusStr = c.traffic_light === 'red' ? 'Excedido' : c.traffic_light === 'yellow' ? 'Alerta' : 'En rango';

      return [c.category_name, formatCurrencyAmount(cLim, cur), formatCurrencyAmount(cSpent, cur), formatCurrencyAmount(cRem, cur), cPct, statusStr];
    });

    tables.push({
      sheetName: sanitizeSheetName('Categorías'),
      title: `Categorías de ${b.name}`,
      headers: ['Categoría', `Límite (${cur})`, `Gastado (${cur})`, `Disponible (${cur})`, '% Usado', 'Estado'],
      rows: catRows,
    });
  }

  // Table 2: Expenses in subbudget categories
  if (config.includeTransactions !== false && expenses && expenses.length > 0) {
    const subExpenses = expenses.filter((e) => subCategoryNames.has(e.category));
    if (subExpenses.length > 0) {
      const includeOrig = Boolean(config.includeOriginalCurrency);
      const headers = includeOrig
        ? ['Fecha', 'Descripción', 'Categoría', `Monto (${cur})`, 'Monto Original', 'Moneda Original', 'Tasa']
        : ['Fecha', 'Descripción', 'Categoría', `Monto (${cur})`];

      const sortedExp = [...subExpenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      const rows: (string | number)[][] = sortedExp.map((exp) => {
        const converted = convertItemAmountToMainCurrency(exp, cur, rates);
        const formattedConverted = formatCurrencyAmount(converted, cur);
        if (!includeOrig) {
          return [exp.date || '', exp.description || '-', exp.category || '-', formattedConverted];
        }
        const formattedOrig = formatCurrencyAmount(exp.amount, exp.currency);
        const origCur = getCurrencyLabel(exp.currency) || exp.currency;
        const rateVal = resolveItemRate(exp, rates);
        const rateStr = rateVal ? Number(rateVal).toFixed(2) : '-';
        return [exp.date || '', exp.description || '-', exp.category || '-', formattedConverted, formattedOrig, origCur, rateStr];
      });

      tables.push({
        sheetName: sanitizeSheetName('Gastos'),
        title: `Gastos Imputados a ${b.name}`,
        headers,
        rows,
      });
    }
  }

  return {
    filenameBase: sanitizeFilename(`subpresupuesto-${b.name}-${b.month_year}`),
    title: `Subpresupuesto: ${b.name} (${b.month_year})`,
    subtitle: b.is_shared ? `Compartido con: ${b.shared_partner_name || 'Pana'}` : 'Presupuesto personal',
    currency: cur,
    headerCards,
    tables,
    svgElements,
  };
}

// -------------------------------------------------------------
// 6. FIXED EXPENSES AND ESTIMATED INCOME DOCUMENT
// -------------------------------------------------------------
export interface BuildFixedAndIncomeOptions {
  config: ExportConfig;
  monthYear?: string;
  fixedExpenses: FixedExpense[];
  estimatedIncomes: EstimatedIncome[];
  realIncomes?: Income[];
  rates?: ExchangeRates | null;
  svgElements?: SVGSVGElement[];
}

export function buildFixedAndIncomeDocument(
  arg1: BuildFixedAndIncomeOptions | ExportConfig,
  arg2?: FixedExpense[],
  arg3?: EstimatedIncome[],
  _arg4?: Income[],
  arg5?: ExchangeRates | null,
  arg6?: SVGSVGElement[],
  arg7?: string
): NormalizedExportDocument {
  const isOptions = 'fixedExpenses' in arg1;
  const config = isOptions ? arg1.config : (arg1 as ExportConfig);
  const fixedExpenses = isOptions ? arg1.fixedExpenses : (arg2 || []);
  const estimatedIncomes = isOptions ? arg1.estimatedIncomes : (arg3 || []);
  const rates = isOptions ? arg1.rates : arg5;
  const svgElements = isOptions ? arg1.svgElements : arg6;
  const monthYear = (isOptions ? arg1.monthYear : arg7) || config.monthYear || new Date().toISOString().slice(0, 7);

  const cur = config.currency;

  let fixedCommitted = 0;
  let fixedPaid = 0;
  const fixedRows: (string | number)[][] = [];

  fixedExpenses.forEach((fe) => {
    const estAmt = convertItemAmountToMainCurrency(fe, cur, rates);
    if (fe.is_active) {
      fixedCommitted += estAmt;
    }

    const check = fe.checks?.find((c) => c.month_year === monthYear);
    const isPaid = Boolean(check);
    const paidAmt = check
      ? convertItemAmountToMainCurrency(
          {
            amount: check.paid_amount,
            currency: check.currency,
            rate_usd_bs: check.rate_usd_bs,
            rate_eur_bs: check.rate_eur_bs,
            rate_usdt_bs: check.rate_usdt_bs,
            amount_usd: check.amount_usd,
            amount_bs: check.amount_bs,
            amount_eur: check.amount_eur,
            amount_usdt: check.amount_usdt,
          },
          cur,
          rates
        )
      : 0;
    if (isPaid) {
      fixedPaid += paidAmt;
    }

    fixedRows.push([
      fe.name,
      fe.category || '-',
      fe.payment_day ? `Día ${fe.payment_day}` : '-',
      formatCurrencyAmount(estAmt, cur),
      isPaid ? 'Pagado' : 'Pendiente',
      check?.paid_date || '-',
      isPaid ? formatCurrencyAmount(paidAmt, cur) : '-',
      check?.notes || fe.notes || '-',
    ]);
  });

  const fixedPending = Math.max(0, fixedCommitted - fixedPaid);

  let incomeEstimated = 0;
  let incomeReceived = 0;
  const incomeRows: (string | number)[][] = [];

  estimatedIncomes.forEach((ei) => {
    const estAmt = convertItemAmountToMainCurrency({ amount: ei.expected_amount, currency: ei.currency }, cur, rates);
    if (ei.is_active) {
      incomeEstimated += estAmt;
    }

    const check = ei.checks?.find((c) => c.month_year === monthYear);
    const isCollected = Boolean(check);
    const collectedAmt = check
      ? convertItemAmountToMainCurrency(
          {
            amount: check.real_amount,
            currency: check.currency,
            rate_usd_bs: check.rate_usd_bs,
            rate_eur_bs: check.rate_eur_bs,
            rate_usdt_bs: check.rate_usdt_bs,
            amount_usd: check.amount_usd,
            amount_bs: check.amount_bs,
            amount_eur: check.amount_eur,
            amount_usdt: check.amount_usdt,
          },
          cur,
          rates
        )
      : 0;

    if (isCollected) {
      incomeReceived += collectedAmt;
    }

    incomeRows.push([
      ei.name,
      ei.category || '-',
      ei.payment_day ? `Día ${ei.payment_day}` : '-',
      formatCurrencyAmount(estAmt, cur),
      isCollected ? 'Cobrado' : 'Pendiente',
      check?.payment_date || '-',
      isCollected ? formatCurrencyAmount(collectedAmt, cur) : '-',
      check?.notes || ei.notes || '-',
    ]);
  });

  const headerCards: ExportKeyValue[] = [];
  if (config.includeHeaderCard !== false) {
    headerCards.push(
      { label: 'Mes Analizado', value: monthYear },
      { label: 'Gastos Fijos Comprometidos', value: formatCurrencyAmount(fixedCommitted, cur) },
      { label: 'Gastos Fijos Pagados', value: formatCurrencyAmount(fixedPaid, cur), highlight: 'positive' },
      {
        label: 'Gastos Fijos Pendientes',
        value: formatCurrencyAmount(fixedPending, cur),
        highlight: fixedPending > 0 ? 'warning' : 'positive',
      },
      { label: 'Ingresos Estimados', value: formatCurrencyAmount(incomeEstimated, cur) },
      { label: 'Ingresos Percibidos', value: formatCurrencyAmount(incomeReceived, cur), highlight: 'positive' }
    );
  }

  const tables: ExportTableSpec[] = [
    {
      sheetName: sanitizeSheetName('Gastos Fijos'),
      title: `Checklist Gastos Fijos (${monthYear})`,
      headers: ['Nombre / Concepto', 'Categoría', 'Día Pago', `Monto Estimado (${cur})`, 'Estado', 'Fecha Pago', `Monto Pagado (${cur})`, 'Notas'],
      rows: fixedRows,
    },
    {
      sheetName: sanitizeSheetName('Ingresos'),
      title: `Checklist Ingresos Estimados (${monthYear})`,
      headers: ['Concepto / Fuente', 'Categoría', 'Día Esperado', `Monto Esperado (${cur})`, 'Estado', 'Fecha Cobro', `Monto Cobrado (${cur})`, 'Notas'],
      rows: incomeRows,
    },
  ];

  return {
    filenameBase: sanitizeFilename(`compromisos-e-ingresos-${monthYear}`),
    title: `Control Mensual: Gastos Fijos e Ingresos - ${monthYear}`,
    subtitle: 'Checklist y Monitoreo de Compromisos',
    currency: cur,
    headerCards,
    tables,
    svgElements,
  };
}

// -------------------------------------------------------------
// 6a. FIXED EXPENSES DOCUMENT
// -------------------------------------------------------------
export interface BuildFixedExpensesOptions {
  config: ExportConfig;
  fixedExpenses: FixedExpense[];
  rates?: ExchangeRates | null;
  svgElements?: SVGSVGElement[];
  monthYear?: string;
}

export function buildFixedExpensesDocument(
  arg1: BuildFixedExpensesOptions | ExportConfig,
  arg2?: FixedExpense[],
  arg3?: ExchangeRates | null,
  arg4?: SVGSVGElement[],
  arg5?: string
): NormalizedExportDocument {
  const isOptions = 'fixedExpenses' in arg1;
  const config = isOptions ? arg1.config : (arg1 as ExportConfig);
  const fixedExpenses = isOptions ? arg1.fixedExpenses : (arg2 || []);
  const rates = isOptions ? arg1.rates : arg3;
  const svgElements = isOptions ? arg1.svgElements : arg4;
  const monthYear = (isOptions ? arg1.monthYear : arg5) || config.monthYear || new Date().toISOString().slice(0, 7);

  const cur = config.currency;

  let fixedCommitted = 0;
  let fixedPaid = 0;
  const fixedRows: (string | number)[][] = [];

  fixedExpenses.forEach((fe) => {
    const estAmt = convertItemAmountToMainCurrency(fe, cur, rates);
    if (fe.is_active) {
      fixedCommitted += estAmt;
    }

    const check = fe.checks?.find((c) => c.month_year === monthYear);
    const isPaid = Boolean(check);
    const paidAmt = check
      ? convertItemAmountToMainCurrency(
          {
            amount: check.paid_amount,
            currency: check.currency,
            rate_usd_bs: check.rate_usd_bs,
            rate_eur_bs: check.rate_eur_bs,
            rate_usdt_bs: check.rate_usdt_bs,
            amount_usd: check.amount_usd,
            amount_bs: check.amount_bs,
            amount_eur: check.amount_eur,
            amount_usdt: check.amount_usdt,
          },
          cur,
          rates
        )
      : 0;
    if (isPaid) {
      fixedPaid += paidAmt;
    }

    fixedRows.push([
      fe.name,
      fe.category || '-',
      fe.payment_day ? `Día ${fe.payment_day}` : '-',
      formatCurrencyAmount(estAmt, cur),
      isPaid ? 'Pagado' : 'Pendiente',
      check?.paid_date || '-',
      isPaid ? formatCurrencyAmount(paidAmt, cur) : '-',
      check?.notes || fe.notes || '-',
    ]);
  });

  const fixedPending = Math.max(0, fixedCommitted - fixedPaid);
  const pctPaid = fixedCommitted > 0 ? (fixedPaid / fixedCommitted) * 100 : 0;

  const headerCards: ExportKeyValue[] = [];
  if (config.includeHeaderCard !== false) {
    headerCards.push(
      { label: 'Mes Analizado', value: monthYear },
      { label: 'Total Comprometido', value: formatCurrencyAmount(fixedCommitted, cur) },
      { label: 'Total Pagado', value: formatCurrencyAmount(fixedPaid, cur), highlight: 'positive' },
      {
        label: 'Saldo Pendiente',
        value: formatCurrencyAmount(fixedPending, cur),
        highlight: fixedPending > 0 ? 'warning' : 'positive',
      },
      {
        label: '% Pagado',
        value: `${pctPaid.toFixed(1)}%`,
        highlight: pctPaid >= 100 ? 'positive' : 'neutral',
      }
    );
  }

  const tables: ExportTableSpec[] = [
    {
      sheetName: sanitizeSheetName('Gastos Fijos'),
      title: `Checklist de Gastos Fijos (${monthYear})`,
      headers: ['Concepto / Nombre', 'Categoría', 'Día Vencimiento', `Monto Estimado (${cur})`, 'Estado', 'Fecha de Pago', `Monto Pagado (${cur})`, 'Notas'],
      rows: fixedRows,
    },
  ];

  return {
    filenameBase: sanitizeFilename(`gastos-fijos-${monthYear}`),
    title: `Control Mensual: Gastos Fijos - ${monthYear}`,
    subtitle: 'Checklist y Monitoreo de Compromisos Fijos Recurrentes',
    currency: cur,
    headerCards,
    tables,
    svgElements,
  };
}

// -------------------------------------------------------------
// 6b. ESTIMATED INCOME DOCUMENT
// -------------------------------------------------------------
export interface BuildEstimatedIncomeOptions {
  config: ExportConfig;
  estimatedIncomes: EstimatedIncome[];
  rates?: ExchangeRates | null;
  svgElements?: SVGSVGElement[];
  monthYear?: string;
}

export function buildEstimatedIncomeDocument(
  arg1: BuildEstimatedIncomeOptions | ExportConfig,
  arg2?: EstimatedIncome[],
  arg3?: ExchangeRates | null,
  arg4?: SVGSVGElement[],
  arg5?: string
): NormalizedExportDocument {
  const isOptions = 'estimatedIncomes' in arg1;
  const config = isOptions ? arg1.config : (arg1 as ExportConfig);
  const estimatedIncomes = isOptions ? arg1.estimatedIncomes : (arg2 || []);
  const rates = isOptions ? arg1.rates : arg3;
  const svgElements = isOptions ? arg1.svgElements : arg4;
  const monthYear = (isOptions ? arg1.monthYear : arg5) || config.monthYear || new Date().toISOString().slice(0, 7);

  const cur = config.currency;

  let incomeEstimated = 0;
  let incomeReceived = 0;
  const incomeRows: (string | number)[][] = [];

  estimatedIncomes.forEach((ei) => {
    const estAmt = convertItemAmountToMainCurrency({ amount: ei.expected_amount, currency: ei.currency }, cur, rates);
    if (ei.is_active) {
      incomeEstimated += estAmt;
    }

    const check = ei.checks?.find((c) => c.month_year === monthYear);
    const isCollected = Boolean(check);
    const collectedAmt = check
      ? convertItemAmountToMainCurrency(
          {
            amount: check.real_amount,
            currency: check.currency,
            rate_usd_bs: check.rate_usd_bs,
            rate_eur_bs: check.rate_eur_bs,
            rate_usdt_bs: check.rate_usdt_bs,
            amount_usd: check.amount_usd,
            amount_bs: check.amount_bs,
            amount_eur: check.amount_eur,
            amount_usdt: check.amount_usdt,
          },
          cur,
          rates
        )
      : 0;

    if (isCollected) {
      incomeReceived += collectedAmt;
    }

    incomeRows.push([
      ei.name,
      ei.category || '-',
      ei.payment_day ? `Día ${ei.payment_day}` : '-',
      formatCurrencyAmount(estAmt, cur),
      isCollected ? 'Cobrado' : 'Pendiente',
      check?.payment_date || '-',
      isCollected ? formatCurrencyAmount(collectedAmt, cur) : '-',
      check?.notes || ei.notes || '-',
    ]);
  });

  const incomePending = Math.max(0, incomeEstimated - incomeReceived);
  const pctCollected = incomeEstimated > 0 ? (incomeReceived / incomeEstimated) * 100 : 0;

  const headerCards: ExportKeyValue[] = [];
  if (config.includeHeaderCard !== false) {
    headerCards.push(
      { label: 'Mes Analizado', value: monthYear },
      { label: 'Total Estimado', value: formatCurrencyAmount(incomeEstimated, cur) },
      { label: 'Total Cobrado', value: formatCurrencyAmount(incomeReceived, cur), highlight: 'positive' },
      {
        label: 'Saldo Pendiente',
        value: formatCurrencyAmount(incomePending, cur),
        highlight: incomePending > 0 ? 'warning' : 'positive',
      },
      {
        label: '% Cobrado',
        value: `${pctCollected.toFixed(1)}%`,
        highlight: pctCollected >= 100 ? 'positive' : 'neutral',
      }
    );
  }

  const tables: ExportTableSpec[] = [
    {
      sheetName: sanitizeSheetName('Ingresos'),
      title: `Checklist de Ingresos Mensuales (${monthYear})`,
      headers: ['Concepto / Fuente', 'Categoría', 'Día Esperado', `Monto Esperado (${cur})`, 'Estado', 'Fecha Cobro', `Monto Cobrado (${cur})`, 'Notas'],
      rows: incomeRows,
    },
  ];

  return {
    filenameBase: sanitizeFilename(`ingresos-mensuales-${monthYear}`),
    title: `Control Mensual: Ingresos Estimados - ${monthYear}`,
    subtitle: 'Checklist y Monitoreo de Cobros e Ingresos Mensuales',
    currency: cur,
    headerCards,
    tables,
    svgElements,
  };
}
