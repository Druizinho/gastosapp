import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, Calculator, ChevronDown, Copy, Check, ArrowRightLeft, ArrowUpDown } from 'lucide-react';
import { getRates } from '../api';
import type { ExchangeRates } from '../types';
import { Skeleton } from './ui/Skeleton';

type CurrencyKey = 'USD' | 'EUR' | 'USDT' | 'BS';

const formatRate = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return `Bs. ${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatNumber = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(val)) return '0.00';
  return Number(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const SubRateDisplay: React.FC<{ value: number | null | undefined }> = ({ value }) => {
  if (value === null || value === undefined || isNaN(value)) {
    return (
      <div
        style={{
          fontSize: '1.15rem',
          fontWeight: 800,
          color: 'var(--text-tertiary)',
          lineHeight: 1.15,
        }}
      >
        —
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'var(--text-secondary)',
          marginRight: '0.22rem',
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        Bs.
      </span>
      <span
        style={{
          fontSize: 'clamp(1rem, 3.8vw, 1.3rem)',
          fontWeight: 900,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {formatNumber(value)}
      </span>
    </div>
  );
};

const formatStatusText = (timestamp?: string | null): string => {
  if (!timestamp) return 'BCV Oficial · Hoy';
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'BCV Oficial · Hoy';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      const timeStr = date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `BCV Oficial · Hoy ${timeStr}`;
    }
    return `BCV Oficial · ${date.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}`;
  } catch {
    return 'BCV Oficial · Hoy';
  }
};

export const RatesPage: React.FC = () => {
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Calculator state
  const [calcAmount, setCalcAmount] = useState<string>('1');
  const [calcBase, setCalcBase] = useState<CurrencyKey>(() => {
    return (localStorage.getItem('gastosapp_calc_base') as CurrencyKey) || 'USD';
  });
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const calculatorRef = useRef<HTMLDivElement>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem('gastosapp_calc_base', calcBase);
  }, [calcBase]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

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

  // Focus and select currency in calculator
  const handleSelectCurrency = (currency: CurrencyKey) => {
    setCalcBase(currency);
    calculatorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  };

  // Quick preset chips per base currency
  const presets = useMemo(() => {
    if (calcBase === 'BS') {
      return [
        { value: 100, label: '+ Bs 100' },
        { value: 500, label: '+ Bs 500' },
        { value: 1000, label: '+ Bs 1.000' },
        { value: 5000, label: '+ Bs 5.000' },
      ];
    }
    const symbol = calcBase === 'USD' ? '$' : calcBase === 'EUR' ? '€' : '₮';
    return [
      { value: 5, label: `+ ${symbol}5` },
      { value: 10, label: `+ ${symbol}10` },
      { value: 20, label: `+ ${symbol}20` },
      { value: 50, label: `+ ${symbol}50` },
      { value: 100, label: `+ ${symbol}100` },
    ];
  }, [calcBase]);

  const handleAddPreset = (valueToAdd: number) => {
    const current = parseFloat(calcAmount.replace(',', '.')) || 0;
    const newTotal = current === 0 ? valueToAdd : current + valueToAdd;
    setCalcAmount(Number.isInteger(newTotal) ? newTotal.toString() : newTotal.toFixed(2));
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleSwapBase = () => {
    setCalcBase((prev) => (prev === 'BS' ? 'USD' : 'BS'));
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Conversions
  const calcResults = useMemo(() => {
    if (!rates) return null;
    const amount = parseFloat(calcAmount.replace(',', '.')) || 0;

    let amountInBs = 0;
    if (calcBase === 'BS') {
      amountInBs = amount;
    } else if (calcBase === 'USD') {
      amountInBs = amount * (rates.usd_bs || 0);
    } else if (calcBase === 'EUR') {
      amountInBs = amount * (rates.eur_bs || 0);
    } else if (calcBase === 'USDT') {
      amountInBs = amount * (rates.usdt_bs || 0);
    }

    return {
      bs: amountInBs,
      usd: rates.usd_bs && rates.usd_bs > 0 ? amountInBs / rates.usd_bs : null,
      eur: rates.eur_bs && rates.eur_bs > 0 ? amountInBs / rates.eur_bs : null,
      usdt: rates.usdt_bs && rates.usdt_bs > 0 ? amountInBs / rates.usdt_bs : null,
    };
  }, [rates, calcAmount, calcBase]);

  const primaryFormattedText = useMemo(() => {
    if (!calcResults) return '—';
    if (calcBase === 'BS') {
      return `$ ${formatNumber(calcResults.usd)}`;
    }
    return `Bs. ${formatNumber(calcResults.bs)}`;
  }, [calcResults, calcBase]);

  const secondaryItems = useMemo(() => {
    if (!calcResults) return [];
    const all = [
      { key: 'USD' as CurrencyKey, label: 'Dólar BCV', symbol: '$', formatted: `$ ${formatNumber(calcResults.usd)}`, color: '#10B981', symbolColor: '#FFFFFF' },
      { key: 'EUR' as CurrencyKey, label: 'Euro BCV', symbol: '€', formatted: `€ ${formatNumber(calcResults.eur)}`, color: '#3B82F6', symbolColor: '#FFFFFF' },
      { key: 'USDT' as CurrencyKey, label: 'Tether USDT', symbol: '₮', formatted: `₮ ${formatNumber(calcResults.usdt)}`, color: '#FACC15', symbolColor: '#78350F' },
      { key: 'BS' as CurrencyKey, label: 'Bolívares', symbol: 'Bs', formatted: `Bs. ${formatNumber(calcResults.bs)}`, color: '#EF4444', symbolColor: '#FFFFFF' },
    ];

    if (calcBase === 'BS') {
      // Primary is USD, so secondary are EUR and USDT
      return all.filter((item) => item.key === 'EUR' || item.key === 'USDT');
    }
    // Primary is BS, so secondary are other foreign currencies excluding current base
    return all.filter((item) => item.key !== calcBase && item.key !== 'BS');
  }, [calcResults, calcBase]);

  const handleCopyResult = async (textToCopy: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.warn('Failed to copy: ', err);
    }
  };

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <style>{`
        @keyframes pulseDot {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          }
          70% {
            transform: scale(1);
            box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
          }
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }
        @keyframes spinIcon {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background-color: #10B981;
          display: inline-block;
          animation: pulseDot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .spin-loading {
          animation: spinIcon 0.8s linear infinite;
        }
        .better-press {
          transition: transform 150ms ease-out, box-shadow 150ms ease-out, border-color 150ms ease-out, background-color 150ms ease-out;
        }
        .better-press:active {
          transform: scale(0.96) !important;
        }
        .hero-rate-card {
          transition: transform 150ms ease-out, box-shadow 150ms ease-out, border-color 150ms ease-out;
        }
        .hero-rate-card:hover {
          border-color: var(--text-tertiary) !important;
          box-shadow: var(--shadow-md) !important;
        }
        .hero-rate-card:active {
          transform: scale(0.96) !important;
        }
        .sub-rate-card {
          padding: 1rem 0.9rem;
          min-height: 146px;
          border-radius: var(--radius-lg);
          background: var(--surface-color);
          border: 1px solid var(--border-color);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          justifyContent: space-between;
          gap: 0.75rem;
          box-sizing: border-box;
          transition: transform 150ms ease-out, box-shadow 150ms ease-out, border-color 150ms ease-out;
        }
        @media (min-width: 480px) {
          .sub-rate-card {
            padding: 1.15rem 1rem;
            min-height: 154px;
            gap: 0.85rem;
          }
        }
        .sub-rate-card:focus-visible {
          outline: 2px solid var(--info-color, #3B82F6);
          outline-offset: 2px;
        }
        .sub-rate-card:hover {
          box-shadow: var(--shadow-md) !important;
          border-color: var(--text-tertiary) !important;
        }
        .sub-rate-card:active {
          transform: scale(0.96) !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .pulse-dot {
            animation: none;
          }
          .spin-loading {
            animation: none;
          }
          .better-press, .hero-rate-card, .sub-rate-card, .preset-chip-btn, .secondary-rate-card, .swap-btn {
            transition: none !important;
          }
        }
        .preset-chip-btn {
          transition: transform 150ms ease-out, background-color 150ms ease-out, border-color 150ms ease-out, box-shadow 150ms ease-out;
        }
        .preset-chip-btn:hover {
          background-color: var(--surface-hover) !important;
          border-color: var(--text-secondary) !important;
        }
        .preset-chip-btn:active {
          transform: scale(0.96) !important;
        }
        .secondary-rate-card {
          transition: transform 150ms ease-out, box-shadow 150ms ease-out, border-color 150ms ease-out, background-color 150ms ease-out;
        }
        .secondary-rate-card:hover {
          border-color: var(--text-tertiary) !important;
          box-shadow: var(--shadow-sm) !important;
        }
        .secondary-rate-card:active {
          transform: scale(0.96) !important;
        }
        .swap-btn {
          transition: transform 150ms ease-out, background-color 150ms ease-out, color 150ms ease-out, border-color 150ms ease-out, box-shadow 150ms ease-out;
        }
        .swap-btn:hover {
          background-color: var(--surface-hover) !important;
          color: var(--text-primary) !important;
          border-color: var(--text-tertiary) !important;
          box-shadow: var(--shadow-sm) !important;
        }
        .swap-btn:active {
          transform: translateY(-50%) scale(0.92) !important;
        }
      `}</style>

      {/* 1. Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.75rem',
          paddingTop: '1rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: '0.25rem',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            Tasas de Cambio
          </h1>
          <p
            style={{
              fontSize: '0.9rem',
              color: 'var(--text-secondary)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {rates?.last_updated ? formatStatusText(rates.last_updated) : 'Cargando cotizaciones...'}
          </p>
        </div>

        <button
          type="button"
          onClick={fetchRates}
          aria-label="Actualizar cotizaciones"
          className="better-press"
          style={{
            background: 'var(--surface-color)',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            boxShadow: 'var(--shadow-xs)',
            flexShrink: 0,
            transition: 'transform 150ms ease-out, box-shadow 150ms ease-out, color 150ms ease-out',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.96)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <RefreshCw size={18} className={loading ? 'spin-loading' : ''} />
        </button>
      </header>

      {loading && !rates ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Skeleton HERO Card */}
          <div
            style={{
              padding: '1.35rem 1.4rem',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--surface-color)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <Skeleton width={46} height={46} borderRadius="var(--radius-full)" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <Skeleton width="45%" height="1.1rem" borderRadius="6px" />
                <Skeleton width="25%" height="0.8rem" borderRadius="4px" />
              </div>
            </div>
            <Skeleton width="55%" height="2.2rem" borderRadius="8px" />
          </div>

          {/* Skeleton 2-Col Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.85rem' }}>
            <div
              className="sub-rate-card"
              style={{
                cursor: 'default',
                pointerEvents: 'none',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Skeleton width={36} height={36} borderRadius="var(--radius-full)" />
                <Skeleton width={36} height={18} borderRadius="var(--radius-full)" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <Skeleton width="65%" height="0.85rem" borderRadius="4px" />
                <Skeleton width="35%" height="0.7rem" borderRadius="4px" />
                <Skeleton width="85%" height="1.25rem" borderRadius="6px" />
              </div>
            </div>
            <div
              className="sub-rate-card"
              style={{
                cursor: 'default',
                pointerEvents: 'none',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Skeleton width={36} height={36} borderRadius="var(--radius-full)" />
                <Skeleton width={56} height={18} borderRadius="var(--radius-full)" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <Skeleton width="65%" height="0.85rem" borderRadius="4px" />
                <Skeleton width="35%" height="0.7rem" borderRadius="4px" />
                <Skeleton width="85%" height="1.25rem" borderRadius="6px" />
              </div>
            </div>
          </div>

          {/* Skeleton Calculator */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <Skeleton width="45%" height="1.5rem" borderRadius="6px" />
            <div style={{ display: 'flex', gap: '0.5rem', overflow: 'hidden' }}>
              <Skeleton width={70} height={32} borderRadius="var(--radius-full)" />
              <Skeleton width={70} height={32} borderRadius="var(--radius-full)" />
              <Skeleton width={70} height={32} borderRadius="var(--radius-full)" />
              <Skeleton width={70} height={32} borderRadius="var(--radius-full)" />
            </div>
            <div
              style={{
                borderRadius: 'var(--radius-lg)',
                background: 'var(--surface-color)',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-md)',
                overflow: 'hidden',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
              }}
            >
              <Skeleton width="60%" height="2.5rem" borderRadius="8px" />
              <Skeleton width="100%" height="4.5rem" borderRadius="8px" />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* 2. Rates Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* HERO Card for USD (BCV) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectCurrency('USD')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectCurrency('USD');
                }
              }}
              className="hero-rate-card"
              aria-label="Seleccionar Dólar BCV Oficial en la calculadora"
              style={{
                position: 'relative',
                overflow: 'hidden',
                padding: '1.35rem 1.4rem',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--surface-color)',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-sm)',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  {/* Circular emblem with '$' */}
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--surface-muted, rgba(0, 0, 0, 0.06))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#10B981',
                      fontWeight: 900,
                      fontSize: '1.35rem',
                      flexShrink: 0,
                    }}
                  >
                    $
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontWeight: 800,
                          color: 'var(--text-primary)',
                          fontSize: '1.05rem',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        Dólar BCV Oficial
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.5rem',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--surface-muted, rgba(0, 0, 0, 0.05))',
                          color: 'var(--text-secondary)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        BCV
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: 'var(--text-tertiary)',
                        marginTop: '0.15rem',
                      }}
                    >
                      1 USD
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    background: 'var(--surface-muted, rgba(0, 0, 0, 0.05))',
                    padding: '0.25rem 0.6rem',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  <span>Calcular</span>
                  <ArrowRightLeft size={12} />
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: '2.15rem',
                    fontWeight: 900,
                    color: 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.03em',
                    lineHeight: 1.1,
                  }}
                >
                  {formatRate(rates?.usd_bs)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  Cotización oficial del Banco Central de Venezuela
                </div>
              </div>
            </div>

            {/* 2-Column Grid for EUR and USDT */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.85rem',
              }}
            >
              {/* Col 1: Euro Oficial */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectCurrency('EUR')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectCurrency('EUR');
                  }
                }}
                className="sub-rate-card"
                aria-label="Seleccionar Euro Oficial en la calculadora"
                style={{
                  boxShadow: '0 2px 10px -2px rgba(59, 130, 246, 0.1), var(--shadow-xs)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: 'var(--radius-full)',
                      background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                      fontWeight: 900,
                      fontSize: '1.1rem',
                      boxShadow: '0 3px 8px rgba(59, 130, 246, 0.25)',
                      flexShrink: 0,
                    }}
                  >
                    €
                  </div>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.42rem',
                      borderRadius: 'var(--radius-full)',
                      background: 'rgba(59, 130, 246, 0.12)',
                      color: '#2563EB',
                      letterSpacing: '0.04em',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    BCV
                  </span>
                </div>

                <div>
                  <div
                    style={{
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    Euro Oficial
                  </div>
                  <div
                    style={{
                      fontSize: '0.70rem',
                      fontWeight: 600,
                      color: 'var(--text-tertiary)',
                      marginTop: '0.12rem',
                      marginBottom: '0.35rem',
                      lineHeight: 1.2,
                    }}
                  >
                    1 EUR
                  </div>
                  <SubRateDisplay value={rates?.eur_bs} />
                </div>
              </div>

              {/* Col 2: Tether USDT */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectCurrency('USDT')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectCurrency('USDT');
                  }
                }}
                className="sub-rate-card"
                aria-label="Seleccionar Tether USDT en la calculadora"
                style={{
                  boxShadow: '0 2px 10px -2px rgba(245, 158, 11, 0.1), var(--shadow-xs)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: 'var(--radius-full)',
                      background: 'linear-gradient(135deg, #FACC15, #EAB308)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#78350F',
                      fontWeight: 900,
                      fontSize: '1.1rem',
                      boxShadow: '0 3px 8px rgba(234, 179, 8, 0.25)',
                      flexShrink: 0,
                    }}
                  >
                    ₮
                  </div>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.42rem',
                      borderRadius: 'var(--radius-full)',
                      background: 'rgba(234, 179, 8, 0.15)',
                      color: '#B45309',
                      letterSpacing: '0.02em',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Binance P2P
                  </span>
                </div>

                <div>
                  <div
                    style={{
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    Tether USDT
                  </div>
                  <div
                    style={{
                      fontSize: '0.70rem',
                      fontWeight: 600,
                      color: 'var(--text-tertiary)',
                      marginTop: '0.12rem',
                      marginBottom: '0.35rem',
                      lineHeight: 1.2,
                    }}
                  >
                    1 USDT
                  </div>
                  <SubRateDisplay value={rates?.usdt_bs} />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Unified Fintech Calculator */}
          <div
            ref={calculatorRef}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            {/* Card title */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(16, 185, 129, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#10B981',
                  }}
                >
                  <Calculator size={20} />
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: '1.12rem',
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                      margin: 0,
                      letterSpacing: '-0.02em',
                      lineHeight: 1.2,
                    }}
                  >
                    Calculadora Inteligente
                  </h2>
                  <p
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      margin: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      marginTop: '0.15rem',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#10B981',
                        display: 'inline-block',
                      }}
                    />
                    Conversión en vivo
                  </p>
                </div>
              </div>
            </div>

            {/* A. Presets row (above the card) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  overflowX: 'auto',
                  paddingBottom: '0.2rem',
                  scrollbarWidth: 'none',
                  flex: 1,
                }}
              >
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleAddPreset(preset.value)}
                    className="preset-chip-btn"
                    style={{
                      flexShrink: 0,
                      background: 'var(--surface-color)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-full)',
                      padding: '0.4rem 0.85rem',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '-0.01em',
                      display: 'inline-flex',
                      alignItems: 'center',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {parseFloat(calcAmount.replace(',', '.')) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCalcAmount('0');
                    inputRef.current?.focus();
                  }}
                  className="better-press"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: '0.3rem 0.5rem',
                    flexShrink: 0,
                  }}
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* B. Unified Continuous Card */}
            <div
              style={{
                background: 'var(--surface-color)',
                border: isFocused ? '1px solid #10B981' : '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: isFocused ? '0 0 0 3px rgba(16, 185, 129, 0.15), var(--shadow-md)' : 'var(--shadow-md)',
                overflow: 'hidden',
                padding: 0,
                transition: 'border-color 150ms ease-out, box-shadow 150ms ease-out',
              }}
            >
              {/* Row 1 (Input - "Tú tienes") */}
              <div style={{ padding: '1.5rem 1.5rem 1.25rem 1.5rem' }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem',
                  }}
                >
                  TÚ TIENES
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    value={calcAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                      setCalcAmount(val);
                    }}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder="0"
                    aria-label="Monto a convertir"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: '2.5rem',
                      fontWeight: 900,
                      color: 'var(--text-primary)',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: 0,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '-0.02em',
                      lineHeight: 1.15,
                    }}
                  />

                  {/* Currency selector pill */}
                  <div
                    style={{
                      position: 'relative',
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'var(--surface-muted, rgba(0,0,0,0.04))',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-full)',
                      padding: '0.45rem 0.85rem',
                      boxShadow: 'var(--shadow-xs)',
                      flexShrink: 0,
                    }}
                  >
                    <select
                      value={calcBase}
                      onChange={(e) => setCalcBase(e.target.value as CurrencyKey)}
                      aria-label="Seleccionar divisa base"
                      style={{
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontSize: '0.92rem',
                        fontWeight: 800,
                        outline: 'none',
                        cursor: 'pointer',
                        paddingRight: '1.25rem',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <option value="USD">USD ($)</option>
                      <option value="BS">VES (Bs)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="USDT">USDT (₮)</option>
                    </select>
                    <ChevronDown
                      size={15}
                      color="var(--text-secondary)"
                      style={{ position: 'absolute', right: '0.65rem', pointerEvents: 'none' }}
                    />
                  </div>
                </div>
              </div>

              {/* Center Divider with Swap Button */}
              <div
                style={{
                  borderTop: '1px solid var(--border-color)',
                  position: 'relative',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <button
                  type="button"
                  onClick={handleSwapBase}
                  aria-label="Invertir divisas"
                  title="Invertir divisas"
                  className="swap-btn"
                  style={{
                    position: 'absolute',
                    top: 0,
                    transform: 'translateY(-50%)',
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    boxShadow: 'var(--shadow-xs)',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <ArrowUpDown size={15} />
                </button>
              </div>

              {/* Row 2 (Output - "Equivale a") */}
              <div
                style={{
                  padding: '1.25rem 1.5rem 1.5rem 1.5rem',
                  background: 'var(--surface-muted, rgba(0,0,0,0.02))',
                }}
              >
                {/* Top bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    EQUIVALE A
                  </span>

                  <button
                    type="button"
                    onClick={() => handleCopyResult(primaryFormattedText)}
                    className="better-press"
                    aria-label="Copiar resultado"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'var(--surface-color)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-full)',
                      padding: '0.35rem 0.85rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: copied ? '#10B981' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                  >
                    {copied ? (
                      <>
                        <Check size={14} color="#10B981" />
                        <span>¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Primary Result Figure */}
                <div
                  style={{
                    fontSize: '2.5rem',
                    fontWeight: 900,
                    color: 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.02em',
                    margin: '0.4rem 0 1rem 0',
                    lineHeight: 1.15,
                  }}
                >
                  {primaryFormattedText}
                </div>

                {/* Secondary Currencies - Prominent Cards */}
                {secondaryItems.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: 'var(--text-tertiary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '0.6rem',
                      }}
                    >
                      En otras monedas:
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '0.65rem',
                      }}
                    >
                      {secondaryItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => handleSelectCurrency(item.key)}
                          className="better-press secondary-rate-card"
                          title={`Cambiar base a ${item.label}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.65rem',
                            background: 'var(--surface-color)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.65rem 0.85rem',
                            boxShadow: 'var(--shadow-xs)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          <div
                            style={{
                              width: '30px',
                              height: '30px',
                              borderRadius: 'var(--radius-full)',
                              background: item.color,
                              color: item.symbolColor || '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.85rem',
                              fontWeight: 900,
                              flexShrink: 0,
                              boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                            }}
                          >
                            {item.symbol}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: '0.78rem',
                                color: 'var(--text-secondary)',
                                fontWeight: 600,
                                lineHeight: 1.2,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {item.label}
                            </div>
                            <div
                              style={{
                                fontSize: '1.05rem',
                                fontWeight: 800,
                                color: 'var(--text-primary)',
                                fontVariantNumeric: 'tabular-nums',
                                letterSpacing: '-0.01em',
                                lineHeight: 1.2,
                                marginTop: '0.15rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {item.formatted}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
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
