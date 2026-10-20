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
  Wallet,
  AlertTriangle,
  Star,
  Check
} from 'lucide-react';
import type {
  MonthlyBudgetResponse,
  SingleBudgetOut,
  BudgetIncomeMode,
  CurrencyType,
  Category,
  EstimatedIncome,
  BudgetCategorySummaryOut
} from '../types';
import {
  getMonthlyBudget,
  confirmMonthlyBudget,
  getEstimatedIncomes,
  createMonthlyBudget,
  updateMonthlyBudgetById,
  deleteMonthlyBudgetById,
  upsertCategoryLimitByBudgetId,
  deleteCategoryLimitByBudgetId,
  setPrimaryMonthlyBudget
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
  const [estimatedIncomes, setEstimatedIncomes] = useState<EstimatedIncome[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConfirmingBudget, setIsConfirmingBudget] = useState<boolean>(false);

  // Currency cycling for hero card (usd, bs, eur, usdt)
  const [displayCurrency, setDisplayCurrency] = useState<'usd' | 'bs' | 'eur' | 'usdt'>('usd');

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
      const [bRes, incomes] = await Promise.all([
        getMonthlyBudget(currentMonthYear),
        getEstimatedIncomes(true),
        refreshCategories(),
      ]);
      setBudgetResponse(bRes);
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

  // Open modal to create or edit a budget
  const handleOpenBudgetModal = (budgetToEdit: SingleBudgetOut | null = null) => {
    setBudgetModal({
      isOpen: true,
      budgetToEdit,
    });
  };

  // Open category limit modal directly for a category in the selected budget
  const handleOpenCategoryLimitModal = (categoryName: string) => {
    if (!selectedBudget) return;
    const existing = selectedBudget.category_limits.find(
      (cl) => cl.category_name.toLowerCase() === categoryName.toLowerCase()
    ) || null;

    // Check if category is already budgeted in other budgets (only alert on non-primary budgets)
    const otherBudgets = selectedBudget.is_primary
      ? []
      : (budgetResponse?.budgets || [])
          .filter((b) => b.id !== selectedBudget.id && b.category_limits.some((cl) => cl.category_name.toLowerCase() === categoryName.toLowerCase()))
          .map((b) => b.name);

    setCategoryModal({
      isOpen: true,
      categoryName,
      existingLimit: existing,
      otherBudgetsWithCat: otherBudgets,
      limitAmount: existing && Number(existing.limit_amount) > 0 ? String(existing.limit_amount) : '',
      currency: existing?.currency || selectedBudget.currency || 'USD_BCV',
    });
  };

  const handleSaveCategoryLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBudget) return;
    const amountNum = parseFloat(categoryModal.limitAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      alert('Ingresa un monto límite válido mayor o igual a 0');
      return;
    }

    try {
      const updated = await upsertCategoryLimitByBudgetId(selectedBudget.id, {
        category_name: categoryModal.categoryName,
        limit_amount: amountNum,
        currency: categoryModal.currency,
      });
      setBudgetResponse(updated);
      setCategoryModal((prev) => ({ ...prev, isOpen: false }));
    } catch (error) {
      console.error('Error saving category limit:', error);
      alert('Error al guardar límite de categoría');
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

  const handleSetPrimary = async (budgetId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const updated = await setPrimaryMonthlyBudget(budgetId);
      setBudgetResponse(updated);
    } catch (error) {
      console.error('Error setting primary budget:', error);
      alert('Error al elegir presupuesto como principal');
    }
  };

  // Currency equivalent helpers
  const prefixMap = { bs: 'Bs. ', usd: '$ ', eur: '€ ', usdt: '' };
  const suffixMap = { bs: '', usd: '', eur: '', usdt: ' USDT' };

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

          {/* Consolidated Hero Card */}
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
                Gasto Total del Mes (Consolidado)
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#10B981',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {budgetResponse?.budgets?.length || 0} presupuestos
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
              {isLoading
                ? '...'
                : (() => {
                    const spentMap = {
                      usd: budgetResponse?.total_spent_usd ?? 0,
                      bs: budgetResponse?.total_spent_bs ?? 0,
                      eur: budgetResponse?.total_spent_eur ?? 0,
                      usdt: budgetResponse?.total_spent_usdt ?? 0,
                    };
                    const limitMap = {
                      usd: budgetResponse?.global_limit_usd,
                      bs: budgetResponse?.global_limit_bs,
                      eur: budgetResponse?.global_limit_eur,
                      usdt: budgetResponse?.global_limit_usdt,
                    };
                    const p = prefixMap[displayCurrency];
                    const s = suffixMap[displayCurrency];
                    const spentStr = formatAmount(spentMap[displayCurrency], p) + s;
                    const lim = limitMap[displayCurrency];
                    if (lim !== null && lim !== undefined && lim > 0) {
                      return `${spentStr} / ${formatAmount(lim, p)}${s}`;
                    }
                    return spentStr;
                  })()}
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

            {/* Consolidated progress if limits exist */}
            {budgetResponse?.global_limit_usd && budgetResponse.global_limit_usd > 0 && (
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
                    Progreso consolidado
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color:
                        budgetResponse.global_traffic_light === 'red'
                          ? '#EF4444'
                          : budgetResponse.global_traffic_light === 'yellow'
                          ? '#F59E0B'
                          : '#10B981',
                    }}
                  >
                    {Math.round(budgetResponse.global_spent_percentage)}%
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
                        budgetResponse.global_traffic_light === 'red'
                          ? 'linear-gradient(90deg, #EF4444, #F87171)'
                          : budgetResponse.global_traffic_light === 'yellow'
                          ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                          : 'linear-gradient(90deg, #10B981, #34D399)',
                      width: `${Math.min(budgetResponse.global_spent_percentage, 100)}%`,
                      transition: 'width 0.4s ease-out',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Bottom info row */}
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
                Total presupuestado:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {formatAmount(
                    displayCurrency === 'usd'
                      ? budgetResponse?.allocated_usd
                      : displayCurrency === 'bs'
                      ? budgetResponse?.allocated_bs
                      : displayCurrency === 'eur'
                      ? budgetResponse?.allocated_eur
                      : budgetResponse?.allocated_usdt,
                    prefixMap[displayCurrency]
                  )}
                  {suffixMap[displayCurrency]}
                </strong>
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                Gastos compartidos deduplicados
              </span>
            </div>
          </div>

          {/* Create New Budget Dashed Button */}
          <button
            onClick={() => handleOpenBudgetModal(null)}
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
            Crear nuevo presupuesto
          </button>

          {/* List of Budgets */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
              Cargando presupuestos...
            </div>
          ) : !budgetResponse?.budgets || budgetResponse.budgets.length === 0 ? (
            <div
              className="soft-card"
              style={{
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              <Wallet size={36} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.35rem', color: 'var(--text-primary)' }}>
                No tienes presupuestos para este mes
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: '0 0 1.25rem' }}>
                Crea un presupuesto (ej. &quot;Gastos Mensuales&quot; o &quot;Personal&quot;) para organizar tus límites de gastos.
              </p>
              <button
                onClick={() => handleOpenBudgetModal(null)}
                className="btn btn-primary"
                style={{ fontSize: '0.85rem', padding: '0.6rem 1.25rem' }}
              >
                <Plus size={16} />
                Crear primer presupuesto
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {budgetResponse.budgets.map((b) => {
                const isRed = b.global_traffic_light === 'red';
                const isYellow = b.global_traffic_light === 'yellow';
                const statusColor = isRed ? '#EF4444' : isYellow ? '#F59E0B' : '#10B981';
                const currSym = currencyLabels[b.currency] || '$';

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
                          <Wallet size={20} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              fontSize: '1rem',
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                            {b.is_primary && (
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
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: 'var(--radius-full)',
                                  flexShrink: 0,
                                }}
                              >
                                <Star size={11} fill="#F59E0B" color="#F59E0B" />
                                Principal
                              </span>
                            )}
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
                              {b.income_mode === 'manual'
                                ? 'Manual'
                                : b.income_mode === 'single_income'
                                ? '1 Ingreso'
                                : 'Ingresos'}
                            </span>
                            <span style={{ fontSize: '0.725rem', color: 'var(--text-tertiary)' }}>
                              {b.categories_count} categorías
                            </span>
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
                        {b.currency !== 'USD_BCV' && b.currency !== 'USD_CASH' && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                            ≈ $ {formatAmount(b.total_spent_usd)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {b.effective_global_limit && b.effective_global_limit > 0 && (
                      <div style={{ marginTop: '0.6rem' }}>
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
                              width: `${Math.min(b.global_spent_percentage, 100)}%`,
                              transition: 'width 0.4s ease-out',
                            }}
                          />
                        </div>
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
                          : 'Sin techo global configurado'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {b.is_primary ? (
                          <div
                            title="Presupuesto principal activo"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.25rem 0.5rem',
                              borderRadius: 'var(--radius-full)',
                              background: 'rgba(245, 158, 11, 0.12)',
                              color: '#B45309',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                            }}
                          >
                            <Star size={12} fill="#F59E0B" color="#F59E0B" />
                            <span>Principal</span>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => handleSetPrimary(b.id, e)}
                            title="Hacer presupuesto principal"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.25rem 0.5rem',
                              borderRadius: 'var(--radius-full)',
                              background: 'var(--surface-muted)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-secondary)',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <Star size={12} />
                            <span>Hacer principal</span>
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenBudgetModal(b);
                          }}
                          title="Editar presupuesto"
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
                          title="Eliminar presupuesto"
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
                    {selectedBudget.name}
                  </h1>
                  {selectedBudget.is_primary && (
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
                        padding: '0.1rem 0.4rem',
                        borderRadius: 'var(--radius-full)',
                        flexShrink: 0,
                      }}
                    >
                      <Star size={11} fill="#F59E0B" color="#F59E0B" />
                      Principal
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
                  {currencyLabels[selectedBudget.currency] || '$'} • {selectedBudget.month_year}
                </p>
              </div>
            </div>

            {/* Edit / Delete actions for this budget */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
              {!selectedBudget.is_primary ? (
                <button
                  onClick={(e) => handleSetPrimary(selectedBudget.id, e)}
                  title="Hacer este presupuesto el principal"
                  style={{
                    height: '36px',
                    padding: '0 0.6rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    boxShadow: 'var(--shadow-sm)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  <Star size={14} />
                  <span>Hacer principal</span>
                </button>
              ) : (
                <div
                  title="Presupuesto principal"
                  style={{
                    height: '36px',
                    padding: '0 0.6rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    color: '#B45309',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  <Star size={14} fill="#F59E0B" color="#F59E0B" />
                  <span>Principal</span>
                </div>
              )}
              <button
                onClick={() => handleOpenBudgetModal(selectedBudget)}
                title="Editar este presupuesto"
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
              <button
                onClick={() =>
                  setConfirmDeleteBudget({
                    isOpen: true,
                    budgetId: selectedBudget.id,
                    budgetName: selectedBudget.name,
                  })
                }
                title="Eliminar este presupuesto"
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
            </div>
          </header>

          {/* Hero Card for THIS Budget */}
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
                Techo de este Presupuesto
              </span>
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
                  : 'Sin techo global'}
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
              {(() => {
                const spentMap = {
                  usd: selectedBudget.total_spent_usd,
                  bs: selectedBudget.total_spent_bs,
                  eur: selectedBudget.total_spent_eur,
                  usdt: selectedBudget.total_spent_usdt,
                };
                const limitMap = {
                  usd: selectedBudget.global_limit_usd,
                  bs: selectedBudget.global_limit_bs,
                  eur: selectedBudget.global_limit_eur,
                  usdt: selectedBudget.global_limit_usdt,
                };
                const p = prefixMap[displayCurrency];
                const s = suffixMap[displayCurrency];
                const spentStr = formatAmount(spentMap[displayCurrency], p) + s;
                const lim = limitMap[displayCurrency];
                if (lim !== null && lim !== undefined && lim > 0) {
                  return `${spentStr} / ${formatAmount(lim, p)}${s}`;
                }
                return spentStr;
              })()}
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

            {/* Progress Bar */}
            {selectedBudget.effective_global_limit && selectedBudget.effective_global_limit > 0 && (
              <div style={{ marginBottom: '0.75rem' }}>
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
                        selectedBudget.global_traffic_light === 'red'
                          ? 'linear-gradient(90deg, #EF4444, #F87171)'
                          : selectedBudget.global_traffic_light === 'yellow'
                          ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                          : 'linear-gradient(90deg, #10B981, #34D399)',
                      width: `${Math.min(selectedBudget.global_spent_percentage, 100)}%`,
                      transition: 'width 0.4s ease-out',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Bottom row */}
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenBudgetModal(selectedBudget);
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
                Ajustar techo
              </button>
            </div>
          </div>

          {/* Section Header: Categorías del presupuesto */}
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
                Categorías del presupuesto ({selectedBudget.category_limits.length})
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                Solo los gastos de estas categorías se suman a este presupuesto
              </p>
            </div>
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
                  No has seleccionado categorías para este presupuesto.
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
                const otherBudgets = selectedBudget.is_primary
                  ? []
                  : (cl.also_in_budgets && cl.also_in_budgets.length > 0)
                    ? cl.also_in_budgets
                    : (budgetResponse?.budgets || [])
                        .filter(
                          (b) =>
                            b.id !== selectedBudget.id &&
                            b.category_limits.some((c) => c.category_name.toLowerCase() === catName.toLowerCase())
                        )
                        .map((b) => b.name);

                if (hasLimit) {
                  // Category WITH configured limit in this budget
                  const isRed = cl.traffic_light === 'red';
                  const isYellow = cl.traffic_light === 'yellow';
                  const statusColor = isRed ? '#EF4444' : isYellow ? '#F59E0B' : '#10B981';
                  const currSym = currencyLabels[cl.currency] || '$';

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
                              {catName}
                            </div>
                            {otherBudgets.length > 0 && (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontSize: '0.675rem',
                                  fontWeight: 600,
                                  color: '#B45309',
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: 'var(--radius-full)',
                                  marginTop: '0.2rem',
                                }}
                              >
                                ⚠️ También en: {otherBudgets.join(', ')}
                              </div>
                            )}
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
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
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
                              title="Quitar límite de este presupuesto"
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
                          </div>
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
                              background: isRed
                                ? 'linear-gradient(90deg, #EF4444, #F87171)'
                                : isYellow
                                ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                                : 'linear-gradient(90deg, #10B981, #34D399)',
                              width: `${Math.min(cl.spent_percentage, 100)}%`,
                              transition: 'width 0.4s ease-out',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  // Category WITHOUT limit (> 0) in this budget (limit_amount === 0)
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
                          {otherBudgets.length > 0 && (
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.675rem',
                                fontWeight: 600,
                                color: '#B45309',
                                background: 'rgba(245, 158, 11, 0.12)',
                                padding: '0.1rem 0.4rem',
                                borderRadius: 'var(--radius-full)',
                                marginTop: '0.15rem',
                              }}
                            >
                              ⚠️ También en: {otherBudgets.join(', ')}
                            </div>
                          )}
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-tertiary)', marginTop: '0.1rem' }}>
                            Gastado este mes: $ {formatAmount(cl.spent_usd)}
                          </div>
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
                          Asignar límite
                        </button>
                        <button
                          onClick={() =>
                            setConfirmDeleteCategoryLimit({
                              isOpen: true,
                              budgetId: selectedBudget.id,
                              categoryName: catName,
                            })
                          }
                          title="Quitar categoría de este presupuesto"
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
          incomes={estimatedIncomes}
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
                  {categoryModal.existingLimit ? 'Editar Límite' : 'Asignar Límite'}
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                  {categoryModal.categoryName} en &quot;{selectedBudget?.name}&quot;
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

            {/* Warning if category is already in other budgets (only alert on non-primary budgets) */}
            {categoryModal.otherBudgetsWithCat.length > 0 && !selectedBudget?.is_primary && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  marginBottom: '1rem',
                  fontSize: '0.75rem',
                  color: '#92400E',
                }}
              >
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Categoría compartida:</strong> ya tiene límite asignado en:{' '}
                  <strong>{categoryModal.otherBudgetsWithCat.join(', ')}</strong>. Puedes presupuestarla aquí también;
                  en el resumen global consolidado sus gastos se contabilizan una sola vez.
                </div>
              </div>
            )}

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
        title="¿Eliminar presupuesto?"
        message={`¿Estás seguro de que deseas eliminar el presupuesto "${confirmDeleteBudget.budgetName}"? Se eliminarán también los límites de categorías configurados dentro de este presupuesto.`}
        onConfirm={handleDeleteBudget}
        onCancel={() => setConfirmDeleteBudget({ isOpen: false, budgetId: '', budgetName: '' })}
      />

      {/* ConfirmDelete Category Limit Modal */}
      <ConfirmModal
        isOpen={confirmDeleteCategoryLimit.isOpen}
        title="¿Quitar categoría del presupuesto?"
        message={`¿Estás seguro de que deseas quitar la categoría "${confirmDeleteCategoryLimit.categoryName}" de este presupuesto?`}
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
  incomes: EstimatedIncome[];
  availableCategories?: string[];
  renderCategoryIcon?: (name: string) => React.ReactNode;
  onClose: () => void;
  onSaved: (response: MonthlyBudgetResponse) => void;
}

