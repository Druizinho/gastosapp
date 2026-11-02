import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Layers,
  PieChart,
  ArrowLeftRight,
  Target,
  Receipt,
  PiggyBank,
  FolderKanban,
  CalendarCheck,
  TrendingUp,
  Download,
  Share2,
  Mail,
  Check,
  ChevronDown,
  SlidersHorizontal,
  AlertTriangle,
  Loader2,
  Send,
  Eye,
} from 'lucide-react';

import type {
  ExportConfig,
  ExportFormatType,
  ExportSourceType,
  MainCurrencyPreference,
  Debt,
  SavingGoal,
  MonthlyBudgetResponse,
  FixedExpense,
  EstimatedIncome,
  BudgetCategorySummaryOut,
} from '../../types';

import { useToast } from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { SegmentedTabs } from '../ui/SegmentedTabs';
import { Skeleton } from '../ui/Skeleton';
import { TOOL_COLORS } from '../../utils/toolColors';
import { ORDERED_CURRENCIES } from '../../utils/currencySummary';
import {
  useReportExport,
  getSymmetricShortcuts,
  getDefaultExportConfig,
} from '../../hooks/useReportExport';

export interface ExportStudioPanelProps {
  initialConfig?: Partial<ExportConfig>;
  onConfigChange?: (config: ExportConfig) => void;
  getSvgElements?: () => SVGSVGElement[];
  defaultEmail?: string;
  defaultCurrency?: MainCurrencyPreference;
  reportCurrency?: MainCurrencyPreference;
  onReportCurrencyChange?: (currency: MainCurrencyPreference) => void;
  cachedDebts?: Debt[];
  cachedSavings?: SavingGoal[];
  cachedBudget?: MonthlyBudgetResponse | null;
  cachedFixedExpenses?: FixedExpense[];
  cachedEstimatedIncomes?: EstimatedIncome[];
  className?: string;
}

