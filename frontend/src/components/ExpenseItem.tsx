import React from 'react';
import type { Expense } from '../types';
import { format, parseISO } from 'date-fns';
import { Pencil, Trash2 } from 'lucide-react';

interface ExpenseItemProps {
  expense: Expense;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
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

const ExpenseItem: React.FC<ExpenseItemProps> = ({ expense, onEdit, onDelete }) => {
  return (
    <div className="expense-item glass-panel">
      <div className="expense-icon" style={{ backgroundColor: getCategoryColor(expense.category) }}>
        {expense.category.charAt(0)}
      </div>
      <div className="expense-details">
        <h3 className="expense-description">{expense.description}</h3>
        <div className="expense-meta">
          <span className="expense-category">{expense.category}</span>
          <span className="expense-date">{format(parseISO(expense.date), 'MMM dd, yyyy')}</span>
        </div>
      </div>
      <div className="expense-amount-actions">
        <div className="expense-amount">${Number(expense.amount).toFixed(2)}</div>
        <div className="expense-actions">
          <button onClick={() => onEdit(expense)} className="action-btn edit-btn"><Pencil size={16} /></button>
          <button onClick={() => onDelete(expense.id)} className="action-btn delete-btn"><Trash2 size={16} /></button>
        </div>
      </div>
    </div>
  );
};

export default ExpenseItem;
