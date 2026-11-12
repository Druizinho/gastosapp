import React, { useRef, useState, useEffect } from 'react';
import type { CurrencyType, ExchangeRates } from '../../types';
import { Info } from 'lucide-react';
import { formatRateForInput } from '../../utils/currencyFormat';

export interface ExchangeRateFieldProps {
  currency: CurrencyType;
  rates: ExchangeRates | null;
  manualRate: string;
  onManualRateChange: (val: string) => void;
  isEditing?: boolean;
  hasDate?: boolean; // default true ("Tasa de la fecha:"), false for templates ("Tasa de referencia:")
  showManualRate?: boolean; // optional controlled state, or internal state initialized from Boolean(manualRate)
  onShowManualRateChange?: (show: boolean) => void;
  mode?: 'expense' | 'income';
}

export const resolveRateForCurrency = (
  currency: CurrencyType | string | null | undefined,
  rates: ExchangeRates | null
): number | undefined => {
  if (!rates || !currency) return undefined;
  if (currency === 'EUR_BCV') return rates.eur_bs ?? undefined;
  if (currency === 'USDT') return rates.usdt_bs ?? undefined;
  if (currency === 'USD_CASH') {
    const candidates = [
      Number(rates.usd_bs) || 0,
      Number(rates.eur_bs) || 0,
      Number(rates.usdt_bs) || 0,
    ].filter((r) => r > 0);
    return candidates.length > 0 ? Math.max(...candidates) : undefined;
  }
  return rates.usd_bs ?? undefined;
};

export function getInitialManualRate(item?: any): string {
  if (!item) return '';
  const baseAmount = Number(item.amount ?? item.paid_amount ?? item.target_amount ?? item.real_amount ?? 0);
  const rawCur = item.currency;
  const cur = rawCur === 'USD' ? 'USD_BCV' : rawCur === 'EUR' ? 'EUR_BCV' : rawCur === 'VES' ? 'BS' : rawCur;

  if (cur === 'EUR_BCV') {
    if (Number(item.rate_eur_bs) > 0) return formatRateForInput(item.rate_eur_bs);
    if (Number(item.amount_bs) > 0 && baseAmount > 0) return formatRateForInput(Number(item.amount_bs) / baseAmount);
  } else if (cur === 'USDT') {
    if (Number(item.rate_usdt_bs) > 0) return formatRateForInput(item.rate_usdt_bs);
    if (Number(item.amount_bs) > 0 && baseAmount > 0) return formatRateForInput(Number(item.amount_bs) / baseAmount);
  } else if (cur === 'USD_CASH') {
    if (Number(item.manual_rate) > 0) return formatRateForInput(item.manual_rate);
    if (Number(item.amount_bs) > 0 && baseAmount > 0) return formatRateForInput(Number(item.amount_bs) / baseAmount);
    if (Number(item.rate_usd_bs) > 0) return formatRateForInput(item.rate_usd_bs);
  } else if (cur === 'BS') {
    if (Number(item.rate_usd_bs) > 0) return formatRateForInput(item.rate_usd_bs);
    if (baseAmount > 0 && Number(item.amount_usd) > 0) return formatRateForInput(baseAmount / Number(item.amount_usd));
  } else {
    // Default (USD_BCV)
    if (Number(item.rate_usd_bs) > 0) return formatRateForInput(item.rate_usd_bs);
    if (Number(item.amount_bs) > 0 && baseAmount > 0) return formatRateForInput(Number(item.amount_bs) / baseAmount);
  }

  return '';
}

export function resolveSubmittedManualRate(params: {
  manualRate: string;
  initialData?: any;
  currency: CurrencyType | string;
  date?: string | null;
  initialDate?: string | null;
  rates: ExchangeRates | null;
}): number | undefined {
  const norm = (c: CurrencyType | string | null | undefined): string | undefined => {
    if (!c) return undefined;
    const u = (c || '').toUpperCase();
    if (u === 'USD') return 'USD_BCV';
    if (u === 'EUR') return 'EUR_BCV';
    if (u === 'VES') return 'BS';
    return u;
  };
  const normCur = norm(params.currency);
  const normInitCur = norm(params.initialData?.currency);

  const currencyChanged = Boolean(params.initialData && normCur !== normInitCur);
  const dateChanged = Boolean(params.initialData && params.date && params.initialDate && params.date !== params.initialDate);
  const initRateStr = params.initialData ? getInitialManualRate(params.initialData) : '';
  const trimmed = (params.manualRate || '').trim();

  if (trimmed !== '') {
    const parsed = parseFloat(trimmed.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) return undefined;
    if (params.initialData && !currencyChanged && !dateChanged && trimmed === initRateStr) {
      return undefined;
    }
    return parsed;
  }

  // trimmed === ''
  if (params.initialData && !currencyChanged && !dateChanged && initRateStr !== '') {
    const official = resolveRateForCurrency(params.currency, params.rates);
    return official && official > 0 ? official : undefined;
  }

  return undefined;
}

