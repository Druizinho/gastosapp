import type { MainCurrencyPreference, RangeSummaryResponse, ExchangeRates, BudgetCategorySummaryOut, BCVRate } from '../types';

export interface CurrencyConfig {
  code: MainCurrencyPreference;
  label: string;
  name: string;
  badgeText: string;
  badgeBg: string;
  badgeColor: string;
  symbol: string;
  locale: string;
  heroTitle: string;
}

export const ORDERED_CURRENCIES: MainCurrencyPreference[] = ['USD', 'BS', 'EUR', 'USDT'];

export const CURRENCY_CONFIGS: Record<MainCurrencyPreference, CurrencyConfig> = {
  USD: {
    code: 'USD',
    label: 'USD',
    name: 'Dólares (BCV)',
    badgeText: '$',
    badgeBg: '#10B981',
    badgeColor: '#FFFFFF',
    symbol: '$',
    locale: 'en-US',
    heroTitle: 'Gastos totales (dólares tasa BCV)',
  },
  BS: {
    code: 'BS',
    label: 'VES',
    name: 'Bolívares',
    badgeText: 'Bs',
    badgeBg: '#EF4444',
    badgeColor: '#FFFFFF',
    symbol: 'Bs',
    locale: 'es-VE',
    heroTitle: 'Gastos totales (Bolívares)',
  },
  EUR: {
    code: 'EUR',
    label: 'EUR',
    name: 'Euros',
    badgeText: '€',
    badgeBg: '#3B82F6',
    badgeColor: '#FFFFFF',
    symbol: '€',
    locale: 'es-VE',
    heroTitle: 'Gastos totales (euros tasa BCV)',
  },
  USDT: {
    code: 'USDT',
    label: 'USDT',
    name: 'Tether (Crypto)',
    badgeText: '₮',
    badgeBg: '#FACC15',
    badgeColor: '#1F2937',
    symbol: '$',
    locale: 'en-US',
    heroTitle: 'Gastos totales (USDT Binance)',
  },
};

const SUB_CURRENCY_MAP: Record<MainCurrencyPreference, MainCurrencyPreference[]> = {
  USD: ['BS', 'EUR', 'USDT'],
  BS: ['USD', 'EUR', 'USDT'],
  EUR: ['USD', 'BS', 'USDT'],
  USDT: ['USD', 'EUR', 'BS'],
};

export function getFilteredSubCurrencies(mainCurrency: MainCurrencyPreference): MainCurrencyPreference[] {
  return SUB_CURRENCY_MAP[mainCurrency] || ORDERED_CURRENCIES.filter(c => c !== mainCurrency);
}

