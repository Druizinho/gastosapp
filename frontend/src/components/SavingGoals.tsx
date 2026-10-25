import React, { useState, useEffect } from 'react';
import {
  Plus,
  PiggyBank,
  Calendar,
  CheckCircle2,
  Trash2,
  Edit3,
  Clock,
  Users,
  FolderKanban,
  RotateCcw
} from 'lucide-react';
import type {
  SavingGoal,
  SavingGoalCreate,
  SavingGoalUpdate,
  SavingDeposit,
  SavingDepositCreate,
  SavingDepositUpdate,
  ExchangeRates,
  MainCurrencyPreference
} from '../types';
import {
  getSavingGoals,
  createSavingGoal,
  updateSavingGoal,
  deleteSavingGoal,
  addSavingDeposit,
  updateSavingDeposit,
  deleteSavingDeposit,
  getRates
} from '../api';
import SavingGoalForm from './SavingGoalForm';
import SavingDepositForm from './SavingDepositForm';
import ConfirmModal from './ConfirmModal';
import { MemberAvatars, ShareMembersModal } from './panas';
import ListCard from './ListCard';
import ListCardBottomSheet from './ListCardBottomSheet';
import { useCategories } from '../context/CategoriesContext';
import { resolveCategoryVisuals } from '../utils/categoryVisuals';
import { useCurrencyPreference } from '../context/CurrencyPreferenceContext';
import {
  formatListCardAmounts,
  formatCurrencyAmount,
  convertItemAmountToMainCurrency,
  isSameCurrency
} from '../utils/currencyFormat';
import { PageHeader } from './ui/PageHeader';
import { SummaryHeroCard } from './ui/SummaryHeroCard';
import { SegmentedTabs } from './ui/SegmentedTabs';
import { EmptyState } from './ui/EmptyState';
import { CurrencyBreakdownCard } from './ui/CurrencyBreakdownCard';

interface SavingGoalsProps {
  onBack?: () => void;
}

const currencyLabels: Record<string, string> = {
  'USD_BCV': '$',
  'EUR_BCV': '€',
  'BS': 'Bs.',
  'USDT': 'USDT',
  'USD_CASH': '$ Cash',
};

