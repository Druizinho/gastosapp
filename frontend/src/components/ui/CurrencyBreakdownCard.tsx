import React from 'react';
import type { ExchangeRates } from '../../types';
import {
  formatCurrencyAmount,
  convertItemAmountToMainCurrency,
  getHistoricalRateDisplay,
  isSameCurrency
} from '../../utils/currencyFormat';
import { ArrowRightLeft, Clock, DollarSign } from 'lucide-react';

export interface CurrencyBreakdownCardProps {
  originalAmount: number;
  originalCurrency: string;
  amountBs?: number | null;
  amountUsd?: number | null;
  amountEur?: number | null;
  amountUsdt?: number | null;
  rateUsdBs?: number | null;
  rateEurBs?: number | null;
  rateUsdtBs?: number | null;
  fallbackRates?: ExchangeRates | null;
  isPendingReference?: boolean; // true for unpaid templates
}

export const CurrencyBreakdownCard: React.FC<CurrencyBreakdownCardProps> = ({
  originalAmount,
  originalCurrency,
  amountBs,
  amountUsd,
  amountEur,
  amountUsdt,
  rateUsdBs,
  rateEurBs,
  rateUsdtBs,
  fallbackRates,
  isPendingReference = false
}) => {
  const itemRef = {
    amount: originalAmount,
    currency: originalCurrency,
    amount_bs: amountBs,
    amount_usd: amountUsd,
    amount_eur: amountEur,
    amount_usdt: amountUsdt,
    rate_usd_bs: rateUsdBs,
    rate_eur_bs: rateEurBs,
    rate_usdt_bs: rateUsdtBs,
  };

  const rateInfo = getHistoricalRateDisplay(itemRef, fallbackRates);

  // Compute resolved equivalents
  const resolvedBs = amountBs != null && !isNaN(amountBs)
    ? amountBs
    : convertItemAmountToMainCurrency(itemRef, 'BS', fallbackRates);

  const resolvedUsd = amountUsd != null && !isNaN(amountUsd)
    ? amountUsd
    : convertItemAmountToMainCurrency(itemRef, 'USD', fallbackRates);

  const resolvedEur = amountEur != null && !isNaN(amountEur)
    ? amountEur
    : convertItemAmountToMainCurrency(itemRef, 'EUR', fallbackRates);

  const resolvedUsdt = amountUsdt != null && !isNaN(amountUsdt)
    ? amountUsdt
    : convertItemAmountToMainCurrency(itemRef, 'USDT', fallbackRates);

  const equivalents = [
    {
      code: 'BS',
      label: 'Bolívares (BCV)',
      symbol: 'Bs.',
      amountText: formatCurrencyAmount(resolvedBs, 'BS'),
      isOriginal: isSameCurrency(originalCurrency, 'BS'),
      accentColor: '#3B82F6',
    },
    {
      code: 'USD',
      label: 'Dólar BCV',
      symbol: '$',
      amountText: formatCurrencyAmount(resolvedUsd, 'USD'),
      isOriginal: isSameCurrency(originalCurrency, 'USD'),
      accentColor: '#10B981',
    },
    {
      code: 'EUR',
      label: 'Euro BCV',
      symbol: '€',
      amountText: formatCurrencyAmount(resolvedEur, 'EUR'),
      isOriginal: isSameCurrency(originalCurrency, 'EUR'),
      accentColor: '#8B5CF6',
    },
    {
      code: 'USDT',
      label: 'USDT (Binance)',
      symbol: '₮',
      amountText: formatCurrencyAmount(resolvedUsdt, 'USDT'),
      isOriginal: isSameCurrency(originalCurrency, 'USDT'),
      accentColor: '#F59E0B',
    },
  ];

  return (
    <div style={{
      background: 'var(--surface-subtle, rgba(255, 255, 255, 0.03))',
      border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
      borderRadius: '16px',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.85rem',
      boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1))',
    }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'rgba(99, 102, 241, 0.12)',
            color: 'var(--brand-primary, #6366F1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <ArrowRightLeft size={15} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)' }}>
              {isPendingReference ? 'Referencia Pendiente' : 'Moneda Registrada'}
            </span>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatCurrencyAmount(originalAmount, originalCurrency)}
            </div>
          </div>
        </div>

        {/* Rate pill */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.25rem 0.6rem',
            borderRadius: '9999px',
            fontSize: '0.72rem',
            fontWeight: 600,
            background: rateInfo.isHistorical ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.12)',
            color: rateInfo.isHistorical ? '#10B981' : 'var(--text-secondary)',
            border: `1px solid ${rateInfo.isHistorical ? 'rgba(16, 185, 129, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
          }}>
            {rateInfo.isHistorical ? <Clock size={12} /> : <DollarSign size={12} />}
            <span>{rateInfo.label}: {rateInfo.valueText}</span>
          </div>

          {rateInfo.secondaryRateText && (
            <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
              {rateInfo.secondaryRateText}
            </span>
          )}
        </div>
      </div>

      {/* 2x2 Equivalencias Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '0.6rem',
      }}>
        {equivalents.map((eq) => (
          <div
            key={eq.code}
            style={{
              padding: '0.65rem 0.75rem',
              borderRadius: '12px',
              background: eq.isOriginal ? 'rgba(99, 102, 241, 0.08)' : 'var(--surface-card, rgba(255, 255, 255, 0.02))',
              border: eq.isOriginal ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.05))',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2rem',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>
                {eq.label}
              </span>
              {eq.isOriginal && (
                <span style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  color: 'var(--brand-primary, #6366F1)',
                  background: 'rgba(99, 102, 241, 0.15)',
                  padding: '0.1rem 0.35rem',
                  borderRadius: '4px',
                }}>
                  ORIGEN
                </span>
              )}
            </div>
            <span style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: eq.isOriginal ? 'var(--text-primary)' : 'var(--text-secondary)',
              letterSpacing: '-0.01em',
            }}>
              {eq.amountText}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
