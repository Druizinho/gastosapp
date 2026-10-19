import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Plus,
  Edit3,
  Trash2,
  SlidersHorizontal,
  Layers,
  Sparkles,
  Package,
  X,
  Receipt,
  CreditCard,
  PiggyBank
} from 'lucide-react';
import type {
  MonthlyBudgetResponse,
  BudgetIncomeMode,
  CurrencyType,
  Category,
  EstimatedIncome,
  BudgetCategorySummaryOut
} from '../types';
import {
  getMonthlyBudget,
  upsertMonthlyBudget,
  confirmMonthlyBudget,
  getBudgetCategories,
  getCategories,
  getEstimatedIncomes,
  upsertBudgetCategoryLimit,
  deleteBudgetCategoryLimit
} from '../api';
import { ICON_MAP } from './CategoryManager';
import ConfirmModal from './ConfirmModal';

interface BudgetsProps {
  onBack?: () => void;
}

const currencyLabels: Record<string, string> = {
  USD_BCV: '$',
  EUR_BCV: '€',
  BS: 'Bs.',
  USDT: 'USDT',
  USD_CASH: '$ Cash',
};

const CURRENCY_OPTIONS: { value: CurrencyType; label: string }[] = [
  { value: 'USD_BCV', label: 'USD (Tasa BCV)' },
  { value: 'BS', label: 'Bolívares (Bs)' },
  { value: 'USD_CASH', label: 'USD (Efectivo / Paralelo)' },
  { value: 'EUR_BCV', label: 'EUR (Tasa BCV)' },
  { value: 'USDT', label: 'USDT (Binance)' },
];

