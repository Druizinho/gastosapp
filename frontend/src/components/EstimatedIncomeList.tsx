import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  Wallet,
  Trash2,
  Edit3,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  Circle,
  Undo2,
  Pause,
  Play,
  ArrowDownLeft,
} from 'lucide-react';
import {
  getMonthlyIncomes,
  deleteEstimatedIncome,
  uncheckIncome,
  getRates,
  updateEstimatedIncome,
  getCategories,
  getIncomes,
  createIncome,
  updateIncome,
  deleteIncome,
} from '../api';
import {
  getCurrencyLabel,
} from '../types';
import type {
  EstimatedIncome,
  ExchangeRates,
  Category,
  MainCurrencyPreference,
  Income,
  IncomeCreate,
  IncomeUpdate,
} from '../types';
import ConfirmModal from './ConfirmModal';
import EstimatedIncomeForm from './EstimatedIncomeForm';
import IncomeCheckForm from './IncomeCheckForm';
import ExpenseForm from './ExpenseForm';
import { useCurrencyPreference } from '../context/CurrencyPreferenceContext';
import {
  formatCurrencyAmount,
  formatListCardAmounts,
  convertItemAmountToMainCurrency,
} from '../utils/currencyFormat';
import { resolveCategoryVisuals } from '../utils/categoryVisuals';
import { colorWithOpacity } from '../utils/toolColors';
import { PageHeader } from './ui/PageHeader';
import { SummaryHeroCard } from './ui/SummaryHeroCard';
import { SegmentedTabs } from './ui/SegmentedTabs';
import { EmptyState } from './ui/EmptyState';
import { CurrencyBreakdownCard } from './ui/CurrencyBreakdownCard';
import { SkeletonList } from './ui/Skeleton';
import ListCard from './ListCard';
import ListCardBottomSheet from './ListCardBottomSheet';
import { useToast } from './ui/Toast';

interface EstimatedIncomeListProps {
  onBack: () => void;
}

