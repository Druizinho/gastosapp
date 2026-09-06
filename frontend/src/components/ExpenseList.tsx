
import type { Expense } from '../types';
import ExpenseItem from './ExpenseItem';

interface ExpenseListProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, onEdit, onDelete }) => {
  if (expenses.length === 0) {
    return (
      <div className="empty-state glass-panel">
        <p>No expenses yet. Add one to get started!</p>
      </div>
    );
  }

  return (
    <div className="expense-list">
      {expenses.map(expense => (
        <ExpenseItem 
          key={expense.id} 
          expense={expense} 
          onEdit={onEdit} 
          onDelete={onDelete} 
        />
      ))}
    </div>
  );
};

export default ExpenseList;
