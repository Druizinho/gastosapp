import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, ArrowRightLeft } from 'lucide-react';
import { getRates } from '../api';
import type { ExchangeRates } from '../types';

const formatRate = (val: number | null | undefined) => {
  if (val === null || val === undefined) return '—';
  return `Bs ${Number(val).toFixed(2)}`;
};

const formatCalc = (val: number | null | undefined, prefix: string) => {
  if (val === null || val === undefined) return '—';
  return `${prefix}${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const RatesPage: React.FC = () => {
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [loading, setLoading] = useState(true);

  // Calculator state
  const [calcAmount, setCalcAmount] = useState<string>('1');
  const [calcBase, setCalcBase] = useState<'USD' | 'EUR' | 'USDT' | 'BS'>('USD');

  const fetchRates = async () => {
    setLoading(true);
    try {
      const data = await getRates();
      setRates(data);
    } catch (error) {
      console.error('Error fetching rates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  // Calculator Logic
  const calcResults = useMemo(() => {
    if (!rates) return null;
    const amount = parseFloat(calcAmount.replace(',', '.')) || 0;

    // First, convert everything to Bolívares
    let amountInBs = 0;
    if (calcBase === 'BS') amountInBs = amount;
    else if (calcBase === 'USD') amountInBs = amount * (rates.usd_bs || 0);
    else if (calcBase === 'EUR') amountInBs = amount * (rates.eur_bs || 0);
    else if (calcBase === 'USDT') amountInBs = amount * (rates.usdt_bs || 0);

    return {
      bs: amountInBs,
      usd: rates.usd_bs ? amountInBs / rates.usd_bs : null,
      eur: rates.eur_bs ? amountInBs / rates.eur_bs : null,
      usdt: rates.usdt_bs ? amountInBs / rates.usdt_bs : null,
    };
  }, [rates, calcAmount, calcBase]);

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '0 0.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Tasas de Cambio</h1>
        <button
          onClick={fetchRates}
          disabled={loading}
          style={{
            background: 'var(--surface-color)',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.2s'
          }}
        >
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {loading && !rates ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
          Cargando tasas...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Main Hero Rate (USD) */}
          <div style={{ textAlign: 'center', padding: '2rem 1rem', background: 'var(--surface-color)', borderRadius: '24px', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              Dólar BCV Oficial
            </div>
            <div style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {formatRate(rates?.usd_bs)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '1rem' }}>
              Actualizado: {rates?.last_updated ? new Date(rates.last_updated).toLocaleString() : '—'}
            </div>
          </div>

          {/* Secondary Rates (EUR, USDT) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: 'var(--surface-color)', padding: '1.25rem', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '0.25rem' }}>Euro BCV</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatRate(rates?.eur_bs)}</div>
            </div>
            <div style={{ background: 'var(--surface-color)', padding: '1.25rem', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '0.25rem' }}>Binance USDT</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatRate(rates?.usdt_bs)}</div>
            </div>
          </div>

          {/* Minimalist Calculator */}
          <div style={{ marginTop: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem', padding: '0 0.5rem' }}>Conversor Rápido</h2>

            <div style={{ background: 'var(--surface-color)', borderRadius: '24px', padding: '1.5rem', boxShadow: 'var(--shadow-md)' }}>
              {/* Input Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={calcAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                      setCalcAmount(val);
                    }}
                    style={{
                      width: '100%',
                      fontSize: '2rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '2px solid var(--accent-light)',
                      padding: '0.5rem 0',
                      outline: 'none',
                      textAlign: 'center',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderBottomColor = 'var(--text-primary)'}
                    onBlur={(e) => e.target.style.borderBottomColor = 'var(--accent-light)'}
                  />
                </div>

                <div style={{ color: 'var(--text-tertiary)' }}>
                  <ArrowRightLeft size={20} />
                </div>

                <div style={{ flex: 0.5 }}>
                  <select
                    value={calcBase}
                    onChange={(e) => setCalcBase(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'var(--surface-muted)',
                      color: 'var(--text-primary)',
                      fontSize: '1rem',
                      fontWeight: 600,
                      outline: 'none',
                      cursor: 'pointer',
                      appearance: 'none',
                      textAlign: 'center'
                    }}
                  >
                    <option value="USD">USD</option>
                    <option value="BS">BS</option>
                    <option value="EUR">EUR</option>
                    <option value="USDT">USDT</option>
                  </select>
                </div>
              </div>

              {/* Results Grid */}
              {calcResults && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {calcBase !== 'BS' && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Bolívares (Bs)</span>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCalc(calcResults.bs, '')}</span>
                    </div>
                  )}
                  {calcBase !== 'USD' && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Dólar (USD)</span>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCalc(calcResults.usd, '$')}</span>
                    </div>
                  )}
                  {calcBase !== 'EUR' && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Euro (EUR)</span>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCalc(calcResults.eur, '€')}</span>
                    </div>
                  )}
                  {calcBase !== 'USDT' && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Tether (USDT)</span>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCalc(calcResults.usdt, '')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