const EstimatedIncomeList: React.FC<EstimatedIncomeListProps> = ({ onBack }) => {
  const toast = useToast();
  const { mainCurrency } = useCurrencyPreference();
  const [displayCurrency, setDisplayCurrency] = useState<MainCurrencyPreference>(mainCurrency);

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: 'movements' | 'por-cobrar' =
    searchParams.get('tab') === 'por-cobrar' ? 'por-cobrar' : 'movements';

  const [porCobrarSubTab, setPorCobrarSubTab] = useState<'pending' | 'confirmed' | 'paused'>('pending');

  const [realIncomes, setRealIncomes] = useState<Income[]>([]);
  const [estimatedIncomes, setEstimatedIncomes] = useState<EstimatedIncome[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Forms modal state
  const [isEstimatedFormOpen, setIsEstimatedFormOpen] = useState(false);
  const [editingEstimatedIncome, setEditingEstimatedIncome] = useState<EstimatedIncome | null>(null);

  const [isCheckFormOpen, setIsCheckFormOpen] = useState(false);
  const [checkingIncome, setCheckingIncome] = useState<EstimatedIncome | null>(null);

  const [isMovementFormOpen, setIsMovementFormOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<Income | null>(null);

  // Bottom sheets state
  const [selectedEstimatedForSheet, setSelectedEstimatedForSheet] = useState<EstimatedIncome | null>(null);
  const [selectedMovementForSheet, setSelectedMovementForSheet] = useState<Income | null>(null);

  // Deletion modals state
  const [confirmDeleteEstimated, setConfirmDeleteEstimated] = useState({ isOpen: false, incomeId: '' });
  const [confirmDeleteMovement, setConfirmDeleteMovement] = useState<{
    isOpen: boolean;
    movement: Income | null;
  }>({ isOpen: false, movement: null });

  // Sync preference with local display currency
  useEffect(() => {
    setDisplayCurrency(mainCurrency);
  }, [mainCurrency]);

  const handleTabChange = (newTab: 'movements' | 'por-cobrar') => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newTab === 'por-cobrar') {
          next.set('tab', 'por-cobrar');
        } else {
          next.delete('tab');
        }
        return next;
      },
      { replace: true }
    );
  };

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

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [yearStr, monthStr] = currentMonthYear.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const lastDayNum = new Date(year, month, 0).getDate();
      const firstDay = `${currentMonthYear}-01`;
      const lastDay = `${currentMonthYear}-${String(lastDayNum).padStart(2, '0')}`;

      const [incomesData, estimatedData, ratesData, categoriesData] = await Promise.all([
        getIncomes(firstDay, lastDay).catch((err) => {
          console.error('Error fetching real incomes:', err);
          return [] as Income[];
        }),
        getMonthlyIncomes(currentMonthYear).catch((err) => {
          console.error('Error fetching estimated incomes:', err);
          return [] as EstimatedIncome[];
        }),
        getRates().catch(() => null),
        getCategories('income').catch(() => [] as Category[]),
      ]);

      // Sort real incomes chronologically descending (newest first)
      const sortedRealIncomes = [...incomesData].sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime();
      });

      setRealIncomes(sortedRealIncomes);
      setEstimatedIncomes(estimatedData);

      setSelectedEstimatedForSheet((prev) =>
        prev ? estimatedData.find((i) => i.id === prev.id) || null : null
      );
      setSelectedMovementForSheet((prev) =>
        prev ? sortedRealIncomes.find((i) => i.id === prev.id) || null : null
      );

      if (ratesData) setRates(ratesData);
      if (categoriesData) setCategories(categoriesData);
    } catch (error) {
      console.error('Error fetching incomes or rates:', error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [currentMonthYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleDataChanged = () => {
      fetchData(true);
    };
    window.addEventListener('gastosapp:data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('gastosapp:data-changed', handleDataChanged);
    };
  }, [fetchData]);

  // Hero Card metrics in displayCurrency
  const { expected, received, pending } = useMemo(() => {
    // 1. Recibido: total of all realIncomes of the month converted using their frozen amounts
    let recSum = 0;
    realIncomes.forEach((item) => {
      recSum += convertItemAmountToMainCurrency(
        {
          amount: Number(item.amount),
          currency: item.currency,
          amount_usd: item.amount_usd,
          amount_bs: item.amount_bs,
          amount_eur: item.amount_eur,
          amount_usdt: item.amount_usdt,
        },
        displayCurrency,
        rates
      );
    });

    // 2. Esperado: sum of expected_amount of active estimatedIncomes for the month
    let expSum = 0;
    let templateCollectedSum = 0;

    estimatedIncomes.forEach((income) => {
      if (income.is_active) {
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
          templateCollectedSum += convertItemAmountToMainCurrency(
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
      }
    });

    return {
      expected: expSum,
      received: recSum,
      pending: Math.max(expSum - templateCollectedSum, 0),
    };
  }, [realIncomes, estimatedIncomes, displayCurrency, rates]);

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

  // Estimated incomes actions
  const handleDeleteEstimated = async () => {
    try {
      await deleteEstimatedIncome(confirmDeleteEstimated.incomeId, currentMonthYear);
      setEstimatedIncomes((prev) => prev.filter((i) => i.id !== confirmDeleteEstimated.incomeId));
      await fetchData(true);
    } catch (error) {
      console.error('Error deleting estimated income:', error);
      alert('Error al dar de baja el ingreso');
    } finally {
      setConfirmDeleteEstimated({ isOpen: false, incomeId: '' });
    }
  };

  const handleUncheck = async (incomeId: string) => {
    try {
      await uncheckIncome(incomeId, currentMonthYear);
      setEstimatedIncomes((prev) =>
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
        setEstimatedIncomes((prev) => prev.map((i) => (i.id === income.id ? { ...i, ...updated } : i)));
      }
      await fetchData(true);
    } catch (error) {
      console.error('Error toggling income state:', error);
    }
  };

  // Real incomes actions
  const handleDeleteMovement = async () => {
    if (!confirmDeleteMovement.movement) return;
    try {
      await deleteIncome(confirmDeleteMovement.movement.id);
      setRealIncomes((prev) => prev.filter((i) => i.id !== confirmDeleteMovement.movement!.id));
      await fetchData(true);
    } catch (error) {
      console.error('Error deleting income movement:', error);
      alert('Error al eliminar el ingreso');
    } finally {
      setConfirmDeleteMovement({ isOpen: false, movement: null });
    }
  };

  // Groupings for Tab 2 (por-cobrar)
  const pendingAndPartialIncomesList = useMemo(
    () => estimatedIncomes.filter((i) => i.is_active && (!i.checks || i.checks.length === 0 || i.checks[0].is_partial)),
    [estimatedIncomes]
  );
  const confirmedIncomesList = useMemo(
    () => estimatedIncomes.filter((i) => i.is_active && i.checks && i.checks.length > 0 && !i.checks[0].is_partial),
    [estimatedIncomes]
  );
  const pausedIncomesList = useMemo(
    () => estimatedIncomes.filter((i) => !i.is_active),
    [estimatedIncomes]
  );

  const pendingCount = pendingAndPartialIncomesList.length;
  const confirmedCount = confirmedIncomesList.length;
  const pausedCount = pausedIncomesList.length;
  const effectivePorCobrarSubTab = porCobrarSubTab === 'paused' && pausedCount === 0 ? 'pending' : porCobrarSubTab;

  const activeEstimatedCount = estimatedIncomes.filter((i) => i.is_active).length;
  const fullyConfirmedCount = confirmedIncomesList.length;
  const progressPercent = activeEstimatedCount > 0 ? (fullyConfirmedCount / activeEstimatedCount) * 100 : (realIncomes.length > 0 ? 100 : 0);

  // Render Movement Card (Tab 1)
  const renderMovementCard = (movement: Income) => {
    const matchedCat = categories.find(
      (c) => c.name.toLowerCase() === (movement.category || '').toLowerCase()
    );
    const { IconComponent, hexColor } = resolveCategoryVisuals(matchedCat, movement.category || 'Otros ingresos');
    const statusColor = hexColor || 'var(--income-color)';

    const formattedDate = new Date(`${movement.date}T12:00:00`).toLocaleDateString('es-VE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const badges = (
      <>
        {movement.category && (
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
            {movement.category}
          </span>
        )}
        {movement.income_check_id && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: 'var(--income-color)',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              padding: '0.12rem 0.5rem',
              borderRadius: 'var(--radius-full)',
            }}
          >
            <CheckCircle size={10} />
            Cobro: {movement.estimated_income_name || 'Plantilla'}
          </span>
        )}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: '0.7rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            background: 'var(--surface-muted)',
            padding: '0.12rem 0.45rem',
            borderRadius: 'var(--radius-full)',
          }}
        >
          {getCurrencyLabel(movement.currency)}
        </span>
      </>
    );

    const { primaryAmount, secondaryAmount } = formatListCardAmounts(movement, mainCurrency, rates);

    return (
      <ListCard
        key={movement.id}
        statusColor={statusColor}
        icon={<IconComponent size={20} />}
        iconBg={`${hexColor}18`}
        iconColor={hexColor}
        title={movement.description || movement.category || 'Ingreso'}
        subtitle={formattedDate}
        badges={badges}
        primaryAmount={primaryAmount}
        secondaryAmount={secondaryAmount}
        onClick={() => setSelectedMovementForSheet(movement)}
      />
    );
  };

  // Render Estimated Income Card (Tab 2)
  const renderEstimatedIncomeCard = (income: EstimatedIncome) => {
    const check = income.checks && income.checks.length > 0 ? income.checks[0] : null;
    const isConfirmed = !!check;
    const isPartial = check?.is_partial;

    const matchedCat = categories.find(
      (c) => c.name.toLowerCase() === (income.category || '').toLowerCase()
    );
    const { IconComponent, hexColor } = resolveCategoryVisuals(matchedCat, income.category || 'Otros ingresos');

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
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: '0.7rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            background: 'var(--surface-muted)',
            padding: '0.12rem 0.45rem',
            borderRadius: 'var(--radius-full)',
          }}
        >
          {getCurrencyLabel(income.currency)}
        </span>
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
            Resto: {new Date(`${check.pending_date}T12:00:00`).toLocaleDateString('es-VE')}
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
        onClick={() => setSelectedEstimatedForSheet(income)}
      >
        {isConfirmed && isPartial && (
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              marginTop: '0.5rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid var(--border-color, rgba(0,0,0,0.06))',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setCheckingIncome(income);
                setIsCheckFormOpen(true);
              }}
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                padding: '0.42rem 0.75rem',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: '0.78rem',
                fontWeight: 600,
                backgroundColor: 'rgba(245, 158, 11, 0.14)',
                color: '#D97706',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                cursor: 'pointer',
                transition: 'transform 150ms ease-out',
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
              <Plus size={14} />
              <span>Registrar pago restante</span>
            </button>
            <button
              type="button"
              onClick={() => handleUncheck(income.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                padding: '0.42rem 0.65rem',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: '0.78rem',
                fontWeight: 500,
                backgroundColor: 'var(--surface-muted)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                cursor: 'pointer',
                transition: 'transform 150ms ease-out',
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
              title="Deshacer confirmación"
            >
              <Undo2 size={14} />
              <span>Deshacer</span>
            </button>
          </div>
        )}
      </ListCard>
    );
  };

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <PageHeader
        title="Ingresos"
        subtitle={activeTab === 'movements' ? 'Movimientos del mes' : 'Plantillas por cobrar'}
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

            {activeTab === 'movements' ? (
              <button
                type="button"
                onClick={() => {
                  setEditingMovement(null);
                  setIsMovementFormOpen(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 'var(--radius-md, 12px)',
                  padding: '0.5rem 0.85rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 3px 10px rgba(16, 185, 129, 0.35)',
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
                <span>+ Ingreso</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingEstimatedIncome(null);
                  setIsEstimatedFormOpen(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'var(--tool-income, #3B82F6)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 'var(--radius-md, 12px)',
                  padding: '0.5rem 0.85rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: `0 3px 10px ${colorWithOpacity('var(--tool-income, #3B82F6)', 35)}`,
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
                <span>+ Plantilla</span>
              </button>
            )}
          </div>
        }
      />

      {/* Monetary Summary Hero Card */}
      <SummaryHeroCard
        eyebrow="Total Recibido"
        badgeText={
          activeTab === 'por-cobrar'
            ? `${fullyConfirmedCount} / ${activeEstimatedCount} confirmados`
            : `${realIncomes.length} ${realIncomes.length === 1 ? 'ingreso registrado' : 'ingresos registrados'}`
        }
        badgeIcon={<Wallet size={14} />}
        mainAmount={isLoading ? '...' : formatCurrencyAmount(received, displayCurrency)}
        isLoading={isLoading}
        mainAmountColor="var(--tool-income, #3B82F6)"
        currencyHintText="Toca para alternar moneda"
        onCycleCurrency={cycleCurrency}
        accentColor="var(--tool-income, #3B82F6)"
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
          rightLabel: `${Math.round(progressPercent)}% (${fullyConfirmedCount}/${activeEstimatedCount})`,
          color: 'var(--tool-income, #3B82F6)',
        }}
      />

      {/* Main Segmented Tabs */}
      <div style={{ marginTop: '1.25rem', marginBottom: '1rem' }}>
        <SegmentedTabs<'movements' | 'por-cobrar'>
          activeTab={activeTab}
          onChange={handleTabChange}
          activeColor="#3B82F6"
          tabs={[
            {
              id: 'movements',
              label: 'Movimientos',
              count: realIncomes.length,
            },
            {
              id: 'por-cobrar',
              label: 'Por cobrar',
              count: pendingAndPartialIncomesList.length + pausedIncomesList.length,
            },
          ]}
        />
      </div>

      {isLoading ? (
        <div style={{ padding: '8px 0' }}>
          <SkeletonList count={4} />
        </div>
      ) : activeTab === 'movements' ? (
        /* Tab 1: Movimientos */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {realIncomes.length === 0 ? (
            <EmptyState
              icon={<ArrowDownLeft size={28} />}
              title="Sin ingresos registrados"
              description="No tienes movimientos de ingreso registrados en este mes."
              actionLabel="+ Registrar Ingreso"
              onAction={() => {
                setEditingMovement(null);
                setIsMovementFormOpen(true);
              }}
              actionColor="#10B981"
            />
          ) : (
            realIncomes.map((movement) => renderMovementCard(movement))
          )}
        </div>
      ) : (
        /* Tab 2: Por cobrar */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* All collected celebration */}
          {fullyConfirmedCount === activeEstimatedCount && activeEstimatedCount > 0 && (
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

          {estimatedIncomes.length === 0 ? (
            <EmptyState
              icon={<Wallet size={28} />}
              title="Sin ingresos por cobrar"
              description="No tienes plantillas de ingresos configuradas para este mes."
              actionLabel="+ Crear Plantilla"
              onAction={() => {
                setEditingEstimatedIncome(null);
                setIsEstimatedFormOpen(true);
              }}
              actionColor="#3B82F6"
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <SegmentedTabs<'pending' | 'confirmed' | 'paused'>
                  activeTab={effectivePorCobrarSubTab}
                  onChange={setPorCobrarSubTab}
                  activeColor="#3B82F6"
                  tabs={[
                    { id: 'pending', label: `Pendientes (${pendingCount})` },
                    { id: 'confirmed', label: `Cobrados (${confirmedCount})` },
                    ...(pausedCount > 0 ? [{ id: 'paused' as const, label: `Pausados (${pausedCount})` }] : []),
                  ]}
                />
              </div>

              {effectivePorCobrarSubTab === 'pending' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {pendingCount === 0 ? (
                    <EmptyState
                      compact
                      title="Sin cobros pendientes"
                      description="No tienes cobros pendientes por recibir este mes."
                    />
                  ) : (
                    pendingAndPartialIncomesList.map((income) => renderEstimatedIncomeCard(income))
                  )}
                </div>
              )}

              {effectivePorCobrarSubTab === 'confirmed' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {confirmedCount === 0 ? (
                    <EmptyState
                      compact
                      title="Sin cobros confirmados"
                      description="Aún no has registrado ningún cobro en este mes."
                    />
                  ) : (
                    confirmedIncomesList.map((income) => renderEstimatedIncomeCard(income))
                  )}
                </div>
              )}

              {effectivePorCobrarSubTab === 'paused' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {pausedCount === 0 ? (
                    <EmptyState
                      compact
                      title="Sin plantillas pausadas"
                      description="No tienes plantillas pausadas en este momento."
                    />
                  ) : (
                    pausedIncomesList.map((income) => renderEstimatedIncomeCard(income))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Movement Form Modal (ExpenseForm with mode="income") */}
      {isMovementFormOpen && (
        <ExpenseForm
          defaultMode="income"
          initialIncomeData={editingMovement}
          onSubmit={async () => {}}
          onIncomeSubmit={async (data: IncomeCreate | IncomeUpdate) => {
            const wasEditing = Boolean(editingMovement);
            try {
              if (editingMovement) {
                await updateIncome(editingMovement.id, data as IncomeUpdate);
              } else {
                await createIncome(data as IncomeCreate);
              }
              setIsMovementFormOpen(false);
              setEditingMovement(null);
              await fetchData(true);
              toast.success(wasEditing ? 'Ingreso actualizado' : 'Ingreso registrado');
            } catch (err) {
              console.error('Error saving income movement:', err);
              toast.error('No se pudo guardar el ingreso');
            }
          }}
          onCancel={() => {
            setIsMovementFormOpen(false);
            setEditingMovement(null);
          }}
        />
      )}

      {/* Estimated Income Form Modal */}
      {isEstimatedFormOpen && (
        <EstimatedIncomeForm
          income={editingEstimatedIncome}
          onClose={() => {
            setIsEstimatedFormOpen(false);
            setEditingEstimatedIncome(null);
          }}
          onSaved={() => {
            setIsEstimatedFormOpen(false);
            setEditingEstimatedIncome(null);
            fetchData(true);
          }}
        />
      )}

      {/* Income Check Form Modal */}
      {isCheckFormOpen && checkingIncome && (
        <IncomeCheckForm
          income={checkingIncome}
          monthYear={currentMonthYear}
          onClose={() => {
            setIsCheckFormOpen(false);
            setCheckingIncome(null);
          }}
          onSaved={() => {
            setIsCheckFormOpen(false);
            setCheckingIncome(null);
            fetchData(true);
          }}
        />
      )}

      {/* Confirm Delete Movement Modal */}
      <ConfirmModal
        isOpen={confirmDeleteMovement.isOpen}
        title="Eliminar Ingreso"
        message={
          confirmDeleteMovement.movement?.income_check_id
            ? `Este ingreso pertenece al cobro de ${confirmDeleteMovement.movement.estimated_income_name || 'una plantilla'}. Al borrarlo se recalculará el cobro y, si no quedan otros pagos vinculados, volverá a Pendiente.`
            : '¿Estás seguro de que deseas eliminar este ingreso? Esta acción no se puede deshacer.'
        }
        onConfirm={handleDeleteMovement}
        onCancel={() => setConfirmDeleteMovement({ isOpen: false, movement: null })}
      />

      {/* Confirm Delete Estimated Income Modal */}
      <ConfirmModal
        isOpen={confirmDeleteEstimated.isOpen}
        title="Dar de baja / Eliminar Ingreso"
        message="¿Estás seguro de que quieres dar de baja este ingreso? A partir de este mes dejará de aparecer. Si registraste cobros en meses anteriores, se mantendrán protegidos en tu historial."
        onConfirm={handleDeleteEstimated}
        onCancel={() => setConfirmDeleteEstimated({ isOpen: false, incomeId: '' })}
      />

      {/* Bottom Sheet for Movement Details & Actions */}
      {selectedMovementForSheet && (
        <ListCardBottomSheet
          isOpen={!!selectedMovementForSheet}
          onClose={() => setSelectedMovementForSheet(null)}
          title={selectedMovementForSheet.description || selectedMovementForSheet.category || 'Ingreso'}
          subtitle={`Registrado el ${new Date(`${selectedMovementForSheet.date}T12:00:00`).toLocaleDateString('es-VE', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}`}
          secondaryActions={[
            {
              label: 'Editar',
              icon: <Edit3 size={16} />,
              onClick: () => {
                const target = selectedMovementForSheet;
                setSelectedMovementForSheet(null);
                setEditingMovement(target);
                setIsMovementFormOpen(true);
              },
            },
            {
              label: 'Eliminar',
              icon: <Trash2 size={16} />,
              danger: true,
              onClick: () => {
                const target = selectedMovementForSheet;
                setSelectedMovementForSheet(null);
                setConfirmDeleteMovement({ isOpen: true, movement: target });
              },
            },
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <CurrencyBreakdownCard
              originalAmount={selectedMovementForSheet.amount}
              originalCurrency={selectedMovementForSheet.currency}
              amountBs={selectedMovementForSheet.amount_bs}
              amountUsd={selectedMovementForSheet.amount_usd}
              amountEur={selectedMovementForSheet.amount_eur}
              amountUsdt={selectedMovementForSheet.amount_usdt}
              rateUsdBs={selectedMovementForSheet.rate_usd_bs}
              rateEurBs={selectedMovementForSheet.rate_eur_bs}
              rateUsdtBs={selectedMovementForSheet.rate_usdt_bs}
              fallbackRates={rates}
            />

            {selectedMovementForSheet.income_check_id && (
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
                  <CheckCircle size={16} />
                  <span>Cobro vinculado a plantilla</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  {selectedMovementForSheet.estimated_income_name
                    ? `Plantilla: ${selectedMovementForSheet.estimated_income_name}`
                    : 'Este ingreso forma parte de un cobro de plantilla.'}
                </div>
              </div>
            )}
          </div>
        </ListCardBottomSheet>
      )}

      {/* Bottom Sheet for Estimated Income Details & Actions */}
      {selectedEstimatedForSheet && (() => {
        const check =
          selectedEstimatedForSheet.checks && selectedEstimatedForSheet.checks.length > 0
            ? selectedEstimatedForSheet.checks[0]
            : null;
        const isConfirmed = !!check;
        const isPartial = check?.is_partial;

        return (
          <ListCardBottomSheet
            isOpen={!!selectedEstimatedForSheet}
            onClose={() => setSelectedEstimatedForSheet(null)}
            title={selectedEstimatedForSheet.name}
            subtitle={
              selectedEstimatedForSheet.payment_day
                ? `Cobro estimado: Día ${selectedEstimatedForSheet.payment_day} de cada mes`
                : 'Ingreso estimado recurrente'
            }
            primaryAction={
              !isConfirmed && selectedEstimatedForSheet.is_active
                ? {
                    label: 'Confirmar Recepción de Ingreso',
                    icon: <Circle size={18} />,
                    onClick: () => {
                      const target = selectedEstimatedForSheet;
                      setSelectedEstimatedForSheet(null);
                      setCheckingIncome(target);
                      setIsCheckFormOpen(true);
                    },
                  }
                : isConfirmed && isPartial && selectedEstimatedForSheet.is_active
                ? {
                    label: 'Registrar pago restante',
                    icon: <Plus size={18} />,
                    onClick: () => {
                      const target = selectedEstimatedForSheet;
                      setSelectedEstimatedForSheet(null);
                      setCheckingIncome(target);
                      setIsCheckFormOpen(true);
                    },
                  }
                : isConfirmed && !isPartial && selectedEstimatedForSheet.is_active
                ? {
                    label: 'Deshacer Confirmación',
                    icon: <Undo2 size={18} />,
                    onClick: () => {
                      const target = selectedEstimatedForSheet;
                      setSelectedEstimatedForSheet(null);
                      handleUncheck(target.id);
                    },
                  }
                : undefined
            }
            secondaryActions={[
              ...(isConfirmed && isPartial && selectedEstimatedForSheet.is_active
                ? [
                    {
                      label: 'Deshacer Confirmación',
                      icon: <Undo2 size={16} />,
                      onClick: () => {
                        const target = selectedEstimatedForSheet;
                        setSelectedEstimatedForSheet(null);
                        handleUncheck(target.id);
                      },
                    },
                  ]
                : []),
              {
                label: selectedEstimatedForSheet.is_active ? 'Pausar Ingreso' : 'Reanudar Ingreso',
                icon: selectedEstimatedForSheet.is_active ? <Pause size={16} /> : <Play size={16} />,
                onClick: () => {
                  const target = selectedEstimatedForSheet;
                  setSelectedEstimatedForSheet(null);
                  handleTogglePause(target);
                },
              },
              {
                label: 'Editar',
                icon: <Edit3 size={16} />,
                onClick: () => {
                  const target = selectedEstimatedForSheet;
                  setSelectedEstimatedForSheet(null);
                  setEditingEstimatedIncome(target);
                  setIsEstimatedFormOpen(true);
                },
              },
              {
                label: 'Eliminar',
                icon: <Trash2 size={16} />,
                danger: true,
                onClick: () => {
                  const target = selectedEstimatedForSheet;
                  setSelectedEstimatedForSheet(null);
                  setConfirmDeleteEstimated({ isOpen: true, incomeId: target.id });
                },
              },
            ]}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <CurrencyBreakdownCard
                originalAmount={isConfirmed && check ? check.real_amount : selectedEstimatedForSheet.expected_amount}
                originalCurrency={isConfirmed && check ? check.currency : selectedEstimatedForSheet.currency}
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

              {selectedEstimatedForSheet.notes && (
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    background: 'var(--surface-muted)',
                    padding: '0.6rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <strong>Nota:</strong> {selectedEstimatedForSheet.notes}
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
