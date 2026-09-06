import React, { useState, useEffect } from 'react';
import { getExpenses, getSummary, createExpense, updateExpense, deleteExpense } from './api';
import type { Expense, SummaryResponse, ExpenseCreate, ExpenseUpdate } from './types';
import Summary from './components/Summary';
import ExpenseList from './components/ExpenseList';
import ExpenseForm from './components/ExpenseForm';
import { Plus } from 'lucide-react';
import './index.css';

function App() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      await deleteExpense(id);
      await fetchData();
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Failed to delete expense');
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
      <header className="app-header">
        <h1>GastosApp</h1>
      </header>

      <main className="app-main">
        {isLoading ? (
          <div className="loading">Loading your data...</div>
        ) : (
          <>
            <Summary summary={summary} />
            <div className="list-header">
              <h2>Recent Expenses</h2>
            </div>
            <ExpenseList 
              expenses={expenses} 
              onEdit={handleEdit} 
              onDelete={handleDelete} 
            />
          </>
        )}
      </main>

      <button className="fab-add" onClick={handleAddClick} aria-label="Add Expense">
        <Plus size={24} />
      </button>

      {isFormOpen && (
        <ExpenseForm 
          initialData={editingExpense}
          onSubmit={handleCreateOrUpdate}
          onCancel={handleCloseForm}
        />
      )}
    </div>
  );
}

export default App;
