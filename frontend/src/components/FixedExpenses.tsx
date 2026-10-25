import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Receipt, Pause, Play, Trash2, Edit3, Calendar, CheckCircle2, Circle, Undo2, Share2, Tag } from 'lucide-react';
import {
  getFixedExpenses,
  createFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
  checkFixedExpense,
  uncheckFixedExpense,
  getRates
} from '../api';
import type {
  FixedExpense,
  FixedExpenseCreate,
  FixedExpenseUpdate,
  FixedExpenseCheckCreate,
  ExchangeRates,
  MainCurrencyPreference
} from '../types';
import FixedExpenseForm from './FixedExpenseForm';
import FixedExpensePayForm from './FixedExpensePayForm';
import ConfirmModal from './ConfirmModal';
import { MemberAvatars, ShareMembersModal } from './panas';
import { LocalCategoryModal } from './panas/LocalCategoryModal';
import { resolveCategoryVisuals } from '../utils/categoryVisuals';
import { useCurrencyPreference } from '../context/CurrencyPreferenceContext';
import {
  formatCurrencyAmount,
  formatListCardAmounts,
  convertItemAmountToMainCurrency
} from '../utils/currencyFormat';
import { PageHeader } from './ui/PageHeader';
import { SummaryHeroCard } from './ui/SummaryHeroCard';
import { SegmentedTabs } from './ui/SegmentedTabs';
import { EmptyState } from './ui/EmptyState';
import { CurrencyBreakdownCard } from './ui/CurrencyBreakdownCard';
import ListCard from './ListCard';
import ListCardBottomSheet from './ListCardBottomSheet';

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const FixedExpenses: React.FC = () => {
  const navigate = useNavigate();
  const { mainCurrency } = useCurrencyPreference();
  const [displayCurrency, setDisplayCurrency] = useState<MainCurrencyPreference>(mainCurrency);

  const [expenses, setExpenses] = useState<FixedExpense[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FixedExpense | null>(null);
  const [payingExpense, setPayingExpense] = useState<FixedExpense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, expenseId: '' });
  const [activeShareModalItem, setActiveShareModalItem] = useState<{ id: string; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'paid'>('pending');
  const [selectedExpenseForSheet, setSelectedExpenseForSheet] = useState<FixedExpense | null>(null);
  const [localCategoryModal, setLocalCategoryModal] = useState<{
    isOpen: boolean;
    expense: FixedExpense | null;
  }>({ isOpen: false, expense: null });

  const handleCategoryUpdated = async (newCategory: string) => {
    if (!localCategoryModal.expense) return;
    const expenseId = localCategoryModal.expense.id;
    setExpenses((prev) =>
      prev.map((e) => (e.id === expenseId ? { ...e, category: newCategory } : e))
    );
    await fetchData();
  };

  // Sync preference with local display currency
  useEffect(() => {
    setDisplayCurrency(mainCurrency);
  }, [mainCurrency]);

  // Month selector
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const monthLabel = useMemo(() => {
    const [y, m] = currentMonth.split('-');
    return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
  }, [currentMonth]);

  const shortMonth = useMemo(() => {
    const shortMonths = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const [y, m] = currentMonth.split('-');
    return `${shortMonths[parseInt(m, 10) - 1]} ${y}`;
  }, [currentMonth]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [expensesData, ratesData] = await Promise.all([
        getFixedExpenses(),
        getRates().catch(() => null),
      ]);
      setExpenses(expensesData);
      if (ratesData) setRates(ratesData);
    } catch (error) {
      console.error('Error fetching fixed expenses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  // Separate expenses into paid and pending for the current viewed month
  const { paidExpenses, pendingExpenses, pausedExpenses } = useMemo(() => {
    const paid: FixedExpense[] = [];
    const pending: FixedExpense[] = [];
    const paused: FixedExpense[] = [];

    const [y, m] = currentMonth.split('-').map(Number);
    const startOfCurrentMonth = new Date(Date.UTC(y, m - 1, 1));
    const endOfCurrentMonth = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    expenses.forEach((exp) => {
      const hasCheck = exp.checks?.some((c) => c.month_year === currentMonth);

      // If created after this month and no check in this month, skip
      if (exp.created_at && new Date(exp.created_at) > endOfCurrentMonth && !hasCheck) {
        return;
      }

      // If deactivated before this month and no check in this month, skip
      if (exp.deactivated_at && new Date(exp.deactivated_at) < startOfCurrentMonth && !hasCheck) {
        return;
      }

      if (!exp.is_active) {
        paused.push(exp);
        return;
      }

      if (hasCheck) {
        paid.push(exp);
      } else {
        pending.push(exp);
      }
    });

    return { paidExpenses: paid, pendingExpenses: pending, pausedExpenses: paused };
  }, [expenses, currentMonth]);

  const totalActive = paidExpenses.length + pendingExpenses.length;
  const totalPaid = paidExpenses.length;
  const countPercent = totalActive > 0 ? (totalPaid / totalActive) * 100 : 0;

  // Monetary calculations in selected summary currency
  const { paidAmountInSelected, pendingAmountInSelected, totalCommittedInSelected } = useMemo(() => {
    let paidSum = 0;
    let pendingSum = 0;

    paidExpenses.forEach((exp) => {
      const check = exp.checks?.find((c) => c.month_year === currentMonth);
      if (check) {
        paidSum += convertItemAmountToMainCurrency(
          {
            amount: check.paid_amount,
            currency: check.currency,
            amount_usd: check.amount_usd,
            amount_bs: check.amount_bs,
            amount_eur: check.amount_eur,
            amount_usdt: check.amount_usdt,
          },
          displayCurrency,
          rates
        );
      }
    });

    pendingExpenses.forEach((exp) => {
      pendingSum += convertItemAmountToMainCurrency(
        {
          amount: exp.amount,
          currency: exp.currency,
          amount_usd: exp.amount_usd,
          amount_bs: exp.amount_bs,
          amount_eur: exp.amount_eur,
          amount_usdt: exp.amount_usdt,
        },
        displayCurrency,
        rates
      );
    });

    return {
      paidAmountInSelected: paidSum,
      pendingAmountInSelected: pendingSum,
      totalCommittedInSelected: paidSum + pendingSum,
    };
  }, [paidExpenses, pendingExpenses, displayCurrency, rates, currentMonth]);

  const cycleDisplayCurrency = () => {
    const currencies: MainCurrencyPreference[] = ['USD', 'BS', 'EUR', 'USDT'];
    const idx = currencies.indexOf(displayCurrency);
    setDisplayCurrency(currencies[(idx + 1) % currencies.length]);
  };

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

  const handleCheckPaid = async (data: FixedExpenseCheckCreate) => {
    if (!payingExpense) return;
    try {
      await checkFixedExpense(payingExpense.id, data);
      setPayingExpense(null);
      await fetchData();
    } catch (error: any) {
      console.error('Error checking paid:', error);
      if (error?.response?.status === 409) {
        alert('Este gasto fijo ya está marcado como pagado para este mes');
      } else {
        alert('Error al marcar como pagado');
      }
    }
  };

  const handleUncheck = async (expense: FixedExpense) => {
    try {
      await uncheckFixedExpense(expense.id, currentMonth);
      await fetchData();
    } catch (error) {
      console.error('Error unchecking:', error);
      alert('Error al deshacer el pago');
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteFixedExpense(confirmDelete.expenseId, currentMonth);
      setConfirmDelete({ isOpen: false, expenseId: '' });
      await fetchData();
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Error al dar de baja el gasto fijo');
    }
  };

  const renderExpenseCard = (expense: FixedExpense, isPaid: boolean = false) => {
    const check = expense.checks?.find((c) => c.month_year === currentMonth);
    const { IconComponent, hexColor } = resolveCategoryVisuals(null, expense.category || undefined);
    const isMember = expense.is_shared && expense.my_role === 'member';

    const statusColor = isPaid
      ? 'var(--income-color)'
      : !expense.is_active
      ? 'var(--text-tertiary)'
      : 'var(--warning-color)';

    const quickAction = (
      <button
        type="button"
        className="list-card-quick-action"
        onClick={(e) => {
          e.stopPropagation();
          if (isPaid) {
            if (check?.can_edit !== false) handleUncheck(expense);
          } else if (expense.is_active) {
            setPayingExpense(expense);
          } else if (!isMember) {
            handleToggleActive(expense);
          }
        }}
        disabled={isPaid && check?.can_edit === false}
        title={
          isPaid
            ? check?.can_edit === false
              ? 'Solo quien registró el pago puede deshacerlo'
              : 'Deshacer pago'
            : expense.is_active
            ? 'Marcar como pagado'
            : isMember
            ? 'Solo administradores pueden reactivar'
            : 'Reactivar'
        }
      >
        {isPaid ? (
          <CheckCircle2 size={22} color="var(--income-color)" />
        ) : expense.is_active ? (
          <Circle size={22} color="var(--text-tertiary)" />
        ) : (
          <Play size={18} color="var(--income-color)" />
        )}
      </button>
    );

    const badges = (
      <>
        {expense.category ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setLocalCategoryModal({ isOpen: true, expense });
            }}
            role="button"
            tabIndex={0}
            title="Personalizar mi categoría"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: hexColor,
              background: `${hexColor}18`,
              border: `1px solid ${hexColor}35`,
              padding: '0.12rem 0.5rem',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              transition: 'transform 150ms ease-out',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <IconComponent size={10} />
            <span>{expense.category}</span>
          </span>
        ) : (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setLocalCategoryModal({ isOpen: true, expense });
            }}
            role="button"
            tabIndex={0}
            title="Personalizar mi categoría"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              background: 'var(--surface-muted)',
              border: '1px dashed var(--border-color)',
              padding: '0.12rem 0.5rem',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              transition: 'transform 150ms ease-out',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <Tag size={10} />
            <span>Categoría</span>
          </span>
        )}
        {expense.is_shared && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setActiveShareModalItem({ id: expense.id, name: expense.name });
            }}
            title="Gestionar miembros del gasto fijo"
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <MemberAvatars members={expense.shared_members} size={20} />
          </div>
        )}
        {isPaid && check && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
              fontSize: '0.68rem',
              color: 'var(--income-color)',
              background: 'rgba(16, 185, 129, 0.1)',
              padding: '0.1rem 0.45rem',
              borderRadius: 'var(--radius-full)',
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={10} />
            Pagado
          </span>
        )}
      </>
    );

    const subtitle = (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
        {expense.payment_day && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <Calendar size={12} />
            Día {expense.payment_day}
          </span>
        )}
        {expense.notes && (
          <span style={{ fontStyle: 'italic', opacity: 0.85 }}>
            {expense.notes.length > 25 ? `${expense.notes.substring(0, 25)}...` : expense.notes}
          </span>
        )}
      </span>
    );

    const itemForAmounts = isPaid && check
      ? {
          amount: check.paid_amount,
          currency: check.currency,
          amount_usd: check.amount_usd,
          amount_bs: check.amount_bs,
          amount_eur: check.amount_eur,
          amount_usdt: check.amount_usdt,
        }
      : {
          amount: expense.amount,
          currency: expense.currency,
          amount_usd: expense.amount_usd,
          amount_bs: expense.amount_bs,
          amount_eur: expense.amount_eur,
          amount_usdt: expense.amount_usdt,
        };

    const { primaryAmount, secondaryAmount } = formatListCardAmounts(itemForAmounts, mainCurrency, rates);

    return (
      <ListCard
        key={expense.id}
        statusColor={statusColor}
        icon={<IconComponent size={22} />}
        iconBg={`${hexColor}18`}
        iconColor={hexColor}
        title={expense.name}
        subtitle={subtitle}
        badges={badges}
        isPaused={!expense.is_active}
        primaryAmount={primaryAmount}
        secondaryAmount={secondaryAmount}
        quickAction={quickAction}
        onClick={() => setSelectedExpenseForSheet(expense)}
      />
    );
  };

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <PageHeader
        title="Gastos Fijos"
        subtitle="Pagos recurrentes del mes"
        onBack={() => navigate('/herramientas')}
        rightAction={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'var(--surface-color, #FFFFFF)',
                padding: '0.45rem 0.65rem',
                borderRadius: 'var(--radius-md, 12px)',
                border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Calendar size={16} color="var(--text-secondary)" />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {shortMonth}
              </span>
              <input
                type="month"
                value={currentMonth}
                onChange={(e) => {
                  if (e.target.value) setCurrentMonth(e.target.value);
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingExpense(null);
                setIsFormOpen(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: '#F59E0B',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 'var(--radius-md, 12px)',
                padding: '0.5rem 0.85rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 3px 10px rgba(245, 158, 11, 0.35)',
                transition: 'transform 150ms ease-out',
                flexShrink: 0,
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'scale(0.96)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Nuevo</span>
            </button>
          </div>
        }
      />

      {/* Summary card with progress bar */}
      <SummaryHeroCard
        eyebrow="Total Mensual Comprometido"
        badgeText={`${totalActive} activos`}
        badgeIcon={<Receipt size={14} />}
        mainAmount={isLoading ? '...' : formatCurrencyAmount(totalCommittedInSelected, displayCurrency)}
        currencyHintText="Toca para alternar moneda"
        onCycleCurrency={cycleDisplayCurrency}
        accentColor="#F59E0B"
        metrics={[
          {
            label: 'PAGADO',
            value: formatCurrencyAmount(paidAmountInSelected, displayCurrency),
            valueColor: '#10B981',
          },
          {
            label: 'PENDIENTE',
            value: formatCurrencyAmount(pendingAmountInSelected, displayCurrency),
            valueColor: '#F59E0B',
          },
        ]}
        progress={{
          percent: countPercent,
          leftLabel: `${totalPaid}/${totalActive} pagados`,
          rightLabel: `${Math.round(countPercent)}%`,
          color: totalActive > 0 && totalPaid === totalActive ? '#10B981' : '#F59E0B',
        }}
      />

      {/* Expense list */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>Cargando...</div>
      ) : expenses.length === 0 ? (
        <EmptyState
          icon={<Receipt size={28} />}
          title="Sin gastos fijos"
          description="Agrega tus gastos recurrentes como alquiler, servicios, suscripciones, etc."
          actionLabel="Agregar gasto fijo"
          onAction={() => {
            setEditingExpense(null);
            setIsFormOpen(true);
          }}
          actionColor="#F59E0B"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SegmentedTabs<'pending' | 'paid'>
            activeTab={activeTab}
            onChange={setActiveTab}
            activeColor={activeTab === 'paid' ? '#10B981' : '#F59E0B'}
            tabs={[
              {
                id: 'pending',
                label: 'Pendientes',
                count: pendingExpenses.length + pausedExpenses.length,
              },
              {
                id: 'paid',
                label: 'Pagados',
                count: paidExpenses.length,
              },
            ]}
          />

          {/* Pending section */}
          {activeTab === 'pending' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {pendingExpenses.length === 0 && pausedExpenses.length === 0 ? (
                <EmptyState
                  compact
                  title="Sin gastos pendientes"
                  description="No tienes pagos fijos pendientes por realizar en este mes."
                />
              ) : (
                <>
                  {pendingExpenses.map((exp) => renderExpenseCard(exp, false))}

                  {pausedExpenses.length > 0 && (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          marginTop: '1rem',
                          marginBottom: '0.2rem',
                          paddingLeft: '0.25rem',
                        }}
                      >
                        <Pause size={14} style={{ color: 'var(--text-tertiary)' }} />
                        <span
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--text-tertiary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Pausados
                        </span>
                      </div>
                      {pausedExpenses.map((exp) => renderExpenseCard(exp, false))}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Paid section */}
          {activeTab === 'paid' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {paidExpenses.length === 0 ? (
                <EmptyState
                  compact
                  title="Sin pagos registrados"
                  description="Aún no has registrado pagos para este mes."
                />
              ) : (
                paidExpenses.map((exp) => renderExpenseCard(exp, true))
              )}
            </div>
          )}

          {/* All paid celebration */}
          {totalActive > 0 && totalPaid === totalActive && pendingExpenses.length === 0 && activeTab === 'pending' && (
            <div
              style={{
                textAlign: 'center',
                padding: '1.5rem',
                background: 'rgba(16, 185, 129, 0.06)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(16, 185, 129, 0.15)',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎉</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--income-color)' }}>
                ¡Todos los gastos fijos pagados!
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Excelente, completaste todos los pagos de {monthLabel}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Form Modal */}
      {isFormOpen && (
        <FixedExpenseForm
          initialData={editingExpense}
          onSubmit={handleCreateOrUpdate}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingExpense(null);
          }}
        />
      )}

      {/* Pay Form Modal */}
      {payingExpense && (
        <FixedExpensePayForm
          expense={payingExpense}
          monthYear={currentMonth}
          onSubmit={handleCheckPaid}
          onCancel={() => setPayingExpense(null)}
        />
      )}

      {/* Confirm Delete Modal */}
      {(() => {
        const toDelete = expenses.find((e) => e.id === confirmDelete.expenseId);
        return (
          <ConfirmModal
            isOpen={confirmDelete.isOpen}
            title="Dar de baja / Eliminar gasto fijo"
            message={
              toDelete?.is_shared
                ? `Este gasto fijo está compartido con tus panas (${toDelete.shared_members?.length || 2} miembros). A partir de este mes dejará de aparecer para todos. Si registraste pagos en meses anteriores, se mantendrán en el historial. ¿Deseas continuar?`
                : '¿Estás seguro de que quieres dar de baja este gasto fijo? A partir de este mes dejará de aparecer. Si registraste pagos en meses anteriores, se mantendrán protegidos en tu historial.'
            }
            onConfirm={handleConfirmDelete}
            onCancel={() => setConfirmDelete({ isOpen: false, expenseId: '' })}
          />
        );
      })()}

      {activeShareModalItem && (
        <ShareMembersModal
          entityId={activeShareModalItem.id}
          entityType="fixed_expense"
          entityName={activeShareModalItem.name}
          onClose={() => setActiveShareModalItem(null)}
          onUpdated={fetchData}
          onSelfLeave={() => {
            setActiveShareModalItem(null);
            fetchData();
          }}
        />
      )}

      {/* Modal: Personalizar Categoría Local */}
      {localCategoryModal.isOpen && localCategoryModal.expense && (
        <LocalCategoryModal
          isOpen={localCategoryModal.isOpen}
          onClose={() => setLocalCategoryModal({ isOpen: false, expense: null })}
          entityId={localCategoryModal.expense.id}
          entityTitle={localCategoryModal.expense.name}
          currentCategory={localCategoryModal.expense.category}
          onCategoryUpdated={handleCategoryUpdated}
        />
      )}

      {/* Mobile Bottom Sheet for Details & Actions */}
      {selectedExpenseForSheet && (() => {
        const isPaid = selectedExpenseForSheet.checks?.some((c) => c.month_year === currentMonth);
        const check = selectedExpenseForSheet.checks?.find((c) => c.month_year === currentMonth);
        const isMember = selectedExpenseForSheet.is_shared && selectedExpenseForSheet.my_role === 'member';

        return (
          <ListCardBottomSheet
            isOpen={!!selectedExpenseForSheet}
            onClose={() => setSelectedExpenseForSheet(null)}
            title={selectedExpenseForSheet.name}
            subtitle={
              selectedExpenseForSheet.payment_day
                ? `Pago estimado: Día ${selectedExpenseForSheet.payment_day} de cada mes`
                : 'Gasto fijo recurrente'
            }
            primaryAction={
              !isPaid && selectedExpenseForSheet.is_active
                ? {
                    label: 'Marcar como Pagado',
                    icon: <Circle size={18} />,
                    onClick: () => {
                      const target = selectedExpenseForSheet;
                      setSelectedExpenseForSheet(null);
                      setPayingExpense(target);
                    },
                  }
                : isPaid && selectedExpenseForSheet.is_active
                ? {
                    label: 'Deshacer Pago',
                    icon: <Undo2 size={18} />,
                    onClick: () => {
                      const target = selectedExpenseForSheet;
                      setSelectedExpenseForSheet(null);
                      handleUncheck(target);
                    },
                    disabled: check?.can_edit === false,
                  }
                : undefined
            }
            secondaryActions={[
              {
                label: 'Personalizar mi categoría',
                icon: <Tag size={16} />,
                onClick: () => {
                  const target = selectedExpenseForSheet;
                  setSelectedExpenseForSheet(null);
                  setLocalCategoryModal({ isOpen: true, expense: target });
                },
              },
              {
                label: selectedExpenseForSheet.is_active ? 'Pausar Gasto' : 'Reactivar Gasto',
                icon: selectedExpenseForSheet.is_active ? <Pause size={16} /> : <Play size={16} />,
                onClick: () => {
                  const target = selectedExpenseForSheet;
                  setSelectedExpenseForSheet(null);
                  handleToggleActive(target);
                },
                disabled: isMember,
              },
              {
                label: 'Editar',
                icon: <Edit3 size={16} />,
                onClick: () => {
                  const target = selectedExpenseForSheet;
                  setSelectedExpenseForSheet(null);
                  setEditingExpense(target);
                  setIsFormOpen(true);
                },
                disabled: isMember,
              },
              ...(selectedExpenseForSheet.is_shared
                ? [
                    {
                      label: 'Panas Compartidos',
                      icon: <Share2 size={16} />,
                      onClick: () => {
                        const target = selectedExpenseForSheet;
                        setSelectedExpenseForSheet(null);
                        setActiveShareModalItem({ id: target.id, name: target.name });
                      },
                    },
                  ]
                : []),
              {
                label: 'Eliminar',
                icon: <Trash2 size={16} />,
                danger: true,
                onClick: () => {
                  const target = selectedExpenseForSheet;
                  setSelectedExpenseForSheet(null);
                  setConfirmDelete({ isOpen: true, expenseId: target.id });
                },
                disabled: isMember,
              },
            ]}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <CurrencyBreakdownCard
                originalAmount={isPaid && check ? check.paid_amount : selectedExpenseForSheet.amount}
                originalCurrency={isPaid && check ? check.currency : selectedExpenseForSheet.currency}
                amountBs={isPaid && check ? check.amount_bs : selectedExpenseForSheet.amount_bs}
                amountUsd={isPaid && check ? check.amount_usd : selectedExpenseForSheet.amount_usd}
                amountEur={isPaid && check ? check.amount_eur : selectedExpenseForSheet.amount_eur}
                amountUsdt={isPaid && check ? check.amount_usdt : selectedExpenseForSheet.amount_usdt}
                rateUsdBs={isPaid && check ? check.rate_usd_bs : selectedExpenseForSheet.rate_usd_bs}
                rateEurBs={isPaid && check ? check.rate_eur_bs : selectedExpenseForSheet.rate_eur_bs}
                rateUsdtBs={isPaid && check ? check.rate_usdt_bs : selectedExpenseForSheet.rate_usdt_bs}
                fallbackRates={rates}
                isPendingReference={!isPaid}
              />

              {selectedExpenseForSheet.notes && (
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    background: 'var(--surface-muted)',
                    padding: '0.6rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <strong>Nota:</strong> {selectedExpenseForSheet.notes}
                </div>
              )}

              {isPaid && check && (
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      color: 'var(--income-color)',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Pagado el {check.paid_date}</span>
                  </div>
                  {check.paid_by_name && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Por {check.paid_by_name}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ListCardBottomSheet>
        );
      })()}
    </div>
  );
};

export default FixedExpenses;
