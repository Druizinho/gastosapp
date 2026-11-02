import React, { useRef, useState, useEffect } from 'react';
import type { CurrencyType, ExchangeRates } from '../../types';
import { Info } from 'lucide-react';

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
    }
  }, [manualRate]);

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
