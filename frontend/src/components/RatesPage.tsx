import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Calculator, DollarSign, Euro, Coins } from 'lucide-react';
import { getRates } from '../api';
import type { ExchangeRates } from '../types';

const formatRate = (val: number | null | undefined) => {
  if (val === null || val === undefined) return 'N/A';
  return `Bs ${Number(val).toFixed(2)}`;
};

const formatCalc = (val: number | null | undefined, prefix: string) => {
  if (val === null || val === undefined) return 'N/A';
  return `${prefix}${Number(val).toFixed(2)}`;
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
    
    // First, convert everything to Bolívares (the base unit the backend uses)
    let amountInBs = 0;
    if (calcBase === 'BS') amountInBs = amount;
    else if (calcBase === 'USD') amountInBs = amount * (rates.usd_bs || 0);
    else if (calcBase === 'EUR') amountInBs = amount * (rates.eur_bs || 0);
    else if (calcBase === 'USDT') amountInBs = amount * (rates.usdt_bs || 0);

    // Then, calculate from Bolívares to others
    return {
      bs: amountInBs,
      usd: rates.usd_bs ? amountInBs / rates.usd_bs : null,
      eur: rates.eur_bs ? amountInBs / rates.eur_bs : null,
      usdt: rates.usdt_bs ? amountInBs / rates.usdt_bs : null,
    };
  }, [rates, calcAmount, calcBase]);

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <header className="soft-card" style={{ marginBottom: '1.5rem', textAlign: 'center', padding: '2rem 1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Tasas de Cambio</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Consulta y calcula tasas en tiempo real.</p>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>Cargando tasas del mercado...</div>
      ) : (
        <div className="soft-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Rates Display */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
            <div style={{ backgroundColor: 'var(--surface-muted)', padding: '1.25rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ backgroundColor: '#10b98120', color: '#10b981', padding: '0.5rem', borderRadius: '10px' }}>
                  <DollarSign size={20} />
                </div>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Dólar BCV</span>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatRate(rates?.usd_bs)}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--surface-muted)', padding: '1.25rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ backgroundColor: '#3b82f620', color: '#3b82f6', padding: '0.5rem', borderRadius: '10px' }}>
                  <Euro size={20} />
                </div>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Euro BCV</span>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatRate(rates?.eur_bs)}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--surface-muted)', padding: '1.25rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ backgroundColor: '#f59e0b20', color: '#f59e0b', padding: '0.5rem', borderRadius: '10px' }}>
                  <Coins size={20} />
                </div>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Binance USDT</span>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatRate(rates?.usdt_bs)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
            Última actualización: {rates?.last_updated ? new Date(rates.last_updated).toLocaleString() : 'N/A'}
            <button 
              onClick={fetchRates} 
              style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem', fontWeight: 500 }}
            >
              <RefreshCw size={12} /> Actualizar
            </button>
          </div>

          {/* Calculator Section */}
          <div style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 600 }}>
              <Calculator size={18} color="var(--text-tertiary)" /> Calculadora de Divisas
            </h3>
            
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <input 
                type="text" 
                inputMode="decimal"
                value={calcAmount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.,]/g, '');
                  setCalcAmount(val);
                }}
                style={{ flex: 2, padding: '0.875rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none' }}
              />
              <select 
                value={calcBase}
                onChange={(e) => setCalcBase(e.target.value as any)}
                style={{ flex: 1, padding: '0.875rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--surface-muted)', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none' }}
              >
                <option value="USD">USD ($)</option>
                <option value="BS">BS (Bs)</option>
                <option value="EUR">EUR (€)</option>
                <option value="USDT">USDT</option>
              </select>
            </div>

            {calcResults && (
              <div style={{ backgroundColor: 'var(--surface-muted)', padding: '1.25rem', borderRadius: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>🇻🇪 Bs</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{formatCalc(calcResults.bs, '')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>🇺🇸 USD</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{formatCalc(calcResults.usd, '$')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>🇪🇺 EUR</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{formatCalc(calcResults.eur, '€')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>🪙 USDT</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{formatCalc(calcResults.usdt, '')}</span>
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};
