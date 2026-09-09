import React, { useState } from 'react';
import type { Expense } from '../types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Pencil, Trash2, ChevronDown } from 'lucide-react';

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
    case 'BS_USD': return <span style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Bs (Tasa USD)</span>;
    case 'BS_EUR': return <span style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Bs (Tasa EUR)</span>;
    case 'USDT': return <span style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>USDT</span>;
    case 'USD_CASH': return <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>USD Cash</span>;
    default: return null;
  }
};

const formatVal = (val: number | null | undefined, prefix: string) => {
  if (val === null || val === undefined) return 'N/A';
  return `${prefix}${Number(val).toFixed(2)}`;
};

const ExpenseItem: React.FC<ExpenseItemProps> = ({ expense, onEdit, onDelete, categoryColor }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const bgColor = categoryColor || getCategoryColor(expense.category);

  return (
    <div 
      className="soft-card expense-item" 
      onClick={() => setIsExpanded(!isExpanded)}
      style={{ 
        padding: '1.25rem', 
        marginBottom: '1rem', 
        borderRadius: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ 
          backgroundColor: `${bgColor}20`, 
          color: bgColor,
          width: '44px', 
          height: '44px', 
          fontSize: '1.25rem', 
          fontWeight: 'bold',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          borderRadius: '12px' 
        }}>
          {expense.category.charAt(0).toUpperCase()}
        </div>
        
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {expense.description}
          </h3>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
            {format(parseISO(expense.date), "dd MMM yyyy", { locale: es })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {formatVal(expense.amount_usd, '$')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem' }}>Ver más</span>
            <ChevronDown 
              size={14} 
              style={{ 
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', 
                transition: 'transform 0.3s ease' 
              }} 
            />
          </div>
        </div>
      </div>

      <div style={{ 
        maxHeight: isExpanded ? '300px' : '0', 
        opacity: isExpanded ? 1 : 0, 
        overflow: 'hidden', 
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        marginTop: isExpanded ? '1rem' : '0'
      }}>
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500 }}>
              {expense.category}
            </span>
            {getCurrencyBadge(expense.currency)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', background: 'var(--surface-muted)', padding: '1rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Monto Original</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {formatVal(expense.amount, (expense.currency || '').startsWith('BS') ? 'Bs ' : (expense.currency === 'USDT' ? 'USDT ' : '$'))}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Equiv. Bs</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {formatVal(expense.amount_bs, 'Bs ')}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Equiv. EUR</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {formatVal(expense.amount_eur, '€ ')}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Equiv. USDT</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {formatVal(expense.amount_usdt, 'USDT ')}
              </span>
            </div>
          </div>

          {expense.currency === 'USD_CASH' && (
            <div style={{ fontSize: '0.75rem', color: '#10b981', fontStyle: 'italic' }}>
              * Efectivo: se usa la tasa más alta o facilitada.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button 
              onClick={(e) => { e.stopPropagation(); onEdit(expense); }} 
              style={{ padding: '0.5rem', borderRadius: '8px', background: 'var(--accent-light)', color: 'var(--accent-color)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Pencil size={18} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(expense.id); }} 
              style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Trash2 size={18} />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ExpenseItem;
