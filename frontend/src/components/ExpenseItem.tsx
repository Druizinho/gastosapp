
import type { Expense } from '../types';
import { format, parseISO } from 'date-fns';
import { Pencil, Trash2 } from 'lucide-react';

interface ExpenseItemProps {
  expense: Expense;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  categoryColor?: string;
}

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    'Food': '#ff9f43',
    'Transport': '#54a0ff',
    'Entertainment': '#ee5253',
    'Bills': '#10ac84',
    'Shopping': '#f368e0',
    'Other': '#c8d6e5'
  };
  return colors[category] || colors['Other'];
};

const getCurrencyBadge = (currency: string) => {
  switch (currency) {
    case 'BS_USD': return <span className="badge" style={{ backgroundColor: '#2563eb', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', marginRight: '8px' }}>Bs (Tasa USD)</span>;
    case 'BS_EUR': return <span className="badge" style={{ backgroundColor: '#7c3aed', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', marginRight: '8px' }}>Bs (Tasa EUR)</span>;
    case 'USDT': return <span className="badge" style={{ backgroundColor: '#f59e0b', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', marginRight: '8px' }}>USDT</span>;
    case 'USD_CASH': return <span className="badge" style={{ backgroundColor: '#10b981', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', marginRight: '8px' }}>USD Cash</span>;
    default: return null;
  }
};

const formatVal = (val: number | null | undefined, prefix: string) => {
  if (val === null || val === undefined) return 'N/A';
  return `${prefix}${Number(val).toFixed(2)}`;
};

const ExpenseItem: React.FC<ExpenseItemProps> = ({ expense, onEdit, onDelete, categoryColor }) => {
  const bgColor = categoryColor || getCategoryColor(expense.category);
  return (
    <div className="expense-item glass-panel" style={{ padding: '1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', borderRadius: '12px' }}>
      <div className="expense-icon" style={{ backgroundColor: bgColor, width: '48px', height: '48px', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px' }}>
        {expense.category.charAt(0)}
      </div>
      <div className="expense-details" style={{ flex: 1 }}>
        <h3 className="expense-description" style={{ fontSize: '1.2rem', marginBottom: '0.5rem', fontWeight: 600 }}>{expense.description}</h3>
        <div className="expense-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {getCurrencyBadge(expense.currency)}
          <span className="expense-category" style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{expense.category}</span>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <span className="expense-date" style={{ fontSize: '0.9rem', color: '#94a3b8' }}>{format(parseISO(expense.date), 'MMM dd, yyyy')}</span>
        </div>
        {expense.currency === 'USD_CASH' && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#f59e0b', fontStyle: 'italic' }}>
            * Las equivalencias y el resumen usan la tasa del mercado (la más alta).
          </div>
        )}
      </div>
      <div className="expense-amount-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.75rem', minWidth: '200px' }}>
        <div className="expense-amount" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff' }}>
          {formatVal(expense.amount, (expense.currency || '').startsWith('BS') ? 'Bs ' : (expense.currency === 'USDT' ? 'USDT ' : '$'))}
        </div>
        <div className="expense-equivalents" style={{ fontSize: '0.85rem', color: '#cbd5e1', backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '8px', width: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', textAlign: 'left' }}>
            <span title="Bolívares">🇻🇪 {formatVal(expense.amount_bs, 'Bs ')}</span>
            <span title="Dólares">🇺🇸 {formatVal(expense.amount_usd, '$ ')}</span>
            <span title="Euros">🇪🇺 {formatVal(expense.amount_eur, '€ ')}</span>
            <span title="USDT">🪙 {formatVal(expense.amount_usdt, 'USDT ')}</span>
          </div>
        </div>
        <div className="expense-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button onClick={() => onEdit(expense)} className="action-btn edit-btn" style={{ padding: '0.5rem', borderRadius: '6px' }}><Pencil size={18} /></button>
          <button onClick={() => onDelete(expense.id)} className="action-btn delete-btn" style={{ padding: '0.5rem', borderRadius: '6px' }}><Trash2 size={18} /></button>
        </div>
      </div>
    </div>
  );
};

export default ExpenseItem;