const formatCurrency = (amount: number, currency: string) => {
  if (amount == null) return '';
  return `${currencyLabels[currency] || currency} ${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const SavingGoals: React.FC<SavingGoalsProps> = ({ onBack }) => {
  const { categories } = useCategories();
  const { mainCurrency, setMainCurrency } = useCurrencyPreference();

  const [goals, setGoals] = useState<SavingGoal[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [typeTab, setTypeTab] = useState<'all' | 'projects' | 'savings'>('all');
  const [statusTab, setStatusTab] = useState<'active' | 'completed' | 'all'>('active');

  const [selectedGoal, setSelectedGoal] = useState<SavingGoal | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingGoal | undefined>(undefined);
  const [depositGoal, setDepositGoal] = useState<SavingGoal | null>(null);
  const [editingDeposit, setEditingDeposit] = useState<SavingDeposit | undefined>(undefined);
  const [selectedDepositForSheet, setSelectedDepositForSheet] = useState<SavingDeposit | null>(null);
  const [activeShareModalItem, setActiveShareModalItem] = useState<{ id: string; name: string } | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean;
    goalId?: string;
    depositId?: string;
    title?: string;
    message?: string;
  }>({ isOpen: false });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [goalsData, ratesData] = await Promise.all([
        getSavingGoals(),
        getRates()
      ]);
      setGoals(goalsData);
      setRates(ratesData);
      setSelectedGoal(prev => {
        if (!prev) return null;
        return goalsData.find(g => g.id === prev.id) || null;
      });
    } catch (error) {
      console.error('Error fetching saving goals:', error);
      showToast('Error al cargar fondos de ahorro');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Convert amount between currencies using rates helper
  const convertAmount = (amount: number, fromCurrency: string) => {
    if (!rates || !amount) return { usd: amount || 0, bs: amount || 0, eur: amount || 0, usdt: amount || 0 };
    const usd_bs = rates.usd_bs || 1;
    const eur_bs = rates.eur_bs || 1;
    const usdt_bs = rates.usdt_bs || 1;

    const curr = fromCurrency === 'USD' ? 'USD_BCV' : fromCurrency === 'EUR' ? 'EUR_BCV' : fromCurrency;

    let bs = 0;
    if (curr === 'BS') bs = amount;
    else if (curr === 'USD_BCV') bs = amount * usd_bs;
    else if (curr === 'EUR_BCV') bs = amount * eur_bs;
    else if (curr === 'USDT') bs = amount * usdt_bs;
    else if (curr === 'USD_CASH') {
      const available_rates = [usd_bs, eur_bs, usdt_bs].filter(r => r > 1);
      const maxRate = available_rates.length > 0 ? Math.max(...available_rates) : usd_bs;
      bs = amount * maxRate;
    } else {
      bs = amount * usd_bs;
    }

    return {
      bs,
      usd: usd_bs > 0 ? bs / usd_bs : 0,
      eur: eur_bs > 0 ? bs / eur_bs : 0,
      usdt: usdt_bs > 0 ? bs / usdt_bs : 0,
    };
  };

  const calcDepositInGoalCurrency = (d: SavingDeposit, goal: SavingGoal): number => {
    if (d.currency === goal.currency) return Number(d.amount);
    if (goal.currency === 'USD_BCV' && d.amount_usd) return Number(d.amount_usd);
    if (goal.currency === 'BS' && d.amount_bs) return Number(d.amount_bs);
    if (goal.currency === 'EUR_BCV' && d.amount_eur) return Number(d.amount_eur);
    if (goal.currency === 'USDT' && d.amount_usdt) return Number(d.amount_usdt);
    if (goal.currency === 'USD_CASH' && d.amount_usd) return Number(d.amount_usd);

    const conv = convertAmount(Number(d.amount), d.currency);
    if (goal.currency === 'USD_BCV' || goal.currency === 'USD_CASH') return conv.usd;
    if (goal.currency === 'BS') return conv.bs;
    if (goal.currency === 'EUR_BCV') return conv.eur;
    if (goal.currency === 'USDT') return conv.usdt;
    return Number(d.amount);
  };

  // Calculate total saved for a goal in its currency
  const calculateGoalSaved = (goal: SavingGoal): number => {
    if (!goal.deposits || goal.deposits.length === 0) return 0;
    return goal.deposits.reduce((acc, d) => acc + calcDepositInGoalCurrency(d, goal), 0);
  };

  const cycleDisplayCurrency = () => {
    const order: MainCurrencyPreference[] = ['USD', 'BS', 'EUR', 'USDT'];
    const idx = order.indexOf(mainCurrency);
    setMainCurrency(order[(idx + 1) % order.length]);
  };

  const handleToggleComplete = async (goal: SavingGoal) => {
    try {
      setSubmitting(true);
      const newStatus = !goal.is_completed;
      const updated = await updateSavingGoal(goal.id, { is_completed: newStatus });
      setSelectedGoal(updated);
      await fetchData();
      if (newStatus) {
        showToast(goal.type === 'project' ? '🎉 ¡Proyecto finalizado con éxito!' : '🎉 ¡Meta marcada como completada!');
      } else {
        showToast(goal.type === 'project' ? 'Proyecto reabierto para nuevos registros' : 'Fondo reabierto');
      }
    } catch (error: any) {
      console.error('Error toggling goal status:', error);
      showToast('Error al actualizar estado');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveGoal = async (data: SavingGoalCreate | SavingGoalUpdate) => {
    try {
      setSubmitting(true);
      const isProj = data.type === 'project';
      let saved: SavingGoal;
      if (editingGoal) {
        saved = await updateSavingGoal(editingGoal.id, data as SavingGoalUpdate);
        showToast(isProj ? 'Proyecto actualizado exitosamente' : 'Fondo actualizado exitosamente');
      } else {
        saved = await createSavingGoal(data as SavingGoalCreate);
        showToast(isProj ? '¡Proyecto creado con éxito! 🛠️' : '¡Fondo de ahorro creado! 🐷');
      }
      setShowGoalForm(false);
      setEditingGoal(undefined);
      if (selectedGoal && editingGoal && selectedGoal.id === editingGoal.id) {
        setSelectedGoal(saved);
      }
      await fetchData();
    } catch (error: any) {
      console.error('Error saving goal:', error);
      const detail = error?.response?.data?.detail;
      showToast(typeof detail === 'string' ? detail : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddOrUpdateDeposit = async (data: SavingDepositCreate | SavingDepositUpdate) => {
    const goalToDeposit = depositGoal || selectedGoal;
    if (!goalToDeposit) return;
    try {
      setSubmitting(true);
      const isProj = goalToDeposit.type === 'project';
      let updated: SavingGoal;
      if (editingDeposit) {
        updated = await updateSavingDeposit(editingDeposit.id, data as SavingDepositUpdate);
      } else {
        updated = await addSavingDeposit(goalToDeposit.id, data as SavingDepositCreate);
      }
      if (selectedGoal && selectedGoal.id === goalToDeposit.id) {
        setSelectedGoal(updated);
      }
      setDepositGoal(null);
      setEditingDeposit(undefined);
      await fetchData();

      if (editingDeposit) {
        showToast(isProj ? 'Pago actualizado correctamente' : 'Aporte actualizado correctamente');
      } else if (updated.is_completed) {
        showToast(isProj ? '🎉 ¡Proyecto completado!' : '🎉 ¡Felicidades! Fondo completado al 100%');
      } else {
        showToast(isProj ? 'Pago registrado correctamente' : 'Aporte registrado correctamente');
      }
    } catch (error: any) {
      console.error('Error saving deposit:', error);
      const detail = error?.response?.data?.detail;
      showToast(typeof detail === 'string' ? detail : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      setSubmitting(true);
      await deleteSavingGoal(goalId);
      if (selectedGoal?.id === goalId) {
        setSelectedGoal(null);
      }
      await fetchData();
      showToast('Eliminado exitosamente');
    } catch (error) {
      console.error('Error deleting goal:', error);
      showToast('Error al eliminar');
    } finally {
      setSubmitting(false);
      setConfirmDelete({ isOpen: false });
    }
  };

  const handleDeleteDeposit = async (depositId: string) => {
    if (!selectedGoal) return;
    try {
      setSubmitting(true);
      const isProj = selectedGoal.type === 'project';
      const updated = await deleteSavingDeposit(depositId);
      setSelectedGoal(updated);
      await fetchData();
      showToast(isProj ? 'Pago eliminado' : 'Aporte eliminado');
    } catch (error) {
      console.error('Error deleting deposit:', error);
      showToast('Error al eliminar');
    } finally {
      setSubmitting(false);
      setConfirmDelete({ isOpen: false });
    }
  };

  // Filtered goals
  const filteredGoals = goals.filter(g => {
    const gType = g.type || 'saving';
    if (typeTab === 'projects' && gType !== 'project') return false;
    if (typeTab === 'savings' && gType !== 'saving') return false;

    if (statusTab === 'active') return !g.is_completed && g.is_active;
    if (statusTab === 'completed') return g.is_completed;
    return true;
  });

  const activeGoals = goals.filter(g => !g.is_completed && g.is_active);
  const activeSavings = activeGoals.filter(g => (g.type || 'saving') === 'saving');
  const activeProjects = activeGoals.filter(g => g.type === 'project');

  const targetedSavings = activeSavings.filter(g => g.target_amount != null && Number(g.target_amount) > 0);
  const openSavings = activeSavings.filter(g => g.target_amount == null || Number(g.target_amount) <= 0);

  const targetedProjects = activeProjects.filter(g => g.target_amount != null && Number(g.target_amount) > 0);
  const openProjects = activeProjects.filter(g => g.target_amount == null || Number(g.target_amount) <= 0);

  const activeGoalsCount = activeGoals.length;
  const completedGoalsCount = goals.filter(g => g.is_completed).length;
  const projectsCount = goals.filter(g => g.type === 'project').length;
  const savingsCount = goals.filter(g => (g.type || 'saving') === 'saving').length;

  const sumGoalsDepositsInMain = (goalList: SavingGoal[]) => {
    return goalList.reduce((acc, g) => {
      if (!g.deposits || g.deposits.length === 0) return acc;
      return acc + g.deposits.reduce((dAcc, d) => {
        return dAcc + convertItemAmountToMainCurrency(
          {
            amount: Number(d.amount),
            currency: d.currency,
            amount_bs: d.amount_bs,
            amount_usd: d.amount_usd,
            amount_eur: d.amount_eur,
            amount_usdt: d.amount_usdt,
          },
          mainCurrency,
          rates
        );
      }, 0);
    }, 0);
  };

  const totalAllInMain = sumGoalsDepositsInMain(activeGoals);
  const totalSavingsInMain = sumGoalsDepositsInMain(activeSavings);
  const totalProjectsInMain = sumGoalsDepositsInMain(activeProjects);
  const targetedSavingsMetrics = sumGoalsDepositsInMain(targetedSavings);
  const openSavingsMetrics = sumGoalsDepositsInMain(openSavings);
  const targetedProjectsMetrics = sumGoalsDepositsInMain(targetedProjects);
  const openProjectsMetrics = sumGoalsDepositsInMain(openProjects);

  const formatVal = (val: number) => formatCurrencyAmount(val, mainCurrency);

  // VIEW: Detail View of a Single Goal
  if (selectedGoal) {
    const isProject = selectedGoal.type === 'project';
    const hasTarget = selectedGoal.target_amount != null && Number(selectedGoal.target_amount) > 0;
    const isOpenSaving = !isProject && !hasTarget;
    const target = hasTarget ? Number(selectedGoal.target_amount) : 0;
    const saved = calculateGoalSaved(selectedGoal);
    const progress = hasTarget ? Math.min((saved / target) * 100, 100) : 0;
    const remaining = hasTarget ? Math.max(target - saved, 0) : null;
    const isOverBudget = isProject && hasTarget && saved > target;

    const matchedCat = categories.find(c => c.name.toLowerCase() === (selectedGoal.category || '').toLowerCase());
    const fallbackCat = selectedGoal.category || (isProject ? 'Proyectos' : 'Ahorro');
    const { IconComponent: HeaderIcon, hexColor: headerHexColor } = resolveCategoryVisuals(matchedCat, fallbackCat);
    const color = selectedGoal.color && selectedGoal.color.startsWith('#') ? selectedGoal.color : headerHexColor;

    const savedInMain = convertItemAmountToMainCurrency({ amount: saved, currency: selectedGoal.currency }, mainCurrency, rates);
    const targetInMain = hasTarget ? convertItemAmountToMainCurrency({ amount: target, currency: selectedGoal.currency }, mainCurrency, rates) : null;
    const remainingInMain = remaining !== null ? convertItemAmountToMainCurrency({ amount: remaining, currency: selectedGoal.currency }, mainCurrency, rates) : null;

    const isMember = selectedGoal.is_shared && selectedGoal.my_role === 'member';

    const detailRightAction = (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <button
          type="button"
          onClick={() => { setEditingGoal(selectedGoal); setShowGoalForm(true); }}
          disabled={isMember}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-full, 9999px)',
            background: 'var(--surface-color)',
            color: isMember ? 'var(--text-tertiary)' : 'var(--text-secondary)',
            border: '1px solid var(--accent-light)',
            cursor: isMember ? 'not-allowed' : 'pointer',
            opacity: isMember ? 0.4 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 150ms ease-out',
          }}
          title={isMember ? "Solo administradores pueden editar" : "Editar"}
        >
          <Edit3 size={16} />
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete({
            isOpen: true,
            goalId: selectedGoal.id,
            title: isProject ? '¿Eliminar Proyecto?' : '¿Eliminar Fondo?',
            message: selectedGoal.is_shared
              ? `Este ${isProject ? 'proyecto' : 'fondo'} está compartido con tus panas (${selectedGoal.shared_members?.length || 2} miembros). Al eliminarlo, también se eliminará para todos.`
              : `Se eliminará el ${isProject ? 'proyecto' : 'fondo de ahorro'} y todo su historial.`,
          })}
          disabled={isMember}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-full, 9999px)',
            background: 'rgba(239, 68, 68, 0.08)',
            color: isMember ? 'var(--text-tertiary)' : 'var(--expense-color)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            cursor: isMember ? 'not-allowed' : 'pointer',
            opacity: isMember ? 0.4 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 150ms ease-out',
          }}
          title={selectedGoal.is_shared && selectedGoal.my_role === 'member' ? "Solo administradores pueden eliminar" : "Eliminar"}
        >
          <Trash2 size={16} />
        </button>
      </div>
    );

    return (
      <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
        <PageHeader
          title={selectedGoal.name}
          subtitle={isProject ? 'Cuenta por Proyecto • Pagos' : 'Fondo de Ahorro • Aportes'}
          onBack={() => setSelectedGoal(null)}
          rightAction={detailRightAction}
        />

        {/* Goal Hero Card */}
        <div 
          className="soft-card"
          onClick={cycleDisplayCurrency}
          style={{
            background: 'var(--surface-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            border: '1px solid var(--accent-light)',
            boxShadow: 'var(--shadow-md)',
            marginBottom: '1.25rem',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
          }}
        >
          {/* Subtle colored glow */}
          <div style={{
            position: 'absolute',
            top: '-40px',
            right: '-40px',
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: color,
            opacity: 0.12,
            filter: 'blur(30px)',
            pointerEvents: 'none',
          }} />

          {/* Badges row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: isProject ? '#3B82F6' : '#10B981',
              background: isProject ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              padding: '0.2rem 0.6rem',
              borderRadius: 'var(--radius-full)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              {isProject ? <FolderKanban size={12} /> : <PiggyBank size={12} />}
              {isProject ? 'Proyecto' : 'Ahorro'}
            </span>

            {selectedGoal.is_shared && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveShareModalItem({ id: selectedGoal.id, name: selectedGoal.name });
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#3B82F6',
                  padding: '0.25rem 0.65rem',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  transition: 'all 0.15s ease'
                }}
                title="Gestionar miembros"
              >
                <MemberAvatars members={selectedGoal.shared_members} size={18} />
                <span>Panas ({selectedGoal.shared_members?.length || 2})</span>
              </div>
            )}

            {selectedGoal.category && (
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: color,
                background: `${color}18`,
                border: `1px solid ${color}35`,
                padding: '0.2rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}>
                <HeaderIcon size={12} />
                {selectedGoal.category}
              </span>
            )}

            {selectedGoal.target_date && (
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--surface-muted)',
                padding: '0.2rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}>
                <Calendar size={12} />
                Objetivo: {formatDate(selectedGoal.target_date)}
              </span>
            )}

            {selectedGoal.is_completed && (
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#10B981',
                background: 'rgba(16, 185, 129, 0.15)',
                padding: '0.2rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}>
                <CheckCircle2 size={12} />
                {isProject ? 'Finalizado' : 'Completado 🎉'}
              </span>
            )}

            {isOpenSaving && (
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#10B981',
                background: 'rgba(16, 185, 129, 0.12)',
                padding: '0.2rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                border: '1px solid rgba(16, 185, 129, 0.25)',
              }}>
                <PiggyBank size={12} />
                Fondo continuo sin límite
              </span>
            )}
          </div>

          {/* Amounts display */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>
                {isProject ? 'Total Invertido / Pagado' : (isOpenSaving ? 'Total Ahorrado' : 'Ahorrado actualmente')}
              </span>
              <strong style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {formatCurrencyAmount(savedInMain, mainCurrency)}
              </strong>
              {!isSameCurrency(selectedGoal.currency, mainCurrency) && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'block' }}>
                  ≈ {formatCurrency(saved, selectedGoal.currency)}
                </span>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>
                {isProject ? 'Presupuesto Estimado' : 'Monto Objetivo'}
              </span>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                {hasTarget && targetInMain != null ? formatCurrencyAmount(targetInMain, mainCurrency) : (isProject ? 'Sin límite (Abierta)' : 'Sin meta límite (Libre)')}
              </span>
              {hasTarget && !isSameCurrency(selectedGoal.currency, mainCurrency) && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'block' }}>
                  ≈ {formatCurrency(target, selectedGoal.currency)}
                </span>
              )}
            </div>
          </div>

          {/* Progress bar or open account indicator */}
          {hasTarget ? (
            <>
              <div style={{
                height: '8px',
                background: 'var(--surface-muted)',
                borderRadius: 'var(--radius-full)',
                overflow: 'hidden',
                marginBottom: '0.5rem',
              }}>
                <div style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: isOverBudget ? '#F59E0B' : color,
                  borderRadius: 'var(--radius-full)',
                  transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>{progress.toFixed(1)}% {isProject ? 'del estimado' : 'alcanzado'}</span>
                <span>
                  {isOverBudget ? (
                    <strong style={{ color: '#F59E0B' }}>
                      +{formatCurrency(saved - target, selectedGoal.currency)} sobre presupuesto
                    </strong>
                  ) : remaining !== null && remainingInMain !== null ? (
                    remaining > 0 ? `Faltan ${formatCurrencyAmount(remainingInMain, mainCurrency)}` : '¡Objetivo superado!'
                  ) : null}
                </span>
              </div>
            </>
          ) : isProject ? (
            <div style={{
              padding: '0.65rem 0.85rem',
              background: 'var(--surface-muted)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
              marginBottom: '0.5rem'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FolderKanban size={15} style={{ color }} />
                Cuenta abierta para acumular gastos
              </span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {selectedGoal.deposits.length} pagos realizados
              </span>
            </div>
          ) : (
            <div style={{
              padding: '0.65rem 0.85rem',
              background: 'rgba(16, 185, 129, 0.08)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
              marginBottom: '0.5rem',
              border: '1px solid rgba(16, 185, 129, 0.2)'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10B981', fontWeight: 600 }}>
                <PiggyBank size={15} />
                Fondo continuo sin meta límite
              </span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                Total: {formatCurrency(saved, selectedGoal.currency)}
              </span>
            </div>
          )}

          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.5rem', textAlign: 'center' }}>
            Toca para cambiar moneda ({mainCurrency})
          </div>

          {/* Shared breakdown if applicable */}
          {selectedGoal.is_shared && saved > 0 && (() => {
            const palette = [color, '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];
            const byContributor: Record<string, { amount: number; isMe: boolean }> = {};
            const myUserId = selectedGoal.shared_members?.find(m => m.is_me)?.user_id;

            selectedGoal.deposits.forEach(d => {
              const depAmount = calcDepositInGoalCurrency(d, selectedGoal);
              const isMe = myUserId ? d.paid_by_user_id === myUserId : !d.paid_by_name;
              const key = isMe ? 'Tú' : (d.paid_by_name || 'Miembro');
              if (!byContributor[key]) {
                byContributor[key] = { amount: 0, isMe };
              }
              byContributor[key].amount += depAmount;
            });

            const entries = Object.entries(byContributor);
            const memberStats = entries.map(([name, data], idx) => ({
              name,
              amount: data.amount,
              pct: saved > 0 ? Math.round((data.amount / saved) * 100) : 0,
              color: palette[idx % palette.length],
              isMe: data.isMe
            }));

            return (
              <div style={{
                marginTop: '1rem',
                padding: '0.85rem 1rem',
                background: 'var(--surface-muted)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                border: '1px solid var(--accent-light)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Users size={14} style={{ color: '#3B82F6' }} />
                    {isProject ? 'Pagos por integrante' : 'Aportes del fondo conjunto'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    Total: {formatCurrency(saved, selectedGoal.currency)}
                  </span>
                </div>
                <div style={{
                  height: '8px',
                  width: '100%',
                  background: 'var(--surface-color)',
                  borderRadius: 'var(--radius-full)',
                  overflow: 'hidden',
                  display: 'flex'
                }}>
                  {memberStats.map((stat, i) => (
                    <div
                      key={i}
                      style={{
                        width: `${stat.pct}%`,
                        height: '100%',
                        background: stat.color,
                        transition: 'width 0.4s ease'
                      }}
                      title={`${stat.name}: ${stat.pct}%`}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.75rem' }}>
                  {memberStats.map((stat, i) => (
                    <span key={i} style={{ color: stat.color, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span>●</span> {stat.name}: {formatCurrency(stat.amount, selectedGoal.currency)} ({stat.pct}%)
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {selectedGoal.notes && (
            <p style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: 'var(--surface-muted)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
            }}>
              &quot;{selectedGoal.notes}&quot;
            </p>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingDeposit(undefined);
                setDepositGoal(selectedGoal);
              }}
              style={{
                flex: 1,
                minWidth: '180px',
                padding: '0.85rem',
                background: color,
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                fontSize: '0.92rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: `0 4px 14px ${color}44`,
                transition: 'transform 150ms ease-out',
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <Plus size={18} />
              {isProject ? 'Registrar Pago' : 'Hacer Aporte'}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleComplete(selectedGoal);
              }}
              disabled={submitting || (selectedGoal.is_shared && selectedGoal.my_role === 'member')}
              style={{
                padding: '0.85rem 1rem',
                background: 'var(--surface-muted)',
                border: '1px solid var(--accent-light)',
                borderRadius: 'var(--radius-md)',
                color: selectedGoal.is_completed ? '#F59E0B' : '#10B981',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                whiteSpace: 'nowrap',
                transition: 'transform 150ms ease-out',
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              title={selectedGoal.is_completed ? 'Reabrir cuenta' : 'Finalizar y archivar'}
            >
              {selectedGoal.is_completed ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
              <span>
                {selectedGoal.is_completed
                  ? (isProject ? 'Reabrir Cuenta' : 'Reabrir Meta')
                  : (isProject ? 'Finalizar Proyecto' : 'Completar Meta')}
              </span>
            </button>
          </div>

          {/* Resumen de Cierre si está completado */}
          {selectedGoal.is_completed && (
            <div style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10B981', fontWeight: 700, fontSize: '0.88rem' }}>
                <CheckCircle2 size={16} />
                <span>{isProject ? 'Resumen de Cierre de Proyecto' : 'Meta de Ahorro Alcanzada'}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {isProject
                  ? `Se invirtió un total de ${formatCurrency(saved, selectedGoal.currency)} a lo largo de ${selectedGoal.deposits.length} pagos registrados.`
                  : `Se alcanzó el total de ${formatCurrency(saved, selectedGoal.currency)} con ${selectedGoal.deposits.length} aportes.`}
              </div>
            </div>
          )}
        </div>

        {/* Deposit History */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {isProject ? `Historial de Pagos (${selectedGoal.deposits.length})` : `Historial de Aportes (${selectedGoal.deposits.length})`}
            </h2>
          </div>

          {selectedGoal.deposits.length === 0 ? (
            <EmptyState
              icon={isProject ? <FolderKanban size={28} /> : <PiggyBank size={28} />}
              title={isProject ? 'Aún no hay pagos registrados en este proyecto' : 'Aún no hay aportes registrados'}
              description={isProject ? 'Registra pagos de repuestos, servicios o compras para llevar el control acumulado.' : 'Comienza aportando para acercarte a tu objetivo.'}
              compact
              actionLabel={isProject ? 'Registrar Pago' : 'Hacer Aporte'}
              actionIcon={<Plus size={16} />}
              onAction={() => {
                setEditingDeposit(undefined);
                setDepositGoal(selectedGoal);
              }}
              actionColor={color}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {[...selectedGoal.deposits]
                .sort((a, b) => new Date(b.created_at || b.deposit_date).getTime() - new Date(a.created_at || a.deposit_date).getTime())
                .map((d) => {
                  const myUserId = selectedGoal.shared_members?.find(m => m.is_me)?.user_id;
                  const isMeDeposit = myUserId ? d.paid_by_user_id === myUserId : !d.paid_by_name;

                  const dCatObj = categories.find(c => c.name.toLowerCase() === (d.category || selectedGoal.category || '').toLowerCase());
                  const dFallbackCat = d.category || selectedGoal.category || (selectedGoal.type === 'project' ? 'Proyectos' : 'Ahorro');
                  const { IconComponent: DIcon, hexColor: dHexColor } = resolveCategoryVisuals(dCatObj, dFallbackCat);
                  const eqInGoal = calcDepositInGoalCurrency(d, selectedGoal);
                  const amounts = formatListCardAmounts(d, mainCurrency, rates, {
                    amountInTarget: eqInGoal,
                    targetCurrency: selectedGoal.currency
                  });

                  const badgesNode = (
                    <>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        <Calendar size={11} />
                        {formatDate(d.deposit_date)}
                      </span>

                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: dHexColor,
                        background: `${dHexColor}18`,
                        border: `1px solid ${dHexColor}35`,
                        padding: '0.12rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <DIcon size={10} />
                        {d.category || selectedGoal.category || (selectedGoal.type === 'project' ? 'Proyectos' : 'Ahorro')}
                      </span>

                      {selectedGoal.is_shared && (
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.12rem 0.5rem',
                          borderRadius: 'var(--radius-full)',
                          background: !isMeDeposit ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                          color: !isMeDeposit ? '#3B82F6' : '#10B981',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          <Users size={10} />
                          {!isMeDeposit ? `${isProject ? 'Pago' : 'Aporte'} de ${d.paid_by_name}` : `${isProject ? 'Pago' : 'Aporte'} tuyo`}
                        </span>
                      )}

                      {(d.create_expense || d.expense_id) && (
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.12rem 0.5rem',
                          borderRadius: 'var(--radius-full)',
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#10B981',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          <CheckCircle2 size={10} />
                          En Gastos
                        </span>
                      )}
                    </>
                  );

                  return (
                    <ListCard
                      key={d.id}
                      statusColor={dHexColor}
                      icon={<DIcon size={18} />}
                      iconBg={`${dHexColor}18`}
                      iconColor={dHexColor}
                      title={d.note || (isProject ? `Pago de ${formatDate(d.deposit_date)}` : `Aporte de ${formatDate(d.deposit_date)}`)}
                      subtitle={d.note ? formatDate(d.deposit_date) : undefined}
                      badges={badgesNode}
                      primaryAmount={amounts.primaryAmount}
                      secondaryAmount={amounts.secondaryAmount}
                      onClick={() => setSelectedDepositForSheet(d)}
                    />
                  );
                })}
            </div>
          )}
        </div>

        {/* Deposit Bottom Sheet */}
        <ListCardBottomSheet
          isOpen={!!selectedDepositForSheet}
          onClose={() => setSelectedDepositForSheet(null)}
          title={isProject ? 'Detalle del Pago' : 'Detalle del Aporte'}
          subtitle={selectedDepositForSheet ? formatDate(selectedDepositForSheet.deposit_date) : undefined}
          secondaryActions={selectedDepositForSheet && selectedDepositForSheet.can_edit !== false ? [
            {
              label: isProject ? 'Editar Pago' : 'Editar Aporte',
              icon: <Edit3 size={15} />,
              onClick: () => {
                const dep = selectedDepositForSheet;
                setSelectedDepositForSheet(null);
                setEditingDeposit(dep);
                setDepositGoal(selectedGoal);
              }
            },
            {
              label: isProject ? 'Eliminar Pago' : 'Eliminar Aporte',
              icon: <Trash2 size={15} />,
              danger: true,
              onClick: () => {
                const dep = selectedDepositForSheet;
                setSelectedDepositForSheet(null);
                setConfirmDelete({
                  isOpen: true,
                  depositId: dep.id,
                  title: isProject ? '¿Eliminar Pago?' : '¿Eliminar Aporte?',
                  message: selectedGoal.is_shared
                    ? `Se eliminará el registro de ${formatCurrency(Number(dep.amount), dep.currency)} y se sincronizará con todos los miembros.`
                    : `Se eliminará el registro de ${formatCurrency(Number(dep.amount), dep.currency)}.`,
                });
              }
            }
          ] : undefined}
        >
          {selectedDepositForSheet && (
            <div>
              <CurrencyBreakdownCard
                originalAmount={Number(selectedDepositForSheet.amount)}
                originalCurrency={selectedDepositForSheet.currency}
                amountBs={selectedDepositForSheet.amount_bs}
                amountUsd={selectedDepositForSheet.amount_usd}
                amountEur={selectedDepositForSheet.amount_eur}
                amountUsdt={selectedDepositForSheet.amount_usdt}
                rateUsdBs={selectedDepositForSheet.rate_usd_bs}
                rateEurBs={selectedDepositForSheet.rate_eur_bs}
                rateUsdtBs={selectedDepositForSheet.rate_usdt_bs}
                fallbackRates={rates}
              />

              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Fecha de registro:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{formatDate(selectedDepositForSheet.deposit_date)}</strong>
                </div>
                {selectedDepositForSheet.currency !== selectedGoal.currency && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Equivalente en moneda del fondo ({selectedGoal.currency}):</span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {formatCurrencyAmount(calcDepositInGoalCurrency(selectedDepositForSheet, selectedGoal), selectedGoal.currency)}
                    </strong>
                  </div>
                )}
                {selectedDepositForSheet.paid_by_name && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Registrado por:</span>
                    <strong style={{ color: '#3B82F6' }}>{selectedDepositForSheet.paid_by_name}</strong>
                  </div>
                )}
                {selectedDepositForSheet.note && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <span>Nota:</span>
                    <span style={{ textAlign: 'right', color: 'var(--text-primary)', fontStyle: 'italic' }}>{selectedDepositForSheet.note}</span>
                  </div>
                )}
                {(selectedDepositForSheet.create_expense || selectedDepositForSheet.expense_id) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10B981', fontWeight: 600, marginTop: '0.25rem' }}>
                    <CheckCircle2 size={14} />
                    <span>Reflejado en la lista mensual de gastos</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </ListCardBottomSheet>

        {activeShareModalItem && (
          <ShareMembersModal
            entityId={activeShareModalItem.id}
            entityType="saving_goal"
            entityName={activeShareModalItem.name}
            onClose={() => setActiveShareModalItem(null)}
            onUpdated={fetchData}
            onSelfLeave={() => {
              setActiveShareModalItem(null);
              setSelectedGoal(null);
              fetchData();
              showToast('Has salido del fondo compartido');
            }}
          />
        )}

        {/* Confirmation Modal in Detail View */}
        <ConfirmModal
          isOpen={confirmDelete.isOpen}
          title={confirmDelete.title || '¿Estás seguro?'}
          message={confirmDelete.message || 'Esta acción no se puede deshacer.'}
          onConfirm={() => {
            if (confirmDelete.goalId) {
              handleDeleteGoal(confirmDelete.goalId);
            } else if (confirmDelete.depositId) {
              handleDeleteDeposit(confirmDelete.depositId);
            }
          }}
          onCancel={() => setConfirmDelete({ isOpen: false })}
        />

        {/* Modal: Crear / Editar Fondo o Proyecto */}
        {showGoalForm && (
          <SavingGoalForm
            initialData={editingGoal}
            onSubmit={handleSaveGoal}
            onCancel={() => { setShowGoalForm(false); setEditingGoal(undefined); }}
            loading={submitting}
          />
        )}

        {/* Modal: Aporte o Pago */}
        {depositGoal && (
          <SavingDepositForm
            {...({ goalCategory: depositGoal.category || (depositGoal.type === 'project' ? 'Proyectos' : 'Ahorro') } as any)}
            initialData={editingDeposit}
            goalName={depositGoal.name}
            goalCurrency={depositGoal.currency}
            goalTargetAmount={depositGoal.target_amount != null ? Number(depositGoal.target_amount) : null}
            goalCurrentSaved={calculateGoalSaved(depositGoal)}
            goalColor={depositGoal.color}
            goalType={depositGoal.type || 'saving'}
            onSubmit={handleAddOrUpdateDeposit}
            onCancel={() => { setDepositGoal(null); setEditingDeposit(undefined); }}
            loading={submitting}
          />
        )}

        {/* Toast Notification */}
        {toastMessage && (
          <div style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--text-primary)',
            color: 'var(--surface-color)',
            padding: '0.75rem 1.5rem',
            borderRadius: 'var(--radius-full)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1000,
            fontSize: '0.9rem',
            fontWeight: 600,
            animation: 'toastSlideUp 0.3s ease'
          }}>
            {toastMessage}
          </div>
        )}
      </div>
    );
  }

  // Configure SummaryHeroCard metrics based on typeTab ('all' | 'savings' | 'projects')
  let heroEyebrow = 'Total General Acumulado';
  let heroAmount = totalAllInMain;
  let heroBadgeText = `${activeGoalsCount} activos (${activeSavings.length} ahorros, ${activeProjects.length} proyectos)`;
  let heroBadgeIcon = <PiggyBank size={14} />;
  let heroAccentColor = '#10B981';
  let heroMetrics = [
    {
      label: 'EN AHORROS',
      value: loading ? '...' : formatVal(totalSavingsInMain),
      subtext: `${activeSavings.length} activos`,
      valueColor: '#10B981',
      icon: <PiggyBank size={14} />,
    },
    {
      label: 'EN PROYECTOS',
      value: loading ? '...' : formatVal(totalProjectsInMain),
      subtext: `${activeProjects.length} activos`,
      valueColor: '#3B82F6',
      icon: <FolderKanban size={14} />,
    },
  ];

  if (typeTab === 'savings') {
    heroEyebrow = 'Total Ahorrado';
    heroAmount = totalSavingsInMain;
    heroBadgeText = `${activeSavings.length} ${activeSavings.length === 1 ? 'fondo activo' : 'fondos activos'}`;
    heroBadgeIcon = <PiggyBank size={14} />;
    heroAccentColor = '#10B981';
    heroMetrics = [
      {
        label: 'CON META FIJADA',
        value: loading ? '...' : formatVal(targetedSavingsMetrics),
        subtext: `${targetedSavings.length} con meta`,
        valueColor: '#10B981',
        icon: <PiggyBank size={14} />,
      },
      {
        label: 'FONDOS LIBRES',
        value: loading ? '...' : formatVal(openSavingsMetrics),
        subtext: `${openSavings.length} sin límite`,
        valueColor: '#14B8A6',
        icon: <PiggyBank size={14} />,
      },
    ];
  } else if (typeTab === 'projects') {
    heroEyebrow = 'Total Invertido en Proyectos';
    heroAmount = totalProjectsInMain;
    heroBadgeText = `${activeProjects.length} ${activeProjects.length === 1 ? 'proyecto activo' : 'proyectos activos'}`;
    heroBadgeIcon = <FolderKanban size={14} />;
    heroAccentColor = '#3B82F6';
    heroMetrics = [
      {
        label: 'CON TOPE / META',
        value: loading ? '...' : formatVal(targetedProjectsMetrics),
        subtext: `${targetedProjects.length} con tope`,
        valueColor: '#3B82F6',
        icon: <FolderKanban size={14} />,
      },
      {
        label: 'CUENTAS ABIERTAS',
        value: loading ? '...' : formatVal(openProjectsMetrics),
        subtext: `${openProjects.length} sin límite`,
        valueColor: '#6366F1',
        icon: <FolderKanban size={14} />,
      },
    ];
  }

  // VIEW: Main Goals List
  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <PageHeader
        title="Proyectos / Ahorros"
        subtitle="Fondos de reserva y cuentas por proyecto"
        onBack={onBack}
        actionLabel="Nuevo"
        actionIcon={<Plus size={18} />}
        onAction={() => { setEditingGoal(undefined); setShowGoalForm(true); }}
        actionColor={typeTab === 'projects' ? '#3B82F6' : 'var(--income-color)'}
      />

      {/* Summary Card */}
      <SummaryHeroCard
        eyebrow={heroEyebrow}
        badgeText={heroBadgeText}
        badgeIcon={heroBadgeIcon}
        mainAmount={loading ? '...' : formatVal(heroAmount)}
        mainAmountColor="var(--text-primary)"
        currencyHintText={`Toca para alternar moneda (${mainCurrency})`}
        onCycleCurrency={cycleDisplayCurrency}
        accentColor={heroAccentColor}
        metrics={heroMetrics}
      />

      {/* Type Filter Tabs: Todos | Proyectos | Ahorros */}
      <SegmentedTabs
        tabs={[
          { id: 'all', label: `Todos (${goals.length})` },
          { id: 'projects', label: `Proyectos (${projectsCount})`, icon: <FolderKanban size={13} /> },
          { id: 'savings', label: `Ahorros (${savingsCount})`, icon: <PiggyBank size={13} /> },
        ]}
        activeTab={typeTab}
        onChange={(tab) => setTypeTab(tab as 'all' | 'projects' | 'savings')}
        activeColor={typeTab === 'projects' ? '#3B82F6' : 'var(--income-color)'}
        style={{ marginBottom: '0.65rem' }}
      />

      {/* Status Filter Pills: Activos | Completados | Todos */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '0.4rem',
        marginBottom: '1.25rem',
        alignItems: 'center',
        overflowX: 'auto',
        paddingBottom: '0.2rem'
      }}>
        <SegmentedTabs
          tabs={[
            { id: 'active', label: `Activos (${activeGoalsCount})` },
            { id: 'completed', label: `Completados (${completedGoalsCount})` },
            { id: 'all', label: 'Todos' },
          ]}
          activeTab={statusTab}
          onChange={(tab) => setStatusTab(tab as 'active' | 'completed' | 'all')}
          style={{ width: 'auto' }}
        />
      </div>

      {/* Goals List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
          Cargando registros...
        </div>
      ) : filteredGoals.length === 0 ? (
        <EmptyState
          icon={typeTab === 'projects' ? <FolderKanban size={28} /> : <PiggyBank size={28} />}
          title={statusTab === 'completed'
            ? 'No hay registros completados en esta sección'
            : (typeTab === 'projects' ? 'No tienes proyectos o cuentas activas' : 'No tienes fondos de ahorro activos')}
          description={typeTab === 'projects'
            ? 'Crea un proyecto para registrar gastos continuos (reparaciones, vehículo, remodelaciones).'
            : 'Crea tu primer fondo de ahorro para comenzar a reservar dinero para tus metas.'}
          actionLabel={typeTab === 'projects' ? 'Nuevo Proyecto' : 'Nuevo Fondo'}
          actionIcon={<Plus size={16} />}
          onAction={() => { setEditingGoal(undefined); setShowGoalForm(true); }}
          actionColor={typeTab === 'projects' ? '#3B82F6' : 'var(--income-color)'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredGoals.map((goal) => {
            const isProject = goal.type === 'project';
            const hasTarget = goal.target_amount != null && Number(goal.target_amount) > 0;
            const isOpenSaving = !isProject && !hasTarget;
            const target = hasTarget ? Number(goal.target_amount) : 0;
            const saved = calculateGoalSaved(goal);
            const progress = hasTarget ? Math.min((saved / target) * 100, 100) : 0;
            const isOverBudget = isProject && hasTarget && saved > target;

            // Visual Resolution by Category
            const matchedGoalCat = categories.find(c => c.name.toLowerCase() === (goal.category || '').toLowerCase());
            const fallbackGoalCat = goal.category || (isProject ? 'Proyectos' : 'Ahorro');
            const { IconComponent, hexColor } = resolveCategoryVisuals(matchedGoalCat, fallbackGoalCat);
            const color = goal.color && goal.color.startsWith('#') ? goal.color : hexColor;

            // Currency conversion to mainCurrency
            const savedInMain = convertItemAmountToMainCurrency(
              { amount: saved, currency: goal.currency },
              mainCurrency,
              rates
            );
            const primaryAmount = formatCurrencyAmount(savedInMain, mainCurrency);

            let secondaryAmount = '';
            if (hasTarget) {
              const targetInMain = convertItemAmountToMainCurrency(
                { amount: target, currency: goal.currency },
                mainCurrency,
                rates
              );
              secondaryAmount = `de ${formatCurrencyAmount(targetInMain, mainCurrency)}`;
            } else {
              secondaryAmount = 'Sin límite · Abierto';
            }

            const titleNode = (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {goal.name}
                {goal.is_completed && (
                  <CheckCircle2 size={16} style={{ color: '#10B981', flexShrink: 0 }} />
                )}
              </span>
            );

            const badgesNode = (
              <>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: isProject ? '#3B82F6' : '#10B981',
                    background: isProject ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                    padding: '0.12rem 0.5rem',
                    borderRadius: 'var(--radius-full)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  {isProject ? <FolderKanban size={10} /> : <PiggyBank size={10} />}
                  {isProject ? 'Proyecto' : 'Ahorro'}
                </span>
                {isOpenSaving && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: '#10B981',
                      background: 'rgba(16, 185, 129, 0.12)',
                      padding: '0.12rem 0.5rem',
                      borderRadius: 'var(--radius-full)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                    }}
                  >
                    Fondo libre
                  </span>
                )}
                {goal.is_shared && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveShareModalItem({ id: goal.id, name: goal.name });
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center' }}
                    title="Gestionar miembros"
                  >
                    <MemberAvatars members={goal.shared_members} size={18} />
                  </div>
                )}
                {goal.category && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: color,
                      background: `${color}18`,
                      border: `1px solid ${color}35`,
                      padding: '0.12rem 0.5rem',
                      borderRadius: 'var(--radius-full)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    <IconComponent size={10} />
                    {goal.category}
                  </span>
                )}
                {goal.target_date && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    <Clock size={11} />
                    {formatDate(goal.target_date)}
                  </span>
                )}
              </>
            );

            const quickActionNode = (
              <button
                type="button"
                className="list-card-quick-action"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingDeposit(undefined);
                  setDepositGoal(goal);
                }}
                title={isProject ? 'Registrar Pago' : 'Nuevo Aporte'}
              >
                <Plus size={20} color={color} />
              </button>
            );

            return (
              <ListCard
                key={goal.id}
                statusColor={color}
                icon={<IconComponent size={20} />}
                iconBg={`${color}18`}
                iconColor={color}
                title={titleNode}
                badges={badgesNode}
                primaryAmount={primaryAmount}
                secondaryAmount={secondaryAmount}
                progress={hasTarget ? { value: progress, color: isOverBudget ? '#F59E0B' : color } : undefined}
                quickAction={quickActionNode}
                onClick={() => setSelectedGoal(goal)}
              >
                {hasTarget && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                      marginTop: '0.15rem',
                    }}
                  >
                    {isOverBudget ? (
                      <span style={{ color: '#F59E0B', fontWeight: 700 }}>
                        +{formatCurrency(saved - target, goal.currency)} sobre presupuesto
                      </span>
                    ) : (
                      <span>{progress.toFixed(0)}% {isProject ? 'del presupuesto' : 'completado'}</span>
                    )}
                  </div>
                )}
              </ListCard>
            );
          })}
        </div>
      )}

      {/* Modal: Crear / Editar Fondo o Proyecto */}
      {showGoalForm && (
        <SavingGoalForm
          initialData={editingGoal}
          onSubmit={handleSaveGoal}
          onCancel={() => { setShowGoalForm(false); setEditingGoal(undefined); }}
          loading={submitting}
        />
      )}

      {/* Modal: Aporte o Pago */}
      {depositGoal && (
        <SavingDepositForm
          {...({ goalCategory: depositGoal.category || (depositGoal.type === 'project' ? 'Proyectos' : 'Ahorro') } as any)}
          initialData={editingDeposit}
          goalName={depositGoal.name}
          goalCurrency={depositGoal.currency}
          goalTargetAmount={depositGoal.target_amount != null ? Number(depositGoal.target_amount) : null}
          goalCurrentSaved={calculateGoalSaved(depositGoal)}
          goalColor={depositGoal.color}
          goalType={depositGoal.type || 'saving'}
          onSubmit={handleAddOrUpdateDeposit}
          onCancel={() => { setDepositGoal(null); setEditingDeposit(undefined); }}
          loading={submitting}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title={confirmDelete.title || '¿Estás seguro?'}
        message={confirmDelete.message || 'Esta acción no se puede deshacer.'}
        onConfirm={() => {
          if (confirmDelete.goalId) {
            handleDeleteGoal(confirmDelete.goalId);
          } else if (confirmDelete.depositId) {
            handleDeleteDeposit(confirmDelete.depositId);
          }
        }}
        onCancel={() => setConfirmDelete({ isOpen: false })}
      />

      {activeShareModalItem && (
        <ShareMembersModal
          entityId={activeShareModalItem.id}
          entityType="saving_goal"
          entityName={activeShareModalItem.name}
          onClose={() => setActiveShareModalItem(null)}
          onUpdated={fetchData}
          onSelfLeave={() => {
            setActiveShareModalItem(null);
            fetchData();
            showToast('Has salido del fondo compartido');
          }}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--text-primary)',
          color: 'var(--surface-color)',
          padding: '0.75rem 1.5rem',
          borderRadius: 'var(--radius-full)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 1000,
          fontSize: '0.9rem',
          fontWeight: 600,
          animation: 'toastSlideUp 0.3s ease'
        }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default SavingGoals;
