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
  X,
  Star,
  Check,
  Lock,
  RotateCcw
} from 'lucide-react';
import type {
  MonthlyBudgetResponse,
  SingleBudgetOut,
  CurrencyType,
  Category,
  BudgetCategorySummaryOut
} from '../types';
import {
  getMonthlyBudget,
  confirmMonthlyBudget,
  createMonthlyBudget,
  updateMonthlyBudgetById,
  deleteMonthlyBudgetById,
  upsertCategoryLimitByBudgetId,
  deleteCategoryLimitByBudgetId
} from '../api';
import { resolveCategoryVisuals } from '../utils/categoryVisuals';
import { useCategories } from '../context/CategoriesContext';
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

export type DisplayCurrency = 'usd' | 'bs' | 'eur' | 'usdt';

export const prefixMap: Record<DisplayCurrency, string> = {
  bs: 'Bs. ',
  usd: '$ ',
  eur: '€ ',
  usdt: '',
};

export const suffixMap: Record<DisplayCurrency, string> = {
  bs: '',
  usd: '',
  eur: '',
  usdt: ' USDT',
};

export interface TrafficLightProgressBarProps {
  percentage: number;
  trafficLight?: 'green' | 'yellow' | 'red';
  height?: number;
  style?: React.CSSProperties;
}

export const TrafficLightProgressBar: React.FC<TrafficLightProgressBarProps> = ({
  percentage,
  trafficLight,
  height = 8,
  style,
}) => {
  const clamped = Math.max(0, Math.min(percentage, 100));
  const resolvedLight =
    trafficLight || (percentage >= 100 ? 'red' : percentage >= 80 ? 'yellow' : 'green');

  const gradient =
    resolvedLight === 'red'
      ? 'linear-gradient(90deg, #EF4444, #F87171)'
      : resolvedLight === 'yellow'
      ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
      : 'linear-gradient(90deg, #10B981, #34D399)';

  return (
    <div
      style={{
        height: `${height}px`,
        borderRadius: 'var(--radius-full)',
        background: 'var(--surface-muted)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          height: '100%',
          borderRadius: 'var(--radius-full)',
          background: gradient,
          width: `${clamped}%`,
          transition: 'width 0.4s ease-out',
        }}
      />
    </div>
  );
};

export interface BudgetHeroCardProps {
  title: string;
  badge: React.ReactNode;
  spentMap: { usd: number; bs: number; eur: number; usdt: number };
  limitMap?: { usd?: number | null; bs?: number | null; eur?: number | null; usdt?: number | null };
  displayCurrency: DisplayCurrency;
  onCycleCurrency: () => void;
  isLoading?: boolean;
  showProgress?: boolean;
  percentage?: number;
  trafficLight?: 'green' | 'yellow' | 'red';
  progressTitle?: string;
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
}

