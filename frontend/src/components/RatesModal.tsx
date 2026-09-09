import React, { useState, useEffect, useMemo } from 'react';
import { X, RefreshCw, Calculator } from 'lucide-react';
import { getRates } from '../api';
import type { ExchangeRates } from '../types';

interface RatesModalProps {
  onClose: () => void;
}

const formatRate = (val: number | null | undefined) => {
  if (val === null || val === undefined) return 'N/A';
  return `Bs ${Number(val).toFixed(2)}`;
};

const formatCalc = (val: number | null | undefined, prefix: string) => {
  if (val === null || val === undefined) return 'N/A';
  return `${prefix}${Number(val).toFixed(2)}`;
};

const RatesModal: React.FC<RatesModalProps> = ({ onClose }) => {
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
    const amount = parseFloat(calcAmount) || 0;
    
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
    <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div className="modal-content glass-panel" style={{ maxWidth: '500px', width: '90%', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Tasas de Cambio
          </h2>
          <button onClick={onClose} className="btn-secondary" style={{ padding: '0.5rem', background: 'transparent', border: 'none', color: '#cbd5e1' }}>
            <X size={24} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#cbd5e1' }}>Cargando tasas del mercado...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Rates Display */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🇺🇸</span>
                  <span style={{ fontWeight: 600, color: '#e2e8f0' }}>Dólar BCV</span>
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>
                  {formatRate(rates?.usd_bs)}
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🇪🇺</span>
                  <span style={{ fontWeight: 600, color: '#e2e8f0' }}>Euro BCV</span>
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#3b82f6' }}>
                  {formatRate(rates?.eur_bs)}
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🪙</span>
                  <span style={{ fontWeight: 600, color: '#e2e8f0' }}>Binance USDT</span>
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f59e0b' }}>
                  {formatRate(rates?.usdt_bs)}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
              Última actualización: {rates?.last_updated ? new Date(rates.last_updated).toLocaleString() : 'N/A'}
              <button onClick={fetchRates} style={{ background: 'none', border: 'none', color: '#3b82f6', marginLeft: '0.5rem', cursor: 'pointer', textDecoration: 'underline' }}>
                <RefreshCw size={12} style={{ display: 'inline', marginRight: '2px' }}/> Actualizar
              </button>
            </div>

            {/* Calculator Section */}
            <div style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ color: '#fff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                <Calculator size={18} /> Calculadora de Divisas
              </h3>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <input 
                  type="number" 
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(e.target.value)}
                  className="form-input"
                  style={{ flex: 2, padding: '0.75rem', borderRadius: '8px', color: '#fff', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <select 
                  value={calcBase}
                  onChange={(e) => setCalcBase(e.target.value as any)}
                  className="form-input"
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', color: '#fff', backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <option value="USD">USD ($)</option>
                  <option value="BS">BS (Bs)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="USDT">USDT</option>
                </select>
              </div>

              {calcResults && (
                <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#cbd5e1' }}>🇻🇪 Bs:</span>
                    <span style={{ fontWeight: 'bold', color: '#fff' }}>{formatCalc(calcResults.bs, '')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#cbd5e1' }}>🇺🇸 USD:</span>
                    <span style={{ fontWeight: 'bold', color: '#fff' }}>{formatCalc(calcResults.usd, '$')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#cbd5e1' }}>🇪🇺 EUR:</span>
                    <span style={{ fontWeight: 'bold', color: '#fff' }}>{formatCalc(calcResults.eur, '€')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#cbd5e1' }}>🪙 USDT:</span>
                    <span style={{ fontWeight: 'bold', color: '#fff' }}>{formatCalc(calcResults.usdt, '')}</span>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default RatesModal;
