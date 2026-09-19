import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Calculator, ChevronDown } from 'lucide-react';
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
  const [calcBase, setCalcBase] = useState<'USD' | 'EUR' | 'USDT' | 'BS'>(() => {
    return (localStorage.getItem('gastosapp_calc_base') as 'USD' | 'EUR' | 'USDT' | 'BS') || 'USD';
  });
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('gastosapp_calc_base', calcBase);
  }, [calcBase]);

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

  const currencyConfigs = {
    USD: {
      key: 'USD',
      label: 'Dólar BCV Oficial',
      short: 'Dólar BCV',
      symbol: '$',
      color: '#10B981',
      getValue: (r: ExchangeRates | null) => r?.usd_bs,
    },
    EUR: {
      key: 'EUR',
      label: 'Euro Oficial',
      short: 'Euro BCV',
      symbol: '€',
      color: '#3B82F6',
      getValue: (r: ExchangeRates | null) => r?.eur_bs,
    },
    USDT: {
      key: 'USDT',
      label: 'Binance USDT',
      short: 'USDT',
      symbol: '₮',
      color: '#FACC15',
      symbolColor: 'black',
      getValue: (r: ExchangeRates | null) => r?.usdt_bs,
    }
  };

  // Calculator Logic
  const calcResults = useMemo(() => {
    if (!rates) return null;
    const amount = parseFloat(calcAmount.replace(',', '.')) || 0;

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', padding: '0 0.5rem', paddingTop: '1rem' }}>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          color: 'var(--text-primary)',
          margin: 0,
          letterSpacing: '-0.02em'
        }}>Tasas de Cambio</h1>
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

      <div style={{ padding: '0 0.5rem', marginBottom: '2rem', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
        Actualizado: {rates?.last_updated ? new Date(rates.last_updated).toLocaleString() : '—'}
      </div>

      {loading && !rates ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
          Cargando tasas...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Unified Rates List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(['USD', 'EUR', 'USDT'] as const).map(rateKey => {
              const config = currencyConfigs[rateKey];
              return (
                <div key={rateKey} className="soft-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: config.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      boxShadow: 'var(--shadow-sm)'
                    }}>
                      {config.symbol}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{config.label}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>1 {rateKey}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {formatRate(config.getValue(rates))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Compact Calculator */}
          <div style={{ marginTop: '0.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem', padding: '0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calculator size={22} color="var(--text-secondary)" />
              Calculadora
            </h2>

            <div style={{ padding: '0 0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* Input Area */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '0.5rem 0.5rem 0.5rem',
                  marginBottom: '0.5rem',
                  borderBottom: `2px solid ${isFocused ? 'var(--primary-color)' : 'var(--border-color)'}`,
                  transition: 'border-color 0.2s ease-in-out'
                }}>
                  <div style={{ 
                    fontSize: '0.9rem', 
                    color: 'var(--text-secondary)', 
                    fontWeight: 600,
                    marginBottom: '0.5rem'
                  }}>
                    Monto a convertir
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'baseline', 
                    justifyContent: 'flex-end', 
                    width: '100%',
                  }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={calcAmount}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.,]/g, '');
                        setCalcAmount(val);
                      }}
                      style={{
                        flex: 1,
                        fontSize: '2rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        textAlign: 'right',
                        padding: '0',
                        minWidth: 0,
                        marginRight: '0.75rem',
                      }}
                      placeholder="0"
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                    />
                    
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <select
                        value={calcBase}
                        onChange={(e) => setCalcBase(e.target.value as any)}
                        style={{
                          appearance: 'none',
                          WebkitAppearance: 'none',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-primary)',
                          fontSize: '1.1rem',
                          fontWeight: 700,
                          outline: 'none',
                          cursor: 'pointer',
                          paddingRight: '1.5rem',
                          zIndex: 1,
                        }}
                      >
                        <option value="USD">USD</option>
                        <option value="BS">VES</option>
                        <option value="EUR">EUR</option>
                        <option value="USDT">USDT</option>
                      </select>
                      <ChevronDown size={20} color="var(--text-primary)" style={{ position: 'absolute', right: 0, pointerEvents: 'none' }} />
                    </div>
                  </div>
                </div>

                {/* Vertical Results List */}
                {calcResults && (
                  <div className="soft-card" style={{ padding: 0, overflow: 'hidden' }}>
                    {[
                      { key: 'BS', label: 'Bolívares (VES)', symbol: 'Bs', val: calcResults.bs, color: '#EF4444' },
                      { key: 'USD', label: 'Dólares (USD)', symbol: '$', val: calcResults.usd, color: '#10B981' },
                      { key: 'EUR', label: 'Euros (EUR)', symbol: '€', val: calcResults.eur, color: '#3B82F6' },
                      { key: 'USDT', label: 'Tether (USDT)', symbol: '₮', val: calcResults.usdt, color: '#FACC15', symbolColor: 'black' },
                    ].filter(item => item.key !== calcBase).map((item, index, arr) => (
                      <div key={item.key} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '1.25rem',
                        borderBottom: index < arr.length - 1 ? '1px solid var(--border-color)' : 'none'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', color: item.symbolColor || 'white' }}>
                            {item.symbol}
                          </div>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{item.label}</span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                          {formatCalc(item.val, '')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
