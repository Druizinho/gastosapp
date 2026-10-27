import type { CurrencyType, MainCurrencyPreference, ExchangeRates } from '../types';

export function toNumeric(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const parsed = Number(val);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatCurrencyAmount(
  amount: number | string | null | undefined,
  currency: CurrencyType | MainCurrencyPreference | string
): string {
  const val = toNumeric(amount);
  const cur = (currency || 'USD').toUpperCase();

  switch (cur) {
    case 'USD':
    case 'USD_BCV':
      return `$ ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'USD_CASH':
      return `$ Efectivo ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'EUR':
    case 'EUR_BCV':
      return `€ ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'USDT':
      return `${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
    case 'BS':
    case 'VES':
      return `Bs. ${val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    default:
      return `${cur} ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function isSameCurrency(itemCurrency: string, mainCurrency: MainCurrencyPreference): boolean {
  const cur = (itemCurrency || '').toUpperCase();
  if (mainCurrency === 'USD') return cur === 'USD' || cur === 'USD_BCV';
  if (mainCurrency === 'BS') return cur === 'BS' || cur === 'VES';
  if (mainCurrency === 'EUR') return cur === 'EUR' || cur === 'EUR_BCV';
  if (mainCurrency === 'USDT') return cur === 'USDT';
  return false;
}

export function convertItemAmountToMainCurrency(
  item: {
    amount: number | string;
    currency: string;
    amount_usd?: number | string | null;
    amount_bs?: number | string | null;
    amount_eur?: number | string | null;
    amount_usdt?: number | string | null;
  },
  mainCurrency: MainCurrencyPreference,
  rates?: ExchangeRates | null
): number {
  const amount = toNumeric(item?.amount);
  const cur = (item?.currency || 'USD').toUpperCase();
  const rUsd = toNumeric(rates?.usd_bs);
  const rEur = toNumeric(rates?.eur_bs);
  const rUsdt = toNumeric(rates?.usdt_bs);
  const maxRefRate = Math.max(rUsd, rEur, rUsdt);

  // If item is already in matching currency
  if (isSameCurrency(cur, mainCurrency)) {
    return amount;
  }

  // 1. Target: USD
  if (mainCurrency === 'USD') {
    if (cur === 'USD_CASH') {
      const amtUsd = toNumeric(item.amount_usd);
      if (amtUsd > 0) {
        return amtUsd;
      }
      const amtBs = toNumeric(item.amount_bs) || (amount * (maxRefRate > 0 ? maxRefRate : rUsd));
      if (rUsd > 0) {
        return amtBs / rUsd;
      }
      return amount;
    }
    if (item.amount_usd != null && !isNaN(Number(item.amount_usd))) {
      return Number(item.amount_usd);
    }
    if (cur === 'USD' || cur === 'USD_BCV') {
      return amount;
    }
    if (cur === 'BS' || cur === 'VES') {
      if (rUsd > 0) {
        return amount / rUsd;
      }
      return 0;
    }
    if (cur === 'EUR' || cur === 'EUR_BCV') {
      if (item.amount_bs != null && rUsd > 0) {
        return Number(item.amount_bs) / rUsd;
      }
      if (rEur > 0 && rUsd > 0) {
        return (amount * rEur) / rUsd;
      }
      return amount; // approximate 1:1 if missing
    }
    if (cur === 'USDT') {
      if (item.amount_bs != null && rUsd > 0) {
        return Number(item.amount_bs) / rUsd;
      }
      if (rUsdt > 0 && rUsd > 0) {
        return (amount * rUsdt) / rUsd;
      }
      return amount; // 1 USDT ≈ 1 USD
    }
    return amount;
  }

  // 2. Target: BS
  if (mainCurrency === 'BS') {
    if (item.amount_bs != null && !isNaN(Number(item.amount_bs))) {
      return Number(item.amount_bs);
    }
    if (cur === 'BS' || cur === 'VES') {
      return amount;
    }
    if (cur === 'USD_CASH') {
      const highestRate = maxRefRate > 0 ? maxRefRate : rUsd;
      if (highestRate > 0) {
        return amount * highestRate;
      }
      return 0;
    }
    if (cur === 'USD' || cur === 'USD_BCV') {
      if (rUsd > 0) {
        return amount * rUsd;
      }
      return 0;
    }
    if (cur === 'EUR' || cur === 'EUR_BCV') {
      if (rEur > 0) {
        return amount * rEur;
      }
      if (rUsd > 0) {
        return amount * rUsd;
      }
      return 0;
    }
    if (cur === 'USDT') {
      if (rUsdt > 0) {
        return amount * rUsdt;
      }
      if (rUsd > 0) {
        return amount * rUsd;
      }
      return 0;
    }
    return 0;
  }

  // 3. Target: EUR
  if (mainCurrency === 'EUR') {
    if (item.amount_eur != null && !isNaN(Number(item.amount_eur))) {
      return Number(item.amount_eur);
    }
    if (cur === 'EUR' || cur === 'EUR_BCV') {
      return amount;
    }
    // Calculate BS amount first
    const bsAmount = item.amount_bs != null && !isNaN(Number(item.amount_bs))
      ? Number(item.amount_bs)
      : convertItemAmountToMainCurrency(item, 'BS', rates);
    if (rates?.eur_bs && Number(rates.eur_bs) > 0) {
      return bsAmount / Number(rates.eur_bs);
    }
    // Fallback: convert through USD
    if (rates?.usd_bs && Number(rates.usd_bs) > 0) {
      return bsAmount / Number(rates.usd_bs);
    }
    return amount;
  }

  // 4. Target: USDT
  if (mainCurrency === 'USDT') {
    if (item.amount_usdt != null && !isNaN(Number(item.amount_usdt))) {
      return Number(item.amount_usdt);
    }
    if (cur === 'USDT') {
      return amount;
    }
    // Calculate BS amount first
    const bsAmount = item.amount_bs != null && !isNaN(Number(item.amount_bs))
      ? Number(item.amount_bs)
      : convertItemAmountToMainCurrency(item, 'BS', rates);
    if (rates?.usdt_bs && Number(rates.usdt_bs) > 0) {
      return bsAmount / Number(rates.usdt_bs);
    }
    if (rates?.usd_bs && Number(rates.usd_bs) > 0) {
      return bsAmount / Number(rates.usd_bs);
    }
    return amount;
  }

  return amount;
}

export function formatListCardAmounts(
  item: {
    amount: number | string;
    currency: string;
    amount_bs?: number | string | null;
    amount_usd?: number | string | null;
    amount_eur?: number | string | null;
    amount_usdt?: number | string | null;
  },
  mainCurrency: MainCurrencyPreference,
  rates?: ExchangeRates | null,
  targetCurrencyOverride?: { amountInTarget: number | string; targetCurrency: string }
): { primaryAmount: string; secondaryAmount: string; isOriginalSameAsMain: boolean } {
  const converted = convertItemAmountToMainCurrency(item, mainCurrency, rates);
  const primaryAmount = formatCurrencyAmount(converted, mainCurrency);
  const isOriginalSameAsMain = isSameCurrency(item.currency, mainCurrency);

  let secondaryAmount = '';
  if (!isOriginalSameAsMain) {
    secondaryAmount = `Orig: ${formatCurrencyAmount(toNumeric(item.amount), item.currency)}`;
    if (targetCurrencyOverride && targetCurrencyOverride.targetCurrency !== item.currency) {
      secondaryAmount += ` · ${formatCurrencyAmount(toNumeric(targetCurrencyOverride.amountInTarget), targetCurrencyOverride.targetCurrency)}`;
    }
  } else {
    if (mainCurrency === 'BS') {
      const amountUsd = item.amount_usd != null && !isNaN(Number(item.amount_usd))
        ? Number(item.amount_usd)
        : convertItemAmountToMainCurrency(item, 'USD', rates);
      secondaryAmount = `$ ${amountUsd.toFixed(2)} BCV`;
    } else {
      const amountBs = item.amount_bs != null && !isNaN(Number(item.amount_bs))
        ? Number(item.amount_bs)
        : convertItemAmountToMainCurrency(item, 'BS', rates);
      secondaryAmount = `Bs. ${amountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  return {
    primaryAmount,
    secondaryAmount,
    isOriginalSameAsMain,
  };
}

export function getHistoricalRateDisplay(
  item: {
    currency: string;
    amount?: number | string;
    amount_bs?: number | string | null;
    rate_usd_bs?: number | string | null;
    rate_eur_bs?: number | string | null;
    rate_usdt_bs?: number | string | null;
  },
  fallbackRates?: ExchangeRates | null
): { label: string; valueText: string; secondaryRateText?: string; isHistorical: boolean } {
  const cur = (item?.currency || 'USD').toUpperCase();
  const amt = toNumeric(item?.amount);
  const amtBs = item?.amount_bs != null && !isNaN(Number(item.amount_bs)) ? Number(item.amount_bs) : null;

  // Derive historical USD rate
  let usdRate: number | null = item?.rate_usd_bs != null && !isNaN(Number(item.rate_usd_bs)) ? Number(item.rate_usd_bs) : null;
  if (usdRate == null && (cur === 'USD' || cur === 'USD_BCV') && amt > 0 && amtBs != null) {
    usdRate = amtBs / amt;
  }
  const isUsdHistorical = usdRate != null && usdRate > 0;
  if (!usdRate && fallbackRates?.usd_bs) {
    usdRate = Number(fallbackRates.usd_bs);
  }

  // Derive historical EUR rate
  let eurRate: number | null = item?.rate_eur_bs != null && !isNaN(Number(item.rate_eur_bs)) ? Number(item.rate_eur_bs) : null;
  if (eurRate == null && (cur === 'EUR' || cur === 'EUR_BCV') && amt > 0 && amtBs != null) {
    eurRate = amtBs / amt;
  }
  const isEurHistorical = eurRate != null && eurRate > 0;
  if (!eurRate && fallbackRates?.eur_bs) {
    eurRate = Number(fallbackRates.eur_bs);
  }

  // Derive historical USDT rate
  let usdtRate: number | null = item?.rate_usdt_bs != null && !isNaN(Number(item.rate_usdt_bs)) ? Number(item.rate_usdt_bs) : null;
  if (usdtRate == null && cur === 'USDT' && amt > 0 && amtBs != null) {
    usdtRate = amtBs / amt;
  }
  const isUsdtHistorical = usdtRate != null && usdtRate > 0;
  if (!usdtRate && fallbackRates?.usdt_bs) {
    usdtRate = Number(fallbackRates.usdt_bs);
  }

  if (cur === 'EUR' || cur === 'EUR_BCV') {
    const rateVal = eurRate || 0;
    const isHistorical = isEurHistorical;
    const label = isHistorical ? 'Tasa Euro BCV registrada' : 'Tasa Euro BCV';
    const valueText = rateVal > 0 ? `Bs. ${rateVal.toFixed(2)} / €` : 'N/D';
    const secondaryRateText = usdRate && usdRate > 0 ? `Tasa USD: Bs. ${usdRate.toFixed(2)} / $` : undefined;
    return { label, valueText, secondaryRateText, isHistorical };
  }

  if (cur === 'USDT') {
    const rateVal = usdtRate || 0;
    const isHistorical = isUsdtHistorical;
    const label = isHistorical ? 'Tasa USDT registrada' : 'Tasa USDT';
    const valueText = rateVal > 0 ? `Bs. ${rateVal.toFixed(2)} / USDT` : 'N/D';
    const secondaryRateText = usdRate && usdRate > 0 ? `Tasa USD: Bs. ${usdRate.toFixed(2)} / $` : undefined;
    return { label, valueText, secondaryRateText, isHistorical };
  }

  if (cur === 'USD_CASH') {
    let effRate: number | null = null;
    let isHistorical = false;

    if (amt > 0 && amtBs != null && amtBs > 0) {
      effRate = amtBs / amt;
      isHistorical = true;
    } else {
      const histUsd = item?.rate_usd_bs != null && !isNaN(Number(item.rate_usd_bs)) ? Number(item.rate_usd_bs) : null;
      const histEur = item?.rate_eur_bs != null && !isNaN(Number(item.rate_eur_bs)) ? Number(item.rate_eur_bs) : null;
      const histUsdt = item?.rate_usdt_bs != null && !isNaN(Number(item.rate_usdt_bs)) ? Number(item.rate_usdt_bs) : null;
      const validHist = [histUsd, histEur, histUsdt].filter((r): r is number => r != null && r > 0);
      if (validHist.length > 0) {
        effRate = Math.max(...validHist);
        isHistorical = true;
      } else {
        const fbUsd = toNumeric(fallbackRates?.usd_bs);
        const fbEur = toNumeric(fallbackRates?.eur_bs);
        const fbUsdt = toNumeric(fallbackRates?.usdt_bs);
        const validFb = [fbUsd, fbEur, fbUsdt].filter(r => r > 0);
        if (validFb.length > 0) {
          effRate = Math.max(...validFb);
          isHistorical = false;
        }
      }
    }

    const refUsd = (item?.rate_usd_bs != null && Number(item.rate_usd_bs) > 0)
      ? Number(item.rate_usd_bs)
      : (fallbackRates?.usd_bs ? Number(fallbackRates.usd_bs) : null);

    const rateVal = effRate || 0;
    const label = isHistorical ? 'Tasa Efectivo registrada' : 'Tasa Efectivo';
    const valueText = rateVal > 0 ? `Bs. ${rateVal.toFixed(2)} / $` : 'N/D';
    const secondaryRateText = refUsd && refUsd > 0 ? `BCV ref: Bs. ${refUsd.toFixed(2)} / $` : undefined;

    return { label, valueText, secondaryRateText, isHistorical };
  }

  if (cur === 'BS' || cur === 'VES') {
    const rateVal = usdRate || 0;
    const isHistorical = isUsdHistorical;
    const label = isHistorical ? 'Tasa BCV de ref. registrada' : 'Tasa BCV de referencia';
    const valueText = rateVal > 0 ? `Bs. ${rateVal.toFixed(2)} / $` : 'N/D';
    return { label, valueText, isHistorical };
  }

  // Default: USD / USD_BCV
  const rateVal = usdRate || 0;
  const isHistorical = isUsdHistorical;
  const label = isHistorical ? 'Tasa BCV registrada' : 'Tasa BCV';
  const valueText = rateVal > 0 ? `Bs. ${rateVal.toFixed(2)} / $` : 'N/D';
  return { label, valueText, isHistorical };
}

export function formatAmountForInput(value: number | string | null | undefined): string {
  if (value == null || value === '') return '';
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (isNaN(num) || num === 0) return '';
  const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
  return rounded.toString();
}

export function formatRateForInput(value: number | string | null | undefined): string {
  if (value == null || value === '') return '';
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (isNaN(num) || num === 0) return '';
  const rounded = Math.round((num + Number.EPSILON) * 10000) / 10000;
  return rounded.toString();
}

