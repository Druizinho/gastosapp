import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Wallet, Trash2, Edit3, CheckCircle, Clock, AlertCircle, Calendar, Circle, Undo2, Pause, Play } from 'lucide-react';
import {
  getMonthlyIncomes,
  deleteEstimatedIncome,
  uncheckIncome,
  getRates,
  updateEstimatedIncome,
  getCategories
} from '../api';
import type {
  EstimatedIncome,
  ExchangeRates,
  Category,
  MainCurrencyPreference
} from '../types';
import ConfirmModal from './ConfirmModal';
import EstimatedIncomeForm from './EstimatedIncomeForm';
import IncomeCheckForm from './IncomeCheckForm';
import { useCurrencyPreference } from '../context/CurrencyPreferenceContext';
import {
  formatCurrencyAmount,
  formatListCardAmounts,
  convertItemAmountToMainCurrency
} from '../utils/currencyFormat';
import { resolveCategoryVisuals } from '../utils/categoryVisuals';
import { PageHeader } from './ui/PageHeader';
import { SummaryHeroCard } from './ui/SummaryHeroCard';
import { SegmentedTabs } from './ui/SegmentedTabs';
import { EmptyState } from './ui/EmptyState';
import { CurrencyBreakdownCard } from './ui/CurrencyBreakdownCard';
import { SkeletonList } from './ui/Skeleton';
import ListCard from './ListCard';
import ListCardBottomSheet from './ListCardBottomSheet';

interface EstimatedIncomeListProps {
  onBack: () => void;
}

