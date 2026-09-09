import { useState, useMemo, useEffect } from 'react';
import type { Expense, Category } from '../types';
import { getCategories } from '../api';
import ExpenseItem from './ExpenseItem';

interface ExpenseListProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, onEdit, onDelete }) => {
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterCurrency, setFilterCurrency] = useState<string>('All');
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const cats = await getCategories();
        setCategories(cats);
      } catch (err) {
        console.error("Error fetching categories for filter", err);
      }
    };
    fetchCats();
  }, [expenses]); // Re-fetch if expenses change, as a simple way to stay reasonably up to date, or just on mount.

  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      const matchCategory = filterCategory === 'All' || expense.category === filterCategory;
      const matchCurrency = filterCurrency === 'All' || expense.currency === filterCurrency;
      return matchCategory && matchCurrency;
    });
  }, [expenses, filterCategory, filterCurrency]);

  const currencyStats = useMemo(() => {
    if (filterCurrency === 'All') return null;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totalAllTime = 0;
    let totalThisMonth = 0;

    expenses.forEach(exp => {
      if (exp.currency === filterCurrency) {
        const amount = typeof exp.amount === 'string' ? parseFloat(exp.amount) : exp.amount;
        totalAllTime += amount;
        const expDate = new Date(exp.date);
        // exp.date is typically YYYY-MM-DD. Need to handle timezone issues correctly.
        // It's safe to parse and get UTC month or local month. Let's use local since user entered it.
        if (expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear) {
          totalThisMonth += amount;
        }
      }
    });

    return { totalAllTime, totalThisMonth };
  }, [expenses, filterCurrency]);

  const getCurrencyLabel = (currency: string) => {
    switch (currency) {
      case 'BS_USD': return 'Bs (Tasa USD)';
      case 'BS_EUR': return 'Bs (Tasa EUR)';
      case 'USDT': return 'USDT';
      case 'USD_CASH': return 'Dólares Efectivo';
      default: return currency;
    }
  };

  if (expenses.length === 0) {
    return (
      <div className="empty-state glass-panel">
        <p>No expenses yet. Add one to get started!</p>
      </div>
    );
  }

  return (
    <div className="expense-list-container">
      <div className="filters-bar" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Filtros</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <option value="All" style={{ color: 'black' }}>Todas las Categorías</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.name} style={{ color: 'black' }}>{cat.name}</option>
            ))}
            <option value="Sin Categoría" style={{ color: 'black' }}>Sin Categoría</option>
          </select>

          <select
            value={filterCurrency}
            onChange={(e) => setFilterCurrency(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <option value="All" style={{ color: 'black' }}>Todas las Monedas</option>
            <option value="BS_USD" style={{ color: 'black' }}>BS (tasa dolar BCV)</option>
            <option value="BS_EUR" style={{ color: 'black' }}>BS (tasa euro BCV)</option>
            <option value="USDT" style={{ color: 'black' }}>USDT</option>
            <option value="USD_CASH" style={{ color: 'black' }}>Dólares (Efectivo)</option>
          </select>
        </div>
      </div>

      {filterCurrency !== 'All' && currencyStats && (
        <div className="currency-stats-card glass-panel" style={{ marginBottom: '1rem', padding: '1.5rem', display: 'flex', justifyContent: 'space-around', textAlign: 'center', backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
          <div>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#bae6fd', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gastado este mes ({getCurrencyLabel(filterCurrency)})</h4>
            <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold', color: '#fff' }}>
              {currencyStats.totalThisMonth.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div style={{ width: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
          <div>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#bae6fd', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Histórico ({getCurrencyLabel(filterCurrency)})</h4>
            <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold', color: '#fff' }}>
              {currencyStats.totalAllTime.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      <div className="currency-legend" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1rem', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.85rem', flexWrap: 'wrap' }}>
        <span><strong>Leyenda de Conversiones:</strong></span>
        <span>🇻🇪 Bolívares</span>
        <span>🇺🇸 Dólares (BCV)</span>
        <span>🇪🇺 Euros (BCV)</span>
        <span>🪙 USDT (Binance)</span>
      </div>

      {filteredExpenses.length === 0 ? (
        <div className="empty-state glass-panel">
          <p>No se encontraron gastos con estos filtros.</p>
        </div>
      ) : (
        <div className="expense-list">
          {filteredExpenses.map(expense => {
            const cat = categories.find(c => c.name === expense.category);
            const color = cat ? cat.color : undefined;
            return (
              <ExpenseItem
                key={expense.id}
                expense={expense}
                onEdit={onEdit}
                onDelete={onDelete}
                categoryColor={color}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExpenseList;
