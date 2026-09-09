import { useState } from 'react';
import type { SummaryResponse } from '../types';

interface SummaryProps {
  summary: SummaryResponse | null;
}

type DisplayCurrency = 'usd' | 'bs' | 'eur' | 'usdt';

const Summary: React.FC<SummaryProps> = ({ summary }) => {
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('usd');

  if (!summary) return <div className="summary-card skeleton" />;

  const getPrefix = (curr: DisplayCurrency) => {
    switch (curr) {
      case 'usd': return '$';
      case 'eur': return '€';
      case 'bs': return 'Bs ';
      case 'usdt': return 'USDT ';
    }
  };

  const totalSpent = summary[`total_spent_${displayCurrency}`] || 0;
  const totalMonth = summary[`total_this_month_${displayCurrency}`] || 0;

  return (
    <div className="summary-container-wrapper">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <select
          value={displayCurrency}
          onChange={(e) => setDisplayCurrency(e.target.value as DisplayCurrency)}
          style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
        >
          <option value="usd" style={{ color: 'black' }}>Ver en $ (tasa BCV)</option>
          <option value="bs" style={{ color: 'black' }}>Ver en Bs</option>
          <option value="eur" style={{ color: 'black' }}>Ver en € (Tasa BCV)</option>
          <option value="usdt" style={{ color: 'black' }}>Ver en USDT</option>
        </select>
      </div>
      <div className="summary-container">
        <div className="summary-card main-summary">
          <h2>Total Spent</h2>
          <div className="amount">{getPrefix(displayCurrency)}{Number(totalSpent).toFixed(2)}</div>
          <p className="subtitle">All time</p>
        </div>
        <div className="summary-card secondary-summary">
          <h2>This Month</h2>
          <div className="amount highlight">{getPrefix(displayCurrency)}{Number(totalMonth).toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
};

export default Summary;