const BudgetFormModal: React.FC<BudgetFormModalProps> = ({
  isOpen,
  monthYear,
  budgetToEdit,
  hasExistingBudgets = false,
  incomes,
  availableCategories = [],
  renderCategoryIcon,
  onClose,
  onSaved,
}) => {
  const isEdit = Boolean(budgetToEdit);
  const [name, setName] = useState<string>(budgetToEdit?.name || '');
  const [currency, setCurrency] = useState<CurrencyType>(budgetToEdit?.currency || 'USD_BCV');
  const [incomeMode, setIncomeMode] = useState<BudgetIncomeMode>(budgetToEdit?.income_mode || 'manual');
  const [linkedIncomeId, setLinkedIncomeId] = useState<string>(budgetToEdit?.linked_income_id || '');
  const [manualLimit, setManualLimit] = useState<string>(
    budgetToEdit?.manual_global_limit !== null && budgetToEdit?.manual_global_limit !== undefined
      ? String(budgetToEdit.manual_global_limit)
      : ''
  );
  const [isPrimary, setIsPrimary] = useState<boolean>(
    budgetToEdit ? Boolean(budgetToEdit.is_primary) : !hasExistingBudgets
  );
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
      alert('Ingresa un nombre para el presupuesto');
      return;
    }
    setIsSubmitting(true);

    let manualVal: number | null = null;
    if (incomeMode === 'manual' && manualLimit.trim()) {
      const num = parseFloat(manualLimit);
      if (!isNaN(num) && num >= 0) {
        manualVal = num;
      }
    }

    try {
      if (isEdit && budgetToEdit) {
        const res = await updateMonthlyBudgetById(budgetToEdit.id, {
          name: name.trim(),
          currency,
          income_mode: incomeMode,
          linked_income_id: incomeMode === 'single_income' && linkedIncomeId ? linkedIncomeId : null,
          manual_global_limit: manualVal,
          is_primary: isPrimary,
          categories: selectedCategories,
        });
        onSaved(res);
      } else {
        const res = await createMonthlyBudget(monthYear, {
          name: name.trim(),
          currency,
          income_mode: incomeMode,
          linked_income_id: incomeMode === 'single_income' && linkedIncomeId ? linkedIncomeId : null,
          manual_global_limit: manualVal,
          is_primary: isPrimary,
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
              {isEdit ? 'Editar Presupuesto' : 'Crear Nuevo Presupuesto'}
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
              Configura el nombre y modo del techo mensual
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
          {/* Name */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Nombre del presupuesto
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Personal, Hogar, Salidas"
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

          {/* Mode Selector */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Modo de techo global
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
                Techo mensual global ({currencyLabels[currency] || '$'})
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
                Opcional: déjalo vacío si solo deseas límites por categorías.
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
                El techo se adaptará automáticamente al monto estimado de este ingreso.
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
              El techo global sumará todos tus ingresos estimados activos ({incomes.length} registrados).
            </div>
          )}

          {/* Category multi-select pills */}
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
                  Categorías incluidas ({selectedCategories.length})
                </label>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                  Solo los gastos de estas categorías se sumarán a este presupuesto
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

          {/* Primary Budget Toggle / Checkbox */}
          <div
            onClick={() => setIsPrimary(!isPrimary)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.85rem',
              borderRadius: '10px',
              border: `1.5px solid ${isPrimary ? 'var(--primary-color)' : 'var(--border-color)'}`,
              background: isPrimary ? 'rgba(16, 185, 129, 0.08)' : 'var(--surface-color)',
              marginBottom: '1.5rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              style={{
                marginTop: '0.15rem',
                width: '18px',
                height: '18px',
                accentColor: 'var(--primary-color)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Presupuesto principal
                </span>
                <Star size={13} fill={isPrimary ? "#F59E0B" : "none"} color={isPrimary ? "#F59E0B" : "var(--text-tertiary)"} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0', lineHeight: 1.35 }}>
                Se tomará en cuenta para mostrar el semáforo de categorías en el Resumen.
              </p>
            </div>
          </div>

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
              {isSubmitting ? 'Guardando...' : 'Guardar Presupuesto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Budgets;