export function computeCrossCurrencyEquivalent(params: {
  amount: number;
  fromCurrency: CurrencyType | string;
  targetCurrency: CurrencyType | string;
  rates: ExchangeRates | null;
  manualRate?: string | number;
}): { amountInBs: number; convertedEquivalent: number | null } {
  const normalize = (c: CurrencyType | string): string => {
    const u = (c || '').toUpperCase();
    if (u === 'USD') return 'USD_BCV';
    if (u === 'EUR') return 'EUR_BCV';
    if (u === 'VES') return 'BS';
    return u;
  };

  const fromCurrency = normalize(params.fromCurrency);
  const targetCurrency = normalize(params.targetCurrency);

  if (!params.amount || params.amount <= 0) {
    return { amountInBs: 0, convertedEquivalent: null };
  }

  const parsedManual = typeof params.manualRate === 'number'
    ? params.manualRate
    : params.manualRate
      ? parseFloat(String(params.manualRate).replace(',', '.'))
      : 0;
  const manualNum = isNaN(parsedManual) ? 0 : parsedManual;

  let rUsd = Number(params.rates?.usd_bs || 0);
  let rEur = Number(params.rates?.eur_bs || 0);
  let rUsdt = Number(params.rates?.usdt_bs || 0);

  if (fromCurrency === 'BS' && manualNum > 0) {
    rUsd = manualNum;
  } else if (fromCurrency === 'USD_BCV' && manualNum > 0) {
    rUsd = manualNum;
  } else if (fromCurrency === 'EUR_BCV' && manualNum > 0) {
    rEur = manualNum;
  } else if (fromCurrency === 'USDT' && manualNum > 0) {
    rUsdt = manualNum;
  }

  let amountInBs = 0;
  if (fromCurrency === 'BS') {
    amountInBs = params.amount;
  } else if (fromCurrency === 'USD_BCV') {
    amountInBs = rUsd > 0 ? params.amount * rUsd : 0;
  } else if (fromCurrency === 'EUR_BCV') {
    amountInBs = rEur > 0 ? params.amount * rEur : 0;
  } else if (fromCurrency === 'USDT') {
    amountInBs = rUsdt > 0 ? params.amount * rUsdt : 0;
  } else if (fromCurrency === 'USD_CASH') {
    const cashRate = manualNum > 0 ? manualNum : Math.max(rUsd, rEur, rUsdt);
    amountInBs = cashRate > 0 ? params.amount * cashRate : 0;
  }

  if (fromCurrency === targetCurrency) {
    return { amountInBs, convertedEquivalent: params.amount };
  }

  if (amountInBs <= 0) {
    return { amountInBs: 0, convertedEquivalent: null };
  }

  let convertedEquivalent: number | null = null;
  if (targetCurrency === 'BS') {
    convertedEquivalent = amountInBs;
  } else if (targetCurrency === 'USD_BCV') {
    convertedEquivalent = rUsd > 0 ? amountInBs / rUsd : null;
  } else if (targetCurrency === 'EUR_BCV') {
    convertedEquivalent = rEur > 0 ? amountInBs / rEur : null;
  } else if (targetCurrency === 'USDT') {
    convertedEquivalent = rUsdt > 0 ? amountInBs / rUsdt : null;
  } else if (targetCurrency === 'USD_CASH') {
    const targetCashRate = Math.max(rUsd, rEur, rUsdt);
    convertedEquivalent = targetCashRate > 0 ? amountInBs / targetCashRate : null;
  }

  return { amountInBs, convertedEquivalent };
}

