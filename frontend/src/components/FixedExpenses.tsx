import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Receipt, Pause, Play, Trash2, Edit3, Calendar } from 'lucide-react';
import { getFixedExpenses, getFixedExpenseSummary, createFixedExpense, updateFixedExpense, deleteFixedExpense } from '../api';
import type { FixedExpense, FixedExpenseCreate, FixedExpenseUpdate, FixedExpenseSummary } from '../types';
import FixedExpenseForm from './FixedExpenseForm';
import ConfirmModal from './ConfirmModal';

const currencyLabels: Record<string, string> = {
  'USD_BCV': '$',
  'EUR_BCV': '€',
  'BS': 'Bs.',
  'USDT': 'USDT',
  'USD_CASH': '$ Cash',
};

const formatAmount = (amount: number | null | undefined, prefix: string = '') => {
  if (amount === null || amount === undefined) return '—';
  return `${prefix}${Number(amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const FixedExpenses: React.FC = () => {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<FixedExpense[]>([]);
  const [summary, setSummary] = useState<FixedExpenseSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FixedExpense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, expenseId: '' });
  const [displayCurrency, setDisplayCurrency] = useState<'bs' | 'usd' | 'eur' | 'usdt'>('usd');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [expensesData, summaryData] = await Promise.all([
        getFixedExpenses(),
        getFixedExpenseSummary()
      ]);
      setExpenses(expensesData);
      setSummary(summaryData);
    } catch (error) {
      console.error('Error fetching fixed expenses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateOrUpdate = async (data: FixedExpenseCreate | FixedExpenseUpdate) => {
    try {
      if (editingExpense) {
        await updateFixedExpense(editingExpense.id, data as FixedExpenseUpdate);
      } else {
        await createFixedExpense(data as FixedExpenseCreate);
      }
      setIsFormOpen(false);
      setEditingExpense(null);
      await fetchData();
    } catch (error) {
      console.error('Error saving fixed expense:', error);
      alert('Error al guardar el gasto fijo');
    }
  };

  const handleToggleActive = async (expense: FixedExpense) => {
    try {
      await updateFixedExpense(expense.id, { is_active: !expense.is_active });
      await fetchData();
    } catch (error) {
      console.error('Error toggling active:', error);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteFixedExpense(confirmDelete.expenseId);
      setConfirmDelete({ isOpen: false, expenseId: '' });
      await fetchData();
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Error al eliminar');
    }
  };

  const getSummaryAmount = () => {
    if (!summary) return '0.00';
    const map = { bs: summary.total_bs, usd: summary.total_usd, eur: summary.total_eur, usdt: summary.total_usdt };
    const prefixMap = { bs: 'Bs. ', usd: '$ ', eur: '€ ', usdt: '' };
    const suffixMap = { bs: '', usd: '', eur: '', usdt: ' USDT' };
    return `${prefixMap[displayCurrency]}${Number(map[displayCurrency]).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffixMap[displayCurrency]}`;
  };

  const cycleDisplayCurrency = () => {
    const order: Array<'bs' | 'usd' | 'eur' | 'usdt'> = ['usd', 'bs', 'eur', 'usdt'];
    const idx = order.indexOf(displayCurrency);
    setDisplayCurrency(order[(idx + 1) % order.length]);
  };

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      {/* Header with back button */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
        <button
          onClick={() => navigate('/herramientas')}
          style={{
            width: '40px', height: '40px', borderRadius: 'var(--radius-full)',
            background: 'var(--surface-color)', border: 'none', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)', color: 'var(--text-primary)',
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Gastos Fijos
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
            Gastos recurrentes mensuales
          </p>
        </div>
      </header>

      {/* Summary card */}
      <div
        className="soft-card"
        onClick={cycleDisplayCurrency}
        style={{ 
          marginBottom: '1.5rem', padding: '1.5rem', cursor: 'pointer',
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.06) 0%, var(--surface-color) 100%)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Mensual Comprometido
          </span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-full)',
            background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B',
            fontSize: '0.75rem', fontWeight: 600,
          }}>
            <Receipt size={14} />
            {summary?.total_active || 0} activos
          </div>
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          {isLoading ? '...' : getSummaryAmount()}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
          Toca para cambiar moneda
        </div>
      </div>

      {/* Add button */}
      <button
        onClick={() => { setEditingExpense(null); setIsFormOpen(true); }}
        style={{
          width: '100%', padding: '0.875rem', marginBottom: '1.25rem',
          background: 'var(--surface-color)', border: '2px dashed var(--accent-light)',
          borderRadius: 'var(--radius-md)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600,
          transition: 'all 0.2s ease',
        }}
      >
        <Plus size={18} />
        Agregar gasto fijo
      </button>

      {/* Expense list */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>Cargando...</div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <Receipt size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
          <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '0.5rem' }}>Sin gastos fijos</p>
          <p style={{ fontSize: '0.85rem' }}>Agrega tus gastos recurrentes como alquiler, servicios, suscripciones, etc.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="soft-card"
              style={{
                padding: '1rem 1.25rem',
                opacity: expense.is_active ? 1 : 0.55,
                transition: 'opacity 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)',
                    textDecoration: expense.is_active ? 'none' : 'line-through',
                  }}>
                    {expense.name}
                  </div>
                  {expense.category && (
                    <span style={{
                      display: 'inline-block', fontSize: '0.7rem', fontWeight: 500,
                      color: 'var(--text-secondary)', background: 'var(--surface-muted)',
                      padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)', marginTop: '0.25rem',
                    }}>
                      {expense.category}
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {currencyLabels[expense.currency]} {formatAmount(expense.amount)}
                  </div>
                  {expense.amount_bs && expense.currency !== 'BS' && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      ≈ Bs. {formatAmount(expense.amount_bs)}
                    </div>
                  )}
                  {expense.amount_usd && expense.currency !== 'USD_BCV' && expense.currency !== 'USD_CASH' && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      ≈ $ {formatAmount(expense.amount_usd)}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom info row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {expense.payment_day && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                      fontSize: '0.75rem', color: 'var(--text-tertiary)',
                    }}>
                      <Calendar size={12} />
                      Día {expense.payment_day}
                    </span>
                  )}
                  {expense.notes && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                      {expense.notes.length > 30 ? expense.notes.substring(0, 30) + '...' : expense.notes}
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button
                    onClick={() => handleToggleActive(expense)}
                    title={expense.is_active ? 'Pausar' : 'Reactivar'}
                    style={{
                      width: '32px', height: '32px', borderRadius: 'var(--radius-full)',
                      background: 'var(--surface-muted)', border: 'none', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      color: expense.is_active ? 'var(--warning-color)' : 'var(--income-color)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {expense.is_active ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button
                    onClick={() => { setEditingExpense(expense); setIsFormOpen(true); }}
                    title="Editar"
                    style={{
                      width: '32px', height: '32px', borderRadius: 'var(--radius-full)',
                      background: 'var(--surface-muted)', border: 'none', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      color: 'var(--text-secondary)', transition: 'all 0.15s ease',
                    }}
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ isOpen: true, expenseId: expense.id })}
                    title="Eliminar"
                    style={{
                      width: '32px', height: '32px', borderRadius: 'var(--radius-full)',
                      background: 'var(--surface-muted)', border: 'none', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      color: 'var(--expense-color)', transition: 'all 0.15s ease',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {isFormOpen && (
        <FixedExpenseForm
          initialData={editingExpense}
          onSubmit={handleCreateOrUpdate}
          onCancel={() => { setIsFormOpen(false); setEditingExpense(null); }}
        />
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title="¿Eliminar gasto fijo?"
        message="¿Seguro que quieres eliminar este gasto fijo? Esta acción no se puede deshacer."
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, expenseId: '' })}
      />
    </div>
  );
};

export default FixedExpenses;
