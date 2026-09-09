import { useState, useMemo, useEffect } from 'react';
import type { Expense, Category, DateFilter, DatePreset } from '../types';
import { getCategories } from '../api';
import ExpenseItem from './ExpenseItem';
import { Filter, ChevronDown, ChevronUp } from 'lucide-react';

interface ExpenseListProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  dateFilter?: DateFilter;
  onDateChange?: (filter: DateFilter) => void;
}

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, onEdit, onDelete, dateFilter, onDateChange }) => {
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterCurrency, setFilterCurrency] = useState<string>('All');
  const [categories, setCategories] = useState<Category[]>([]);
  const [showFilters, setShowFilters] = useState(false);

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
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      const matchCategory = filterCategory === 'All' || expense.category === filterCategory;
      const matchCurrency = filterCurrency === 'All' || expense.currency === filterCurrency;
      return matchCategory && matchCurrency;
    });
  }, [expenses, filterCategory, filterCurrency]);

  const currencyStats = useMemo(() => {
    if (filterCurrency === 'All') return null;

    let totalPeriod = 0;
    filteredExpenses.forEach(exp => {
      const amount = typeof exp.amount === 'string' ? parseFloat(exp.amount) : exp.amount;
      totalPeriod += amount;
    });

    return { totalPeriod };
  }, [filteredExpenses, filterCurrency]);

  const getCurrencyLabel = (currency: string) => {
    switch (currency) {
      case 'BS_USD': return 'Bs (Tasa USD)';
      case 'BS_EUR': return 'Bs (Tasa EUR)';
      case 'USDT': return 'USDT';
      case 'USD_CASH': return 'Dólares Efectivo';
      default: return currency;
    }
  };

  const selectStyle = {
    padding: '0.6rem 1rem', 
    borderRadius: '8px', 
    background: 'var(--surface-color)', 
    color: 'var(--text-primary)', 
    border: '1px solid var(--border-color)',
    fontSize: '0.9rem',
    outline: 'none',
    width: '100%',
    maxWidth: '200px'
  };

  const activeFiltersCount = (filterCategory !== 'All' ? 1 : 0) + (filterCurrency !== 'All' ? 1 : 0) + (dateFilter?.preset !== 'month' ? 1 : 0);

  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterCategory, filterCurrency, dateFilter]);

  const totalPages = Math.ceil(filteredExpenses.length / ITEMS_PER_PAGE);
  const paginatedExpenses = filteredExpenses.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="expense-list-container">
      
      {/* Botón para Mostrar/Ocultar Filtros */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button 
          onClick={() => setShowFilters(!showFilters)}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            background: showFilters ? 'var(--surface-muted)' : 'var(--surface-color)', 
            border: '1px solid var(--border-color)', 
            padding: '0.5rem 1rem', 
            borderRadius: '20px', 
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <Filter size={14} />
          {showFilters ? 'Ocultar Filtros' : 'Filtros'}
          {!showFilters && activeFiltersCount > 0 && (
            <span style={{ background: 'var(--accent-color)', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
              {activeFiltersCount}
            </span>
          )}
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Panel de Filtros Desplegable */}
      {showFilters && (
        <div 
          className="soft-card" 
          style={{ 
            padding: '1.25rem', 
            marginBottom: '1.5rem', 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '1rem',
            animation: 'fadeIn 0.2s ease'
          }}
        >
          {dateFilter && onDateChange && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 180px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Período</label>
              <select
                value={dateFilter.preset}
                onChange={(e) => {
                  const preset = e.target.value as DatePreset;
                  if (preset !== 'custom') {
                    onDateChange({ preset, from: undefined, to: undefined });
                  } else {
                    const today = new Date().toISOString().split('T')[0];
                    onDateChange({ preset: 'custom', from: dateFilter.from || today, to: dateFilter.to || today });
                  }
                }}
                style={{...selectStyle, maxWidth: '100%'}}
              >
                <option value="today">Hoy</option>
                <option value="week">Esta Semana</option>
                <option value="month">Este Mes</option>
                <option value="year">Este Año</option>
                <option value="all">Todo</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>
          )}

          {dateFilter?.preset === 'custom' && onDateChange && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 250px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Fechas Custom</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="date"
                  value={dateFilter.from || ''}
                  max={dateFilter.to || undefined}
                  onChange={(e) => onDateChange({ ...dateFilter, preset: 'custom', from: e.target.value || undefined })}
                  style={{...selectStyle, maxWidth: '100%'}}
                />
                <span style={{ color: 'var(--text-tertiary)' }}>-</span>
                <input 
                  type="date"
                  value={dateFilter.to || ''}
                  min={dateFilter.from || undefined}
                  onChange={(e) => onDateChange({ ...dateFilter, preset: 'custom', to: e.target.value || undefined })}
                  style={{...selectStyle, maxWidth: '100%'}}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 180px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Categoría</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{...selectStyle, maxWidth: '100%'}}
            >
              <option value="All">Todas las Categorías</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
              <option value="Sin Categoría">Sin Categoría</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 180px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Moneda</label>
            <select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
              style={{...selectStyle, maxWidth: '100%'}}
            >
              <option value="All">Todas las Monedas</option>
              <option value="BS_USD">BS (tasa dolar BCV)</option>
              <option value="BS_EUR">BS (tasa euro BCV)</option>
              <option value="USDT">USDT</option>
              <option value="USD_CASH">Dólares (Efectivo)</option>
            </select>
          </div>
        </div>
      )}

      {filterCurrency !== 'All' && currencyStats && (
        <div className="soft-card" style={{ marginBottom: '1.5rem', padding: '1.5rem', textAlign: 'center' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-tertiary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total del Período ({getCurrencyLabel(filterCurrency)})
          </h4>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            {currencyStats.totalPeriod.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="soft-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <p>No hay gastos en este período. ¡Añade uno para empezar!</p>
        </div>
      ) : filteredExpenses.length === 0 ? (
        <div className="soft-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <p>No se encontraron gastos con estos filtros.</p>
        </div>
      ) : (
        <div className="expense-list">
          {paginatedExpenses.map(expense => {
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
          
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem', paddingBottom: '1rem' }}>
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: currentPage === 1 ? 'var(--surface-color)' : 'var(--accent-light)',
                  color: currentPage === 1 ? 'var(--text-tertiary)' : 'var(--accent-color)',
                  fontWeight: 600,
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Anterior
              </button>
              
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Página {currentPage} de {totalPages}
              </span>
              
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: currentPage === totalPages ? 'var(--surface-color)' : 'var(--accent-light)',
                  color: currentPage === totalPages ? 'var(--text-tertiary)' : 'var(--accent-color)',
                  fontWeight: 600,
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExpenseList;