export const ExchangeRateField: React.FC<ExchangeRateFieldProps> = ({
  currency,
  rates,
  manualRate,
  onManualRateChange,
  isEditing = false,
  hasDate = true,
  showManualRate: controlledShowManualRate,
  onShowManualRateChange,
  mode = 'expense',
}) => {
  const [internalShowManualRate, setInternalShowManualRate] = useState<boolean>(() => Boolean(manualRate));
  const manualRateInputRef = useRef<HTMLInputElement | null>(null);

  const isControlled = controlledShowManualRate !== undefined;
  const isManualRateVisible = isControlled ? controlledShowManualRate : internalShowManualRate;

  const setManualRateVisible = (visible: boolean) => {
    if (!isControlled) {
      setInternalShowManualRate(visible);
    }
    onShowManualRateChange?.(visible);
  };

  const isUsdtRateMissing =
    currency === 'USDT' &&
    rates !== null &&
    (rates.usdt_bs === null || rates.usdt_bs === undefined || rates.usdt_bs <= 0);

  const currentRate = resolveRateForCurrency(currency, rates);

  useEffect(() => {
    if (isUsdtRateMissing && !isManualRateVisible) {
      setManualRateVisible(true);
    }
  }, [isUsdtRateMissing]);

  useEffect(() => {
    if (Boolean(manualRate) && !isManualRateVisible) {
      setManualRateVisible(true);
    } else if (
      !manualRate &&
      isManualRateVisible &&
      !isUsdtRateMissing &&
      document.activeElement !== manualRateInputRef.current
    ) {
      setManualRateVisible(false);
    }
  }, [manualRate, isManualRateVisible, isUsdtRateMissing]);

  const handleOpenManualRate = () => {
    setManualRateVisible(true);
    setTimeout(() => {
      manualRateInputRef.current?.focus();
    }, 50);
  };

  const handleCloseManualRate = () => {
    onManualRateChange('');
    setManualRateVisible(false);
  };

  const labelText = !hasDate || currency === 'BS' ? 'Tasa de referencia:' : 'Tasa de la fecha:';

  if (!isManualRateVisible) {
    return (
      <div
        className="rate-collapsed-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.625rem 0.875rem',
          backgroundColor: 'var(--surface-muted, #F3F4F6)',
          borderRadius: 'var(--radius-sm, 12px)',
          border: '1px solid var(--border-color, #E5E7EB)',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0, flex: 1, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {labelText}
          </span>
          <span
            style={{
              fontSize: '0.82rem',
              fontWeight: 700,
              color: isUsdtRateMissing ? '#ef4444' : 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {isUsdtRateMissing ? (
              'No disponible'
            ) : currentRate && Number(currentRate) > 0 ? (
              `Bs. ${Number(currentRate).toFixed(2)}`
            ) : rates === null ? (
              <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Cargando...</span>
            ) : (
              <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Sin tasa</span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={handleOpenManualRate}
          className="btn-trigger-manual-rate"
          aria-label="Personalizar tasa de cambio"
        >
          ¿Usaste otra tasa?
        </button>
      </div>
    );
  }

  return (
    <div className="form-group" style={{ animation: 'modalSlideUp 0.2s ease-out' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.4rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <label style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span>Tasa de Cambio {isEditing ? '(Histórica)' : ''}</span>
          {currency !== 'BS' && (
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.15rem 0.5rem',
                borderRadius: 'var(--radius-full)',
                background: isUsdtRateMissing ? 'rgba(239, 68, 68, 0.12)' : 'var(--surface-muted, rgba(0, 0, 0, 0.05))',
                color: isUsdtRateMissing ? '#ef4444' : 'var(--text-secondary)',
              }}
            >
              {isUsdtRateMissing
                ? 'No hay precio en esta fecha'
                : currentRate && Number(currentRate) > 0
                  ? `Oficial: Bs. ${Number(currentRate).toFixed(2)}`
                  : 'Sin tasa'}
            </span>
          )}
        </label>
        <button
          type="button"
          onClick={handleCloseManualRate}
          className="btn-clear-rate"
          aria-label="Restaurar tasa oficial"
        >
          ✕ {isEditing ? 'Restaurar' : 'Usar oficial'}
        </button>
      </div>

      <input
        ref={manualRateInputRef}
        type="text"
        inputMode="decimal"
        value={manualRate}
        onChange={(e) => {
          const val = e.target.value.replace(/[^0-9.,]/g, '');
          onManualRateChange(val);
        }}
        placeholder={
          isUsdtRateMissing
            ? 'No hay precio en esta fecha — tasa manual opcional'
            : currentRate && Number(currentRate) > 0
              ? `Por defecto: Bs. ${Number(currentRate).toFixed(2)}`
              : 'Ej. 36.50'
        }
      />
      {isUsdtRateMissing ? (
        <div
          style={{
            marginTop: '0.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
            background: 'rgba(234, 179, 8, 0.12)',
            color: '#b45309',
            padding: '0.75rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            border: '1px solid rgba(234, 179, 8, 0.25)',
          }}
        >
          <Info size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#b45309' }} />
          <span>No hay precio de USDT en esta fecha. Puedes ingresar una tasa manual (opcional).</span>
        </div>
      ) : (
        <div
          style={{
            marginTop: '0.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
            background: 'rgba(59, 130, 246, 0.1)',
            color: 'var(--accent-color)',
            padding: '0.75rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            border: '1px solid rgba(59, 130, 246, 0.2)',
          }}
        >
          <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            {isEditing
              ? mode === 'income'
                ? 'Esta fue la tasa de cambio usada en su momento. Modifícala solo si deseas recalcular el ingreso.'
                : 'Esta fue la tasa de cambio usada en su momento. Modifícala solo si deseas recalcular el gasto.'
              : '💡 Déjalo en blanco para usar la tasa de cambio automática del sistema (BCV o Binance).'}
          </span>
        </div>
      )}
    </div>
  );
};

export default ExchangeRateField;