export function formatCurrency(val: number, currency: MainCurrencyPreference): string {
  const safeVal = isNaN(val) || !isFinite(val) ? 0 : val;
  const config = CURRENCY_CONFIGS[currency] || CURRENCY_CONFIGS.USD;
  
  // Bolívares optimization: omit decimals when val >= 100 or when decimals are 0
  const isBs = currency === 'BS';
  const hasNoDecimals = Math.abs(safeVal % 1) < 0.001;
  const omitDecimals = isBs && (Math.abs(safeVal) >= 100 || hasNoDecimals);
  const fractionDigits = omitDecimals ? 0 : 2;

  const formatted = safeVal.toLocaleString(config.locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  switch (currency) {
    case 'USD':
      return `$${formatted}`;
    case 'BS':
      return `Bs ${formatted}`;
    case 'EUR':
      return `€ ${formatted}`;
    case 'USDT':
      return ` $ ${formatted}`;
    default:
      return `${config.symbol} ${formatted}`;
  }
}

export function formatSignedCurrency(val: number, currency: MainCurrencyPreference): string {
  const formatted = formatCurrency(Math.abs(val), currency);
  if (val > 0) return `+${formatted}`;
  if (val < 0) return `-${formatted}`;
  return formatted;
}

export function resolveCurrencyTotal(
  summary: { total_usd?: number | null; total_bs?: number | null; total_eur?: number | null; total_usdt?: number | null } | null | undefined,
  currency: MainCurrencyPreference,
  rates?: ExchangeRates | null
): number {
  if (!summary) return 0;

  const totalUsd = Number(summary.total_usd) || 0;
  const totalBs = Number(summary.total_bs) || 0;
  const totalEur = Number(summary.total_eur) || 0;
  const totalUsdt = Number(summary.total_usdt) || 0;

  switch (currency) {
    case 'USD': {
      if (totalUsd > 0) return totalUsd;
      if (rates?.usd_bs && rates.usd_bs > 0 && totalBs > 0) return totalBs / rates.usd_bs;
      return totalUsd;
    }
    case 'BS': {
      if (totalBs > 0) return totalBs;
      if (rates?.usd_bs && rates.usd_bs > 0 && totalUsd > 0) return totalUsd * rates.usd_bs;
      return totalBs;
    }
    case 'EUR': {
      if (totalEur > 0) return totalEur;
      if (rates?.eur_bs && rates.eur_bs > 0 && totalBs > 0) return totalBs / rates.eur_bs;
      return totalEur;
    }
    case 'USDT': {
      if (totalUsdt > 0) return totalUsdt;
      if (rates?.usdt_bs && rates.usdt_bs > 0 && totalBs > 0) return totalBs / rates.usdt_bs;
      if (totalUsd > 0) return totalUsd;
      return totalUsdt;
    }
  }
}

export function resolveIncomeTotal(
  summary: RangeSummaryResponse | { income_total_usd?: number | null; income_total_bs?: number | null; income_total_eur?: number | null; income_total_usdt?: number | null } | null | undefined,
  currency: MainCurrencyPreference,
  rates?: BCVRate | null
): number {
  if (!summary) return 0;

  const totalUsd = Number(summary.income_total_usd) || 0;
  const totalBs = Number(summary.income_total_bs) || 0;
  const totalEur = Number(summary.income_total_eur) || 0;
  const totalUsdt = Number(summary.income_total_usdt) || 0;

  switch (currency) {
    case 'USD': {
      if (totalUsd > 0) return totalUsd;
      if (rates?.usd_bs && rates.usd_bs > 0 && totalBs > 0) return totalBs / rates.usd_bs;
      return totalUsd;
    }
    case 'BS': {
      if (totalBs > 0) return totalBs;
      if (rates?.usd_bs && rates.usd_bs > 0 && totalUsd > 0) return totalUsd * rates.usd_bs;
      return totalBs;
    }
    case 'EUR': {
      if (totalEur > 0) return totalEur;
      if (rates?.eur_bs && rates.eur_bs > 0 && totalBs > 0) return totalBs / rates.eur_bs;
      return totalEur;
    }
    case 'USDT': {
      if (totalUsdt > 0) return totalUsdt;
      if (rates?.usdt_bs && rates.usdt_bs > 0 && totalBs > 0) return totalBs / rates.usdt_bs;
      if (totalUsd > 0) return totalUsd;
      return totalUsdt;
    }
  }
}

export function resolveBalanceTotal(
  summary: RangeSummaryResponse | null | undefined,
  currency: MainCurrencyPreference,
  rates?: BCVRate | null
): number {
  if (!summary) return 0;

  let balanceVal: number | undefined | null;
  switch (currency) {
    case 'USD':
      balanceVal = summary.balance_usd;
      break;
    case 'BS':
      balanceVal = summary.balance_bs;
      break;
    case 'EUR':
      balanceVal = summary.balance_eur;
      break;
    case 'USDT':
      balanceVal = summary.balance_usdt;
      break;
  }

  if (balanceVal !== undefined && balanceVal !== null && !isNaN(Number(balanceVal))) {
    return Number(balanceVal);
  }

  return resolveIncomeTotal(summary, currency, rates) - resolveCurrencyTotal(summary, currency, rates);
}

export function resolveCategoryTotal(
  cat: { total_usd?: number | null; total_bs?: number | null; total_eur?: number | null; total_usdt?: number | null } | null | undefined,
  currency: MainCurrencyPreference
): number {
  if (!cat) return 0;
  let val = 0;
  switch (currency) {
    case 'USD':
      val = Number(cat.total_usd) || 0;
      break;
    case 'BS':
      val = Number(cat.total_bs) || 0;
      break;
    case 'EUR':
      val = Number(cat.total_eur) || 0;
      break;
    case 'USDT':
      val = Number(cat.total_usdt) || 0;
      break;
  }
  return isNaN(val) ? 0 : val;
}

export function resolveDailyAvg(
  summary: RangeSummaryResponse | null | undefined,
  currency: MainCurrencyPreference
): number {
  if (!summary) return 0;
  let val = 0;
  switch (currency) {
    case 'USD':
      val = Number(summary.daily_avg_usd) || 0;
      break;
    case 'BS':
      val = Number(summary.daily_avg_bs) || 0;
      break;
    case 'EUR':
      val = Number(summary.daily_avg_eur) || 0;
      break;
    case 'USDT':
      val = Number(summary.daily_avg_usdt) || 0;
      break;
  }
  return isNaN(val) ? 0 : val;
}

export function resolveBudgetCategoryLimit(
  cl: BudgetCategorySummaryOut | null | undefined,
  currency: MainCurrencyPreference
): number {
  if (!cl) return 0;
  switch (currency) {
    case 'USD':
      return Number(cl.limit_usd) || 0;
    case 'BS':
      return Number(cl.limit_bs) || 0;
    case 'EUR':
      return Number(cl.limit_eur) || 0;
    case 'USDT':
      return Number(cl.limit_usdt) || 0;
    default:
      return Number(cl.limit_amount) || 0;
  }
}