export const BudgetHeroCard: React.FC<BudgetHeroCardProps> = ({
  title,
  badge,
  spentMap,
  limitMap,
  displayCurrency,
  onCycleCurrency,
  isLoading = false,
  showProgress = false,
  percentage = 0,
  trafficLight,
  progressTitle,
  footerLeft,
  footerRight,
}) => {
  const p = prefixMap[displayCurrency];
  const s = suffixMap[displayCurrency];
  const spent = spentMap[displayCurrency] ?? 0;
  const spentStr = formatAmount(spent, p) + s;
  const lim = limitMap ? limitMap[displayCurrency] : undefined;
  let amountDisplay = spentStr;
  if (lim !== null && lim !== undefined && lim > 0) {
    amountDisplay = `${spentStr} / ${formatAmount(lim, p)}${s}`;
  }

  const resolvedLight =
    trafficLight || (percentage >= 100 ? 'red' : percentage >= 80 ? 'yellow' : 'green');
  const lightColor =
    resolvedLight === 'red' ? '#EF4444' : resolvedLight === 'yellow' ? '#F59E0B' : '#10B981';

  return (
    <div
      className="soft-card"
      onClick={onCycleCurrency}
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
          {title}
        </span>
        {badge}
      </div>

      <div
        style={{
          fontSize: '1.85rem',
          fontWeight: 800,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
        }}
      >
        {isLoading ? '...' : amountDisplay}
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

      {showProgress && (
        <div style={{ marginBottom: '0.75rem' }}>
          {progressTitle && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.35rem',
              }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {progressTitle}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: lightColor,
                }}
              >
                {Math.round(percentage)}%
              </span>
            </div>
          )}
          <TrafficLightProgressBar
            percentage={percentage}
            trafficLight={trafficLight}
            height={8}
          />
        </div>
      )}

      {(footerLeft || footerRight) && (
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
          {footerLeft || <div />}
          {footerRight || <div />}
        </div>
      )}
    </div>
  );
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

  // Master-Detail navigation: selected budget ID (null = master view, string = detail view)
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);

  const { categories: allCategories, refreshCategories } = useCategories();

  // Data states
  const [budgetResponse, setBudgetResponse] = useState<MonthlyBudgetResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConfirmingBudget, setIsConfirmingBudget] = useState<boolean>(false);

  // Currency cycling for hero card (usd, bs, eur, usdt)
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('usd');

  // Modals state
  const [budgetModal, setBudgetModal] = useState<{
    isOpen: boolean;
    budgetToEdit: SingleBudgetOut | null;
  }>({
    isOpen: false,
    budgetToEdit: null,
  });

  const [categoryModal, setCategoryModal] = useState<{
    isOpen: boolean;
    categoryName: string;
    existingLimit: BudgetCategorySummaryOut | null;
    otherBudgetsWithCat: string[];
    limitAmount: string;
    currency: CurrencyType;
  }>({
    isOpen: false,
    categoryName: '',
    existingLimit: null,
    otherBudgetsWithCat: [],
    limitAmount: '',
    currency: 'USD_BCV',
  });

  const [confirmDeleteBudget, setConfirmDeleteBudget] = useState<{
    isOpen: boolean;
    budgetId: string;
    budgetName: string;
  }>({
    isOpen: false,
    budgetId: '',
    budgetName: '',
  });

  const [confirmDeleteCategoryLimit, setConfirmDeleteCategoryLimit] = useState<{
    isOpen: boolean;
    budgetId: string;
    categoryName: string;
  }>({
    isOpen: false,
    budgetId: '',
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

  // Primary budget (Plan Maestro - single source of truth for limits)
  const primaryBudget: SingleBudgetOut | undefined = useMemo(() => {
    return budgetResponse?.budgets?.find((b) => b.is_primary) || budgetResponse?.budgets?.[0];
  }, [budgetResponse]);

  // Sub-budgets (category groups that inherit limits from Primary)
  const subBudgets: SingleBudgetOut[] = useMemo(() => {
    return budgetResponse?.budgets?.filter((b) => !b.is_primary) || [];
  }, [budgetResponse]);

  // Currently selected budget object (if in detail view)
  const selectedBudget: SingleBudgetOut | undefined = useMemo(() => {
    if (!selectedBudgetId || !budgetResponse?.budgets) return undefined;
    return budgetResponse.budgets.find((b) => b.id === selectedBudgetId);
  }, [selectedBudgetId, budgetResponse]);

  // If selected budget no longer exists (e.g. deleted), revert to master view
  useEffect(() => {
    if (selectedBudgetId && budgetResponse?.budgets && !selectedBudget) {
      setSelectedBudgetId(null);
    }
  }, [selectedBudgetId, budgetResponse, selectedBudget]);

  // Fetch all budget and helper data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [bRes] = await Promise.all([
        getMonthlyBudget(currentMonthYear),
        refreshCategories(),
      ]);
      setBudgetResponse(bRes);
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
    if (selectedBudgetId) {
      setSelectedBudgetId(null);
      return;
    }
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
      setBudgetResponse(res);
    } catch (error) {
      console.error('Error confirming budget:', error);
      alert('Error al confirmar presupuesto del mes');
    } finally {
      setIsConfirmingBudget(false);
    }
  };

  const handleManageCategories = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (primaryBudget) {
      setSelectedBudgetId(primaryBudget.id);
      return;
    }
    setIsLoading(true);
    try {
      const bRes = await getMonthlyBudget(currentMonthYear);
      setBudgetResponse(bRes);
      let prim = bRes.budgets?.find((b) => b.is_primary) || bRes.budgets?.[0];
      if (!prim) {
        const createdRes = await createMonthlyBudget(currentMonthYear, {
          name: 'Presupuesto Principal',
          currency: 'USD_BCV',
          is_primary: true,
          categories: [],
        });
        setBudgetResponse(createdRes);
        prim = createdRes.budgets?.find((b) => b.is_primary) || createdRes.budgets?.[0];
      }
      if (prim) {
        setSelectedBudgetId(prim.id);
      }
    } catch (error) {
      console.error('Error loading or initializing budget for category management:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Open modal to create or edit a budget group
  const handleOpenBudgetModal = (budgetToEdit: SingleBudgetOut | null = null) => {
    setBudgetModal({
      isOpen: true,
      budgetToEdit,
    });
  };

  // Open category limit modal directly (always edits in Primary budget)
  const handleOpenCategoryLimitModal = (categoryName: string) => {
    const targetBudgetForLimit = primaryBudget || selectedBudget;
    if (!targetBudgetForLimit) return;
    const existing = targetBudgetForLimit.category_limits.find(
      (cl) => cl.category_name.toLowerCase() === categoryName.toLowerCase()
    ) || null;

    setCategoryModal({
      isOpen: true,
      categoryName,
      existingLimit: existing,
      otherBudgetsWithCat: [],
      limitAmount: existing && Number(existing.limit_amount) > 0 ? String(existing.limit_amount) : '',
      currency: existing?.currency || targetBudgetForLimit.currency || 'USD_BCV',
    });
  };

  const handleSaveCategoryLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetBudgetForLimit = primaryBudget || selectedBudget;
    if (!targetBudgetForLimit) return;
    const amountNum = parseFloat(categoryModal.limitAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      alert('Ingresa un monto límite válido mayor o igual a 0');
      return;
    }

    try {
      const updated = await upsertCategoryLimitByBudgetId(targetBudgetForLimit.id, {
        category_name: categoryModal.categoryName,
        limit_amount: amountNum,
        currency: categoryModal.currency,
      });
      setBudgetResponse(updated);
      setCategoryModal((prev) => ({ ...prev, isOpen: false }));
    } catch (error: any) {
      console.error('Error saving category limit:', error);
      alert(error?.response?.data?.detail || 'Error al guardar límite de categoría');
    }
  };

  const handleDeleteBudget = async () => {
    if (!confirmDeleteBudget.budgetId) return;
    try {
      const updated = await deleteMonthlyBudgetById(confirmDeleteBudget.budgetId);
      setBudgetResponse(updated);
      if (selectedBudgetId === confirmDeleteBudget.budgetId) {
        setSelectedBudgetId(null);
      }
      setConfirmDeleteBudget({ isOpen: false, budgetId: '', budgetName: '' });
    } catch (error) {
      console.error('Error deleting budget:', error);
      alert('Error al eliminar presupuesto');
    }
  };

  const handleDeleteCategoryLimit = async () => {
    if (!confirmDeleteCategoryLimit.budgetId || !confirmDeleteCategoryLimit.categoryName) return;
    try {
      const updated = await deleteCategoryLimitByBudgetId(
        confirmDeleteCategoryLimit.budgetId,
        confirmDeleteCategoryLimit.categoryName
      );
      setBudgetResponse(updated);
      setConfirmDeleteCategoryLimit({ isOpen: false, budgetId: '', categoryName: '' });
    } catch (error) {
      console.error('Error deleting category limit:', error);
      alert('Error al eliminar límite de categoría');
    }
  };

  // Currency equivalent helpers (prefixMap, suffixMap declared at module level)

  // Render category icon with color using resolveCategoryVisuals
  const renderCategoryIcon = (categoryName: string) => {
    const catObj = categoryMap[categoryName];
    const { IconComponent, hexColor } = resolveCategoryVisuals(catObj, categoryName);
    return <IconComponent size={18} color={hexColor} />;
  };

  // Check if any budget is unconfirmed
  const hasUnconfirmedBudgets = useMemo(() => {
    if (!budgetResponse || !budgetResponse.exists || !budgetResponse.budgets) return false;
    return budgetResponse.budgets.some((b) => !b.is_confirmed);
  }, [budgetResponse]);

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      {/* ======================================================== */}
      {/* MASTER VIEW (when selectedBudgetId === null)             */}
      {/* ======================================================== */}
      {!selectedBudget && (
        <>
          {/* Header */}
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
                  Planificación y techos mensuales
                </p>
              </div>
            </div>

            {/* Compact Month Navigator */}
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
          {hasUnconfirmedBudgets && (
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
                  Presupuestos clonados del mes anterior. Revísalos y confirma tus límites.
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

          {/* Hero Card: Presupuesto Principal (Plan Maestro) */}
          <BudgetHeroCard
            title="Presupuesto Principal (Plan Maestro)"
            badge={
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: '#B45309',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <Star size={12} fill="#F59E0B" color="#F59E0B" />
                Plan Maestro
              </div>
            }
            spentMap={{
              usd: budgetResponse?.total_spent_usd ?? 0,
              bs: budgetResponse?.total_spent_bs ?? 0,
              eur: budgetResponse?.total_spent_eur ?? 0,
              usdt: budgetResponse?.total_spent_usdt ?? 0,
            }}
            limitMap={{
              usd: budgetResponse?.global_limit_usd,
              bs: budgetResponse?.global_limit_bs,
              eur: budgetResponse?.global_limit_eur,
              usdt: budgetResponse?.global_limit_usdt,
            }}
            displayCurrency={displayCurrency}
            onCycleCurrency={cycleDisplayCurrency}
            isLoading={isLoading}
            showProgress={!!(budgetResponse?.global_limit_usd && budgetResponse.global_limit_usd > 0)}
            percentage={budgetResponse?.global_spent_percentage}
            trafficLight={budgetResponse?.global_traffic_light}
            progressTitle="Límite del mes consumido"
            footerLeft={
              <span>
                Techo Plan Maestro:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {formatAmount(
                    displayCurrency === 'usd'
                      ? budgetResponse?.global_limit_usd
                      : displayCurrency === 'bs'
                      ? budgetResponse?.global_limit_bs
                      : displayCurrency === 'eur'
                      ? budgetResponse?.global_limit_eur
                      : budgetResponse?.global_limit_usdt,
                    prefixMap[displayCurrency]
                  )}
                  {suffixMap[displayCurrency]}
                </strong>
              </span>
            }
            footerRight={
              <button
                onClick={handleManageCategories}
                disabled={isLoading}
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-full)',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.7 : 1,
                }}
              >
                <SlidersHorizontal size={13} />
                Gestionar Categorías y Límites
              </button>
            }
          />

          {/* Section: Grupos y Sub-presupuestos */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '1.25rem',
              marginBottom: '0.85rem',
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Grupos y Sub-presupuestos ({subBudgets.length})
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                Agrupa categorías para organizar o compartir tus límites
              </p>
            </div>
            <button
              onClick={() => handleOpenBudgetModal(null)}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                padding: '0.45rem 0.85rem',
                borderRadius: 'var(--radius-full)',
                fontWeight: 600,
              }}
            >
              <Plus size={15} />
              Nuevo grupo
            </button>
          </div>

          {/* List of Sub-Budgets */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
              Cargando presupuestos...
            </div>
          ) : subBudgets.length === 0 ? (
            <div
              className="soft-card"
              style={{
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              <Layers size={36} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.35rem', color: 'var(--text-primary)' }}>
                No tienes grupos de categorías creados
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: '0 0 1.25rem' }}>
                Crea un grupo (ej. &quot;Casa & Mercado&quot; o &quot;Gastos Personales&quot;) para reunir categorías y heredarlas del Principal.
              </p>
              <button
                onClick={() => handleOpenBudgetModal(null)}
                className="btn btn-primary"
                style={{ fontSize: '0.85rem', padding: '0.6rem 1.25rem' }}
              >
                <Plus size={16} />
                Crear primer grupo
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {subBudgets.map((b) => {
                const isRed = b.global_traffic_light === 'red';
                const isYellow = b.global_traffic_light === 'yellow';
                const statusColor = isRed ? '#EF4444' : isYellow ? '#F59E0B' : '#10B981';
                const currSym = currencyLabels[b.currency] || '$';
                const catNames = b.category_limits.map((c) => c.category_name).slice(0, 3).join(', ');
                const hasMore = b.category_limits.length > 3 ? ` +${b.category_limits.length - 3}` : '';

                return (
                  <div
                    key={b.id}
                    className="soft-card"
                    onClick={() => setSelectedBudgetId(b.id)}
                    style={{
                      padding: '1.15rem 1.25rem',
                      borderLeft: `4px solid ${statusColor}`,
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    }}
                  >
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
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            background: 'var(--surface-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-primary)',
                            flexShrink: 0,
                          }}
                        >
                          <Layers size={20} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '1rem',
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {b.name}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              marginTop: '0.2rem',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                                background: 'var(--surface-muted)',
                                padding: '0.15rem 0.45rem',
                                borderRadius: 'var(--radius-full)',
                              }}
                            >
                              {b.categories_count} categorías
                            </span>
                            {catNames && (
                              <span style={{ fontSize: '0.725rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {catNames}{hasMore}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Amount Column */}
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.5rem' }}>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {currSym} {formatAmount(b.total_spent_budget_currency)}
                          {b.effective_global_limit && b.effective_global_limit > 0 ? (
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                              {' '}/ {currSym} {formatAmount(b.effective_global_limit)}
                            </span>
                          ) : null}
                        </div>
                        {b.currency !== 'BS' && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                            ≈ Bs. {formatAmount(b.total_spent_bs)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {b.effective_global_limit && b.effective_global_limit > 0 && (
                      <div style={{ marginTop: '0.6rem' }}>
                        <TrafficLightProgressBar
                          percentage={b.global_spent_percentage}
                          trafficLight={b.global_traffic_light}
                          height={8}
                        />
                      </div>
                    )}

                    {/* Actions and Footer Row */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '0.6rem',
                        paddingTop: '0.45rem',
                        borderTop: '1px solid var(--border-color)',
                      }}
                    >
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor }}>
                        {b.effective_global_limit && b.effective_global_limit > 0
                          ? `${Math.round(b.global_spent_percentage)}% consumido`
                          : 'Sin límites asignados'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenBudgetModal(b);
                          }}
                          title="Editar grupo"
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteBudget({
                              isOpen: true,
                              budgetId: b.id,
                              budgetName: b.name,
                            });
                          }}
                          title="Eliminar grupo"
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
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ======================================================== */}
      {/* DETAIL VIEW (when selectedBudgetId is active)            */}
      {/* ======================================================== */}
      {selectedBudget && (
        <>
          {/* Detail Header */}
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
                onClick={() => setSelectedBudgetId(null)}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
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
                    {selectedBudget.is_primary ? 'Plan Maestro' : selectedBudget.name}
                  </h1>
                  {selectedBudget.is_primary ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: '#B45309',
                        background: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        padding: '0.1rem 0.45rem',
                        borderRadius: 'var(--radius-full)',
                        flexShrink: 0,
                      }}
                    >
                      <Star size={11} fill="#F59E0B" color="#F59E0B" />
                      Principal
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: 'var(--primary-color)',
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        padding: '0.1rem 0.45rem',
                        borderRadius: 'var(--radius-full)',
                        flexShrink: 0,
                      }}
                    >
                      <Layers size={11} />
                      Grupo
                    </span>
                  )}
                </div>
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
                  {selectedBudget.is_primary
                    ? `Fuente de verdad de todos los límites • ${currencyLabels[selectedBudget.currency] || '$'} • ${selectedBudget.month_year}`
                    : `Límites heredados del Principal • ${currencyLabels[selectedBudget.currency] || '$'} • ${selectedBudget.month_year}`}
                </p>
              </div>
            </div>

            {/* Edit / Delete actions for this budget */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
              <button
                onClick={() => handleOpenBudgetModal(selectedBudget)}
                title={selectedBudget.is_primary ? 'Editar nombre y moneda' : 'Editar grupo'}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--surface-color)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <Edit3 size={15} />
              </button>
              {!selectedBudget.is_primary && (
                <button
                  onClick={() =>
                    setConfirmDeleteBudget({
                      isOpen: true,
                      budgetId: selectedBudget.id,
                      budgetName: selectedBudget.name,
                    })
                  }
                  title="Eliminar este grupo"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'var(--expense-color)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </header>

          {/* Hero Card for THIS Budget */}
          <BudgetHeroCard
            title={selectedBudget.is_primary ? 'Techo Total del Plan Maestro' : `Techo de "${selectedBudget.name}"`}
            badge={
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: 'var(--radius-full)',
                  background:
                    selectedBudget.global_traffic_light === 'red'
                      ? 'rgba(239, 68, 68, 0.12)'
                      : selectedBudget.global_traffic_light === 'yellow'
                      ? 'rgba(245, 158, 11, 0.12)'
                      : 'rgba(16, 185, 129, 0.12)',
                  color:
                    selectedBudget.global_traffic_light === 'red'
                      ? '#EF4444'
                      : selectedBudget.global_traffic_light === 'yellow'
                      ? '#F59E0B'
                      : '#10B981',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {selectedBudget.effective_global_limit && selectedBudget.effective_global_limit > 0
                  ? `${Math.round(selectedBudget.global_spent_percentage)}% consumido`
                  : 'Sin límites asignados'}
              </div>
            }
            spentMap={{
              usd: selectedBudget.total_spent_usd,
              bs: selectedBudget.total_spent_bs,
              eur: selectedBudget.total_spent_eur,
              usdt: selectedBudget.total_spent_usdt,
            }}
            limitMap={{
              usd: selectedBudget.global_limit_usd,
              bs: selectedBudget.global_limit_bs,
              eur: selectedBudget.global_limit_eur,
              usdt: selectedBudget.global_limit_usdt,
            }}
            displayCurrency={displayCurrency}
            onCycleCurrency={cycleDisplayCurrency}
            showProgress={!!(selectedBudget.effective_global_limit && selectedBudget.effective_global_limit > 0)}
            percentage={selectedBudget.global_spent_percentage}
            trafficLight={selectedBudget.global_traffic_light}
            footerLeft={
              <span>
                {selectedBudget.is_primary ? 'Total sumatoria de categorías: ' : 'Límites sumados en este grupo: '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {formatAmount(
                    displayCurrency === 'usd'
                      ? selectedBudget.allocated_usd
                      : displayCurrency === 'bs'
                      ? selectedBudget.allocated_bs
                      : displayCurrency === 'eur'
                      ? selectedBudget.allocated_eur
                      : selectedBudget.allocated_usdt,
                    prefixMap[displayCurrency]
                  )}
                  {suffixMap[displayCurrency]}
                </strong>
              </span>
            }
            footerRight={
              selectedBudget.is_primary ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                  Suma automática de límites
                </span>
              ) : (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontSize: '0.75rem',
                    color: 'var(--primary-color)',
                    fontWeight: 600,
                  }}
                >
                  <Lock size={12} />
                  Límites heredados del Principal
                </span>
              )
            }
          />

          {/* Section Header: Categorías */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {selectedBudget.is_primary
                  ? `Categorías del Plan Maestro (${selectedBudget.category_limits.length})`
                  : `Categorías del grupo (${selectedBudget.category_limits.length})`}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                {selectedBudget.is_primary
                  ? 'Define aquí el límite mensual de cada categoría. Los grupos heredarán estos límites.'
                  : 'Solo los gastos de estas categorías se suman a este grupo.'}
              </p>
            </div>
            {!selectedBudget.is_primary && (
              <button
                onClick={() => handleOpenBudgetModal(selectedBudget)}
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.75rem',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                }}
              >
                <SlidersHorizontal size={13} />
                Gestionar categorías
              </button>
            )}
          </div>

          {/* Direct Category Cards Listing */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {selectedBudget.category_limits.length === 0 ? (
              <div
                className="soft-card"
                style={{
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                }}
              >
                <Layers size={36} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem' }} />
                <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 500 }}>
                  No has seleccionado categorías para este grupo.
                </p>
                <button
                  onClick={() => handleOpenBudgetModal(selectedBudget)}
                  className="btn btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.8rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                  }}
                >
                  <Plus size={14} />
                  Elegir categorías
                </button>
              </div>
            ) : (
              selectedBudget.category_limits.map((cl) => {
                const catName = cl.category_name;
                const hasLimit = Number(cl.limit_amount) > 0;
                const currSym = currencyLabels[cl.currency] || '$';

                if (hasLimit) {
                  // Category WITH configured limit
                  const isRed = cl.traffic_light === 'red';
                  const isYellow = cl.traffic_light === 'yellow';
                  const statusColor = isRed ? '#EF4444' : isYellow ? '#F59E0B' : '#10B981';

                  return (
                    <div
                      key={catName}
                      className="soft-card"
                      style={{
                        padding: '1rem 1.25rem',
                        borderLeft: `4px solid ${statusColor}`,
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      }}
                    >
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
                            {renderCategoryIcon(catName)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span
                                style={{
                                  fontSize: '0.95rem',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {catName}
                              </span>
                              {!selectedBudget.is_primary && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.2rem',
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    color: 'var(--text-tertiary)',
                                    background: 'var(--surface-muted)',
                                    padding: '0.1rem 0.35rem',
                                    borderRadius: 'var(--radius-full)',
                                    flexShrink: 0,
                                  }}
                                  title="Límite heredado del Presupuesto Principal"
                                >
                                  <Lock size={10} /> Heredado
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: '0.75rem',
                                color: cl.remaining_amount < 0 ? '#EF4444' : 'var(--text-tertiary)',
                                fontWeight: cl.remaining_amount < 0 ? 600 : 400,
                                marginTop: '0.15rem',
                              }}
                            >
                              {cl.remaining_amount < 0
                                ? `Excedido por ${currSym} ${formatAmount(Math.abs(cl.remaining_amount))}`
                                : `Disponible: ${currSym} ${formatAmount(cl.remaining_amount)}`}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.5rem' }}>
                          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {currSym} {formatAmount(cl.spent_amount)} / {formatAmount(cl.limit_amount)}
                          </div>
                          {cl.currency !== 'BS' && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                              ≈ Bs. {formatAmount(cl.spent_bs)} / {formatAmount(cl.limit_bs)}
                            </div>
                          )}
                          {cl.currency !== 'USD_BCV' && cl.currency !== 'USD_CASH' && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                              ≈ $ {formatAmount(cl.spent_usd)} / {formatAmount(cl.limit_usd)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 8px Progress Bar */}
                      <div style={{ marginTop: '0.5rem' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.35rem',
                          }}
                        >
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor }}>
                            {Math.round(cl.spent_percentage)}% consumido
                          </span>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {selectedBudget.is_primary ? (
                              <>
                                <button
                                  onClick={() => handleOpenCategoryLimitModal(catName)}
                                  title="Editar límite"
                                  style={{
                                    width: '30px',
                                    height: '30px',
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
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  onClick={() =>
                                    setConfirmDeleteCategoryLimit({
                                      isOpen: true,
                                      budgetId: selectedBudget.id,
                                      categoryName: catName,
                                    })
                                  }
                                  title="Restablecer límite a 0"
                                  style={{
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: 'var(--radius-full)',
                                    background: 'var(--surface-muted)',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: 'var(--text-tertiary)',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  <RotateCcw size={13} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleOpenCategoryLimitModal(catName)}
                                  title="Ajustar límite en el Presupuesto Principal"
                                  style={{
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '6px',
                                    background: 'var(--surface-muted)',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    cursor: 'pointer',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                  }}
                                >
                                  <Edit3 size={11} />
                                  Ajustar en Principal
                                </button>
                                <button
                                  onClick={() =>
                                    setConfirmDeleteCategoryLimit({
                                      isOpen: true,
                                      budgetId: selectedBudget.id,
                                      categoryName: catName,
                                    })
                                  }
                                  title="Quitar categoría de este grupo"
                                  style={{
                                    width: '30px',
                                    height: '30px',
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
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        <TrafficLightProgressBar
                          percentage={cl.spent_percentage}
                          trafficLight={cl.traffic_light}
                          height={8}
                        />
                      </div>
                    </div>
                  );
                } else {
                  // Category without limit (limit_amount === 0) -> "⚠️ Falta ingresar límite"
                  return (
                    <div
                      key={catName}
                      className="soft-card"
                      style={{
                        padding: '0.85rem 1.15rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        background: 'var(--surface-color)',
                        borderLeft: '4px solid var(--border-color)',
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
                          {renderCategoryIcon(catName)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.9rem',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {catName}
                          </div>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              color: '#B45309',
                              marginTop: '0.15rem',
                            }}
                          >
                            ⚠️ Falta ingresar límite
                          </div>
                          {cl.spent_usd > 0 && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.1rem' }}>
                              Gastado: $ {formatAmount(cl.spent_usd)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                        <button
                          onClick={() => handleOpenCategoryLimitModal(catName)}
                          className="btn btn-secondary"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.4rem 0.75rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: 'var(--radius-full)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Plus size={14} />
                          {selectedBudget.is_primary ? 'Definir límite' : 'Ajustar en Principal'}
                        </button>
                        {!selectedBudget.is_primary && (
                          <button
                            onClick={() =>
                              setConfirmDeleteCategoryLimit({
                                isOpen: true,
                                budgetId: selectedBudget.id,
                                categoryName: catName,
                              })
                            }
                            title="Quitar categoría de este grupo"
                            style={{
                              width: '30px',
                              height: '30px',
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
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
              })
            )}
          </div>
        </>
      )}

      {/* ======================================================== */}
      {/* MODALS                                                   */}
      {/* ======================================================== */}

      {/* BudgetFormModal (Create / Edit Budget) */}
      {budgetModal.isOpen && (
        <BudgetFormModal
          isOpen={budgetModal.isOpen}
          monthYear={currentMonthYear}
          budgetToEdit={budgetModal.budgetToEdit}
          hasExistingBudgets={(budgetResponse?.budgets?.length || 0) > 0}
          availableCategories={budgetResponse?.available_categories || []}
          renderCategoryIcon={renderCategoryIcon}
          onClose={() => setBudgetModal({ isOpen: false, budgetToEdit: null })}
          onSaved={(updated) => {
            setBudgetResponse(updated);
            setBudgetModal({ isOpen: false, budgetToEdit: null });
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
                  {categoryModal.existingLimit && Number(categoryModal.existingLimit.limit_amount) > 0
                    ? 'Editar Límite Mensual'
                    : 'Asignar Límite Mensual'}
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                  {categoryModal.categoryName} • Plan Maestro
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

            {/* Sync explanation callout */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                marginBottom: '1rem',
                fontSize: '0.75rem',
                color: '#065F46',
              }}
            >
              <Lock size={15} style={{ flexShrink: 0 }} />
              <div>
                El límite se define en el <strong>Plan Maestro</strong> y se sincroniza automáticamente con todos los grupos que incluyan esta categoría.
              </div>
            </div>

            <form onSubmit={handleSaveCategoryLimit} className="expense-form">
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Categoría
                </label>
                <input
                  type="text"
                  value={categoryModal.categoryName}
                  disabled
                  className="input-field"
                  style={{ width: '100%', marginTop: '0.35rem', opacity: 0.7 }}
                />
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

      {/* ConfirmDelete Budget Modal */}
      <ConfirmModal
        isOpen={confirmDeleteBudget.isOpen}
        title="¿Eliminar grupo?"
        message={`¿Estás seguro de que deseas eliminar el grupo "${confirmDeleteBudget.budgetName}"? Los límites en el Plan Maestro se mantendrán intactos.`}
        onConfirm={handleDeleteBudget}
        onCancel={() => setConfirmDeleteBudget({ isOpen: false, budgetId: '', budgetName: '' })}
      />

      {/* ConfirmDelete Category Limit Modal */}
      <ConfirmModal
        isOpen={confirmDeleteCategoryLimit.isOpen}
        title={selectedBudget?.is_primary ? '¿Restablecer límite?' : '¿Quitar categoría del grupo?'}
        message={
          selectedBudget?.is_primary
            ? `¿Deseas restablecer a 0 el límite de "${confirmDeleteCategoryLimit.categoryName}" en el Plan Maestro? Los grupos que incluyan esta categoría también heredarán 0.`
            : `¿Deseas quitar la categoría "${confirmDeleteCategoryLimit.categoryName}" de este grupo? El límite en el Plan Maestro se mantendrá intacto.`
        }
        onConfirm={handleDeleteCategoryLimit}
        onCancel={() => setConfirmDeleteCategoryLimit({ isOpen: false, budgetId: '', categoryName: '' })}
      />
    </div>
  );
};

// Modal for Creating or Editing a Budget (BudgetFormModal)
interface BudgetFormModalProps {
  isOpen: boolean;
  monthYear: string;
  budgetToEdit: SingleBudgetOut | null;
  hasExistingBudgets?: boolean;
  availableCategories?: string[];
  renderCategoryIcon?: (name: string) => React.ReactNode;
  onClose: () => void;
  onSaved: (response: MonthlyBudgetResponse) => void;
}

const BudgetFormModal: React.FC<BudgetFormModalProps> = ({
  isOpen,
  monthYear,
  budgetToEdit,
  availableCategories = [],
  renderCategoryIcon,
  onClose,
  onSaved,
}) => {
  const isEdit = Boolean(budgetToEdit);
  const isPrimary = Boolean(budgetToEdit?.is_primary);
  const [name, setName] = useState<string>(budgetToEdit?.name || '');
  const [currency, setCurrency] = useState<CurrencyType>(budgetToEdit?.currency || 'USD_BCV');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    if (budgetToEdit) {
      return budgetToEdit.category_limits ? budgetToEdit.category_limits.map((cl) => cl.category_name) : [];
    }
    return availableCategories || [];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const allSelected =
    availableCategories.length > 0 &&
    availableCategories.every((cat) =>
      selectedCategories.some((sc) => sc.toLowerCase() === cat.toLowerCase())
    );

  const toggleCategory = (catName: string) => {
    setSelectedCategories((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === catName.toLowerCase());
      if (exists) {
        return prev.filter((c) => c.toLowerCase() !== catName.toLowerCase());
      } else {
        return [...prev, catName];
      }
    });
  };

  const handleSelectAllCategories = () => {
    if (availableCategories.length === 0) return;
    if (allSelected) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories([...availableCategories]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Ingresa un nombre');
      return;
    }
    setIsSubmitting(true);

    try {
      if (isEdit && budgetToEdit) {
        const res = await updateMonthlyBudgetById(budgetToEdit.id, {
          name: name.trim(),
          currency,
          is_primary: isPrimary,
          categories: isPrimary ? undefined : selectedCategories,
        });
        onSaved(res);
      } else {
        const res = await createMonthlyBudget(monthYear, {
          name: name.trim(),
          currency,
          is_primary: false,
          categories: selectedCategories,
        });
        onSaved(res);
      }
    } catch (error: any) {
      console.error('Error saving budget:', error);
      alert(error?.response?.data?.detail || 'Error al guardar el presupuesto');
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
              {isEdit ? (isPrimary ? 'Editar Plan Maestro' : 'Editar Grupo') : 'Nuevo Grupo de Categorías'}
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
              {isPrimary
                ? 'Configura el nombre y moneda base de tu Plan Maestro'
                : 'Agrupa categorías que heredarán sus límites del Principal'}
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
          {/* Banner */}
          {isPrimary ? (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                marginBottom: '1rem',
                fontSize: '0.75rem',
                color: '#92400E',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Star size={15} fill="#F59E0B" color="#F59E0B" style={{ flexShrink: 0 }} />
              <div>
                <strong>Plan Maestro:</strong> Es el presupuesto principal y la fuente de verdad de todos los límites de categorías.
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                marginBottom: '1rem',
                fontSize: '0.75rem',
                color: '#065F46',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Lock size={15} style={{ flexShrink: 0 }} />
              <div>
                <strong>Límites heredados:</strong> Los montos de cada categoría se toman automáticamente del Presupuesto Principal.
              </div>
            </div>
          )}

          {/* Name */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {isPrimary ? 'Nombre del Presupuesto Principal' : 'Nombre del grupo'}
            </label>
            <input
              type="text"
              required
              placeholder={isPrimary ? 'Plan Maestro' : 'Ej. Hogar, Salidas, Pareja'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              style={{ width: '100%', marginTop: '0.35rem' }}
            />
          </div>

          {/* Currency */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Moneda base
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

          {/* Category selection for Sub-Budgets */}
          {!isPrimary && (
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.4rem',
                }}
              >
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Categorías a incluir ({selectedCategories.length})
                  </label>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                    Solo los gastos de estas categorías se sumarán a este grupo
                  </div>
                </div>
                {availableCategories.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllCategories}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary-color)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                    }}
                  >
                    {allSelected ? 'Limpiar' : 'Seleccionar todas'}
                  </button>
                )}
              </div>

              {/* Chips Container */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.4rem',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  padding: '0.5rem',
                  borderRadius: '10px',
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {availableCategories.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', padding: '0.5rem' }}>
                    No hay categorías registradas.
                  </div>
                ) : (
                  availableCategories.map((cat) => {
                    const isChecked = selectedCategories.some(
                      (sc) => sc.toLowerCase() === cat.toLowerCase()
                    );
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.35rem 0.65rem',
                          borderRadius: 'var(--radius-full)',
                          border: `1.5px solid ${isChecked ? 'var(--primary-color)' : 'var(--border-color)'}`,
                          background: isChecked ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface-color)',
                          color: isChecked ? 'var(--primary-color)' : 'var(--text-secondary)',
                          fontSize: '0.75rem',
                          fontWeight: isChecked ? 600 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {renderCategoryIcon && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', transform: 'scale(0.85)' }}>
                            {renderCategoryIcon(cat)}
                          </span>
                        )}
                        <span>{cat}</span>
                        {isChecked && <Check size={12} strokeWidth={2.5} />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
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
              {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Grupo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Budgets;
