import React, { useState } from 'react';
import type { Expense, Category } from '../types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Pencil, Trash2 } from 'lucide-react';
import { resolveCategoryVisuals } from '../utils/categoryVisuals';
import { useCurrencyPreference } from '../context/CurrencyPreferenceContext';
import { formatListCardAmounts } from '../utils/currencyFormat';
import { CurrencyBreakdownCard } from './ui/CurrencyBreakdownCard';
import ListCard from './ListCard';
import ListCardBottomSheet from './ListCardBottomSheet';

interface ExpenseItemProps {
  expense: Expense;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  categoryColor?: string;
  categoryObj?: Category;
}

const getCurrencyBadge = (currency: string) => {
  switch (currency) {
    case 'USD_BCV': return <span style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Dólar BCV</span>;
    case 'EUR_BCV': return <span style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Euro BCV</span>;
    case 'BS': return <span style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Bolívares</span>;
    case 'USDT': return <span style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>USDT</span>;
    case 'USD_CASH': return <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>USD Cash</span>;
    default: return null;
  }
};

const ExpenseItem: React.FC<ExpenseItemProps> = ({ expense, onEdit, onDelete, categoryObj, categoryColor }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { mainCurrency } = useCurrencyPreference();
  const effectiveCatObj = categoryObj || (categoryColor ? ({ name: expense.category, color: categoryColor } as Category) : null);
  const { IconComponent, hexColor } = resolveCategoryVisuals(effectiveCatObj, expense.category);
  const { primaryAmount, secondaryAmount } = formatListCardAmounts(expense, mainCurrency);

  return (
    <>
      <ListCard
        statusColor={hexColor}
        icon={<IconComponent size={22} />}
        iconBg={`${hexColor}18`}
        iconColor={hexColor}
        title={expense.description}
        subtitle={format(parseISO(expense.date), "dd MMM yyyy", { locale: es })}
        badges={
          <span
            style={{
              backgroundColor: `${hexColor}18`,
              color: hexColor,
              border: `1px solid ${hexColor}35`,
              padding: '0.1rem 0.45rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.68rem',
              fontWeight: 600,
            }}
          >
            {expense.category}
          </span>
        }
        primaryAmount={primaryAmount}
        secondaryAmount={secondaryAmount}
        onClick={() => setIsExpanded(true)}
      />

      <ListCardBottomSheet
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
        title="Detalle del Gasto"
        subtitle={expense.description}
        headerExtra={getCurrencyBadge(expense.currency)}
        secondaryActions={[
          {
            label: 'Editar',
            icon: <Pencil size={16} />,
            onClick: () => {
              setIsExpanded(false);
              onEdit(expense);
            },
          },
          {
            label: 'Borrar',
            icon: <Trash2 size={16} />,
            danger: true,
            onClick: () => {
              setIsExpanded(false);
              onDelete(expense.id);
            },
          },
        ]}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <CurrencyBreakdownCard
            originalAmount={expense.amount}
            originalCurrency={expense.currency}
            amountBs={expense.amount_bs}
            amountUsd={expense.amount_usd}
            amountEur={expense.amount_eur}
            amountUsdt={expense.amount_usdt}
            rateUsdBs={expense.rate_usd_bs}
            rateEurBs={expense.rate_eur_bs}
            rateUsdtBs={expense.rate_usdt_bs}
          />

          {expense.currency === 'USD_CASH' && (
            <div style={{ fontSize: '0.75rem', color: '#10b981', fontStyle: 'italic', marginTop: '0.25rem' }}>
              * Efectivo: se usa la tasa más alta o facilitada.
            </div>
          )}
        </div>
      </ListCardBottomSheet>
    </>
  );
};

export default React.memo(ExpenseItem);