const EstimatedIncomeList: React.FC<EstimatedIncomeListProps> = ({ onBack }) => {
  const { mainCurrency } = useCurrencyPreference();
  const [displayCurrency, setDisplayCurrency] = useState<MainCurrencyPreference>(mainCurrency);

  const [incomes, setIncomes] = useState<EstimatedIncome[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCheckFormOpen, setIsCheckFormOpen] = useState(false);

  const [editingIncome, setEditingIncome] = useState<EstimatedIncome | null>(null);
  const [checkingIncome, setCheckingIncome] = useState<EstimatedIncome | null>(null);

  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, incomeId: '' });
  const [activeTab, setActiveTab] = useState<'pending' | 'paid'>('pending');
  const [selectedIncomeForSheet, setSelectedIncomeForSheet] = useState<EstimatedIncome | null>(null);

  // Sync preference with local display currency
  useEffect(() => {
    setDisplayCurrency(mainCurrency);
  }, [mainCurrency]);

  // Month selector logic
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const getMonthYearString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const currentMonthYear = getMonthYearString(currentDate);

  const shortMonthLabel = useMemo(() => {
    const shortMonths = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const [y, m] = currentMonthYear.split('-');
    return `${shortMonths[parseInt(m, 10) - 1]} ${y}`;
  }, [currentMonthYear]);

  const fetchData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [data, ratesData, categoriesData] = await Promise.all([
        getMonthlyIncomes(currentMonthYear),
        getRates().catch(() => null),
        getCategories().catch(() => []),
      ]);
      setIncomes(data);
      setSelectedIncomeForSheet((prev) => (prev ? (data.find((i) => i.id === prev.id) || prev) : null));
      if (ratesData) setRates(ratesData);
      if (categoriesData) setCategories(categoriesData);
    } catch (error) {
      console.error('Error fetching incomes or rates:', error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentMonthYear]);

  const { expected, received, pending } = useMemo(() => {
    let expSum = 0;
    let recSum = 0;

    incomes.forEach((income) => {
      expSum += convertItemAmountToMainCurrency(
        {
          amount: Number(income.expected_amount),
          currency: income.currency,
        },
        displayCurrency,
        rates
      );

      if (income.checks && income.checks.length > 0) {
        const check = income.checks[0];
        recSum += convertItemAmountToMainCurrency(
          {
            amount: Number(check.real_amount),
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

    return {
      expected: expSum,
      received: recSum,
      pending: Math.max(expSum - recSum, 0),
    };
  }, [incomes, displayCurrency, rates]);

  const cycleCurrency = () => {
    const currencies: MainCurrencyPreference[] = ['USD', 'BS', 'EUR', 'USDT'];
    const nextIndex = (currencies.indexOf(displayCurrency) + 1) % currencies.length;
    setDisplayCurrency(currencies[nextIndex]);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const [year, month] = e.target.value.split('-');
    setCurrentDate(new Date(Number(year), Number(month) - 1, 1));
  };

  const handleDelete = async () => {
    try {
      await deleteEstimatedIncome(confirmDelete.incomeId, currentMonthYear);
      setIncomes((prev) => prev.filter((i) => i.id !== confirmDelete.incomeId));
      await fetchData(true);
    } catch (error) {
      console.error('Error deleting income:', error);
      alert('Error al dar de baja el ingreso');
    } finally {
      setConfirmDelete({ isOpen: false, incomeId: '' });
    }
  };

  const handleUncheck = async (incomeId: string) => {
    try {
      await uncheckIncome(incomeId, currentMonthYear);
      setIncomes((prev) =>
        prev.map((i) => (i.id === incomeId ? { ...i, checks: [] } : i))
      );
      await fetchData(true);
    } catch (error) {
      console.error('Error unchecking income:', error);
    }
  };

  const handleTogglePause = async (income: EstimatedIncome) => {
    try {
      const updated = await updateEstimatedIncome(income.id, { is_active: !income.is_active });
      if (updated) {
        setIncomes((prev) => prev.map((i) => (i.id === income.id ? { ...i, ...updated } : i)));
      }
      await fetchData(true);
    } catch (error) {
      console.error('Error toggling income state:', error);
    }
  };

  const totalExpectedCount = incomes.length;
  const confirmedIncomes = incomes.filter((i) => i.checks && i.checks.length > 0);
  const confirmedCount = confirmedIncomes.length;
  const progressPercent = totalExpectedCount > 0 ? (confirmedCount / totalExpectedCount) * 100 : 0;

  const renderIncomeCard = (income: EstimatedIncome) => {
    const check = income.checks && income.checks.length > 0 ? income.checks[0] : null;
    const isConfirmed = !!check;
    const isPartial = check?.is_partial;

    const matchedCat = categories.find(
      (c) => c.name.toLowerCase() === (income.category || '').toLowerCase()
    );
    const { IconComponent, hexColor } = resolveCategoryVisuals(matchedCat, income.category || 'Ingresos');

    // Overdue logic
    const today = new Date();
    let isOverdue = false;
    if (!isConfirmed && income.payment_day) {
      const paymentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), income.payment_day);
      if (
        today > paymentDate &&
        currentDate.getMonth() <= today.getMonth() &&
        currentDate.getFullYear() <= today.getFullYear()
      ) {
        isOverdue = true;
      }
    }

    const statusColor = isConfirmed && !isPartial
      ? 'var(--income-color)'
      : isConfirmed && isPartial
      ? 'var(--warning-color)'
      : isOverdue && income.is_active
      ? 'var(--expense-color)'
      : !income.is_active
      ? 'var(--text-tertiary)'
      : hexColor || 'var(--info-color)';

    const quickAction = (
      <button
        type="button"
        className="list-card-quick-action"
        onClick={(e) => {
          e.stopPropagation();
          if (!isConfirmed) {
            setCheckingIncome(income);
            setIsCheckFormOpen(true);
          } else {
            handleUncheck(income.id);
          }
        }}
        title={!isConfirmed ? 'Confirmar ingreso' : 'Deshacer confirmación'}
      >
        {!isConfirmed ? (
          <Circle size={22} color="var(--text-tertiary)" />
        ) : (
          <CheckCircle size={22} color={isPartial ? 'var(--warning-color)' : 'var(--income-color)'} />
        )}
      </button>
    );

    const badges = (
      <>
        {income.category && (
          <span
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
            }}
          >
            <IconComponent size={10} />
            {income.category}
          </span>
        )}
        {isConfirmed ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: isPartial ? 'var(--warning-color)' : 'var(--income-color)',
              background: isPartial ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
              padding: '0.12rem 0.5rem',
              borderRadius: 'var(--radius-full)',
            }}
          >
            <CheckCircle size={10} />
            {isPartial ? 'Pago Parcial' : 'Cobrado'}
          </span>
        ) : !income.is_active ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.7rem',
              fontWeight: 500,
              color: 'var(--text-tertiary)',
              background: 'var(--surface-muted)',
              padding: '0.12rem 0.5rem',
              borderRadius: 'var(--radius-full)',
            }}
          >
            <Pause size={10} />
            Pausado
          </span>
        ) : isOverdue ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: 'var(--expense-color)',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '0.12rem 0.5rem',
              borderRadius: 'var(--radius-full)',
            }}
          >
            <AlertCircle size={10} />
            Atrasado
          </span>
        ) : (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.7rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              background: 'var(--surface-muted)',
              padding: '0.12rem 0.5rem',
              borderRadius: 'var(--radius-full)',
            }}
          >
            <Clock size={10} />
            Pendiente
          </span>
        )}
      </>
    );

    const subtitle = (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
        {income.payment_day && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <Calendar size={12} />
            Día {income.payment_day}
          </span>
        )}
        {isConfirmed && isPartial && check.pending_date && (
          <span style={{ color: 'var(--warning-color)', fontWeight: 500 }}>
            Resto: {new Date(check.pending_date).toLocaleDateString('es-VE')}
          </span>
        )}
      </span>
    );

    const itemForAmounts = isConfirmed && check
      ? {
          amount: check.real_amount,
          currency: check.currency,
          amount_usd: check.amount_usd,
          amount_bs: check.amount_bs,
          amount_eur: check.amount_eur,
          amount_usdt: check.amount_usdt,
        }
      : {
          amount: income.expected_amount,
          currency: income.currency,
        };

    const { primaryAmount, secondaryAmount } = formatListCardAmounts(itemForAmounts, mainCurrency, rates);

    return (
      <ListCard
        key={income.id}
        statusColor={statusColor}
        icon={<IconComponent size={20} />}
        iconBg={`${hexColor}18`}
        iconColor={hexColor}
        title={income.name}
        subtitle={subtitle}
        badges={badges}
        isPaused={!income.is_active}
        primaryAmount={primaryAmount}
        secondaryAmount={secondaryAmount}
        quickAction={quickAction}
        onClick={() => setSelectedIncomeForSheet(income)}
      />
    );
  };

  const pendingIncomesList = incomes.filter((i) => !(i.checks && i.checks.length > 0) && i.is_active);
  const pausedIncomesList = incomes.filter((i) => !(i.checks && i.checks.length > 0) && !i.is_active);
  const paidIncomesList = incomes.filter((i) => i.checks && i.checks.length > 0);

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <PageHeader
        title="Ingresos"
        subtitle="Ingresos estimados del mes"
        onBack={onBack}
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
                {shortMonthLabel}
              </span>
              <input
                type="month"
                value={currentMonthYear}
                onChange={handleMonthChange}
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
                setEditingIncome(null);
                setIsFormOpen(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: '#3B82F6',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 'var(--radius-md, 12px)',
                padding: '0.5rem 0.85rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 3px 10px rgba(59, 130, 246, 0.35)',
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

      {/* Monetary Summary Card */}
      <SummaryHeroCard
        eyebrow="Total Recibido"
        badgeText={`${confirmedCount} / ${totalExpectedCount} confirmados`}
        badgeIcon={<Wallet size={14} />}
        mainAmount={isLoading ? '...' : formatCurrencyAmount(received, displayCurrency)}
        isLoading={isLoading}
        mainAmountColor="var(--income-color)"
        currencyHintText="Toca para alternar moneda"
        onCycleCurrency={cycleCurrency}
        accentColor="#3B82F6"
        metrics={[
          {
            label: 'ESPERADO',
            value: formatCurrencyAmount(expected, displayCurrency),
          },
          {
            label: 'PENDIENTE',
            value: formatCurrencyAmount(pending, displayCurrency),
            valueColor: '#F59E0B',
          },
        ]}
        progress={{
          percent: progressPercent,
          leftLabel: 'Progreso de cobro',
          rightLabel: `${Math.round(progressPercent)}% (${confirmedCount}/${totalExpectedCount})`,
          color: progressPercent === 100 ? '#10B981' : '#3B82F6',
        }}
      />

      {isLoading ? (
        <div style={{ padding: '8px 0' }}>
          <SkeletonList count={4} />
        </div>
      ) : incomes.length === 0 ? (
        <EmptyState
          icon={<Wallet size={28} />}
          title="Sin ingresos estimados"
          description="No tienes ingresos estimados para este mes."
          actionLabel="Añadir ingreso estimado"
          onAction={() => {
            setEditingIncome(null);
            setIsFormOpen(true);
          }}
          actionColor="#3B82F6"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SegmentedTabs<'pending' | 'paid'>
            activeTab={activeTab}
            onChange={setActiveTab}
            activeColor={activeTab === 'paid' ? '#10B981' : '#3B82F6'}
            tabs={[
              {
                id: 'pending',
                label: 'Pendientes',
                count: pendingIncomesList.length + pausedIncomesList.length,
              },
              {
                id: 'paid',
                label: 'Confirmados',
                count: paidIncomesList.length,
              },
            ]}
          />

          {/* All collected celebration */}
          {confirmedCount === totalExpectedCount && totalExpectedCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: 'var(--income-color)',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              <CheckCircle size={20} />
              <span>¡Excelente! Has cobrado todos tus ingresos estimados de este mes.</span>
            </div>
          )}

          {/* Pending section */}
          {activeTab === 'pending' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {pendingIncomesList.length === 0 && pausedIncomesList.length === 0 ? (
                <EmptyState
                  compact
                  title="Sin ingresos pendientes"
                  description="No tienes cobros pendientes por recibir este mes."
                />
              ) : (
                <>
                  {pendingIncomesList.map((income) => renderIncomeCard(income))}

                  {pausedIncomesList.length > 0 && (
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
                      {pausedIncomesList.map((income) => renderIncomeCard(income))}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Paid section */}
          {activeTab === 'paid' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {paidIncomesList.length === 0 ? (
                <EmptyState
                  compact
                  title="Sin ingresos confirmados"
                  description="Aún no has confirmado cobros en este mes."
                />
              ) : (
                paidIncomesList.map((income) => renderIncomeCard(income))
              )}
            </div>
          )}
        </div>
      )}

      {isFormOpen && (
        <EstimatedIncomeForm
          income={editingIncome}
          onClose={() => {
            setIsFormOpen(false);
            setEditingIncome(null);
          }}
          onSaved={() => fetchData(true)}
        />
      )}

      {isCheckFormOpen && checkingIncome && (
        <IncomeCheckForm
          income={checkingIncome}
          monthYear={currentMonthYear}
          onClose={() => {
            setIsCheckFormOpen(false);
            setCheckingIncome(null);
          }}
          onSaved={() => fetchData(true)}
        />
      )}

      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title="Dar de baja / Eliminar Ingreso"
        message="¿Estás seguro de que quieres dar de baja este ingreso? A partir de este mes dejará de aparecer. Si registraste cobros en meses anteriores, se mantendrán protegidos en tu historial."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, incomeId: '' })}
      />

      {/* Mobile Bottom Sheet for Income Details & Actions */}
      {selectedIncomeForSheet && (() => {
        const check = selectedIncomeForSheet.checks && selectedIncomeForSheet.checks.length > 0 ? selectedIncomeForSheet.checks[0] : null;
        const isConfirmed = !!check;
        const isPartial = check?.is_partial;

        return (
          <ListCardBottomSheet
            isOpen={!!selectedIncomeForSheet}
            onClose={() => setSelectedIncomeForSheet(null)}
            title={selectedIncomeForSheet.name}
            subtitle={
              selectedIncomeForSheet.payment_day
                ? `Cobro estimado: Día ${selectedIncomeForSheet.payment_day} de cada mes`
                : 'Ingreso estimado recurrente'
            }
            primaryAction={
              !isConfirmed && selectedIncomeForSheet.is_active
                ? {
                    label: 'Confirmar Recepción de Ingreso',
                    icon: <Circle size={18} />,
                    onClick: () => {
                      const target = selectedIncomeForSheet;
                      setSelectedIncomeForSheet(null);
                      setCheckingIncome(target);
                      setIsCheckFormOpen(true);
                    },
                  }
                : isConfirmed && selectedIncomeForSheet.is_active
                ? {
                    label: 'Deshacer Confirmación',
                    icon: <Undo2 size={18} />,
                    onClick: () => {
                      const target = selectedIncomeForSheet;
                      setSelectedIncomeForSheet(null);
                      handleUncheck(target.id);
                    },
                  }
                : undefined
            }
            secondaryActions={[
              {
                label: selectedIncomeForSheet.is_active ? 'Pausar Ingreso' : 'Reanudar Ingreso',
                icon: selectedIncomeForSheet.is_active ? <Pause size={16} /> : <Play size={16} />,
                onClick: () => {
                  const target = selectedIncomeForSheet;
                  setSelectedIncomeForSheet(null);
                  handleTogglePause(target);
                },
              },
              {
                label: 'Editar',
                icon: <Edit3 size={16} />,
                onClick: () => {
                  const target = selectedIncomeForSheet;
                  setSelectedIncomeForSheet(null);
                  setEditingIncome(target);
                  setIsFormOpen(true);
                },
              },
              {
                label: 'Eliminar',
                icon: <Trash2 size={16} />,
                danger: true,
                onClick: () => {
                  const target = selectedIncomeForSheet;
                  setSelectedIncomeForSheet(null);
                  setConfirmDelete({ isOpen: true, incomeId: target.id });
                },
              },
            ]}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <CurrencyBreakdownCard
                originalAmount={isConfirmed && check ? check.real_amount : selectedIncomeForSheet.expected_amount}
                originalCurrency={isConfirmed && check ? check.currency : selectedIncomeForSheet.currency}
                amountBs={isConfirmed && check ? check.amount_bs : undefined}
                amountUsd={isConfirmed && check ? check.amount_usd : undefined}
                amountEur={isConfirmed && check ? check.amount_eur : undefined}
                amountUsdt={isConfirmed && check ? check.amount_usdt : undefined}
                rateUsdBs={isConfirmed && check ? check.rate_usd_bs : undefined}
                rateEurBs={isConfirmed && check ? check.rate_eur_bs : undefined}
                rateUsdtBs={isConfirmed && check ? check.rate_usdt_bs : undefined}
                fallbackRates={rates}
                isPendingReference={!isConfirmed}
              />

              {selectedIncomeForSheet.notes && (
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    background: 'var(--surface-muted)',
                    padding: '0.6rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <strong>Nota:</strong> {selectedIncomeForSheet.notes}
                </div>
              )}

              {isConfirmed && check && (
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: isPartial ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                    border: `1px solid ${isPartial ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      color: isPartial ? 'var(--warning-color)' : 'var(--income-color)',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                    }}
                  >
                    <CheckCircle size={16} />
                    <span>{isPartial ? 'Pago Parcial Registrado' : 'Pago Completo Recibido'}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Fecha de cobro: {check.payment_date}
                  </div>
                </div>
              )}
            </div>
          </ListCardBottomSheet>
        );
      })()}
    </div>
  );
};

export default EstimatedIncomeList;
