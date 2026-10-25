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
  Layers,
  Plus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  getPanaDetails, 
  checkFixedExpense, 
  uncheckFixedExpense, 
  deleteConnection,
  getMonthlyBudget,
  updateMonthlyBudgetById,
  getShareByEntity,
  removeShareMember
} from '../api';
import type { PanaDetail, CurrencyType, SharedSubBudgetBrief } from '../types';
import { SegmentedTabs, type TabItem } from './ui/SegmentedTabs';
import { EmptyState } from './ui/EmptyState';
import { ListCard } from './ListCard';
import { ShareSubBudgetModal } from './ShareSubBudgetModal';

export type PanaTab = 'expenses' | 'debts' | 'savings' | 'budgets';

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
  const [activeTab, setActiveTab] = useState<PanaTab>('expenses');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

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
      setError(null);
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

  const handleUnshareSubBudget = async (b: SharedSubBudgetBrief) => {
    if (!detail || !partnerId) return;
    if (!confirm(`¿Dejar de compartir "${b.name}" con ${detail.partner_name}?`)) return;

    try {
      setActionLoading(b.id);
      setError(null);
      let unshared = false;
      try {
        const shareInfo = await getShareByEntity(b.id);
        const sId = shareInfo.share_id || (shareInfo as any).id;
        if (sId) {
          await removeShareMember(sId, partnerId);
          unshared = true;
        }
      } catch {
        // Fallback to updateMonthlyBudgetById
      }

      if (!unshared) {
        const mb = await getMonthlyBudget(b.month_year);
        const matched = mb.budgets?.find((sb) => sb.id === b.id);
        const remainingIds = (matched?.shared_members || [])
          .filter((m) => !m.is_owner && !m.is_me && m.user_id !== matched?.owner_id)
          .map((m) => m.user_id)
          .filter((id) => id !== partnerId);
        await updateMonthlyBudgetById(b.id, { shared_with_ids: remainingIds });
      }

      await fetchDetails();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al dejar de compartir el subpresupuesto');
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

  const tabs: TabItem<PanaTab>[] = [
    {
      id: 'expenses',
      label: 'Fijos',
      count: detail?.shared_fixed_expenses?.length || 0,
      icon: <Home size={15} />,
    },
    {
      id: 'debts',
      label: 'Deudas',
      count: detail?.shared_debts?.length || 0,
      icon: <CreditCard size={15} />,
    },
    {
      id: 'savings',
      label: 'Ahorros',
      count: detail?.shared_saving_goals?.length || 0,
      icon: <PiggyBank size={15} />,
    },
    {
      id: 'budgets',
      label: 'Presupuestos',
      count: detail?.shared_sub_budgets?.length || 0,
      icon: <Layers size={15} />,
    },
  ];

  return (
    <>
      <div 
        className="modal-backdrop" 
        onClick={onClose}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
        }}
      >
        <div 
          className="expense-form-container soft-card" 
          onClick={(e) => e.stopPropagation()}
          style={{ 
            maxWidth: '540px', 
            width: '95%',
            maxHeight: '90vh', 
            display: 'flex', 
            flexDirection: 'column', 
            padding: '1.25rem',
            borderRadius: '20px',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}
        >
          {/* Header */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            marginBottom: '1rem', 
            borderBottom: '1px solid var(--accent-light, rgba(0, 0, 0, 0.06))', 
            paddingBottom: '0.85rem' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '1.2rem',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
                flexShrink: 0
              }}>
                {detail?.partner_name ? detail.partner_name.charAt(0).toUpperCase() : 'P'}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    {detail?.partner_name || 'Cargando...'}
                  </h2>
                  {detail && (
                    <span style={{
                      fontSize: '0.68rem',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#10B981',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                      Conectado
                    </span>
                  )}
                </div>
                {detail?.partner_email && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0' }}>
                    {detail.partner_email}
                  </p>
                )}
              </div>
            </div>
            <button 
              type="button" 
              onClick={onClose} 
              className="btn-icon"
              aria-label="Cerrar modal"
              style={{ 
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>

          {error && (
            <div style={{ 
              padding: '0.75rem 1rem', 
              background: 'rgba(239, 68, 68, 0.1)', 
              color: '#EF4444', 
              borderRadius: 'var(--radius-md, 12px)', 
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

          {/* Segmented Tabs Switcher */}
          <div style={{ marginBottom: '1rem' }}>
            <SegmentedTabs<PanaTab>
              tabs={tabs}
              activeTab={activeTab}
              onChange={(tabId) => setActiveTab(tabId)}
              activeColor="#6366F1"
            />
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
                {(!detail?.shared_fixed_expenses || detail.shared_fixed_expenses.length === 0) ? (
                  <EmptyState
                    icon={<Home size={28} />}
                    title="Sin gastos fijos compartidos"
                    description="Al crear un gasto fijo puedes elegir compartirlo con tu pana para pagar juntos alquiler, internet o servicios."
                    actionLabel="Ir a Gastos Fijos"
                    actionIcon={<PlusCircle size={16} />}
                    onAction={() => {
                      onClose();
                      navigate('/herramientas/gastos-fijos');
                    }}
                    compact
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {detail?.shared_fixed_expenses.map((expense) => (
                      <div 
                        key={expense.id}
                        style={{
                          padding: '0.85rem 1rem',
                          background: 'var(--surface-muted, rgba(0, 0, 0, 0.02))',
                          borderRadius: 'var(--radius-md, 12px)',
                          border: '1px solid var(--accent-light, rgba(0, 0, 0, 0.08))',
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
                                  borderRadius: 'var(--radius-sm, 6px)',
                                  background: 'rgba(99, 102, 241, 0.1)',
                                  color: 'var(--primary-color, #6366F1)'
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
                                    borderRadius: 'var(--radius-full, 9999px)',
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
                          borderRadius: 'var(--radius-sm, 8px)'
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
                              borderRadius: 'var(--radius-sm, 6px)',
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
                {(!detail?.shared_debts || detail.shared_debts.length === 0) ? (
                  <EmptyState
                    icon={<CreditCard size={28} />}
                    title="Sin deudas compartidas"
                    description="Si adquieren un compromiso o préstamo juntos, compártanlo para que los abonos descuenten de la deuda de ambos."
                    actionLabel="Ir a Deudas"
                    actionIcon={<PlusCircle size={16} />}
                    onAction={() => {
                      onClose();
                      navigate('/herramientas/deudas-nuestras');
                    }}
                    compact
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {detail?.shared_debts.map((debt) => (
                      <div 
                        key={debt.id}
                        style={{
                          padding: '0.85rem 1rem',
                          background: 'var(--surface-muted, rgba(0, 0, 0, 0.02))',
                          borderRadius: 'var(--radius-md, 12px)',
                          border: '1px solid var(--accent-light, rgba(0, 0, 0, 0.08))',
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
                                    borderRadius: 'var(--radius-full, 9999px)',
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
                              borderRadius: 'var(--radius-sm, 6px)',
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
                          background: 'var(--accent-light, rgba(0, 0, 0, 0.08))',
                          borderRadius: 'var(--radius-full, 9999px)',
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
                              borderRadius: 'var(--radius-sm, 6px)',
                              border: '1px solid var(--accent-light, rgba(0, 0, 0, 0.1))',
                              background: 'transparent',
                              color: 'var(--primary-color, #6366F1)',
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
                  <EmptyState
                    icon={<PiggyBank size={28} />}
                    title="Sin metas de ahorro compartidas"
                    description="Pueden crear fondos conjuntos para proyectos de remodelación, viajes, compras o reservas."
                    actionLabel="Ir a Proyectos / Ahorros"
                    actionIcon={<PlusCircle size={16} />}
                    actionColor="var(--income-color, #10B981)"
                    onAction={() => {
                      onClose();
                      navigate('/herramientas/ahorros');
                    }}
                    compact
                  />
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
                            background: 'var(--surface-muted, rgba(0, 0, 0, 0.02))',
                            borderRadius: 'var(--radius-md, 12px)',
                            border: '1px solid var(--accent-light, rgba(0, 0, 0, 0.08))',
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
                                    borderRadius: 'var(--radius-full, 9999px)',
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
                                    borderRadius: 'var(--radius-sm, 6px)',
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
                                      borderRadius: 'var(--radius-full, 9999px)',
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
                                borderRadius: 'var(--radius-sm, 6px)',
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
                              background: 'var(--accent-light, rgba(0, 0, 0, 0.08))',
                              borderRadius: 'var(--radius-full, 9999px)',
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
                                borderRadius: 'var(--radius-sm, 6px)',
                                border: '1px solid var(--accent-light, rgba(0, 0, 0, 0.1))',
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
                {/* Header row with title, count, and "+ Compartir subpresupuesto" button */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                  padding: '0 0.25rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Subpresupuestos del mes
                    </span>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.1rem 0.45rem',
                      borderRadius: '9999px',
                      background: 'rgba(99, 102, 241, 0.1)',
                      color: 'var(--primary-color, #6366F1)'
                    }}>
                      {detail?.shared_sub_budgets?.length || 0}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsShareModalOpen(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'var(--primary-color, #6366F1)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 'var(--radius-md, 10px)',
                      padding: '0.4rem 0.75rem',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)',
                      transition: 'transform 150ms ease-out',
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    <Plus size={14} />
                    Compartir subpresupuesto
                  </button>
                </div>

                {(!detail?.shared_sub_budgets || detail.shared_sub_budgets.length === 0) ? (
                  <EmptyState
                    icon={<Layers size={28} />}
                    title="Sin subpresupuestos compartidos"
                    description="Comparte grupos de gasto en modo solo lectura con tu pana para coordinar presupuestos de comida, salidas, etc."
                    actionLabel="+ Compartir subpresupuesto"
                    actionIcon={<Plus size={15} />}
                    onAction={() => setIsShareModalOpen(true)}
                    compact
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {detail.shared_sub_budgets.map((b) => {
                      const trafficColor =
                        b.global_traffic_light === 'red'
                          ? '#EF4444'
                          : b.global_traffic_light === 'yellow'
                          ? '#F59E0B'
                          : '#10B981';
                      const currSymbol =
                        b.currency === 'BS' ? 'Bs' : b.currency === 'EUR_BCV' ? '€' : '$';

                      return (
                        <ListCard
                          key={b.id}
                          icon={<Layers size={20} />}
                          statusColor={trafficColor}
                          title={b.name}
                          subtitle={`${b.categories_count} categorías • ${b.month_year}`}
                          badges={
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: 'var(--radius-full, 9999px)',
                                  background: b.is_mine ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                                  color: b.is_mine ? '#10B981' : '#3B82F6',
                                  fontWeight: 600,
                                }}
                              >
                                {b.is_mine ? 'Compartido por ti' : `De ${b.owner_name || detail.partner_name} · Solo lectura`}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: 'var(--radius-full, 9999px)',
                                  background: `${trafficColor}18`,
                                  color: trafficColor,
                                  fontWeight: 600,
                                }}
                              >
                                {Math.round(b.global_spent_percentage)}% consumido
                              </span>
                              {b.members_count > 2 && (
                                <span
                                  title={b.member_names?.join(', ')}
                                  style={{
                                    fontSize: '0.68rem',
                                    padding: '0.12rem 0.45rem',
                                    borderRadius: 'var(--radius-full, 9999px)',
                                    background: 'var(--surface-muted, rgba(0, 0, 0, 0.05))',
                                    color: 'var(--text-secondary)',
                                    fontWeight: 600,
                                  }}
                                >
                                  {b.members_count} panas
                                </span>
                              )}
                            </div>
                          }
                          progress={{
                            value: b.total_spent_budget_currency,
                            max: b.effective_global_limit > 0 ? b.effective_global_limit : 1,
                            color: trafficColor,
                          }}
                          primaryAmount={`${b.total_spent_budget_currency.toFixed(2)} ${currSymbol} / ${b.effective_global_limit.toFixed(2)} ${currSymbol}`}
                          quickAction={
                            b.is_mine ? (
                              <button
                                type="button"
                                disabled={actionLoading === b.id}
                                onClick={() => handleUnshareSubBudget(b)}
                                title="Dejar de compartir este subpresupuesto con tu pana"
                                style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: 'var(--radius-sm, 8px)',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  cursor: actionLoading === b.id ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  background: 'rgba(239, 68, 68, 0.08)',
                                  color: '#EF4444',
                                  transition: 'all 150ms ease-out',
                                }}
                              >
                                {actionLoading === b.id ? '...' : 'Dejar de compartir'}
                              </button>
                            ) : undefined
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer / Danger Zone */}
          <div style={{ 
            borderTop: '1px solid var(--accent-light, rgba(0, 0, 0, 0.06))', 
            paddingTop: '0.85rem', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center' 
          }}>
            <button
              type="button"
              onClick={handleDeleteConnection}
              disabled={loading}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: 'var(--radius-md, 12px)',
                border: 'none',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#EF4444',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'transform 150ms ease-out',
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
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
                borderRadius: 'var(--radius-md, 12px)',
                border: '1px solid var(--accent-light, rgba(0, 0, 0, 0.1))',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {/* Sub-budget Sharing Modal */}
      {detail && (
        <ShareSubBudgetModal
          isOpen={isShareModalOpen}
          partnerId={detail.partner_id}
          partnerName={detail.partner_name}
          onClose={() => setIsShareModalOpen(false)}
          onShared={fetchDetails}
        />
      )}
    </>
  );
};