export const ExportStudioPanel: React.FC<ExportStudioPanelProps> = ({
  initialConfig,
  onConfigChange,
  getSvgElements,
  defaultEmail,
  defaultCurrency,
  reportCurrency,
  onReportCurrencyChange: _onReportCurrencyChange,
  cachedDebts,
  cachedSavings,
  cachedBudget,
  cachedFixedExpenses,
  cachedEstimatedIncomes,
  className = '',
}) => {
  const { user } = useAuth();
  const toast = useToast();

  // Internal configuration state
  const [config, setConfig] = useState<ExportConfig>(() => {
    const base = getDefaultExportConfig(defaultCurrency || reportCurrency || 'USD');
    return { ...base, ...initialConfig };
  });

  // Delivery Email State
  const [emailRecipient, setEmailRecipient] = useState<string>(
    () => defaultEmail || user?.email || ''
  );
  const [showEmailInline, setShowEmailInline] = useState(false);

  // Details open/close state
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);

  // Reference for animation handling
  const prevSourceRef = useRef(config.source);

  // Memoized entities cache object to prevent re-renders / re-fetching loop
  const memoizedEntities = useMemo(
    () => ({
      debts: cachedDebts,
      savings: cachedSavings,
      budgetData: cachedBudget,
      fixedExpenses: cachedFixedExpenses,
      estimatedIncomes: cachedEstimatedIncomes,
    }),
    [cachedDebts, cachedSavings, cachedBudget, cachedFixedExpenses, cachedEstimatedIncomes]
  );

  const handleExportSuccess = useCallback((msg: string) => {
    toast.success(msg);
  }, [toast]);

  const handleExportError = useCallback((err: string) => {
    toast.error(err);
  }, [toast]);

  // Hook instance for centralized report export
  const {
    exportDocument,
    previewData,
    isExporting,
    exportProgress,
    exportProgressStage,
    exportActionLoading,
    entities,
    loadingEntities,
    loadEntitiesForSource,
  } = useReportExport({
    config,
    entities: memoizedEntities,
    getSvgElements,
    onSuccess: handleExportSuccess,
    onError: handleExportError,
  });

  // Sync initialConfig changes if provided
  useEffect(() => {
    if (initialConfig) {
      setConfig((prev) => {
        const next = { ...prev, ...initialConfig };
        return next;
      });
    }
  }, [initialConfig]);

  // Automatically fetch entity options if needed on source or month changes
  useEffect(() => {
    loadEntitiesForSource(config.source, config.monthYear);
    prevSourceRef.current = config.source;
  }, [config.source, config.monthYear, loadEntitiesForSource]);

  // Update helper
  const updateConfig = (patch: Partial<ExportConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    onConfigChange?.(next);
  };

  // ---------------------------------------------------------------------------
  // Smart Format Defaults (automatically adjusts toggles based on selected format)
  // ---------------------------------------------------------------------------
  const handleFormatChange = (fmt: ExportFormatType) => {
    if (fmt === 'pdf') {
      updateConfig({
        format: 'pdf',
        includeHeaderCard: true,
        includeCharts: true,
        includeCategories: true,
        includeTransactions: false,
        includeOriginalCurrency: false,
      });
    } else if (fmt === 'xlsx') {
      updateConfig({
        format: 'xlsx',
        includeHeaderCard: true,
        includeCharts: false,
        includeCategories: true,
        includeTransactions: true,
        includeOriginalCurrency: true,
      });
    } else if (fmt === 'csv') {
      updateConfig({
        format: 'csv',
        includeHeaderCard: false,
        includeCharts: false,
        includeCategories: false,
        includeTransactions: true,
        includeOriginalCurrency: true,
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Sources Metadata (2x4 Grid)
  // ---------------------------------------------------------------------------
  const sourcesList: Array<{
    id: ExportSourceType;
    label: string;
    sub: string;
    icon: React.ReactNode;
    accent: string;
    bgAccent: string;
  }> = [
    {
      id: 'summary',
      label: 'Resumen de Periodo',
      sub: 'Gastos, ingresos y balance neto',
      icon: <PieChart size={18} />,
      accent: 'var(--tool-reports, #06B6D4)',
      bgAccent: 'rgba(6, 182, 212, 0.1)',
    },
    {
      id: 'comparison',
      label: 'Comparativa A vs B',
      sub: 'Periodo A vs. Periodo B',
      icon: <ArrowLeftRight size={18} />,
      accent: 'var(--tool-reports, #06B6D4)',
      bgAccent: 'rgba(6, 182, 212, 0.1)',
    },
    {
      id: 'budgets',
      label: 'Presupuestos',
      sub: 'Límites maestros y subpresupuestos',
      icon: <Target size={18} />,
      accent: TOOL_COLORS.budgets.solid,
      bgAccent: TOOL_COLORS.budgets.bg,
    },
    {
      id: 'debts',
      label: 'Deudas',
      sub: 'Por pagar, por cobrar y estados',
      icon: <Receipt size={18} />,
      accent: TOOL_COLORS.debts.solid,
      bgAccent: TOOL_COLORS.debts.bg,
    },
    {
      id: 'savings',
      label: 'Metas de Ahorro',
      sub: 'Fondos y metas personales',
      icon: <PiggyBank size={18} />,
      accent: TOOL_COLORS.savings.solid,
      bgAccent: TOOL_COLORS.savings.bg,
    },
    {
      id: 'projects',
      label: 'Proyectos',
      sub: 'Presupuestos e iniciativas',
      icon: <FolderKanban size={18} />,
      accent: TOOL_COLORS.projects.solid,
      bgAccent: TOOL_COLORS.projects.bg,
    },
    {
      id: 'fixed_expenses',
      label: 'Gastos Fijos',
      sub: 'Compromisos mensuales obligatorios',
      icon: <CalendarCheck size={18} />,
      accent: TOOL_COLORS.fixedExpenses.solid,
      bgAccent: TOOL_COLORS.fixedExpenses.bg,
    },
    {
      id: 'estimated_incomes',
      label: 'Ingresos Mensuales',
      sub: 'Ingresos proyectados y cobros',
      icon: <TrendingUp size={18} />,
      accent: TOOL_COLORS.income.solid,
      bgAccent: TOOL_COLORS.income.bg,
    },
  ];

  // Active section inclusions count for accordion summary
  const activeSectionsCount = [
    config.includeHeaderCard,
    config.format === 'pdf' && config.includeCharts,
    config.includeCategories,
    config.includeTransactions,
    config.includeOriginalCurrency,
  ].filter(Boolean).length;

  // Active debts filtered by segmented control
  const debtsList = entities.debts || [];
  const activeDebtFilter = config.debtFilterType || 'all';
  const filteredDebts = useMemo(() => {
    return (entities.debts || []).filter((d) => {
      if (activeDebtFilter === 'owed') return d.type === 'owed';
      if (activeDebtFilter === 'receivable') return d.type === 'receivable';
      return true;
    });
  }, [entities.debts, activeDebtFilter]);

  // Pure savings & projects
  const pureSavings = useMemo(() => (entities.savings || []).filter((g) => g.type !== 'project' && !(g as any).is_project), [entities.savings]);
  const projectsList = useMemo(() => (entities.savings || []).filter((g) => g.type === 'project' || (g as any).is_project), [entities.savings]);
  const budgetData = entities.budgetData;

  // Format Action Button Label
  const formatLabel = config.format === 'pdf' ? 'PDF' : config.format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV';

  // Symmetric shortcuts for dates
  const shortcuts = useMemo(() => getSymmetricShortcuts(), []);

  return (
    <div
      className={`export-studio-panel ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        width: '100%',
        maxWidth: '1040px',
        margin: '0 auto',
      }}
    >
      <style>{`
        .export-studio-interactive {
          transition: transform 150ms ease-out, background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
          user-select: none;
        }
        .export-studio-interactive:active:not(:disabled) {
          transform: scale(0.96);
        }
        @media (prefers-reduced-motion: reduce) {
          .export-studio-interactive {
            transition: none !important;
          }
          .export-studio-interactive:active:not(:disabled) {
            transform: none !important;
          }
        }
      `}</style>

      {/* ===================================================================== */}
      {/* SOURCE SELECTOR (2x4 MATRIX)                                          */}
      {/* Concentric radius: outer = 22px, padding = 14px, inner = 8px          */}
      {/* ===================================================================== */}
      <section
        style={{
          background: 'var(--surface-color, #FFFFFF)',
          borderRadius: '22px',
          padding: '14px',
          border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: 'var(--tool-reports, #06B6D4)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 800,
              }}
            >
              1
            </div>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary, #0F172A)', margin: 0 }}>
              Origen de Datos
            </h3>
          </div>
        </div>

        {/* 2x4 Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))',
            gap: '8px',
          }}
        >
          {sourcesList.map((src) => {
            const isSelected = config.source === src.id;
            return (
              <button
                key={src.id}
                type="button"
                className="export-studio-interactive"
                onClick={() => updateConfig({ source: src.id })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: isSelected
                    ? `2px solid ${src.accent}`
                    : '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
                  background: isSelected ? src.bgAccent : 'var(--surface-muted, #F8FAFC)',
                  color: isSelected ? 'var(--text-primary, #0F172A)' : 'var(--text-secondary, #64748B)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    color: isSelected ? src.accent : 'var(--text-tertiary, #94A3B8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {src.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {src.label}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary, #94A3B8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {src.sub}
                  </div>
                </div>
                {isSelected && <Check size={16} color={src.accent} />}
              </button>
            );
          })}
        </div>

        {/* =================================================================== */}
        {/* ENTITY SUB-SELECTOR                                                */}
        {/* Concentric radius: outer = 16px, padding = 12px, inner = 8px       */}
        {/* =================================================================== */}
        <div
          style={{
            marginTop: '12px',
            background: 'var(--surface-muted, #F8FAFC)',
            borderRadius: '16px',
            padding: '12px',
            border: '1px solid var(--border-color, rgba(0, 0, 0, 0.06))',
          }}
        >
          {loadingEntities ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '6px 2px' }}>
              <Skeleton height="14px" width="35%" borderRadius="4px" />
              <Skeleton height="40px" width="100%" borderRadius="10px" />
            </div>
          ) : (
            <>
              {/* DEBTS SUB-SELECTOR */}
              {config.source === 'debts' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                      Filtrar Cartera de Deudas:
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary, #94A3B8)', fontVariantNumeric: 'tabular-nums' }}>
                      {filteredDebts.length} encontradas
                    </span>
                  </div>

                  {/* Segmented Tabs for debts */}
                  <SegmentedTabs<'all' | 'owed' | 'receivable'>
                    tabs={[
                      { id: 'all', label: 'Todas las deudas', shortLabel: 'Todas', count: debtsList.length },
                      { id: 'receivable', label: 'Por cobrar', shortLabel: 'Cobrar', count: debtsList.filter((d) => d.type === 'receivable').length, badgeColor: 'var(--success-color, #10B981)' },
                      { id: 'owed', label: 'Por pagar', shortLabel: 'Pagar', count: debtsList.filter((d) => d.type === 'owed').length, badgeColor: 'var(--danger-color, #EF4444)' },
                    ]}
                    activeTab={activeDebtFilter}
                    onChange={(segId) => {
                      updateConfig({
                        debtFilterType: segId,
                        selectedDebtId: 'all',
                      });
                    }}
                    activeColor="var(--tool-debts, #8B5CF6)"
                  />

                  {/* Debts Dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <select
                      aria-label="Seleccionar alcance de deudas"
                      value={config.selectedDebtId}
                      onChange={(e) => updateConfig({ selectedDebtId: e.target.value })}
                      style={{
                        width: '100%',
                        maxWidth: '520px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, rgba(0, 0, 0, 0.15))',
                        fontSize: '0.82rem',
                        background: 'var(--surface-color, #FFFFFF)',
                        color: 'var(--text-primary, #0F172A)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <option value="all">
                        Todas las deudas de este grupo ({filteredDebts.length})
                      </option>
                      {filteredDebts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.counterpart} — {d.concept || 'Deuda'} ({d.currency} {Number(d.total_amount).toLocaleString()}) {d.is_settled ? '[Saldada]' : '[Activa]'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* BUDGETS SUB-SELECTOR */}
              {config.source === 'budgets' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary, #64748B)', marginBottom: '4px' }}>
                        Mes del Presupuesto:
                      </label>
                      <input
                        type="month"
                        aria-label="Mes del Presupuesto"
                        value={config.monthYear}
                        onChange={(e) => updateConfig({ monthYear: e.target.value })}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color, rgba(0, 0, 0, 0.15))',
                          fontSize: '0.82rem',
                          background: 'var(--surface-color, #FFFFFF)',
                          color: 'var(--text-primary, #0F172A)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary, #64748B)', marginBottom: '4px' }}>
                        Alcance del Documento:
                      </label>
                      <select
                        aria-label="Alcance del Presupuesto"
                        value={config.selectedBudgetId}
                        onChange={(e) => updateConfig({ selectedBudgetId: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color, rgba(0, 0, 0, 0.15))',
                          fontSize: '0.82rem',
                          background: 'var(--surface-color, #FFFFFF)',
                          color: 'var(--text-primary, #0F172A)',
                        }}
                      >
                        <option value="all">Plan Maestro + Todos los Subpresupuestos</option>
                        <option value="primary_only">Solo el Plan Maestro</option>
                        {budgetData?.budgets && budgetData.budgets.length > 0 && (
                          <optgroup label="Subpresupuestos">
                            {budgetData.budgets.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} {b.is_shared ? `(Compartido - ${b.shared_partner_name || 'Pana'})` : ''}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {budgetData?.category_limits && budgetData.category_limits.length > 0 && (
                          <optgroup label="Categorías Límite">
                            {budgetData.category_limits.map((c: BudgetCategorySummaryOut) => (
                              <option key={c.category_name} value={c.category_name}>
                                Categoría: {c.category_name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* SAVINGS SUB-SELECTOR */}
              {config.source === 'savings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                    Metas de Ahorro a Exportar:
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <select
                      aria-label="Seleccionar meta de ahorro"
                      value={config.selectedSavingId}
                      onChange={(e) => updateConfig({ selectedSavingId: e.target.value })}
                      style={{
                        width: '100%',
                        maxWidth: '480px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, rgba(0, 0, 0, 0.15))',
                        fontSize: '0.82rem',
                        background: 'var(--surface-color, #FFFFFF)',
                        color: 'var(--text-primary, #0F172A)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <option value="all">Todas las metas de ahorro ({pureSavings.length})</option>
                      {pureSavings.map((g) => {
                        const savedAmount = (g.deposits || []).reduce(
                          (acc, d) => acc + (d.transaction_type === 'withdrawal' ? -Number(d.amount || 0) : Number(d.amount || 0)),
                          0
                        );
                        const hasTarget = Boolean(g.target_amount && Number(g.target_amount) > 0);
                        const statusLabel = g.is_completed ? 'Concluido' : 'En curso';
                        const text = hasTarget
                          ? `${g.name} — Ahorrado: ${g.currency} ${savedAmount.toLocaleString()} / Meta: ${Number(g.target_amount).toLocaleString()} (${statusLabel})`
                          : `${g.name} — Total ahorrado: ${g.currency} ${savedAmount.toLocaleString()} (${statusLabel})`;
                        return (
                          <option key={g.id} value={g.id}>
                            {text}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}

              {/* PROJECTS SUB-SELECTOR */}
              {config.source === 'projects' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                    Proyectos a Exportar:
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <select
                      aria-label="Seleccionar proyecto"
                      value={config.selectedProjectId || 'all'}
                      onChange={(e) => updateConfig({ selectedProjectId: e.target.value })}
                      style={{
                        width: '100%',
                        maxWidth: '480px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, rgba(0, 0, 0, 0.15))',
                        fontSize: '0.82rem',
                        background: 'var(--surface-color, #FFFFFF)',
                        color: 'var(--text-primary, #0F172A)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <option value="all">Todos los proyectos ({projectsList.length})</option>
                      {projectsList.map((p) => {
                        const executedAmount = (p.deposits || []).reduce(
                          (acc, d) => acc + (d.transaction_type === 'withdrawal' ? -Number(d.amount || 0) : Number(d.amount || 0)),
                          0
                        );
                        const hasTarget = Boolean(p.target_amount && Number(p.target_amount) > 0);
                        const statusLabel = p.is_completed ? 'Concluido' : 'En curso';
                        const text = hasTarget
                          ? `${p.name} — Ejecutado: ${p.currency} ${executedAmount.toLocaleString()} / Meta: ${Number(p.target_amount).toLocaleString()} (${statusLabel})`
                          : `${p.name} — Total ejecutado: ${p.currency} ${executedAmount.toLocaleString()} (${statusLabel})`;
                        return (
                          <option key={p.id} value={p.id}>
                            {text}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}

              {/* FIXED EXPENSES SUB-SELECTOR */}
              {config.source === 'fixed_expenses' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary, #64748B)', marginBottom: '4px' }}>
                    Mes de Gastos Fijos:
                  </label>
                  <input
                    type="month"
                    aria-label="Mes de Gastos Fijos"
                    value={config.monthYear}
                    onChange={(e) => updateConfig({ monthYear: e.target.value })}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, rgba(0, 0, 0, 0.15))',
                      fontSize: '0.82rem',
                      background: 'var(--surface-color, #FFFFFF)',
                      color: 'var(--text-primary, #0F172A)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                </div>
              )}

              {/* ESTIMATED INCOMES SUB-SELECTOR */}
              {config.source === 'estimated_incomes' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary, #64748B)', marginBottom: '4px' }}>
                    Mes de Ingresos Mensuales:
                  </label>
                  <input
                    type="month"
                    aria-label="Mes de Ingresos Mensuales"
                    value={config.monthYear}
                    onChange={(e) => updateConfig({ monthYear: e.target.value })}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, rgba(0, 0, 0, 0.15))',
                      fontSize: '0.82rem',
                      background: 'var(--surface-color, #FFFFFF)',
                      color: 'var(--text-primary, #0F172A)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                </div>
              )}

              {/* SUMMARY & COMPARISON DATE PICKERS */}
              {(config.source === 'summary' || config.source === 'comparison') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                      {config.source === 'comparison' ? 'Periodo A (Base):' : 'Rango de Fechas del Reporte:'}
                    </span>
                    {/* Shortcuts */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        className="export-studio-interactive"
                        onClick={() => updateConfig({ dateFromA: shortcuts.monthVsLastMonth.dateFromA, dateToA: shortcuts.monthVsLastMonth.dateToA })}
                        style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '5px', border: '1px solid var(--border-color, rgba(0,0,0,0.1))', background: 'var(--surface-color, #FFFFFF)', color: 'var(--text-secondary, #64748B)', cursor: 'pointer' }}
                      >
                        Este mes
                      </button>
                      <button
                        type="button"
                        className="export-studio-interactive"
                        onClick={() => updateConfig({ dateFromA: shortcuts.monthVsLastMonth.dateFromB, dateToA: shortcuts.monthVsLastMonth.dateToB })}
                        style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '5px', border: '1px solid var(--border-color, rgba(0,0,0,0.1))', background: 'var(--surface-color, #FFFFFF)', color: 'var(--text-secondary, #64748B)', cursor: 'pointer' }}
                      >
                        Mes anterior
                      </button>
                      <button
                        type="button"
                        className="export-studio-interactive"
                        onClick={() => updateConfig({ dateFromA: shortcuts.yearVsLastYear.dateFromA, dateToA: shortcuts.yearVsLastYear.dateToA })}
                        style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '5px', border: '1px solid var(--border-color, rgba(0,0,0,0.1))', background: 'var(--surface-color, #FFFFFF)', color: 'var(--text-secondary, #64748B)', cursor: 'pointer' }}
                      >
                        Este año
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                      type="date"
                      aria-label="Fecha Desde"
                      value={config.dateFromA}
                      onChange={(e) => updateConfig({ dateFromA: e.target.value })}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, rgba(0, 0, 0, 0.15))',
                        fontSize: '0.82rem',
                        background: 'var(--surface-color, #FFFFFF)',
                        color: 'var(--text-primary, #0F172A)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary, #94A3B8)' }}>al</span>
                    <input
                      type="date"
                      aria-label="Fecha Hasta"
                      value={config.dateToA}
                      onChange={(e) => updateConfig({ dateToA: e.target.value })}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, rgba(0, 0, 0, 0.15))',
                        fontSize: '0.82rem',
                        background: 'var(--surface-color, #FFFFFF)',
                        color: 'var(--text-primary, #0F172A)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    />
                  </div>

                  {/* Comparison Period B */}
                  {config.source === 'comparison' && (
                    <div style={{ marginTop: '6px', paddingTop: '8px', borderTop: '1px dashed var(--border-color, rgba(0,0,0,0.1))' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #64748B)', marginBottom: '4px' }}>
                        Periodo B (Comparativo):
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <input
                          type="date"
                          aria-label="Periodo B Desde"
                          value={config.dateFromB || ''}
                          onChange={(e) => updateConfig({ dateFromB: e.target.value })}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color, rgba(0, 0, 0, 0.15))',
                            fontSize: '0.82rem',
                            background: 'var(--surface-color, #FFFFFF)',
                            color: 'var(--text-primary, #0F172A)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        />
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary, #94A3B8)' }}>al</span>
                        <input
                          type="date"
                          aria-label="Periodo B Hasta"
                          value={config.dateToB || ''}
                          onChange={(e) => updateConfig({ dateToB: e.target.value })}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color, rgba(0, 0, 0, 0.15))',
                            fontSize: '0.82rem',
                            background: 'var(--surface-color, #FFFFFF)',
                            color: 'var(--text-primary, #0F172A)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SECTION 2: FORMATO Y MONEDA DEL REPORTE                               */}
      {/* Concentric radius: outer = 22px, padding = 14px, inner = 14px/8px     */}
      {/* ===================================================================== */}
      <section
        style={{
          background: 'var(--surface-color, #FFFFFF)',
          borderRadius: '22px',
          padding: '14px',
          border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              background: 'var(--tool-reports, #06B6D4)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 800,
            }}
          >
            2
          </div>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary, #0F172A)', margin: 0 }}>
            Formato y Moneda del Reporte
          </h3>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '12px',
            marginTop: '12px',
          }}
        >
          {/* Subsection A: Formato de Salida */}
          <div
            style={{
              background: 'var(--surface-muted, #F8FAFC)',
              borderRadius: '14px',
              padding: '12px',
              border: '1px solid var(--border-color, rgba(0, 0, 0, 0.06))',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #64748B)' }}>
              Formato de Archivo:
            </div>
            <SegmentedTabs<ExportFormatType>
              tabs={[
                { id: 'pdf', label: 'PDF', icon: <FileText size={15} /> },
                { id: 'xlsx', label: 'Excel', icon: <FileSpreadsheet size={15} /> },
                { id: 'csv', label: 'CSV', icon: <Layers size={15} /> },
              ]}
              activeTab={config.format}
              onChange={handleFormatChange}
              activeColor={
                config.format === 'pdf'
                  ? 'var(--danger-color, #EF4444)'
                  : config.format === 'xlsx'
                  ? 'var(--success-color, #10B981)'
                  : 'var(--info-color, #3B82F6)'
              }
            />
          </div>

          {/* Subsection B: Moneda de Consolidación */}
          <div
            style={{
              background: 'var(--surface-muted, #F8FAFC)',
              borderRadius: '14px',
              padding: '12px',
              border: '1px solid var(--border-color, rgba(0, 0, 0, 0.06))',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #64748B)' }}>
              Moneda del Documento:
            </div>
            <SegmentedTabs<MainCurrencyPreference>
              tabs={ORDERED_CURRENCIES.map((cur) => ({ id: cur, label: cur }))}
              activeTab={config.currency}
              onChange={(cur) => updateConfig({ currency: cur })}
              activeColor="var(--tool-reports, #06B6D4)"
            />
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* COLLAPSIBLE SECTION CUSTOMIZER (<details> ACCORDION)                  */}
      {/* Concentric radius: outer = 20px, padding = 12px, inner = 8px          */}
      {/* ===================================================================== */}
      <details
        open={isCustomizerOpen}
        onToggle={(e) => setIsCustomizerOpen(e.currentTarget.open)}
        style={{
          background: 'var(--surface-color, #FFFFFF)',
          borderRadius: '20px',
          padding: '12px 14px',
          border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <summary
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            userSelect: 'none',
            outline: 'none',
            listStyle: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SlidersHorizontal size={16} color="var(--tool-reports, #06B6D4)" />
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
              Personalizar contenido ({activeSectionsCount} secciones activas)
            </span>
          </div>
          <div
            style={{
              transform: isCustomizerOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease-out',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-tertiary, #94A3B8)',
            }}
          >
            <ChevronDown size={18} />
          </div>
        </summary>

        {/* Collapsible Content */}
        <div
          style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-color, rgba(0,0,0,0.06))',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {[
            {
              key: 'includeHeaderCard',
              label: 'Ficha ejecutiva de cabecera / Tarjetas clave (KPIs)',
              desc: 'Resumen con totales, métricas principales y metadatos.',
            },
            {
              key: 'includeCharts',
              label: 'Gráficos vectoriales visuales (PDF)',
              desc: 'Incrusta distribución por categorías y series temporales.',
              disabled: config.format !== 'pdf',
              disabledNote: '(Solo disponible en formato PDF)',
            },
            {
              key: 'includeCategories',
              label: 'Desglose por categorías / Límites presupuestarios',
              desc: 'Tabla agrupada por rubros con montos y porcentajes.',
            },
            {
              key: 'includeTransactions',
              label: 'Tabla detallada de movimientos y transacciones individuales',
              desc: 'Listado completo fila por fila con fecha, concepto y montos.',
            },
            {
              key: 'includeOriginalCurrency',
              label: 'Mostrar columnas de moneda y tasa original',
              desc: 'Mantiene trazabilidad multidivisa (USD/EUR/VES/USDT).',
            },
          ].map((item) => {
            const checked = Boolean((config as any)[item.key]);
            return (
              <label
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.5 : 1,
                  background: checked && !item.disabled ? 'var(--bg-secondary, #F8FAFC)' : 'transparent',
                  transition: 'background-color 150ms ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={item.disabled}
                  onChange={(e) => updateConfig({ [item.key]: e.target.checked })}
                  style={{
                    marginTop: '2px',
                    width: '17px',
                    height: '17px',
                    accentColor: 'var(--tool-reports, #06B6D4)',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary, #0F172A)' }}>
                    {item.label}{' '}
                    {item.disabledNote && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary, #94A3B8)', fontWeight: 400 }}>
                        {item.disabledNote}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary, #94A3B8)', marginTop: '1px' }}>
                    {item.desc}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </details>

      {/* ===================================================================== */}
      {/* LIVE DOCUMENT BLUEPRINT PREVIEW CARD                                  */}
      {/* Concentric radius: outer = 22px, padding = 16px, inner = 10px         */}
      {/* ===================================================================== */}
      <section
        style={{
          background: 'linear-gradient(180deg, var(--surface-color, #FFFFFF) 0%, var(--surface-muted, #F8FAFC) 100%)',
          borderRadius: '22px',
          padding: '16px',
          border: '1.5px solid var(--border-color, rgba(0, 0, 0, 0.08))',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Eye size={18} color="var(--tool-reports, #06B6D4)" />
            <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary, #0F172A)', margin: 0 }}>
              Vista Previa del Documento (Blueprint)
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '6px',
                background: config.format === 'pdf' ? 'var(--danger-color, #EF4444)' : config.format === 'xlsx' ? 'var(--success-color, #10B981)' : 'var(--info-color, #3B82F6)',
                color: '#FFFFFF',
              }}
            >
              {config.format.toUpperCase()}
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'var(--surface-color, #FFFFFF)',
                border: '1px solid var(--border-color, rgba(0, 0, 0, 0.12))',
                color: 'var(--text-secondary, #64748B)',
              }}
            >
              {config.currency}
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'var(--tool-reports-bg, rgba(6, 182, 212, 0.12))',
                color: 'var(--tool-reports, #06B6D4)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {previewData.recordsCount} {previewData.recordsLabel}
            </span>
          </div>
        </div>

        {/* Title, Subtitle and KPIs in Blueprint */}
        {loadingEntities ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            <Skeleton height="20px" width="45%" borderRadius="6px" />
            <Skeleton height="14px" width="30%" borderRadius="4px" />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '8px',
                marginTop: '6px',
              }}
            >
              <Skeleton height="56px" borderRadius="10px" />
              <Skeleton height="56px" borderRadius="10px" />
              <Skeleton height="56px" borderRadius="10px" />
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary, #0F172A)', letterSpacing: '-0.01em' }}>
                {previewData.title}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748B)', marginTop: '2px' }}>
                {previewData.subtitle}
              </div>
            </div>

            {/* 3 Top Preview KPI Tiles */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '8px',
                marginBottom: '12px',
              }}
            >
              {previewData.kpis.map((kpi, idx) => {
                const isPos = kpi.highlight === 'positive';
                const isWarn = kpi.highlight === 'warning';
                return (
                  <div
                    key={kpi.label + idx}
                    style={{
                      background: 'var(--surface-color, #FFFFFF)',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: isWarn
                        ? '1.5px solid var(--warning-color, #F59E0B)'
                        : '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary, #94A3B8)', fontWeight: 600, textTransform: 'uppercase' }}>
                      {kpi.label}
                    </span>
                    <span
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: 800,
                        color: isWarn
                          ? 'var(--warning-color, #D97706)'
                          : isPos
                          ? 'var(--success-color, #10B981)'
                          : 'var(--text-primary, #0F172A)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {kpi.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Inclusions Chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary, #94A3B8)', marginRight: '2px' }}>
            Contenido incluido:
          </span>
          {[
            { label: 'KPIs', active: config.includeHeaderCard },
            { label: 'Gráficos', active: config.format === 'pdf' && config.includeCharts },
            { label: 'Categorías', active: config.includeCategories },
            { label: 'Movimientos', active: config.includeTransactions },
            { label: 'Tasas', active: config.includeOriginalCurrency },
          ].map((chip) => (
            <span
              key={chip.label}
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: chip.active ? 'var(--income-bg, rgba(16, 185, 129, 0.12))' : 'rgba(0, 0, 0, 0.04)',
                color: chip.active ? 'var(--success-color, #10B981)' : 'var(--text-tertiary, #94A3B8)',
                border: chip.active ? '1px solid var(--income-color, rgba(16, 185, 129, 0.3))' : '1px solid transparent',
              }}
            >
              {chip.active ? `✓ ${chip.label}` : `✗ ${chip.label}`}
            </span>
          ))}
        </div>

        {/* Zero Records Warning Banner */}
        {(!previewData.hasRecords || previewData.recordsCount === 0) && (
          <div
            style={{
              marginTop: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'var(--warning-bg, rgba(245, 158, 11, 0.12))',
              border: '1px solid var(--warning-color, rgba(245, 158, 11, 0.3))',
              color: 'var(--warning-color, #B45309)',
              fontSize: '0.78rem',
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={16} flex-shrink={0} />
            <span>
              {previewData.emptyWarning ||
                'No se encontraron registros para los filtros seleccionados. El reporte exportado contendrá únicamente la estructura de encabezados.'}
            </span>
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* ACTION BAR & DELIVERY HANDLERS                                        */}
      {/* ===================================================================== */}
      <section
        style={{
          background: 'var(--surface-color, #FFFFFF)',
          borderRadius: '20px',
          padding: '14px',
          border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {/* 1. Primary Download Button */}
          <button
            type="button"
            className="export-studio-interactive"
            onClick={() => exportDocument({ action: 'download' })}
            disabled={isExporting}
            style={{
              flex: '2 1 240px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 20px',
              borderRadius: '12px',
              border: 'none',
              background: 'var(--tool-reports, #06B6D4)',
              color: '#FFFFFF',
              fontSize: '0.92rem',
              fontWeight: 800,
              cursor: isExporting ? 'not-allowed' : 'pointer',
              opacity: isExporting ? 0.7 : 1,
              boxShadow: '0 2px 8px rgba(6, 182, 212, 0.3)',
            }}
          >
            {exportActionLoading === 'download' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Download size={18} />
            )}
            <span>Descargar {formatLabel}</span>
          </button>

          {/* 2. Secondary Share Button */}
          <button
            type="button"
            className="export-studio-interactive"
            onClick={() => exportDocument({ action: 'share' })}
            disabled={isExporting}
            title="Compartir archivo vía menú nativo o descargar"
            style={{
              flex: '1 1 130px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color, rgba(0, 0, 0, 0.12))',
              background: 'var(--surface-color, #FFFFFF)',
              color: 'var(--text-primary, #0F172A)',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: isExporting ? 'not-allowed' : 'pointer',
              opacity: isExporting ? 0.7 : 1,
            }}
          >
            {exportActionLoading === 'share' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Share2 size={16} />
            )}
            <span>Compartir</span>
          </button>

          {/* 3. Send by Email Toggle Button */}
          <button
            type="button"
            className="export-studio-interactive"
            onClick={() => setShowEmailInline((prev) => !prev)}
            disabled={isExporting}
            style={{
              flex: '1 1 160px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '12px 16px',
              borderRadius: '12px',
              border: showEmailInline
                ? '1.5px solid var(--tool-reports, #06B6D4)'
                : '1px solid var(--border-color, rgba(0, 0, 0, 0.12))',
              background: showEmailInline ? 'var(--tool-reports-bg, rgba(6, 182, 212, 0.08))' : 'var(--surface-color, #FFFFFF)',
              color: showEmailInline ? 'var(--tool-reports, #06B6D4)' : 'var(--text-secondary, #64748B)',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: isExporting ? 'not-allowed' : 'pointer',
            }}
          >
            <Mail size={16} />
            <span>Enviar por Correo {showEmailInline ? '▴' : '▾'}</span>
          </button>
        </div>

        {/* Unfolded Inline Email Form */}
        {showEmailInline && (
          <div
            style={{
              background: 'var(--surface-muted, #F8FAFC)',
              borderRadius: '12px',
              padding: '12px',
              border: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
              Destinatario del Reporte ({formatLabel}):
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="email"
                aria-label="Correo del destinatario"
                placeholder="ejemplo@correo.com"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
                style={{
                  flex: '1 1 240px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, rgba(0, 0, 0, 0.15))',
                  fontSize: '0.85rem',
                  background: 'var(--surface-color, #FFFFFF)',
                  color: 'var(--text-primary, #0F172A)',
                }}
              />
              <button
                type="button"
                className="export-studio-interactive"
                onClick={() =>
                  exportDocument({
                    action: 'email',
                    emailRecipient,
                  })
                }
                disabled={isExporting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--accent-color, #0F172A)',
                  color: 'var(--text-inverse, #FFFFFF)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: isExporting ? 'not-allowed' : 'pointer',
                  opacity: isExporting ? 0.7 : 1,
                }}
              >
                {exportActionLoading === 'email' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
                <span>Enviar Ahora</span>
              </button>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary, #94A3B8)' }}>
              Se adjuntará el archivo {config.format.toUpperCase()} con el resumen de métricas clave al correo indicado.
            </div>
          </div>
        )}

        {/* Export Progress Indicator */}
        {isExporting && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'var(--tool-reports-bg, rgba(6, 182, 212, 0.08))',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--tool-reports, #06B6D4)' }}>
                <Loader2 size={14} className="animate-spin" />
                <span>{exportProgressStage || 'Generando documento...'}</span>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--tool-reports, #06B6D4)', fontVariantNumeric: 'tabular-nums' }}>
                {exportProgress}%
              </span>
            </div>
            {/* Progress track */}
            <div
              style={{
                width: '100%',
                height: '5px',
                borderRadius: '3px',
                background: 'rgba(6, 182, 212, 0.15)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${exportProgress}%`,
                  height: '100%',
                  background: 'var(--tool-reports, #06B6D4)',
                  borderRadius: '3px',
                  transition: 'width 200ms ease-out',
                }}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default ExportStudioPanel;
