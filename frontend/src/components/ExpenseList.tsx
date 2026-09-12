import { useState, useMemo, useEffect } from 'react';
import type { Expense, Category } from '../types';
import ExpenseItem from './ExpenseItem';
import AmountRangeFilter from './AmountRangeFilter';
import { Filter, ChevronDown, ChevronUp, Search } from 'lucide-react';

interface ExpenseListProps {
  expenses: Expense[];
  categories: Category[];
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, categories, onEdit, onDelete }) => {
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterCurrency, setFilterCurrency] = useState<string>('All');
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');


  const { globalMin, globalMax } = useMemo(() => {
    if (!expenses.length) return { globalMin: 0, globalMax: 1000 };
    let min = Infinity;
    let max = -Infinity;
    expenses.forEach(e => {
      const val = Number(e.amount_usd) || 0;
      if (val < min) min = val;
      if (val > max) max = val;
    });
    if (min === Infinity || max === -Infinity) return { globalMin: 0, globalMax: 1000 };
    return { globalMin: Math.floor(min), globalMax: Math.ceil(max) };
  }, [expenses]);

  const [filterMinAmount, setFilterMinAmount] = useState<number>(globalMin);
  const [filterMaxAmount, setFilterMaxAmount] = useState<number>(globalMax);

  // Sync state if global changes (e.g. initial load)
  useEffect(() => {
    setFilterMinAmount(globalMin);
    setFilterMaxAmount(globalMax);
  }, [globalMin, globalMax]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      const matchCategory = filterCategory === 'All' || expense.category === filterCategory;
      const matchCurrency = filterCurrency === 'All' || expense.currency === filterCurrency;
      
      const valUsd = Number(expense.amount_usd) || 0;
      const matchAmount = valUsd >= filterMinAmount && valUsd <= filterMaxAmount;

      const matchSearch = expense.description.toLowerCase().includes(searchTerm.toLowerCase());

      return matchCategory && matchCurrency && matchAmount && matchSearch;
    });
  }, [expenses, filterCategory, filterCurrency, filterMinAmount, filterMaxAmount, searchTerm]);

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

  const activeFiltersCount = 
    (filterCategory !== 'All' ? 1 : 0) + 
    (filterCurrency !== 'All' ? 1 : 0) + 
    (filterMinAmount > globalMin || filterMaxAmount < globalMax ? 1 : 0);

  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterCategory, filterCurrency, filterMinAmount, filterMaxAmount, searchTerm]);

  const totalPages = Math.ceil(filteredExpenses.length / ITEMS_PER_PAGE);
  const paginatedExpenses = filteredExpenses.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="expense-list-container">
      
      {/* Barra de Búsqueda y Botón Filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        
        {/* Input de Búsqueda */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          flexGrow: 1, 
          background: 'var(--surface-color)',
          border: '1px solid var(--border-color)',
          borderRadius: '20px',
          padding: '0.5rem 1rem',
          gap: '0.5rem'
        }}>
          <Search size={16} color="var(--text-tertiary)" />
          <input 
            type="text"
            placeholder="Buscar gasto por descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              width: '100%',
              color: 'var(--text-primary)',
              fontSize: '0.9rem'
            }}
          />
        </div>

        {/* Botón de Filtros */}
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
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap'
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
          {/* Amount Range Filter */}
          <div style={{ width: '100%', marginBottom: '0.5rem' }}>
            <AmountRangeFilter 
              min={globalMin} 
              max={globalMax} 
              minVal={filterMinAmount} 
              maxVal={filterMaxAmount} 
              onChange={(min, max) => {
                setFilterMinAmount(min);
                setFilterMaxAmount(max);
              }}
            />
          </div>

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
