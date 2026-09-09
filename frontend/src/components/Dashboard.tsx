import React, { useState, useEffect } from 'react';
import { getExpenses, getSummary, createExpense, updateExpense, deleteExpense } from '../api';
import type { Expense, SummaryResponse, ExpenseCreate, ExpenseUpdate } from '../types';
import Summary from './Summary';
import ExpenseList from './ExpenseList';
import ExpenseForm from './ExpenseForm';
import CategoryManager from './CategoryManager';
import ConfirmModal from './ConfirmModal';
import { Plus, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import '../index.css';

const Dashboard: React.FC = () => {
  const { signOut, user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, expenseId: '' });

  const fetchData = async () => {
    try {
      const [expensesData, summaryData] = await Promise.all([
        getExpenses(),
        getSummary()
      ]);
      setExpenses(expensesData);
      setSummary(summaryData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateOrUpdate = async (data: ExpenseCreate | ExpenseUpdate) => {
    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, data as ExpenseUpdate);
      } else {
        await createExpense(data as ExpenseCreate);
      }
      setIsFormOpen(false);
      setEditingExpense(null);
      await fetchData();
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('Failed to save expense');
    }
  };

  const openDeleteConfirm = (id: string) => {
    setConfirmDelete({ isOpen: true, expenseId: id });
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteExpense(confirmDelete.expenseId);
      setConfirmDelete({ isOpen: false, expenseId: '' });
      await fetchData();
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Failed to delete expense');
      setConfirmDelete({ isOpen: false, expenseId: '' });
    }
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setIsFormOpen(true);
  };

  const handleAddClick = () => {
    setEditingExpense(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingExpense(null);
  };

  return (
    <div className="app-container">
      <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>GastosApp</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => setIsCategoryManagerOpen(true)} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} /> Categorías
          </button>
          <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>{user?.email}</span>
          <button onClick={signOut} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LogOut size={18} /> Salir
          </button>
        </div>
      </header>

      <main className="app-main">
        {isLoading ? (
          <div className="loading">Cargando tus datos...</div>
        ) : (
          <>
            <Summary summary={summary} />
            <div className="list-header">
              <h2>Gastos Recientes</h2>
            </div>
            <ExpenseList 
              expenses={expenses} 
              onEdit={handleEdit} 
              onDelete={openDeleteConfirm} 
            />
          </>
        )}
      </main>

      <button className="fab-add" onClick={handleAddClick} aria-label="Add Expense">
        <Plus size={24} />
      </button>

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

      {isCategoryManagerOpen && (
        <CategoryManager 
          onClose={() => setIsCategoryManagerOpen(false)}
          onCategoriesChanged={() => fetchData()}
        />
      )}
    </div>
  );
};

export default Dashboard;
