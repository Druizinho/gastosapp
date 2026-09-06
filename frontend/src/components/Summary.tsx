import React from 'react';
import type { SummaryResponse } from '../types';

interface SummaryProps {
  summary: SummaryResponse | null;
}

const Summary: React.FC<SummaryProps> = ({ summary }) => {
  if (!summary) return <div className="summary-card skeleton" />;

  return (
    <div className="summary-container">
      <div className="summary-card main-summary">
        <h2>Total Spent</h2>
        <div className="amount">${Number(summary.total_spent).toFixed(2)}</div>
        <p className="subtitle">All time</p>
      </div>
      <div className="summary-card secondary-summary">
        <h2>This Month</h2>
        <div className="amount highlight">${Number(summary.total_this_month).toFixed(2)}</div>
      </div>
    </div>
  );
};

export default Summary;
