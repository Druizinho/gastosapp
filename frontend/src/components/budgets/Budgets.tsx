import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Edit3,
  Trash2,
  SlidersHorizontal,
  Layers,
  Star,
  Lock,
  RotateCcw,
  Users,
  ArrowLeft
} from 'lucide-react';
import type {
  MonthlyBudgetResponse,
  SingleBudgetOut,
  CurrencyType,
  Category,
  BudgetCategorySummaryOut,
  ShareMemberOut,
  Connection
} from '../../types';
import {
  getMonthlyBudget,
  getCachedMonthlyBudget,
  isMonthlyBudgetCacheStale,
  createMonthlyBudget,
  deleteMonthlyBudgetById,
  deleteCategoryLimitByBudgetId,
  getConnections,
  removeShareMember,
  invalidateMonthlyBudgetCache
} from '../../api';
import { supabase } from '../../supabaseClient';
import { resolveCategoryVisuals } from '../../utils/categoryVisuals';
import { useCategories } from '../../context/CategoriesContext';
import { useCurrencyPreference } from '../../context/CurrencyPreferenceContext';
import ListCard from '../ui/ListCard';
import ConfirmModal from '../ui/ConfirmModal';
import { MemberAvatars, ShareMembersModal } from '../panas';
import { PageHeader } from '../ui/PageHeader';
import { MonthPicker } from '../ui/MonthPicker';
import { SummaryHeroCard, type SummaryMetricItem } from '../ui/SummaryHeroCard';
import { SegmentedTabs } from '../ui/SegmentedTabs';
import { SkeletonListCard } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';
import { CategoryLimitModal } from './CategoryLimitModal';
import { BudgetFormModal } from './BudgetFormModal';
import {
  currencyLabels,
  formatAmount,
  prefixMap,
  suffixMap,
  type DisplayCurrency,
  type SubBudgetTab,
} from './constants';

export * from './constants';

interface BudgetsProps {
  onBack?: () => void;
}

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
  title?: string;
  eyebrow?: string;
  badge?: React.ReactNode;
  badgeText?: string;
  badgeIcon?: React.ReactNode;
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
  eyebrow,
  badge,
  badgeText,
  badgeIcon,
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
  const spentStr = `${formatAmount(spent, p)}${s}`;
  const lim = limitMap ? limitMap[displayCurrency] : undefined;
  const hasLimit = lim !== null && lim !== undefined && lim > 0;
  const limitStr = hasLimit ? `${formatAmount(lim, p)}${s}` : 'Sin límite';
  const remaining = hasLimit ? lim - spent : 0;
  const remainingStr = hasLimit ? `${formatAmount(remaining, p)}${s}` : '—';

  const resolvedLight =
    trafficLight || (percentage >= 100 ? 'red' : percentage >= 80 ? 'yellow' : 'green');
  const lightColor =
    resolvedLight === 'red' ? '#EF4444' : resolvedLight === 'yellow' ? '#F59E0B' : '#10B981';

  const metrics: SummaryMetricItem[] = [
    {
      label: 'GASTADO',
      value: spentStr,
    },
    {
      label: 'LÍMITE',
      value: limitStr,
    },
    {
      label: 'DISPONIBLE',
      value: remainingStr,
      valueColor: hasLimit ? (remaining <= 0 ? '#EF4444' : lightColor) : undefined,
    },
  ];

  return (
    <SummaryHeroCard
      eyebrow={eyebrow || title || 'PRESUPUESTO'}
      badgeText={badgeText || (typeof badge === 'string' ? badge : undefined)}
      badgeIcon={badgeIcon}
      badgeColor={lightColor}
      mainAmount={isLoading ? '...' : spentStr}
      statusSubtext={hasLimit ? `de ${limitStr} límite mensual` : 'Sin límite mensual fijado'}
      currencyHintText={displayCurrency.toUpperCase()}
      onCycleCurrency={onCycleCurrency}
      accentColor="var(--tool-budgets, #6366F1)"
      metrics={metrics}
      progress={
        showProgress
          ? {
              percent: Math.min(100, Math.max(0, percentage || 0)),
              leftLabel: progressTitle || 'Límite del mes consumido',
              rightLabel: `${Math.round(percentage || 0)}%`,
              color: lightColor,
            }
          : undefined
      }
    >
      {(footerLeft || footerRight) && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
            paddingTop: '0.65rem',
            marginTop: '0.85rem',
            borderTop: '1px solid var(--border-color, rgba(0, 0, 0, 0.07))',
            fontSize: '0.75rem',
            color: 'var(--text-secondary, #475569)',
          }}
        >
          {footerLeft || <div />}
          {footerRight || <div />}
        </div>
      )}
    </SummaryHeroCard>
  );
};

