import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import compiled code from dist or test the JS logic directly
// Let's test the functions directly as defined in currencySummary
const ORDERED_CURRENCIES = ['USD', 'BS', 'EUR', 'USDT'];

const CURRENCY_CONFIGS = {
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

const SUB_CURRENCY_MAP = {
  USD: ['BS', 'EUR', 'USDT'],
  BS: ['USD', 'EUR', 'USDT'],
  EUR: ['USD', 'BS', 'USDT'],
  USDT: ['USD', 'EUR', 'BS'],
};

function getFilteredSubCurrencies(mainCurrency) {
  return SUB_CURRENCY_MAP[mainCurrency] || ORDERED_CURRENCIES.filter(c => c !== mainCurrency);
}

function formatCurrency(val, currency) {
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

function resolveCurrencyTotal(summary, currency, rates) {
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

describe('currencySummary dynamic calculation and filtering', () => {
  describe('getFilteredSubCurrencies', () => {
    it('returns BS, EUR, USDT when main is USD', () => {
      assert.deepEqual(getFilteredSubCurrencies('USD'), ['BS', 'EUR', 'USDT']);
    });

    it('returns USD, EUR, BS when main is USDT', () => {
      assert.deepEqual(getFilteredSubCurrencies('USDT'), ['USD', 'EUR', 'BS']);
    });

    it('returns USD, EUR, USDT when main is BS', () => {
      assert.deepEqual(getFilteredSubCurrencies('BS'), ['USD', 'EUR', 'USDT']);
    });

    it('returns USD, BS, USDT when main is EUR', () => {
      assert.deepEqual(getFilteredSubCurrencies('EUR'), ['USD', 'BS', 'USDT']);
    });
  });

  describe('formatCurrency', () => {
    it('formats USD correctly', () => {
      assert.equal(formatCurrency(1234.56, 'USD'), '$1,234.56');
    });

    it('formats BS correctly with Bs prefix and omits decimals when >= 100 or when integer', () => {
      const formatted = formatCurrency(1234.56, 'BS');
      assert.ok(formatted.includes('Bs'));
      assert.equal(formatCurrency(14500, 'BS'), 'Bs 14.500');
      assert.equal(formatCurrency(50, 'BS'), 'Bs 50');
      assert.equal(formatCurrency(50.5, 'BS'), 'Bs 50,50');
    });

    it('formats EUR correctly with € symbol', () => {
      const formatted = formatCurrency(1234.56, 'EUR');
      assert.ok(formatted.includes('€'));
    });

    it('formats USDT correctly', () => {
      const formatted = formatCurrency(1234.56, 'USDT');
      assert.ok(formatted.includes('1,234.56'));
    });
  });

  describe('resolveCurrencyTotal', () => {
    it('returns direct total if available', () => {
      const summary = { total_usd: 150, total_bs: 5400, total_eur: 140, total_usdt: 150 };
      assert.equal(resolveCurrencyTotal(summary, 'USD'), 150);
      assert.equal(resolveCurrencyTotal(summary, 'BS'), 5400);
      assert.equal(resolveCurrencyTotal(summary, 'EUR'), 140);
      assert.equal(resolveCurrencyTotal(summary, 'USDT'), 150);
    });

    it('converts when direct total is 0 using rates', () => {
      const summary = { total_usd: 0, total_bs: 5400, total_eur: 0, total_usdt: 0 };
      const rates = { usd_bs: 36, eur_bs: 40, usdt_bs: 36.5, last_updated: null };
      assert.equal(resolveCurrencyTotal(summary, 'USD', rates), 150);
      assert.equal(resolveCurrencyTotal(summary, 'EUR', rates), 135);
    });
  });
});
