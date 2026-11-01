import type { CurrencyType } from '../../types';

export type DisplayCurrency = 'usd' | 'bs' | 'eur' | 'usdt';
export type SubBudgetTab = 'all' | 'own' | 'shared';

export const currencyLabels: Record<string, string> = {
  USD_BCV: '$',
  EUR_BCV: '€',
  BS: 'Bs.',
  USDT: 'USDT',
  USD_CASH: '$ Cash',
};

export const CURRENCY_OPTIONS: { value: CurrencyType; label: string }[] = [
  { value: 'USD_BCV', label: 'USD (Tasa BCV)' },
  { value: 'BS', label: 'Bolívares (Bs)' },
  { value: 'USD_CASH', label: 'USD (Efectivo / Paralelo)' },
  { value: 'EUR_BCV', label: 'EUR (Tasa BCV)' },
  { value: 'USDT', label: 'USDT (Binance)' },
];

export const formatAmount = (amount: number | null | undefined, prefix: string = ''): string => {
  if (amount === null || amount === undefined) return '—';
  return `${prefix}${Number(amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const prefixMap: Record<DisplayCurrency, string> = {
  bs: 'Bs. ',
  usd: '$ ',
  eur: '€ ',
  usdt: '',
};

export const suffixMap: Record<DisplayCurrency, string> = {
  bs: '',
  usd: '',
  eur: '',
  usdt: ' USDT',
};
