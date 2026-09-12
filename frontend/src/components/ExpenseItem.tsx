import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Expense } from '../types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Pencil, Trash2, ChevronDown, Package } from 'lucide-react';
import { ICON_MAP } from './CategoryManager';

interface ExpenseItemProps {
  expense: Expense;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  categoryColor?: string;
}

const getCategoryIcon = (category: string) => {
  const icons: Record<string, string> = {
    'Food': 'Utensils',
    'Transport': 'Car',
    'Entertainment': 'Tv',
    'Bills': 'Home',
    'Shopping': 'ShoppingCart',
    'Alimentación': 'Utensils',
    'Vivienda': 'Home',
    'Ocio': 'Tv',
    'Salud': 'HeartPulse',
    'Other': 'Package'
  };
  return icons[category] || 'Package';
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
  const iconName = categoryColor || getCategoryIcon(expense.category);
  const IconComponent = ICON_MAP[iconName] || Package;

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
          backgroundColor: 'var(--surface-color)',
          color: 'var(--text-secondary)',
          width: '44px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '12px',
          border: '1px solid var(--border-color)'
        }}>
          <IconComponent size={22} />
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

      {isExpanded && createPortal(
        <div className="bottom-sheet-overlay" onClick={() => setIsExpanded(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: 600 }}>Detalle del Gasto</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500 }}>
                  {expense.category}
                </span>
                {getCurrencyBadge(expense.currency)}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--surface-muted)', padding: '1rem', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Dólar BCV</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {formatVal(expense.rate_usd_bs, '$ ')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Equiv. Bs</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {formatVal(expense.amount_bs, 'Bs ')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Equiv. EUR</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {formatVal(expense.amount_eur, '€ ')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Equiv. USDT</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {formatVal(expense.amount_usdt, '$ ')}
                  </span>
                </div>
              </div>

              {expense.currency === 'USD_CASH' && (
                <div style={{ fontSize: '0.75rem', color: '#10b981', fontStyle: 'italic' }}>
                  * Efectivo: se usa la tasa más alta o facilitada.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '0.5rem' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsExpanded(false); onDelete(expense.id); }}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600 }}
                >
                  <Trash2 size={18} /> Borrar
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsExpanded(false); onEdit(expense); }}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', background: 'var(--accent-light)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600 }}
                >
                  <Pencil size={18} /> Editar
                </button>
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ExpenseItem;
