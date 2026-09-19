import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, ArrowRightLeft, Calculator, ChevronDown } from 'lucide-react';
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

type RateKey = 'USD' | 'EUR' | 'USDT';

export const RatesPage: React.FC = () => {
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [loading, setLoading] = useState(true);

  // Protagonist state
  const [primaryRate, setPrimaryRate] = useState<RateKey>(() => {
    return (localStorage.getItem('gastosapp_primary_rate') as RateKey) || 'USD';
  });

  useEffect(() => {
    localStorage.setItem('gastosapp_primary_rate', primaryRate);
  }, [primaryRate]);

  // Calculator state
  const [calcAmount, setCalcAmount] = useState<string>('1');
  const [calcBase, setCalcBase] = useState<'USD' | 'EUR' | 'USDT' | 'BS'>('USD');
  const [isFocused, setIsFocused] = useState<boolean>(false);

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

  // Configuration for rates (subtle gradients)
  const currencyConfigs = {
    USD: {
      label: 'Dólar BCV Oficial',
      short: 'Dólar BCV',
      color: '#10B981', // Green
      gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, var(--surface-color) 100%)',
      getValue: (r: ExchangeRates | null) => r?.usd_bs,
    },
    USDT: {
      label: 'Binance USDT',
      short: 'USDT',
      color: '#FACC15', // Pure Yellow
      gradient: 'linear-gradient(135deg, rgba(250, 204, 21, 0.12) 0%, var(--surface-color) 100%)',
      getValue: (r: ExchangeRates | null) => r?.usdt_bs,
    },
    EUR: {
      label: 'Euro Oficial',
      short: 'Euro BCV',
      color: '#3B82F6', // Blue
      gradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, var(--surface-color) 100%)',
      getValue: (r: ExchangeRates | null) => r?.eur_bs,
    }
  };

  const primaryConfig = currencyConfigs[primaryRate];
  const secondaryRates = (['USD', 'EUR', 'USDT'] as const).filter(r => r !== primaryRate);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '0 0.5rem', paddingTop: '1rem' }}>
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

      {loading && !rates ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
          Cargando tasas...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Main Hero Rate */}
          <div className="soft-card" style={{
            textAlign: 'center',
            padding: '2.5rem 1rem',
            background: 'var(--surface-color)',
            position: 'relative',
            overflow: 'hidden',
            transition: 'background 0.3s ease'
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              {primaryConfig.label}
            </div>
            <div style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {formatRate(primaryConfig.getValue(rates))}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '1rem' }}>
              Actualizado: {rates?.last_updated ? new Date(rates.last_updated).toLocaleString() : '—'}
            </div>
          </div>

          {/* Secondary Rates (Clickable) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {secondaryRates.map(rateKey => {
              const config = currencyConfigs[rateKey];
              return (
                <div
                  key={rateKey}
                  className="soft-card"
                  onClick={() => setPrimaryRate(rateKey)}
                  style={{
                    padding: '1.25rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    position: 'relative',
                    border: '1px solid transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.borderColor = 'transparent';
                  }}
                >
                  <div style={{ position: 'absolute', top: '10px', right: '10px', color: 'var(--text-tertiary)' }}>
                    <ArrowRightLeft size={14} />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {config.short}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {formatRate(config.getValue(rates))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Redesigned Calculator */}
          <div style={{ marginTop: '0.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem', padding: '0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calculator size={22} color="var(--text-secondary)" />
              Calculadora de tasas
            </h2>

            <div style={{ padding: '0 0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* Input Area */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '0.5rem 0.5rem 0.5rem',
                  marginBottom: '1rem',
                  borderBottom: `2px solid ${isFocused ? 'var(--primary-color)' : 'var(--border-color)'}`,
                  transition: 'border-color 0.2s ease-in-out'
                }}>
                  <div style={{ 
                    fontSize: '1rem', 
                    color: 'var(--text-primary)', 
                    fontWeight: 600,
                    marginBottom: '0.5rem'
                  }}>
                    Monto en {calcBase === 'BS' ? 'VES' : calcBase}
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
                        fontWeight: 600,
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
                          fontWeight: 600,
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

                {/* Results List */}
                {calcResults && (
                  <div className="metrics-scroll" style={{ padding: '0.5rem 0' }}>
                    {calcBase !== 'BS' && (
                      <div className="soft-card" style={{
                        padding: '1.5rem 1rem', minHeight: '120px', minWidth: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', scrollSnapAlign: 'start'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold', color: 'white' }}>Bs</div>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>VES</span>
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem', wordBreak: 'break-word', lineHeight: 1.2 }}>{formatCalc(calcResults.bs, '')}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Bolívares</div>
                      </div>
                    )}

                    {calcBase !== 'USD' && (
                      <div className="soft-card" style={{
                        padding: '1.5rem 1rem', minHeight: '120px', minWidth: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', scrollSnapAlign: 'start'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 'bold', color: 'white' }}>$</div>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>USD</span>
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem', wordBreak: 'break-word', lineHeight: 1.2 }}>{formatCalc(calcResults.usd, '')}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Dólares</div>
                      </div>
                    )}

                    {calcBase !== 'EUR' && (
                      <div className="soft-card" style={{
                        padding: '1.5rem 1rem', minHeight: '120px', minWidth: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', scrollSnapAlign: 'start'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', color: 'white' }}>€</div>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>EUR</span>
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem', wordBreak: 'break-word', lineHeight: 1.2 }}>{formatCalc(calcResults.eur, '')}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Euros</div>
                      </div>
                    )}

                    {calcBase !== 'USDT' && (
                      <div className="soft-card" style={{
                        padding: '1.5rem 1rem', minHeight: '120px', minWidth: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', scrollSnapAlign: 'start'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#FACC15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 'bold', color: 'black' }}>₮</div>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>USDT</span>
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem', wordBreak: 'break-word', lineHeight: 1.2 }}>{formatCalc(calcResults.usdt, '')}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Tether</div>
                      </div>
                    )}
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