const formatAmount = (amount: number | null | undefined, prefix: string = ''): string => {
  if (amount === null || amount === undefined) return '—';
  return `${prefix}${Number(amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const Budgets: React.FC<BudgetsProps> = ({ onBack }) => {
  const navigate = useNavigate();

  // Current viewed month (YYYY-MM)
  const [currentMonthYear, setCurrentMonthYear] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  // Data states
  const [budget, setBudget] = useState<MonthlyBudgetResponse | null>(null);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [availableCategoryNames, setAvailableCategoryNames] = useState<string[]>([]);
  const [estimatedIncomes, setEstimatedIncomes] = useState<EstimatedIncome[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConfirmingBudget, setIsConfirmingBudget] = useState<boolean>(false);

  // Currency cycling for hero card
  const [displayCurrency, setDisplayCurrency] = useState<'usd' | 'bs' | 'eur' | 'usdt'>('usd');

  // Modals state
  const [isGlobalModalOpen, setIsGlobalModalOpen] = useState<boolean>(false);
  const [categoryModal, setCategoryModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    categoryName: string;
    limitAmount: string;
    currency: CurrencyType;
  }>({
    isOpen: false,
    mode: 'create',
    categoryName: '',
    limitAmount: '',
    currency: 'USD_BCV',
  });

  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean;
    categoryName: string;
  }>({
    isOpen: false,
    categoryName: '',
  });

  // Short month label for navigator pill
  const shortMonthLabel = useMemo(() => {
    const shortMonths = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const [y, m] = currentMonthYear.split('-');
    return `${shortMonths[parseInt(m, 10) - 1]} ${y}`;
  }, [currentMonthYear]);

  // Fast map of user categories for custom colors/icons
  const categoryMap = useMemo(() => {
    const map: Record<string, Category> = {};
    allCategories.forEach((c) => {
      map[c.name] = c;
    });
    return map;
  }, [allCategories]);

  // Fetch all budget and helper data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [budgetData, userCats, availCats, incomes] = await Promise.all([
        getMonthlyBudget(currentMonthYear),
        getCategories(),
        getBudgetCategories(),
        getEstimatedIncomes(true),
      ]);
      setBudget(budgetData);
      setAllCategories(userCats);
      setAvailableCategoryNames(availCats);
      setEstimatedIncomes(incomes);
    } catch (error) {
      console.error('Error fetching budget data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentMonthYear]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/herramientas');
    }
  };

  const cycleDisplayCurrency = () => {
    const order: Array<'usd' | 'bs' | 'eur' | 'usdt'> = ['usd', 'bs', 'eur', 'usdt'];
    const idx = order.indexOf(displayCurrency);
    setDisplayCurrency(order[(idx + 1) % order.length]);
  };

  const handleConfirmBudget = async () => {
    setIsConfirmingBudget(true);
    try {
      const res = await confirmMonthlyBudget(currentMonthYear);
      setBudget(res);
    } catch (error) {
      console.error('Error confirming budget:', error);
      alert('Error al confirmar presupuesto del mes');
    } finally {
      setIsConfirmingBudget(false);
    }
  };

  const openCategoryModalForAdd = (prefillName?: string) => {
    const budgetedNames = new Set((budget?.category_limits || []).map((cl) => cl.category_name));
    const unbudgetedOptions = availableCategoryNames.filter((name) => !budgetedNames.has(name));
    const defaultName = prefillName || (unbudgetedOptions.length > 0 ? unbudgetedOptions[0] : availableCategoryNames[0] || '');

    setCategoryModal({
      isOpen: true,
      mode: 'create',
      categoryName: defaultName,
      limitAmount: '',
      currency: budget?.currency || 'USD_BCV',
    });
  };

  const openCategoryModalForEdit = (item: BudgetCategorySummaryOut) => {
    setCategoryModal({
      isOpen: true,
      mode: 'edit',
      categoryName: item.category_name,
      limitAmount: String(item.limit_amount),
      currency: item.currency || budget?.currency || 'USD_BCV',
    });
  };

  const handleSaveCategoryLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(categoryModal.limitAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      alert('Ingresa un monto límite válido mayor o igual a 0');
      return;
    }
    if (!categoryModal.categoryName.trim()) {
      alert('Selecciona una categoría válida');
      return;
    }

    try {
      const updated = await upsertBudgetCategoryLimit(currentMonthYear, {
        category_name: categoryModal.categoryName.trim(),
        limit_amount: amountNum,
        currency: categoryModal.currency,
      });
      setBudget(updated);
      setCategoryModal((prev) => ({ ...prev, isOpen: false }));
    } catch (error) {
      console.error('Error saving category limit:', error);
      alert('Error al guardar límite de categoría');
    }
  };

  const handleDeleteCategoryLimit = async () => {
    if (!confirmDelete.categoryName) return;
    try {
      const updated = await deleteBudgetCategoryLimit(currentMonthYear, confirmDelete.categoryName);
      setBudget(updated);
      setConfirmDelete({ isOpen: false, categoryName: '' });
    } catch (error) {
      console.error('Error deleting category limit:', error);
      alert('Error al eliminar límite de categoría');
    }
  };

  // Currency equivalent helpers for hero card
  const prefixMap = { bs: 'Bs. ', usd: '$ ', eur: '€ ', usdt: '' };
  const suffixMap = { bs: '', usd: '', eur: '', usdt: ' USDT' };

  const getHeroAmount = () => {
    if (!budget) return '—';
    const p = prefixMap[displayCurrency];
    const s = suffixMap[displayCurrency];

    const spentMap = {
      usd: budget.total_spent_usd,
      bs: budget.total_spent_bs,
      eur: budget.total_spent_eur,
      usdt: budget.total_spent_usdt,
    };
    const limitMap = {
      usd: budget.global_limit_usd,
      bs: budget.global_limit_bs,
      eur: budget.global_limit_eur,
      usdt: budget.global_limit_usdt,
    };

    const spentStr = formatAmount(spentMap[displayCurrency], p) + s;
    const limitVal = limitMap[displayCurrency];
    if (limitVal !== null && limitVal !== undefined && limitVal > 0) {
      const limitStr = formatAmount(limitVal, p) + s;
      return `${spentStr} / ${limitStr}`;
    }
    return spentStr;
  };

  const getGlobalBadge = () => {
    if (!budget || !budget.effective_global_limit) {
      return {
        text: 'Sin límite global',
        bg: 'var(--surface-muted)',
        color: 'var(--text-secondary)',
      };
    }
    const pct = Math.round(budget.global_spent_percentage);
    if (budget.global_traffic_light === 'red') {
      return {
        text: `${pct}% excedido`,
        bg: 'rgba(239, 68, 68, 0.12)',
        color: '#EF4444',
      };
    }
    if (budget.global_traffic_light === 'yellow') {
      return {
        text: `${pct}% en alerta`,
        bg: 'rgba(245, 158, 11, 0.12)',
        color: '#F59E0B',
      };
    }
    return {
      text: `${pct}% en rango`,
      bg: 'rgba(16, 185, 129, 0.12)',
      color: '#10B981',
    };
  };

  const badge = getGlobalBadge();

  const allocatedMap = {
    usd: budget?.allocated_usd ?? 0,
    bs: budget?.allocated_bs ?? 0,
    eur: budget?.allocated_eur ?? 0,
    usdt: budget?.allocated_usdt ?? 0,
  };

  const unbudgetedMap = {
    usd: budget?.unbudgeted_spent_usd ?? 0,
    bs: budget?.unbudgeted_spent_bs ?? 0,
    eur: budget?.unbudgeted_spent_eur ?? 0,
    usdt: budget?.unbudgeted_spent_usdt ?? 0,
  };

  const globalProgress = budget?.effective_global_limit && budget.effective_global_limit > 0
    ? Math.min(budget.global_spent_percentage, 100)
    : 0;

  // Render system category icon fallback
  const renderCategoryIcon = (categoryName: string) => {
    if (categoryName === 'Gastos Fijos') return <Receipt size={18} />;
    if (categoryName === 'Deudas') return <CreditCard size={18} />;
    if (categoryName === 'Ahorro') return <PiggyBank size={18} />;

    const catObj = categoryMap[categoryName];
    if (catObj && catObj.color && ICON_MAP[catObj.color]) {
      const CustomIcon = ICON_MAP[catObj.color];
      return <CustomIcon size={18} />;
    }
    return <Package size={18} />;
  };

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      {/* Header with circular back button and compact Month Navigator */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'nowrap',
          gap: '0.5rem',
          marginBottom: '1.25rem',
          paddingTop: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <button
            onClick={handleBack}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-color)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
              color: 'var(--text-primary)',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: '1.2rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Presupuestos
            </h1>
            <p
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Planificación y límites mensuales
            </p>
          </div>
        </div>

        {/* Compact Month Navigator matching FixedExpenses 1:1 */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--surface-color)',
            padding: '0.4rem 0.6rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Calendar size={18} color="var(--text-secondary)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {shortMonthLabel}
          </span>
          <input
            type="month"
            value={currentMonthYear}
            onChange={(e) => {
              if (e.target.value) setCurrentMonthYear(e.target.value);
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
      </header>

      {/* Auto-clone unconfirmed banner */}
      {budget && !budget.is_confirmed && budget.exists && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: 1 }}>
            <Sparkles size={18} color="#F59E0B" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.825rem', color: 'var(--text-primary)', fontWeight: 500 }}>
              Presupuesto clonado del mes anterior. Revísalo y confirma tus límites.
            </span>
          </div>
          <button
            onClick={handleConfirmBudget}
            disabled={isConfirmingBudget}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: 'var(--radius-full)',
              background: '#F59E0B',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: isConfirmingBudget ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              opacity: isConfirmingBudget ? 0.7 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            {isConfirmingBudget ? 'Confirmando...' : 'Confirmar mes'}
          </button>
        </div>
      )}

      {/* Hero card with tap-to-cycle currency and global progress */}
      <div
        className="soft-card"
        onClick={cycleDisplayCurrency}
        style={{
          marginBottom: '1.25rem',
          padding: '1.25rem',
          cursor: 'pointer',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, var(--surface-color) 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.4rem',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Gasto Total del Mes
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.2rem 0.6rem',
              borderRadius: 'var(--radius-full)',
              background: badge.bg,
              color: badge.color,
              fontSize: '0.75rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {badge.text}
          </div>
        </div>

        <div
          style={{
            fontSize: '1.85rem',
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          {isLoading ? '...' : getHeroAmount()}
        </div>

        <div
          style={{
            fontSize: '0.7rem',
            color: 'var(--text-tertiary)',
            marginTop: '0.2rem',
            marginBottom: '0.75rem',
          }}
        >
          Toca para alternar moneda ({displayCurrency.toUpperCase()})
        </div>

        {/* Global Limit Progress Bar */}
        {budget && budget.effective_global_limit && budget.effective_global_limit > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.35rem',
              }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Progreso global
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: badge.color }}>
                {Math.round(budget.global_spent_percentage)}%
              </span>
            </div>
            <div
              style={{
                height: '8px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--surface-muted)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 'var(--radius-full)',
                  background:
                    budget.global_traffic_light === 'red'
                      ? 'linear-gradient(90deg, #EF4444, #F87171)'
                      : budget.global_traffic_light === 'yellow'
                      ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                      : 'linear-gradient(90deg, #10B981, #34D399)',
                  width: `${globalProgress}%`,
                  transition: 'width 0.4s ease-out',
                }}
              />
            </div>
          </div>
        )}

        {/* Bottom bar of Hero Card */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '0.65rem',
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
          }}
        >
          <span>
            Asignado a categorías:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {formatAmount(allocatedMap[displayCurrency], prefixMap[displayCurrency])}
              {suffixMap[displayCurrency]}
            </strong>
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsGlobalModalOpen(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.3rem 0.65rem',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-color)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.15s ease',
            }}
          >
            <SlidersHorizontal size={13} />
            Configurar Global
          </button>
        </div>
      </div>

      {/* Add Category Limit Button matching FixedExpenses 1:1 */}
      <button
        onClick={() => openCategoryModalForAdd()}
        style={{
          width: '100%',
          padding: '0.875rem',
          marginBottom: '1.25rem',
          background: 'var(--surface-color)',
          border: '2px dashed var(--accent-light)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          color: 'var(--text-secondary)',
          fontFamily: 'inherit',
          fontSize: '0.9rem',
          fontWeight: 600,
          transition: 'all 0.2s ease',
        }}
      >
        <Plus size={18} />
        Agregar categoría al presupuesto
      </button>

      {/* Category List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
          Cargando presupuesto...
        </div>
      ) : !budget || budget.category_limits.length === 0 ? (
        <div
          className="soft-card"
          style={{
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            marginBottom: '1rem',
          }}
        >
          <Layers size={32} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.35rem', color: 'var(--text-primary)' }}>
            No hay categorías presupuestadas
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: '0 0 1rem' }}>
            Empieza agregando un límite a tus categorías principales como Gastos Fijos, Mercado o Salidas.
          </p>
          <button
            onClick={() => openCategoryModalForAdd()}
            className="btn btn-primary"
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            <Plus size={16} />
            Asignar primer límite
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {budget.category_limits.map((cat) => {
            const isRed = cat.traffic_light === 'red';
            const isYellow = cat.traffic_light === 'yellow';
            const statusColor = isRed ? '#EF4444' : isYellow ? '#F59E0B' : '#10B981';
            const currSym = currencyLabels[cat.currency] || '$';

            return (
              <div
                key={cat.category_name}
                className="soft-card"
                style={{
                  padding: '1rem 1.25rem',
                  borderLeft: `4px solid ${statusColor}`,
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                {/* Top Info Row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: 'var(--surface-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-primary)',
                        flexShrink: 0,
                      }}
                    >
                      {renderCategoryIcon(cat.category_name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {cat.category_name}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: cat.remaining_amount < 0 ? '#EF4444' : 'var(--text-tertiary)',
                          fontWeight: cat.remaining_amount < 0 ? 600 : 400,
                        }}
                      >
                        {cat.remaining_amount < 0
                          ? `Excedido por ${currSym} ${formatAmount(Math.abs(cat.remaining_amount))}`
                          : `Disponible: ${currSym} ${formatAmount(cat.remaining_amount)}`}
                      </div>
                    </div>
                  </div>

                  {/* Primary amount in category currency & equivalents */}
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.5rem' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {currSym} {formatAmount(cat.spent_amount)} / {formatAmount(cat.limit_amount)}
                    </div>
                    {cat.currency !== 'BS' && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                        ≈ Bs. {formatAmount(cat.spent_bs)} / {formatAmount(cat.limit_bs)}
                      </div>
                    )}
                    {cat.currency !== 'USD_BCV' && cat.currency !== 'USD_CASH' && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                        ≈ $ {formatAmount(cat.spent_usd)} / {formatAmount(cat.limit_usd)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar and action buttons */}
                <div style={{ marginTop: '0.4rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.35rem',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor }}>
                      {Math.round(cat.spent_percentage)}% consumido
                    </span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        onClick={() => openCategoryModalForEdit(cat)}
                        title="Editar límite"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--surface-muted)',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() =>
                          setConfirmDelete({
                            isOpen: true,
                            categoryName: cat.category_name,
                          })
                        }
                        title="Eliminar límite"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--surface-muted)',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: 'var(--expense-color)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      height: '6px',
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--surface-muted)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        borderRadius: 'var(--radius-full)',
                        background: isRed
                          ? 'linear-gradient(90deg, #EF4444, #F87171)'
                          : isYellow
                          ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                          : 'linear-gradient(90deg, #10B981, #34D399)',
                        width: `${Math.min(cat.spent_percentage, 100)}%`,
                        transition: 'width 0.4s ease-out',
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unbudgeted categories footer card */}
      {budget && budget.unbudgeted_categories.length > 0 && (
        <div className="soft-card" style={{ padding: '1.25rem', marginTop: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.4rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={16} color="var(--text-secondary)" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Gastos sin límite asignado
              </span>
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Total: {formatAmount(unbudgetedMap[displayCurrency], prefixMap[displayCurrency])}
              {suffixMap[displayCurrency]}
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', margin: '0 0 0.75rem 0' }}>
            Toca una categoría para asignarle un límite en tu presupuesto:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {budget.unbudgeted_categories.map((catName) => (
              <button
                key={catName}
                onClick={() => openCategoryModalForAdd(catName)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.65rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Plus size={12} />
                {catName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* GlobalBudgetModal */}
      {isGlobalModalOpen && budget && (
        <GlobalBudgetModal
          isOpen={isGlobalModalOpen}
          monthYear={currentMonthYear}
          currentBudget={budget}
          incomes={estimatedIncomes}
          onClose={() => setIsGlobalModalOpen(false)}
          onSaved={(updated) => {
            setBudget(updated);
            setIsGlobalModalOpen(false);
          }}
        />
      )}

      {/* CategoryLimitModal */}
      {categoryModal.isOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1000 }}>
          <div
            className="expense-form-container soft-card"
            style={{
              maxWidth: '420px',
              width: '90%',
              padding: '1.5rem',
              animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  {categoryModal.mode === 'create' ? 'Agregar Categoría' : 'Editar Límite'}
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                  Define el monto máximo para esta categoría
                </p>
              </div>
              <button
                onClick={() => setCategoryModal((prev) => ({ ...prev, isOpen: false }))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveCategoryLimit} className="expense-form">
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Categoría
                </label>
                {categoryModal.mode === 'create' ? (
                  <select
                    value={categoryModal.categoryName}
                    onChange={(e) => setCategoryModal((prev) => ({ ...prev, categoryName: e.target.value }))}
                    className="input-field"
                    required
                    style={{ width: '100%', marginTop: '0.35rem' }}
                  >
                    {availableCategoryNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={categoryModal.categoryName}
                    disabled
                    className="input-field"
                    style={{ width: '100%', marginTop: '0.35rem', opacity: 0.7 }}
                  />
                )}
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Moneda del límite
                </label>
                <select
                  value={categoryModal.currency}
                  onChange={(e) =>
                    setCategoryModal((prev) => ({ ...prev, currency: e.target.value as CurrencyType }))
                  }
                  className="input-field"
                  style={{ width: '100%', marginTop: '0.35rem' }}
                >
                  {CURRENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Monto límite ({currencyLabels[categoryModal.currency] || '$'})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  placeholder="0.00"
                  value={categoryModal.limitAmount}
                  onChange={(e) => setCategoryModal((prev) => ({ ...prev, limitAmount: e.target.value }))}
                  className="input-field"
                  style={{ width: '100%', marginTop: '0.35rem', fontSize: '1.1rem', fontWeight: 600 }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setCategoryModal((prev) => ({ ...prev, isOpen: false }))}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'var(--surface-muted)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', fontWeight: 600 }}
                >
                  Guardar Límite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ConfirmDelete Modal */}
      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title="¿Eliminar límite?"
        message={`¿Estás seguro de que deseas eliminar el límite para "${confirmDelete.categoryName}"? Los gastos de esta categoría pasarán a ser no presupuestados.`}
        onConfirm={handleDeleteCategoryLimit}
        onCancel={() => setConfirmDelete({ isOpen: false, categoryName: '' })}
      />
    </div>
  );
};

// Modal for Configuring Global Budget Limit and Mode
interface GlobalBudgetModalProps {
  isOpen: boolean;
  monthYear: string;
  currentBudget: MonthlyBudgetResponse;
  incomes: EstimatedIncome[];
  onClose: () => void;
  onSaved: (budget: MonthlyBudgetResponse) => void;
}

const GlobalBudgetModal: React.FC<GlobalBudgetModalProps> = ({
  isOpen,
  monthYear,
  currentBudget,
  incomes,
  onClose,
  onSaved,
}) => {
  const [currency, setCurrency] = useState<CurrencyType>(currentBudget.currency);
  const [incomeMode, setIncomeMode] = useState<BudgetIncomeMode>(currentBudget.income_mode);
  const [linkedIncomeId, setLinkedIncomeId] = useState<string>(currentBudget.linked_income_id || '');
  const [manualLimit, setManualLimit] = useState<string>(
    currentBudget.manual_global_limit !== null && currentBudget.manual_global_limit !== undefined
      ? String(currentBudget.manual_global_limit)
      : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    let manualVal: number | null = null;
    if (incomeMode === 'manual') {
      const num = parseFloat(manualLimit);
      if (!isNaN(num) && num >= 0) {
        manualVal = num;
      } else {
        manualVal = null;
      }
    }

    try {
      const payload = {
        currency,
        income_mode: incomeMode,
        linked_income_id: incomeMode === 'single_income' && linkedIncomeId ? linkedIncomeId : null,
        manual_global_limit: manualVal,
        category_limits: null, // Keep existing category limits intact!
      };
      const res = await upsertMonthlyBudget(monthYear, payload);
      onSaved(res);
    } catch (error) {
      console.error('Error saving global budget:', error);
      alert('Error al guardar presupuesto global');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1000 }}>
      <div
        className="expense-form-container soft-card"
        style={{
          maxWidth: '450px',
          width: '90%',
          padding: '1.5rem',
          animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Presupuesto Global
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
              Configura el tope general y modo de cálculo del mes
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="expense-form">
          {/* Currency */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Moneda base del presupuesto global
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyType)}
              className="input-field"
              style={{ width: '100%', marginTop: '0.35rem' }}
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Selector */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Modo de límite global
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.4rem',
                marginTop: '0.35rem',
              }}
            >
              {[
                { id: 'manual', label: 'Manual' },
                { id: 'single_income', label: '1 Ingreso' },
                { id: 'all_incomes', label: 'Ingresos' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setIncomeMode(tab.id as BudgetIncomeMode)}
                  style={{
                    padding: '0.5rem 0.25rem',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: incomeMode === tab.id ? 'var(--primary-color)' : 'var(--border-color)',
                    background: incomeMode === tab.id ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface-color)',
                    color: incomeMode === tab.id ? 'var(--primary-color)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode details */}
          {incomeMode === 'manual' && (
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Tope mensual global ({currencyLabels[currency] || '$'})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="Sin límite global (opcional)"
                value={manualLimit}
                onChange={(e) => setManualLimit(e.target.value)}
                className="input-field"
                style={{ width: '100%', marginTop: '0.35rem', fontSize: '1.05rem', fontWeight: 600 }}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.25rem', display: 'block' }}>
                Deja vacío si solo deseas presupuestar por categorías individuales.
              </span>
            </div>
          )}

          {incomeMode === 'single_income' && (
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Ingreso estimado a vincular
              </label>
              <select
                value={linkedIncomeId}
                onChange={(e) => setLinkedIncomeId(e.target.value)}
                className="input-field"
                required
                style={{ width: '100%', marginTop: '0.35rem' }}
              >
                <option value="">Selecciona un ingreso estimado...</option>
                {incomes.map((inc) => (
                  <option key={inc.id} value={inc.id}>
                    {inc.name} ({currencyLabels[inc.currency] || '$'} {formatAmount(inc.expected_amount)})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.25rem', display: 'block' }}>
                El límite global se adaptará automáticamente al monto estimado de este ingreso.
              </span>
            </div>
          )}

          {incomeMode === 'all_incomes' && (
            <div
              style={{
                padding: '0.85rem',
                borderRadius: '8px',
                background: 'var(--surface-muted)',
                marginBottom: '1.5rem',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
              }}
            >
              <p style={{ margin: '0 0 0.4rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Modo dinámico: Total de ingresos
              </p>
              El tope global sumará todos tus ingresos estimados activos ({incomes.length} activos registrados), convertidos a la moneda global.
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: '12px',
                border: 'none',
                background: 'var(--surface-muted)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: '12px',
                fontWeight: 600,
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting ? 'Guardando...' : 'Guardar Global'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Budgets;
