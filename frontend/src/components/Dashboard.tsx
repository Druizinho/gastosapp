import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getExpenses, getSummaryRange, createExpense, updateExpense, deleteExpense, getCategories } from '../api';
import type { Expense, RangeSummaryResponse, ExpenseCreate, ExpenseUpdate, DateFilter, DatePreset, Category } from '../types';
import { useAuth } from '../context/AuthContext';
import Summary from './Summary';
import PeriodSelector from './PeriodSelector';
import ExpenseList from './ExpenseList';
import ExpenseForm from './ExpenseForm';
import ConfirmModal from './ConfirmModal';

const Dashboard: React.FC = () => {
  const { displayName, avatarUrl } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Initialize filter from URL or default
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    const preset = (searchParams.get('preset') as DatePreset) || 'month';
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    return { preset, from, to };
  });

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<RangeSummaryResponse | null>(null);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, expenseId: '' });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Helper function to resolve dates based on preset
      const resolveDates = (filter: DateFilter) => {
        const today = new Date();
        const yyyyMmDd = (d: Date) => d.toISOString().split('T')[0];
        
        let from = filter.from;
        let to = filter.to;
        
        if (filter.preset === 'today') {
          from = yyyyMmDd(today);
          to = from;
        } else if (filter.preset === 'week') {
          const firstDay = new Date(today.setDate(today.getDate() - today.getDay()));
          const lastDay = new Date(today.setDate(today.getDate() - today.getDay() + 6));
          from = yyyyMmDd(firstDay);
          to = yyyyMmDd(lastDay);
        } else if (filter.preset === 'month') {
          const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
          const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          from = yyyyMmDd(firstDay);
          to = yyyyMmDd(lastDay);
        } else if (filter.preset === 'year') {
          const firstDay = new Date(today.getFullYear(), 0, 1);
          const lastDay = new Date(today.getFullYear(), 11, 31);
          from = yyyyMmDd(firstDay);
          to = yyyyMmDd(lastDay);
        } else if (filter.preset === 'all') {
          from = '2000-01-01'; // Default long past
          to = yyyyMmDd(today);
        }
        
        return { from: from!, to: to! };
      };

      const resolved = resolveDates(dateFilter);

      // Si es "custom" pero no hay fechas, no podemos hacer fetch
      if (dateFilter.preset === 'custom' && (!dateFilter.from || !dateFilter.to)) {
        setIsLoading(false);
        return;
      }

      const [expensesData, summaryData, categoriesData] = await Promise.all([
        getExpenses(resolved.from, resolved.to),
        getSummaryRange(resolved.from, resolved.to),
        getCategories()
      ]);
      setExpenses(expensesData);
      setSummary(summaryData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Sync URL when filter changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('preset', dateFilter.preset);
    if (dateFilter.from) params.set('from', dateFilter.from);
    if (dateFilter.to) params.set('to', dateFilter.to);
    
    // Preserve 'add' parameter if it exists
    if (searchParams.get('add') === 'true') {
      params.set('add', 'true');
    }
    
    setSearchParams(params, { replace: true });
    
    fetchData();
  }, [dateFilter, searchParams, setSearchParams]);

  // Handle 'add' URL param to open form
  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      setEditingExpense(null);
      setIsFormOpen(true);
    } else {
      setIsFormOpen(false);
    }
  }, [searchParams]);

  const handleCreateOrUpdate = async (data: ExpenseCreate | ExpenseUpdate) => {
    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, data as ExpenseUpdate);
      } else {
        await createExpense(data as ExpenseCreate);
      }
      handleCloseForm();
      await fetchData();
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('Failed to save expense');
    }
  };

  const handleCloseForm = () => {
    setEditingExpense(null);
    setIsFormOpen(false);
    // Remove 'add' from URL
    if (searchParams.get('add') === 'true') {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('add');
      setSearchParams(newParams, { replace: true });
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteExpense(confirmDelete.expenseId);
      setConfirmDelete({ isOpen: false, expenseId: '' });
      await fetchData();
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Failed to delete expense');
    }
  };

  // Get user initials for avatar
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="dashboard-container" style={{ padding: '1rem', paddingBottom: '6rem' }}>
      {/* Top Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent-light)', border: '2px solid white', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.95rem', overflow: 'hidden' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              getInitials(displayName)
            )}
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Bienvenido,</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>{displayName}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: 'var(--surface-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
          </button>
        </div>
      </header>

      <main style={{ opacity: isLoading ? 0.5 : 1, pointerEvents: isLoading ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
        <PeriodSelector filter={dateFilter} onChange={setDateFilter} />
        <Summary summary={summary} dateFilter={dateFilter} categories={categories} />
        <div className="list-header mt-8 mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Gastos del Período</h2>
        </div>
        <ExpenseList 
          expenses={expenses} 
          categories={categories}
          onEdit={(e) => { setEditingExpense(e); setIsFormOpen(true); }} 
          onDelete={(id) => setConfirmDelete({ isOpen: true, expenseId: id })}
        />
      </main>

      <ConfirmModal 
        isOpen={confirmDelete.isOpen}
        title="¿Borrar gasto?"
        message="¿Seguro que quieres borrar este gasto? Esta acción no se puede deshacer."
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, expenseId: '' })}
      />

      {isFormOpen && (
        <ExpenseForm 
          initialData={editingExpense}
          onSubmit={handleCreateOrUpdate}
          onCancel={handleCloseForm}
        />
      )}
    </div>
  );
};

export default Dashboard;