export const Budgets: React.FC<BudgetsProps> = ({ onBack }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subId = searchParams.get('subId');
  const toast = useToast();

  // Current viewed month (YYYY-MM)
  const [currentMonthYear, setCurrentMonthYear] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  // Master-Detail navigation: selected budget ID (null = master view, string = detail view)
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);

  // Sub-budget tab filter: all | own | shared
  const [subBudgetTab, setSubBudgetTab] = useState<SubBudgetTab>('all');

  const { categories: allCategories } = useCategories();

  // Data states
  const [budgetResponse, setBudgetResponse] = useState<MonthlyBudgetResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [panas, setPanas] = useState<{ partner_id: string; partner_name: string }[]>([]);

  // Currency cycling for hero card (usd, bs, eur, usdt)
  const { mainCurrency } = useCurrencyPreference();
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(() =>
    mainCurrency ? (mainCurrency.toLowerCase() as DisplayCurrency) : 'usd'
  );

  useEffect(() => {
    if (mainCurrency) {
      setDisplayCurrency(mainCurrency.toLowerCase() as DisplayCurrency);
    }
  }, [mainCurrency]);

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
  const [isDeletingCategoryLimit, setIsDeletingCategoryLimit] = useState(false);

  const [leaveSharedBudgetConfirm, setLeaveSharedBudgetConfirm] = useState<SingleBudgetOut | null>(null);
  const [activeShareModalItem, setActiveShareModalItem] = useState<{ id: string; name: string } | null>(null);


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

  // Shared with me sub-budgets
  const sharedWithMeBudgets: SingleBudgetOut[] = useMemo(() => {
    return budgetResponse?.shared_with_me_budgets || [];
  }, [budgetResponse]);

  // Sub-budgets to display based on active tab
  const displayedSubBudgets = useMemo(() => {
    if (subBudgetTab === 'own') {
      return subBudgets.map((b) => ({ budget: b, isSharedWithMe: false }));
    }
    if (subBudgetTab === 'shared') {
      return sharedWithMeBudgets.map((b) => ({ budget: b, isSharedWithMe: true }));
    }
    return [
      ...subBudgets.map((b) => ({ budget: b, isSharedWithMe: false })),
      ...sharedWithMeBudgets.map((b) => ({ budget: b, isSharedWithMe: true })),
    ];
  }, [subBudgetTab, subBudgets, sharedWithMeBudgets]);

  // Currently selected budget object (if in detail view)
  const selectedBudget: SingleBudgetOut | undefined = useMemo(() => {
    if (!selectedBudgetId) return undefined;
    const fromOwner = budgetResponse?.budgets?.find((b) => b.id === selectedBudgetId);
    if (fromOwner) return fromOwner;
    return budgetResponse?.shared_with_me_budgets?.find((b) => b.id === selectedBudgetId);
  }, [selectedBudgetId, budgetResponse]);

  // If selected budget no longer exists (e.g. deleted), revert to master view
  useEffect(() => {
    if (selectedBudgetId && (budgetResponse?.budgets || budgetResponse?.shared_with_me_budgets) && !selectedBudget) {
      setSelectedBudgetId(null);
    }
  }, [selectedBudgetId, budgetResponse, selectedBudget]);

  const [isLeavingShare, setIsLeavingShare] = useState(false);

  const handleLeaveSharedBudget = (budget?: SingleBudgetOut | unknown) => {
    const target = (budget && typeof budget === 'object' && 'id' in (budget as any))
      ? (budget as SingleBudgetOut)
      : selectedBudget;
    if (!target?.share_id) return;
    setLeaveSharedBudgetConfirm(target);
  };

  const handleConfirmLeaveSharedBudget = async () => {
    const target = leaveSharedBudgetConfirm || selectedBudget;
    if (!target?.share_id) return;
    setIsLeavingShare(true);
    try {
      let myUserId = target.shared_members?.find((m) => m.is_me)?.user_id;
      if (!myUserId) {
        myUserId = target.shared_members?.find((m) => m.role === 'member')?.user_id;
      }
      if (!myUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        myUserId = user?.id;
      }
      if (!myUserId) {
        throw new Error('No se pudo identificar tu ID de usuario');
      }
      await removeShareMember(target.share_id, myUserId);
      toast.success(`Has salido de "${target.name}"`);
      if (selectedBudgetId === target.id) {
        setSelectedBudgetId(null);
      }
      invalidateMonthlyBudgetCache(currentMonthYear);
      await fetchData(true, true);
    } catch (err: any) {
      console.error('Error al salir del presupuesto compartido:', err);
      toast.error(err?.response?.data?.detail || 'Error al salir del presupuesto compartido');
    } finally {
      setLeaveSharedBudgetConfirm(null);
      setIsLeavingShare(false);
    }
  };

  // Fetch budget data
  const fetchData = async (silent = false, forceRefresh = silent) => {
    const cached = getCachedMonthlyBudget(currentMonthYear);
    if (cached) {
      setBudgetResponse(cached);
    } else if (!silent) {
      setIsLoading(true);
    }
    try {
      const bRes = await getMonthlyBudget(currentMonthYear, forceRefresh);
      setBudgetResponse(bRes);
    } catch (error) {
      console.error('Error fetching budget data:', error);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const cached = getCachedMonthlyBudget(currentMonthYear);
    if (cached) {
      setBudgetResponse(cached);
      setIsLoading(false);
      if (isMonthlyBudgetCacheStale(currentMonthYear)) {
        fetchData(true, true);
      }
    } else {
      fetchData(false, false);
    }
  }, [currentMonthYear]);

  // Deep-linking: automatically select and open subId if present
  useEffect(() => {
    if (!subId || isLoading || !budgetResponse) return;

    const allBudgets = [
      ...(budgetResponse.budgets || []),
      ...(budgetResponse.shared_with_me_budgets || []),
    ];
    const targetBudget = allBudgets.find((b) => b.id === subId);

    if (targetBudget) {
      setSelectedBudgetId(subId);
      const isSharedWithMe = budgetResponse.shared_with_me_budgets?.some((b) => b.id === subId);
      setSubBudgetTab((prev) => {
        if (isSharedWithMe && prev === 'own') return 'all';
        if (!isSharedWithMe && prev === 'shared') return 'all';
        return prev;
      });
    }
  }, [subId, isLoading, budgetResponse]);

  // Scroll to sub-budget card when viewed in master list
  useEffect(() => {
    if (!subId || selectedBudgetId !== null) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`sub-budget-${subId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => clearTimeout(timer);
  }, [subId, selectedBudgetId]);

  // Lazy-load connections only when budget modal opens
  useEffect(() => {
    if (!budgetModal.isOpen || connections.length > 0) return;
    let isMounted = true;
    getConnections()
      .then((conns) => {
        if (isMounted) {
          const acceptedConns = (conns || []).filter((c) => c.status === 'accepted' && c.partner_id);
          setConnections(acceptedConns);
          const accepted = acceptedConns.map((c) => ({
            partner_id: c.partner_id!,
            partner_name: c.partner_name || 'Pana',
          }));
          setPanas(accepted);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [budgetModal.isOpen, connections.length]);

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

  const handleDeleteBudget = async () => {
    if (!confirmDeleteBudget.budgetId) {
      setConfirmDeleteBudget({ isOpen: false, budgetId: '', budgetName: '' });
      return;
    }
    const budgetId = confirmDeleteBudget.budgetId;
    const budgetName = confirmDeleteBudget.budgetName;
    // Dismiss confirmation modal immediately to avoid sticking on screen
    setConfirmDeleteBudget({ isOpen: false, budgetId: '', budgetName: '' });
    try {
      const updated = await deleteMonthlyBudgetById(budgetId);
      setBudgetResponse(updated);
      if (selectedBudgetId === budgetId) {
        setSelectedBudgetId(null);
      }
      toast.success(`Grupo "${budgetName}" eliminado`);
    } catch (error) {
      console.error('Error deleting budget:', error);
      toast.error('Error al eliminar presupuesto');
    }
  };

  const handleDeleteCategoryLimit = async () => {
    const budgetId =
      confirmDeleteCategoryLimit.budgetId ||
      primaryBudget?.id ||
      selectedBudget?.id ||
      budgetResponse?.budgets?.find((b) => b.is_primary)?.id;
    const catName = confirmDeleteCategoryLimit.categoryName;

    // Immediately close confirmation dialog so it never lingers on screen
    setConfirmDeleteCategoryLimit({ isOpen: false, budgetId: '', categoryName: '' });

    // If categoryModal (the edit limit modal) is open, close it cleanly
    if (categoryModal.isOpen) {
      setCategoryModal((prev) => ({
        ...prev,
        isOpen: false,
        limitAmount: '',
        existingLimit: null,
      }));
    }

    if (!budgetId || !catName) {
      return;
    }

    setIsDeletingCategoryLimit(true);
    try {
      const updated = await deleteCategoryLimitByBudgetId(budgetId, catName);
      setBudgetResponse(updated);
      toast.success(
        selectedBudget?.is_primary || !selectedBudget
          ? `Límite de "${catName}" restablecido a 0`
          : `Categoría "${catName}" quitada del grupo`
      );
    } catch (error: any) {
      console.error('Error deleting category limit:', error);
      toast.error(error?.response?.data?.detail || 'Error al eliminar límite de categoría');
    } finally {
      setIsDeletingCategoryLimit(false);
    }
  };

  // Currency equivalent helpers (prefixMap, suffixMap declared at module level)

  // Render category icon with color using resolveCategoryVisuals
  const renderCategoryIcon = (categoryName: string) => {
    const catObj = categoryMap[categoryName];
    const { IconComponent, hexColor } = resolveCategoryVisuals(catObj, categoryName);
    return <IconComponent size={18} color={hexColor} />;
  };

  const monthNavigator = (
    <MonthPicker
      value={currentMonthYear}
      onChange={setCurrentMonthYear}
      ariaLabel="Seleccionar mes del presupuesto"
    />
  );

  const detailRightAction = selectedBudget ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
      {selectedBudget.is_read_only ? (
        selectedBudget.share_id ? (
          <button
            type="button"
            onClick={() => handleLeaveSharedBudget(selectedBudget)}
            disabled={isLeavingShare}
            title="Salir del presupuesto compartido"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.45rem 0.85rem',
              borderRadius: 'var(--radius-full)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              background: 'rgba(239, 68, 68, 0.08)',
              color: '#EF4444',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: isLeavingShare ? 'not-allowed' : 'pointer',
            }}
          >
            <Trash2 size={13} />
            {isLeavingShare ? 'Saliendo...' : 'Salir del compartido'}
          </button>
        ) : null
      ) : (
        <>
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
        </>
      )}
    </div>
  ) : null;

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      {/* ======================================================== */}
      {/* MASTER VIEW (when selectedBudgetId === null)             */}
      {/* ======================================================== */}
      {!selectedBudget && (
        <>
          {/* Header */}
          <PageHeader
            title="Presupuestos"
            onBack={handleBack}
            rightAction={monthNavigator}
            actionColor="var(--tool-budgets, #6366F1)"
          />

          {/* Hero Card: Presupuesto Principal (Plan Maestro) */}
          <BudgetHeroCard
            eyebrow="PRESUPUESTO GENERAL"
            badgeText="Plan Maestro"
            badgeIcon={<Star size={12} fill="#F59E0B" color="#F59E0B" />}
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
                className="app-btn app-btn-sm app-btn-secondary"
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
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Grupos y Sub-presupuestos
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                Agrupa categorías para organizar o compartir tus límites
              </p>
            </div>
            <button
              onClick={() => handleOpenBudgetModal(null)}
              className="app-btn app-btn-sm app-btn-primary"
            >
              <Plus size={15} />
              Nuevo grupo
            </button>
          </div>

          {/* SegmentedTabs Selector */}
          <SegmentedTabs<SubBudgetTab>
            tabs={[
              {
                id: 'all',
                label: 'Todos',
                shortLabel: 'Todos',
                count: subBudgets.length + sharedWithMeBudgets.length,
              },
              {
                id: 'own',
                label: 'Mis sub-presupuestos',
                shortLabel: 'Míos',
                count: subBudgets.length,
                icon: <Layers size={13} />,
                badgeColor: 'var(--tool-budgets, #6366F1)',
              },
              {
                id: 'shared',
                label: 'Compartidos conmigo',
                shortLabel: 'Compartidos',
                count: sharedWithMeBudgets.length,
                icon: <Users size={13} />,
                badgeColor: '#3B82F6',
              },
            ]}
            activeTab={subBudgetTab}
            onChange={setSubBudgetTab}
            activeColor={subBudgetTab === 'shared' ? '#3B82F6' : 'var(--tool-budgets, #6366F1)'}
            style={{ marginBottom: '1rem' }}
          />

          {/* List of Sub-Budgets */}
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonListCard key={i} showProgress={true} />
              ))}
            </div>
          ) : displayedSubBudgets.length === 0 ? (
            subBudgetTab === 'shared' ? (
              <div
                className="soft-card"
                style={{
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                }}
              >
                <Users size={36} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.35rem', color: 'var(--text-primary)' }}>
                  No tienes sub-presupuestos compartidos
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: '0 0 0.5rem' }}>
                  Cuando tus panas compartan un sub-presupuesto contigo, podrás consultarlo aquí en modo lectura.
                </p>
              </div>
            ) : (
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
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {displayedSubBudgets.map(({ budget: b, isSharedWithMe }) => {
                const isRed = b.global_traffic_light === 'red';
                const isYellow = b.global_traffic_light === 'yellow';
                const statusColor = isRed ? '#EF4444' : isYellow ? '#F59E0B' : '#10B981';
                const currSym = currencyLabels[b.currency] || '$';
                const catLimits = b.category_limits || [];
                const catNames = catLimits.map((c) => c.category_name).slice(0, 3).join(', ');
                const hasMore = catLimits.length > 3 ? ` +${catLimits.length - 3}` : '';

                const isShared = Boolean(
                  b.is_shared ||
                  (b.shared_members && b.shared_members.length > 0) ||
                  b.shared_partner_name
                );

                const ownBudgetMembers: ShareMemberOut[] = isShared
                  ? b.shared_members && b.shared_members.length > 0
                    ? b.shared_members
                    : [
                        {
                          user_id: (b as any).shared_partner_id || b.share_id || 'partner',
                          name: b.shared_partner_name || 'Panas',
                          role: 'member',
                          is_owner: false,
                        },
                      ]
                  : [];

                const sharedWithMeMembers: ShareMemberOut[] =
                  b.shared_members && b.shared_members.length > 0
                    ? b.shared_members
                    : [
                        {
                          user_id: b.owner_id || (b as any).shared_partner_id || 'owner',
                          name: b.shared_by || b.shared_partner_name || 'Pana',
                          role: 'admin',
                          is_owner: true,
                        },
                      ];

                const subtitle = (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      width: '100%',
                      minWidth: 0,
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor, flexShrink: 0 }}>
                      {b.effective_global_limit && b.effective_global_limit > 0
                        ? `${Math.round(b.global_spent_percentage)}% consumido`
                        : 'Sin límites asignados'}
                    </span>
                    {catNames && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-tertiary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                        }}
                        title={`${catNames}${hasMore}`}
                      >
                        · {catNames}{hasMore}
                      </span>
                    )}
                  </div>
                );

                const badges = isSharedWithMe ? (
                  <>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#3B82F6',
                        background: 'rgba(59, 130, 246, 0.12)',
                        padding: '0.12rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                      }}
                    >
                      <Layers size={10} />
                      Compartido
                    </span>

                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        background: 'var(--surface-muted)',
                        padding: '0.12rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                      }}
                    >
                      {b.categories_count} {b.categories_count === 1 ? 'categoría' : 'categorías'}
                    </span>

                    {sharedWithMeMembers.length > 0 && (
                      <div
                        style={{ display: 'inline-flex', alignItems: 'center' }}
                        title={`Compartido por ${b.shared_by || 'Pana'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveShareModalItem({ id: b.id, name: b.name });
                        }}
                      >
                        <MemberAvatars
                          members={sharedWithMeMembers}
                          size={18}
                          interactive={true}
                          onClick={() => setActiveShareModalItem({ id: b.id, name: b.name })}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: 'var(--primary-color)',
                        background: 'rgba(16, 185, 129, 0.12)',
                        padding: '0.12rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                      }}
                    >
                      <Layers size={10} />
                      Grupo
                    </span>

                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        background: 'var(--surface-muted)',
                        padding: '0.12rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                      }}
                    >
                      {b.categories_count} {b.categories_count === 1 ? 'categoría' : 'categorías'}
                    </span>

                    {isShared && ownBudgetMembers.length > 0 && (
                      <div
                        style={{ display: 'inline-flex', alignItems: 'center' }}
                        title="Gestionar miembros compartidos"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveShareModalItem({ id: b.id, name: b.name });
                        }}
                      >
                        <MemberAvatars
                          members={ownBudgetMembers}
                          size={18}
                          interactive={true}
                          onClick={() => setActiveShareModalItem({ id: b.id, name: b.name })}
                        />
                      </div>
                    )}
                  </>
                );

                const primaryAmount = (
                  <span>
                    {currSym} {formatAmount(b.total_spent_budget_currency)}
                    {b.effective_global_limit && b.effective_global_limit > 0 ? (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {' '}/ {currSym} {formatAmount(b.effective_global_limit)}
                      </span>
                    ) : null}
                  </span>
                );

                const secondaryAmount =
                  b.currency !== 'BS'
                    ? `≈ Bs. ${formatAmount(b.total_spent_bs)}`
                    : `≈ $ ${formatAmount(b.total_spent_usd)}`;

                const quickAction = isSharedWithMe ? undefined : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      type="button"
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
                      type="button"
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
                );

                return (
                  <div key={b.id} id={`sub-budget-${b.id}`}>
                    <ListCard
                      statusColor={statusColor}
                      icon={<Layers size={20} />}
                      iconBg={isSharedWithMe ? 'rgba(59, 130, 246, 0.1)' : 'var(--surface-muted)'}
                      iconColor={isSharedWithMe ? '#3B82F6' : 'var(--text-primary)'}
                      title={b.name}
                      subtitle={subtitle}
                      badges={badges}
                      progress={
                        b.effective_global_limit && b.effective_global_limit > 0
                          ? {
                              value: b.total_spent_budget_currency,
                              max: b.effective_global_limit,
                              color: statusColor,
                            }
                          : undefined
                      }
                      primaryAmount={primaryAmount}
                      secondaryAmount={secondaryAmount}
                      quickAction={quickAction}
                      onClick={() => setSelectedBudgetId(b.id)}
                    />
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
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '1.25rem',
              paddingTop: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: '1 1 auto' }}>
              <button
                type="button"
                onClick={() => setSelectedBudgetId(null)}
                aria-label="Volver"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--radius-full, 9999px)',
                  background: 'var(--surface-color, #FFFFFF)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
                  color: 'var(--text-primary, #0F172A)',
                  flexShrink: 0,
                  transition: 'transform 150ms ease-out, box-shadow 150ms ease-out',
                }}
              >
                <ArrowLeft size={20} />
              </button>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h1
                    style={{
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                      margin: 0,
                      letterSpacing: '-0.02em',
                      lineHeight: 1.2,
                      wordBreak: 'break-word',
                    }}
                  >
                    {selectedBudget.is_primary ? 'Plan Maestro' : selectedBudget.name}
                  </h1>
                  {selectedBudget.is_read_only && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#3B82F6',
                        background: 'rgba(59, 130, 246, 0.12)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                        flexShrink: 0,
                      }}
                    >
                      <Layers size={10} />
                      Compartido por {selectedBudget.shared_by || 'Pana'} · Solo lectura
                    </span>
                  )}
                </div>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-tertiary)',
                    margin: '2px 0 0 0',
                    fontWeight: 500,
                    wordBreak: 'break-word',
                  }}
                >
                  {selectedBudget.is_read_only
                    ? `Presupuesto compartido en modo lectura • ${currencyLabels[selectedBudget.currency] || '$'} • ${selectedBudget.month_year}`
                    : selectedBudget.is_primary
                    ? `Fuente de verdad de todos los límites • ${currencyLabels[selectedBudget.currency] || '$'} • ${selectedBudget.month_year}`
                    : `Límites heredados del Principal • ${currencyLabels[selectedBudget.currency] || '$'} • ${selectedBudget.month_year}`}
                </p>
              </div>
            </div>

            {/* Right action */}
            {detailRightAction && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0, marginLeft: 'auto' }}>
                {detailRightAction}
              </div>
            )}
          </header>

          {/* Hero Card for THIS Budget */}
          <BudgetHeroCard
            eyebrow={selectedBudget.is_primary ? 'PRESUPUESTO GENERAL' : 'GRUPO DE CATEGORÍAS'}
            badgeText={
              selectedBudget.effective_global_limit && selectedBudget.effective_global_limit > 0
                ? `${Math.round(selectedBudget.global_spent_percentage)}% consumido`
                : 'Sin límites asignados'
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
            isLoading={isLoading}
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
            {!selectedBudget.is_primary && !selectedBudget.is_read_only && (
              <button
                onClick={() => handleOpenBudgetModal(selectedBudget)}
                className="app-btn app-btn-sm app-btn-secondary"
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
                  {selectedBudget.is_read_only
                    ? 'Este grupo compartido no tiene categorías asignadas aún.'
                    : 'No has seleccionado categorías para este grupo.'}
                </p>
                {!selectedBudget.is_read_only && (
                  <button
                    onClick={() => handleOpenBudgetModal(selectedBudget)}
                    className="app-btn app-btn-sm app-btn-primary"
                  >
                    <Plus size={14} />
                    Elegir categorías
                  </button>
                )}
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

                  const title = catName;

                  const subtitle = (
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
                  );

                  const badges = (
                    <>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor }}>
                        {Math.round(cl.spent_percentage)}% consumido
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
                    </>
                  );

                  const primaryAmount = `${currSym} ${formatAmount(cl.spent_amount)} / ${formatAmount(cl.limit_amount)}`;

                  const secondaryAmount =
                    cl.currency !== 'BS'
                      ? `≈ Bs. ${formatAmount(cl.spent_bs)}`
                      : `≈ $ ${formatAmount(cl.spent_usd)}`;

                  const quickAction = selectedBudget.is_read_only ? undefined : (
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {selectedBudget.is_primary ? (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCategoryLimitModal(catName);
                            }}
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
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteCategoryLimit({
                                isOpen: true,
                                budgetId: selectedBudget.id,
                                categoryName: catName,
                              });
                            }}
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
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCategoryLimitModal(catName);
                            }}
                            title="Ajustar en Presupuesto Principal"
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
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteCategoryLimit({
                                isOpen: true,
                                budgetId: selectedBudget.id,
                                categoryName: catName,
                              });
                            }}
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
                  );

                  return (
                    <ListCard
                      key={catName}
                      statusColor={statusColor}
                      icon={renderCategoryIcon(catName)}
                      iconBg="var(--surface-muted)"
                      iconColor="var(--text-primary)"
                      title={title}
                      subtitle={subtitle}
                      badges={badges}
                      progress={{
                        value: cl.spent_amount,
                        max: cl.limit_amount,
                        color: statusColor,
                      }}
                      primaryAmount={primaryAmount}
                      secondaryAmount={secondaryAmount}
                      quickAction={quickAction}
                      onClick={selectedBudget.is_read_only ? undefined : () => handleOpenCategoryLimitModal(catName)}
                    />
                  );
                } else {
                  // Category without limit (limit_amount === 0) -> "⚠️ Falta ingresar límite"
                  const subtitle = (
                    <div>
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
                  );

                  const quickAction = selectedBudget.is_read_only ? undefined : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenCategoryLimitModal(catName);
                        }}
                        className="app-btn app-btn-sm app-btn-secondary"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        <Plus size={14} />
                        {selectedBudget.is_primary ? 'Definir límite' : 'Ajustar en Principal'}
                      </button>
                      {!selectedBudget.is_primary && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteCategoryLimit({
                              isOpen: true,
                              budgetId: selectedBudget.id,
                              categoryName: catName,
                            });
                          }}
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
                  );

                  return (
                    <ListCard
                      key={catName}
                      statusColor="var(--border-color)"
                      icon={renderCategoryIcon(catName)}
                      iconBg="var(--surface-muted)"
                      iconColor="var(--text-primary)"
                      title={catName}
                      subtitle={subtitle}
                      quickAction={quickAction}
                      onClick={selectedBudget.is_read_only ? undefined : () => handleOpenCategoryLimitModal(catName)}
                    />
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
          panas={panas}
          connections={connections}
          onClose={() => setBudgetModal({ isOpen: false, budgetToEdit: null })}
          onSaved={(updated: MonthlyBudgetResponse) => {
            setBudgetResponse(updated);
            setBudgetModal({ isOpen: false, budgetToEdit: null });
          }}
        />
      )}

      {/* CategoryLimitModal */}
      {categoryModal.isOpen && (
        <CategoryLimitModal
          isOpen={categoryModal.isOpen}
          categoryName={categoryModal.categoryName}
          budgetId={(primaryBudget || selectedBudget)?.id}
          existingLimit={categoryModal.existingLimit}
          initialLimitAmount={categoryModal.limitAmount}
          initialCurrency={categoryModal.currency}
          onClose={() => setCategoryModal((prev) => ({ ...prev, isOpen: false }))}
          onSaved={(updated: MonthlyBudgetResponse) => {
            setBudgetResponse(updated);
            setCategoryModal((prev) => ({ ...prev, isOpen: false }));
          }}
          onResetLimit={() => {
            const targetId = (primaryBudget || selectedBudget)?.id || '';
            setConfirmDeleteCategoryLimit({
              isOpen: true,
              budgetId: targetId,
              categoryName: categoryModal.categoryName,
            });
          }}
        />
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
        loading={isDeletingCategoryLimit}
        title={selectedBudget?.is_primary ? '¿Restablecer límite?' : '¿Quitar categoría del grupo?'}
        message={
          selectedBudget?.is_primary
            ? `¿Deseas restablecer a 0 el límite de "${confirmDeleteCategoryLimit.categoryName}" en el Plan Maestro? Los grupos que incluyan esta categoría también heredarán 0.`
            : `¿Deseas quitar la categoría "${confirmDeleteCategoryLimit.categoryName}" de este grupo? El límite en el Plan Maestro se mantendrá intacto.`
        }
        onConfirm={handleDeleteCategoryLimit}
        onCancel={() => setConfirmDeleteCategoryLimit({ isOpen: false, budgetId: '', categoryName: '' })}
      />

      {/* ConfirmLeave Shared Budget Modal */}
      <ConfirmModal
        isOpen={!!leaveSharedBudgetConfirm}
        title="¿Salir del presupuesto compartido?"
        message={`¿Estás seguro de salir de "${leaveSharedBudgetConfirm?.name || ''}"? Dejarás de ver este presupuesto compartido.`}
        onConfirm={handleConfirmLeaveSharedBudget}
        onCancel={() => setLeaveSharedBudgetConfirm(null)}
        loading={isLeavingShare}
      />

      {/* ShareMembersModal for Sub-Budget */}
      {activeShareModalItem && (
        <ShareMembersModal
          entityId={activeShareModalItem.id}
          entityType="sub_budget"
          entityTypeLabel="sub-presupuesto"
          entityName={activeShareModalItem.name}
          onClose={() => setActiveShareModalItem(null)}
          onUpdated={() => {
            invalidateMonthlyBudgetCache(currentMonthYear);
            fetchData(true, true);
          }}
          onSelfLeave={() => {
            setActiveShareModalItem(null);
            invalidateMonthlyBudgetCache(currentMonthYear);
            fetchData(true, true);
            toast.success('Has salido del presupuesto compartido');
          }}
        />
      )}
    </div>
  );
};

export default Budgets;
