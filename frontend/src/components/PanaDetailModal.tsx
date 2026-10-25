import React, { useState, useEffect } from 'react';
import { 
  X, 
  Home, 
  CreditCard, 
  PiggyBank,
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Trash2, 
  PlusCircle, 
  ExternalLink,
  Check,
  Undo2,
  Layers
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  getPanaDetails, 
  checkFixedExpense, 
  uncheckFixedExpense, 
  deleteConnection 
} from '../api';
import type { PanaDetail, CurrencyType } from '../types';

interface PanaDetailModalProps {
  isOpen: boolean;
  partnerId: string | null;
  onClose: () => void;
  onConnectionDeleted: () => void;
}

export const PanaDetailModal: React.FC<PanaDetailModalProps> = ({
  isOpen,
  partnerId,
  onClose,
  onConnectionDeleted
}) => {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PanaDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'expenses' | 'debts' | 'savings' | 'budgets'>('expenses');

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const fetchDetails = async () => {
    if (!partnerId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getPanaDetails(partnerId);
      setDetail(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al cargar detalles del Pana');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && partnerId) {
      fetchDetails();
    } else {
      setDetail(null);
    }
  }, [isOpen, partnerId]);

  if (!isOpen) return null;

  const handleToggleCheck = async (expenseId: string, isPaid: boolean, amount: number, currency: string) => {
    try {
      setActionLoading(expenseId);
      setError(null);
      if (isPaid) {
        await uncheckFixedExpense(expenseId, currentMonthStr);
      } else {
        await checkFixedExpense(expenseId, {
          month_year: currentMonthStr,
          paid_amount: amount,
          currency: currency as CurrencyType,
          create_expense: false
        });
      }
      await fetchDetails();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al actualizar el estado del gasto');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteConnection = async () => {
    if (!detail) return;
    if (!confirm(`¿Estás seguro de desconectar a ${detail.partner_name}? Se mantendrán tus registros pero dejarán de sincronizarse.`)) return;
    try {
      setLoading(true);
      await deleteConnection(detail.connection_id);
      onConnectionDeleted();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al eliminar la conexión');
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className="expense-form-container" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '1.25rem' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--accent-light)', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1.15rem'
            }}>
              {detail?.partner_name ? detail.partner_name.charAt(0).toUpperCase() : 'P'}
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {detail?.partner_name || 'Cargando...'}
              </h2>
              {detail?.partner_email && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                  {detail.partner_email}
                </p>
              )}
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="btn-icon"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ 
            padding: '0.75rem 1rem', 
            background: 'rgba(239, 68, 68, 0.1)', 
            color: '#EF4444', 
            borderRadius: 'var(--radius-md)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            marginBottom: '1rem', 
            fontSize: '0.85rem' 
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Tab Switcher */}
        <div style={{
          display: 'flex',
          background: 'var(--surface-muted)',
          borderRadius: 'var(--radius-md)',
          padding: '0.25rem',
          marginBottom: '1rem',
          gap: '0.2rem'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            style={{
              flex: 1,
              padding: '0.5rem 0.25rem',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: activeTab === 'expenses' ? 'var(--surface-color)' : 'transparent',
              color: activeTab === 'expenses' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'expenses' ? 600 : 500,
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'expenses' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <Home size={15} />
            Fijos ({detail?.shared_fixed_expenses?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('debts')}
            style={{
              flex: 1,
              padding: '0.5rem 0.25rem',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: activeTab === 'debts' ? 'var(--surface-color)' : 'transparent',
              color: activeTab === 'debts' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'debts' ? 600 : 500,
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'debts' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <CreditCard size={15} />
            Deudas ({detail?.shared_debts?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('savings')}
            style={{
              flex: 1,
              padding: '0.5rem 0.25rem',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: activeTab === 'savings' ? 'var(--surface-color)' : 'transparent',
              color: activeTab === 'savings' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'savings' ? 600 : 500,
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'savings' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <PiggyBank size={15} />
            Ahorros ({detail?.shared_saving_goals?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('budgets')}
            style={{
              flex: 1,
              padding: '0.5rem 0.25rem',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: activeTab === 'budgets' ? 'var(--surface-color)' : 'transparent',
              color: activeTab === 'budgets' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'budgets' ? 600 : 500,
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'budgets' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <Layers size={15} />
            Presupuestos ({detail?.shared_sub_budgets?.length || 0})
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem', marginBottom: '1rem' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '180px' }}>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : activeTab === 'expenses' ? (
            /* TAB: GASTOS FIJOS */
            <div>
              {detail?.shared_fixed_expenses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-tertiary)' }}>
                  <Home size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  <p style={{ margin: 0, fontWeight: 500, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    No tienen gastos fijos compartidos todavía
                  </p>
                  <p style={{ margin: '0.35rem 0 1rem', fontSize: '0.8rem' }}>
                    Al crear un gasto fijo puedes elegir compartirlo con tu pana para pagar juntos alquiler, internet, etc.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate('/herramientas/gastos-fijos');
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--primary-color)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <PlusCircle size={16} />
                    Ir a Gastos Fijos
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {detail?.shared_fixed_expenses.map((expense) => (
                    <div 
                      key={expense.id}
                      style={{
                        padding: '0.85rem 1rem',
                        background: 'var(--surface-muted)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--accent-light)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                              {expense.name}
                            </span>
                            {expense.category && (
                              <span style={{
                                fontSize: '0.7rem',
                                padding: '0.15rem 0.5rem',
                                borderRadius: 'var(--radius-sm)',
                                background: 'rgba(99, 102, 241, 0.1)',
                                color: 'var(--primary-color)'
                              }}>
                                {expense.category}
                              </span>
                            )}
                            {(expense.members_count || 2) > 2 && (
                              <span
                                title={expense.member_names?.join(', ')}
                                style={{
                                  fontSize: '0.68rem',
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: 'var(--radius-full)',
                                  background: 'rgba(59, 130, 246, 0.12)',
                                  color: '#3B82F6',
                                  fontWeight: 600
                                }}
                              >
                                Compartido entre {expense.members_count}
                              </span>
                            )}
                          </div>
                          {expense.payment_day && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                              Día de pago: {expense.payment_day} de cada mes
                            </span>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                            {expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {expense.currency}
                          </span>
                        </div>
                      </div>

                      {/* Month status indicator & quick action */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.75rem',
                        background: expense.is_paid_this_month ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        borderRadius: 'var(--radius-sm)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {expense.is_paid_this_month ? (
                            <>
                              <CheckCircle2 size={16} style={{ color: '#10B981', flexShrink: 0 }} />
                              <span style={{ fontSize: '0.78rem', color: '#10B981', fontWeight: 600 }}>
                                Pagado {expense.paid_by_name ? `por ${expense.paid_by_name}` : 'este mes'}
                              </span>
                            </>
                          ) : (
                            <>
                              <Clock size={16} style={{ color: '#F59E0B', flexShrink: 0 }} />
                              <span style={{ fontSize: '0.78rem', color: '#F59E0B', fontWeight: 600 }}>
                                Pendiente este mes
                              </span>
                            </>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={actionLoading === expense.id}
                          onClick={() => handleToggleCheck(expense.id, expense.is_paid_this_month, expense.amount, expense.currency)}
                          style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: actionLoading === expense.id ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            background: expense.is_paid_this_month ? 'rgba(239, 68, 68, 0.12)' : '#10B981',
                            color: expense.is_paid_this_month ? '#EF4444' : 'white'
                          }}
                        >
                          {actionLoading === expense.id ? '...' : expense.is_paid_this_month ? (
                            <>
                              <Undo2 size={13} /> Desmarcar
                            </>
                          ) : (
                            <>
                              <Check size={13} /> Marcar Pagado
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'debts' ? (
            /* TAB: DEUDAS COMPARTIDAS */
            <div>
              {detail?.shared_debts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-tertiary)' }}>
                  <CreditCard size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  <p style={{ margin: 0, fontWeight: 500, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    No tienen deudas compartidas con terceros
                  </p>
                  <p style={{ margin: '0.35rem 0 1rem', fontSize: '0.8rem' }}>
                    Si adquieren un compromiso o préstamo juntos, compártanlo para que los abonos descuenten de la deuda de ambos.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate('/herramientas/deudas-nuestras');
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--primary-color)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <PlusCircle size={16} />
                    Ir a Deudas
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {detail?.shared_debts.map((debt) => (
                    <div 
                      key={debt.id}
                      style={{
                        padding: '0.85rem 1rem',
                        background: 'var(--surface-muted)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--accent-light)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                              {debt.concept}
                            </span>
                            {(debt.members_count || 2) > 2 && (
                              <span
                                title={debt.member_names?.join(', ')}
                                style={{
                                  fontSize: '0.68rem',
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: 'var(--radius-full)',
                                  background: 'rgba(59, 130, 246, 0.12)',
                                  color: '#3B82F6',
                                  fontWeight: 600
                                }}
                              >
                                Compartido entre {debt.members_count}
                              </span>
                            )}
                          </div>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            {debt.type === 'receivable' ? 'Deudor:' : 'Acreedor:'} <strong>{debt.counterpart}</strong>
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            fontWeight: 600, 
                            color: debt.is_settled ? '#10B981' : '#F59E0B',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            background: debt.is_settled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'
                          }}>
                            {debt.is_settled ? 'Saldada' : `${debt.paid_percentage}% pagado`}
                          </span>
                        </div>
                      </div>

                      {/* Amounts */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Total: <strong>{debt.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {debt.currency}</strong>
                        </span>
                        <span style={{ color: debt.is_settled ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                          Resta: {debt.remaining_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {debt.currency}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div style={{
                        width: '100%',
                        height: '6px',
                        background: 'var(--accent-light)',
                        borderRadius: 'var(--radius-full)',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${debt.paid_percentage}%`,
                          height: '100%',
                          background: debt.is_settled ? '#10B981' : 'linear-gradient(90deg, #6366F1, #10B981)',
                          transition: 'width 0.3s'
                        }} />
                      </div>

                      {debt.last_payment_by && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Último abono por: <strong>{debt.last_payment_by}</strong></span>
                          {debt.last_payment_date && <span>{debt.last_payment_date}</span>}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            navigate(debt.type === 'receivable' ? '/herramientas/deudas-por-cobrar' : '/herramientas/deudas-nuestras');
                          }}
                          style={{
                            padding: '0.3rem 0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--accent-light)',
                            background: 'transparent',
                            color: 'var(--primary-color)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <ExternalLink size={13} />
                          Gestionar en Deudas
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'savings' ? (
            /* TAB: AHORROS COMPARTIDOS */
            <div>
              {(!detail?.shared_saving_goals || detail.shared_saving_goals.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-tertiary)' }}>
                  <PiggyBank size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  <p style={{ margin: 0, fontWeight: 500, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    No tienen proyectos ni fondos de ahorro compartidos todavía
                  </p>
                  <p style={{ margin: '0.35rem 0 1rem', fontSize: '0.8rem' }}>
                    Pueden crear fondos conjuntos para proyectos de remodelación, viajes, compras o reservas.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate('/herramientas/ahorros');
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--income-color)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <PlusCircle size={16} />
                    Ir a Proyectos / Ahorros
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {detail.shared_saving_goals.map((goal) => {
                    const color = goal.color || '#10B981';
                    const isProject = goal.type === 'project';
                    const hasTarget = goal.target_amount !== null && goal.target_amount !== undefined;
                    const remaining = hasTarget ? Math.max(goal.target_amount! - goal.current_amount, 0) : null;

                    return (
                      <div 
                        key={goal.id}
                        style={{
                          padding: '0.85rem 1rem',
                          background: 'var(--surface-muted)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--accent-light)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.6rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                {goal.name}
                              </span>
                              {isProject && (
                                <span style={{
                                  fontSize: '0.68rem',
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: 'var(--radius-full)',
                                  background: 'rgba(59, 130, 246, 0.12)',
                                  color: '#3B82F6',
                                  fontWeight: 600
                                }}>
                                  🛠️ Proyecto
                                </span>
                              )}
                              {goal.category && (
                                <span style={{
                                  fontSize: '0.7rem',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: 'var(--radius-sm)',
                                  background: `${color}18`,
                                  color: color
                                }}>
                                  {goal.category}
                                </span>
                              )}
                              {(goal.members_count || 2) > 2 && (
                                <span
                                  title={goal.member_names?.join(', ')}
                                  style={{
                                    fontSize: '0.68rem',
                                    padding: '0.12rem 0.45rem',
                                    borderRadius: 'var(--radius-full)',
                                    background: 'rgba(59, 130, 246, 0.12)',
                                    color: '#3B82F6',
                                    fontWeight: 600
                                  }}
                                >
                                  Compartido entre {goal.members_count}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                              {hasTarget
                                ? `${isProject ? 'Presupuesto' : 'Meta'}: ${goal.target_amount!.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${goal.currency}`
                                : 'Cuenta abierta / Sin tope'}
                            </span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ 
                              fontSize: '0.75rem', 
                              fontWeight: 600, 
                              color: goal.is_completed ? '#10B981' : color,
                              padding: '0.15rem 0.5rem',
                              borderRadius: 'var(--radius-sm)',
                              background: goal.is_completed ? 'rgba(16, 185, 129, 0.1)' : `${color}18`
                            }}>
                              {goal.is_completed
                                ? (isProject ? 'Concluido 🎉' : 'Completado 🎉')
                                : hasTarget
                                  ? `${Math.round(goal.progress_percentage)}% ${isProject ? 'ejecutado' : 'ahorrado'}`
                                  : 'Cuenta abierta'}
                            </span>
                          </div>
                        </div>

                        {/* Amounts */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {isProject ? 'Pagado' : 'Ahorrado'}: <strong>{goal.current_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {goal.currency}</strong>
                          </span>
                          <span style={{ color: goal.is_completed ? '#10B981' : 'var(--text-tertiary)', fontWeight: 600 }}>
                            {hasTarget ? (
                              remaining! > 0
                                ? `Falta: ${remaining!.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${goal.currency}`
                                : (isProject ? '¡Presupuesto alcanzado!' : '¡Meta alcanzada!')
                            ) : (
                              'Sin tope fijado'
                            )}
                          </span>
                        </div>

                        {/* Progress bar */}
                        {hasTarget && (
                          <div style={{
                            width: '100%',
                            height: '6px',
                            background: 'var(--accent-light)',
                            borderRadius: 'var(--radius-full)',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${Math.min(goal.progress_percentage, 100)}%`,
                              height: '100%',
                              background: color,
                              transition: 'width 0.3s'
                            }} />
                          </div>
                        )}

                        {goal.last_deposit_by && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Último aporte por: <strong>{goal.last_deposit_by}</strong></span>
                            {goal.last_deposit_date && <span>{goal.last_deposit_date}</span>}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              navigate('/herramientas/ahorros');
                            }}
                            style={{
                              padding: '0.3rem 0.75rem',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--accent-light)',
                              background: 'transparent',
                              color: color,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <ExternalLink size={13} />
                            Gestionar en Ahorros
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* TAB: PRESUPUESTOS COMPARTIDOS */
            <div>
              {(!detail?.shared_sub_budgets || detail.shared_sub_budgets.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-tertiary)' }}>
                  <Layers size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  <p style={{ margin: 0, fontWeight: 500, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    No tienen sub-presupuestos compartidos.
                  </p>
                  <p style={{ margin: '0.35rem 0 1rem', fontSize: '0.8rem' }}>
                    Al crear un grupo en Presupuestos puedes elegir compartirlo con tu pana en modo solo lectura.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate('/herramientas/presupuestos');
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--primary-color)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <PlusCircle size={16} />
                    Ir a Presupuestos
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {detail.shared_sub_budgets.map((b) => {
                    const trafficColor =
                      b.global_traffic_light === 'red'
                        ? '#ef4444'
                        : b.global_traffic_light === 'yellow'
                        ? '#f59e0b'
                        : '#10b981';
                    const currSymbol =
                      b.currency === 'BS' ? 'Bs' : b.currency === 'EUR_BCV' ? '€' : '$';

                    return (
                      <div
                        key={b.id}
                        style={{
                          background: 'var(--surface-color)',
                          border: '1px solid var(--accent-light)',
                          borderRadius: 'var(--radius-md)',
                          padding: '0.85rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                          position: 'relative'
                        }}
                      >
                        {/* Title and Badges */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                                {b.name}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: 'var(--radius-full)',
                                  background: b.is_mine ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                                  color: b.is_mine ? '#10b981' : '#3B82F6',
                                  fontWeight: 600
                                }}
                              >
                                {b.is_mine
                                  ? 'Creado por ti'
                                  : `De ${b.owner_name || detail.partner_name} · Solo lectura`}
                              </span>
                              {b.members_count > 2 && (
                                <span
                                  title={b.member_names?.join(', ')}
                                  style={{
                                    fontSize: '0.68rem',
                                    padding: '0.12rem 0.45rem',
                                    borderRadius: 'var(--radius-full)',
                                    background: 'var(--surface-muted)',
                                    color: 'var(--text-secondary)',
                                    fontWeight: 600
                                  }}
                                >
                                  {b.members_count} panas
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                              {b.categories_count} categorías asignadas • {b.month_year}
                            </span>
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: trafficColor,
                                padding: '0.15rem 0.5rem',
                                borderRadius: 'var(--radius-sm)',
                                background: `${trafficColor}18`
                              }}
                            >
                              {Math.round(b.global_spent_percentage)}% consumido
                            </span>
                          </div>
                        </div>

                        {/* Spent vs Limit */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            Gastado: <strong>{b.total_spent_budget_currency.toFixed(2)} {currSymbol}</strong>
                          </span>
                          <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>
                            Tope: {b.effective_global_limit.toFixed(2)} {currSymbol}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div
                          style={{
                            width: '100%',
                            height: '6px',
                            background: 'var(--accent-light)',
                            borderRadius: 'var(--radius-full)',
                            overflow: 'hidden'
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(Math.max(b.global_spent_percentage, 0), 100)}%`,
                              height: '100%',
                              background: trafficColor,
                              transition: 'width 0.3s'
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              navigate('/herramientas/presupuestos');
                            }}
                            style={{
                              padding: '0.3rem 0.75rem',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--accent-light)',
                              background: 'transparent',
                              color: 'var(--primary-color)',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <ExternalLink size={13} />
                            Ver en Presupuestos
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer / Danger Zone */}
        <div style={{ borderTop: '1px solid var(--accent-light)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleDeleteConnection}
            disabled={loading}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#EF4444',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <Trash2 size={15} />
            Desconectar Pana
          </button>

          <button
            type="button"
            onClick={onClose}
            className="btn-cancel"
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--accent-light)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
