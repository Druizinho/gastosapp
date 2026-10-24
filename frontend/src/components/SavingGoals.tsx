import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Plus,
  PiggyBank,
  Calendar,
  CheckCircle2,
  Trash2,
  Edit3,
  TrendingUp,
  ChevronRight,
  Clock,
  Tag,
  Users,
  FolderKanban,
  RotateCcw
} from 'lucide-react';
import type { SavingGoal, SavingGoalCreate, SavingGoalUpdate, SavingDeposit, SavingDepositCreate, SavingDepositUpdate, ExchangeRates } from '../types';
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
  const [goals, setGoals] = useState<SavingGoal[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [typeTab, setTypeTab] = useState<'all' | 'projects' | 'savings'>('all');
  const [statusTab, setStatusTab] = useState<'active' | 'completed' | 'all'>('active');
  const [displayCurrency, setDisplayCurrency] = useState<'usd' | 'bs' | 'eur' | 'usdt'>('usd');

  const [selectedGoal, setSelectedGoal] = useState<SavingGoal | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingGoal | undefined>(undefined);
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<SavingDeposit | undefined>(undefined);
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

  // Calculate total saved for a goal in its currency
  const calculateGoalSaved = (goal: SavingGoal): number => {
    if (!goal.deposits || goal.deposits.length === 0) return 0;
    return goal.deposits.reduce((acc, d) => {
      if (d.currency === goal.currency) {
        return acc + Number(d.amount);
      }
      if (goal.currency === 'USD_BCV' && d.amount_usd) return acc + Number(d.amount_usd);
      if (goal.currency === 'BS' && d.amount_bs) return acc + Number(d.amount_bs);
      if (goal.currency === 'EUR_BCV' && d.amount_eur) return acc + Number(d.amount_eur);
      if (goal.currency === 'USDT' && d.amount_usdt) return acc + Number(d.amount_usdt);
      if (goal.currency === 'USD_CASH' && d.amount_usd) return acc + Number(d.amount_usd);

      const conv = convertAmount(Number(d.amount), d.currency);
      if (goal.currency === 'USD_BCV' || goal.currency === 'USD_CASH') return acc + conv.usd;
      if (goal.currency === 'BS') return acc + conv.bs;
      if (goal.currency === 'EUR_BCV') return acc + conv.eur;
      if (goal.currency === 'USDT') return acc + conv.usdt;
      return acc + Number(d.amount);
    }, 0);
  };

  // Convert amount between currencies using rates
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

  // Helper to sum deposits converted to currencies for a list of goals
  const sumDepositsForGoals = (goalList: SavingGoal[]) => {
    const total = { usd: 0, bs: 0, eur: 0, usdt: 0 };
    goalList.forEach(goal => {
      if (goal.deposits && goal.deposits.length > 0) {
        goal.deposits.forEach(d => {
          if (d.amount_bs) {
            total.bs += Number(d.amount_bs);
            total.usd += Number(d.amount_usd || 0);
            total.eur += Number(d.amount_eur || 0);
            total.usdt += Number(d.amount_usdt || 0);
          } else {
            const depConv = convertAmount(Number(d.amount), d.currency);
            total.usd += depConv.usd;
            total.bs += depConv.bs;
            total.eur += depConv.eur;
            total.usdt += depConv.usdt;
          }
        });
      }
    });
    return total;
  };

  // Dynamic totals for active goals across categories
  const getSummaryAmounts = () => {
    const activeGoals = goals.filter(g => !g.is_completed && g.is_active);
    const activeSavings = activeGoals.filter(g => (g.type || 'saving') === 'saving');
    const activeProjects = activeGoals.filter(g => g.type === 'project');

    const targetSavings = activeSavings.filter(g => g.target_amount != null && Number(g.target_amount) > 0);
    const openSavings = activeSavings.filter(g => g.target_amount == null || Number(g.target_amount) <= 0);

    const totalAll = sumDepositsForGoals(activeGoals);
    const totalSavings = sumDepositsForGoals(activeSavings);
    const totalProjects = sumDepositsForGoals(activeProjects);
    const totalTargetSavings = sumDepositsForGoals(targetSavings);
    const totalOpenSavings = sumDepositsForGoals(openSavings);

    const activeProjectsPaymentsCount = activeProjects.reduce((sum, g) => sum + (g.deposits?.length || 0), 0);

    return {
      activeGoals,
      activeSavings,
      activeProjects,
      targetSavings,
      openSavings,
      totalAll,
      totalSavings,
      totalProjects,
      totalTargetSavings,
      totalOpenSavings,
      activeProjectsPaymentsCount,
      totalSaved: totalAll,
      totalTarget: { usd: 0, bs: 0, eur: 0, usdt: 0 },
    };
  };

  const formatSummaryAmount = (amounts: { usd: number; bs: number; eur: number; usdt: number }, currency?: 'usd' | 'bs' | 'eur' | 'usdt') => {
    const activeCurrency = currency || displayCurrency;
    const prefixMap = { bs: 'Bs. ', usd: '$ ', eur: '€ ', usdt: '' };
    const suffixMap = { bs: '', usd: '', eur: '', usdt: ' USDT' };
    const val = amounts[activeCurrency] || 0;
    return `${prefixMap[activeCurrency]}${Number(val).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffixMap[activeCurrency]}`;
  };

  const cycleDisplayCurrency = () => {
    const order: Array<'usd' | 'bs' | 'eur' | 'usdt'> = ['usd', 'bs', 'eur', 'usdt'];
    const idx = order.indexOf(displayCurrency);
    setDisplayCurrency(order[(idx + 1) % order.length]);
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
    if (!selectedGoal) return;
    try {
      setSubmitting(true);
      const isProj = selectedGoal.type === 'project';
      let updated: SavingGoal;
      if (editingDeposit) {
        updated = await updateSavingDeposit(editingDeposit.id, data as SavingDepositUpdate);
      } else {
        updated = await addSavingDeposit(selectedGoal.id, data as SavingDepositCreate);
      }
      setSelectedGoal(updated);
      setShowDepositForm(false);
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
      showToast('Registro eliminado');
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

  const activeGoalsCount = goals.filter(g => !g.is_completed && g.is_active).length;
  const completedGoalsCount = goals.filter(g => g.is_completed).length;
  const projectsCount = goals.filter(g => g.type === 'project').length;
  const savingsCount = goals.filter(g => (g.type || 'saving') === 'saving').length;

  // VIEW: Detail View of a Single Goal
  if (selectedGoal && !showGoalForm && !showDepositForm) {
    const isProject = selectedGoal.type === 'project';
    const hasTarget = selectedGoal.target_amount != null && Number(selectedGoal.target_amount) > 0;
    const isOpenSaving = !isProject && !hasTarget;
    const target = hasTarget ? Number(selectedGoal.target_amount) : 0;
    const saved = calculateGoalSaved(selectedGoal);
    const progress = hasTarget ? Math.min((saved / target) * 100, 100) : 0;
    const remaining = hasTarget ? Math.max(target - saved, 0) : null;
    const isOverBudget = isProject && hasTarget && saved > target;
    const color = selectedGoal.color || (isProject ? '#3B82F6' : '#10B981');

    const savedConv = convertAmount(saved, selectedGoal.currency);
    const targetConv = hasTarget ? convertAmount(target, selectedGoal.currency) : null;
    const remainingConv = remaining !== null ? convertAmount(remaining, selectedGoal.currency) : null;

    return (
      <div style={{ padding: '0.5rem 0', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
        {/* Toast */}
        {toastMessage && (
          <div style={{
            position: 'fixed',
            bottom: '5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface-color)',
            color: 'var(--text-primary)',
            padding: '0.75rem 1.5rem',
            borderRadius: 'var(--radius-full)',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--accent-light)',
            zIndex: 1000,
            fontSize: '0.9rem',
            fontWeight: 600,
          }}>
            {toastMessage}
          </div>
        )}

        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingTop: '0.25rem' }}>
          <button
            onClick={() => setSelectedGoal(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem',
              borderRadius: 'var(--radius-full)',
              flexShrink: 0,
            }}
            aria-label="Volver"
          >
            <ArrowLeft size={22} />
          </button>
          <div style={{ flex: 1, minWidth: 0, paddingRight: '0.25rem' }}>
            <h1 style={{
              fontSize: 'clamp(1.15rem, 4.5vw, 1.35rem)',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {selectedGoal.name}
            </h1>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isProject ? 'Cuenta por Proyecto • Pagos' : 'Fondo de Ahorro • Aportes'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
            <button
              onClick={() => { setEditingGoal(selectedGoal); setShowGoalForm(true); }}
              disabled={selectedGoal.is_shared && selectedGoal.my_role === 'member'}
              title={selectedGoal.is_shared && selectedGoal.my_role === 'member' ? "Solo administradores pueden editar" : "Editar"}
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-color)',
                color: (selectedGoal.is_shared && selectedGoal.my_role === 'member') ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                border: '1px solid var(--accent-light)',
                cursor: (selectedGoal.is_shared && selectedGoal.my_role === 'member') ? 'not-allowed' : 'pointer',
                opacity: (selectedGoal.is_shared && selectedGoal.my_role === 'member') ? 0.4 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Edit3 size={17} />
            </button>
            <button
              onClick={() => setConfirmDelete({
                isOpen: true,
                goalId: selectedGoal.id,
                title: isProject ? '¿Eliminar Proyecto?' : '¿Eliminar Fondo?',
                message: selectedGoal.is_shared
                  ? `Este ${isProject ? 'proyecto' : 'fondo'} está compartido con tus panas (${selectedGoal.shared_members?.length || 2} miembros). Al eliminarlo, también se eliminará para todos.`
                  : `Se eliminará el ${isProject ? 'proyecto' : 'fondo de ahorro'} y todo su historial.`,
              })}
              disabled={selectedGoal.is_shared && selectedGoal.my_role === 'member'}
              title={selectedGoal.is_shared && selectedGoal.my_role === 'member' ? "Solo administradores pueden eliminar" : "Eliminar"}
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-color)',
                color: (selectedGoal.is_shared && selectedGoal.my_role === 'member') ? 'var(--text-tertiary)' : 'var(--expense-color)',
                border: '1px solid var(--expense-bg)',
                cursor: (selectedGoal.is_shared && selectedGoal.my_role === 'member') ? 'not-allowed' : 'pointer',
                opacity: (selectedGoal.is_shared && selectedGoal.my_role === 'member') ? 0.4 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </header>

        {/* Goal Hero Card */}
        <div 
          className="soft-card"
          onClick={cycleDisplayCurrency}
          style={{
            background: 'var(--surface-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem 1rem',
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
            {/* Type badge */}
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: isProject ? '#3B82F6' : '#10B981',
              background: isProject ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              padding: '0.25rem 0.65rem',
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
                  padding: '0.3rem 0.75rem',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  transition: 'all 0.15s ease'
                }}
                title="Gestionar miembros"
              >
                <MemberAvatars members={selectedGoal.shared_members} size={20} />
                <span>Gestionar panas ({selectedGoal.shared_members?.length || 2})</span>
              </div>
            )}
            {selectedGoal.category && (
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: color,
                background: `${color}18`,
                padding: '0.25rem 0.65rem',
                borderRadius: 'var(--radius-full)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}>
                <Tag size={12} />
                {selectedGoal.category}
              </span>
            )}
            {selectedGoal.target_date && (
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--surface-muted)',
                padding: '0.25rem 0.65rem',
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
                padding: '0.25rem 0.65rem',
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
                padding: '0.25rem 0.65rem',
                borderRadius: 'var(--radius-full)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                border: '1px solid rgba(16, 185, 129, 0.25)',
              }}>
                <PiggyBank size={12} />
                Fondo continuo sin meta límite
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
                {formatSummaryAmount(savedConv)}
              </strong>
              {displayCurrency !== (selectedGoal.currency.toLowerCase().startsWith('usd') ? 'usd' : selectedGoal.currency.toLowerCase().startsWith('eur') ? 'eur' : selectedGoal.currency.toLowerCase()) && (
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
                {targetConv ? formatSummaryAmount(targetConv) : (isProject ? 'Sin límite (Abierta)' : 'Sin meta límite (Libre)')}
              </span>
              {hasTarget && displayCurrency !== (selectedGoal.currency.toLowerCase().startsWith('usd') ? 'usd' : selectedGoal.currency.toLowerCase().startsWith('eur') ? 'eur' : selectedGoal.currency.toLowerCase()) && (
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
                height: '10px',
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
                  ) : remaining !== null && remainingConv ? (
                    remaining > 0 ? `Faltan ${formatSummaryAmount(remainingConv)}` : '¡Objetivo superado!'
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
                Total Ahorrado: {formatCurrency(saved, selectedGoal.currency)}
              </span>
            </div>
          )}

          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.5rem', textAlign: 'center' }}>
            Toca para cambiar moneda ({displayCurrency.toUpperCase()})
          </div>

          {/* Shared breakdown if applicable */}
          {selectedGoal.is_shared && saved > 0 && (() => {
            const palette = [color, '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];
            const byContributor: Record<string, { amount: number; isMe: boolean }> = {};
            const myUserId = selectedGoal.shared_members?.find(m => m.is_me)?.user_id;

            selectedGoal.deposits.forEach(d => {
              let depAmount = Number(d.amount);
              if (d.currency !== selectedGoal.currency) {
                if (selectedGoal.currency === 'USD_BCV' && d.amount_usd) depAmount = Number(d.amount_usd);
                else if (selectedGoal.currency === 'BS' && d.amount_bs) depAmount = Number(d.amount_bs);
                else if (selectedGoal.currency === 'EUR_BCV' && d.amount_eur) depAmount = Number(d.amount_eur);
                else if (selectedGoal.currency === 'USDT' && d.amount_usdt) depAmount = Number(d.amount_usdt);
                else if (selectedGoal.currency === 'USD_CASH' && d.amount_usd) depAmount = Number(d.amount_usd);
              }

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
                {/* Multi-member progress bar */}
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
                setShowDepositForm(true);
              }}
              style={{
                flex: 1,
                minWidth: '180px',
                padding: '0.85rem',
                background: color,
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: `0 4px 14px ${color}44`,
              }}
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
                whiteSpace: 'nowrap'
              }}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {isProject ? `Historial de Pagos (${selectedGoal.deposits.length})` : `Historial de Aportes (${selectedGoal.deposits.length})`}
            </h2>
          </div>

          {selectedGoal.deposits.length === 0 ? (
            <div style={{
              background: 'var(--surface-color)',
              padding: '2.5rem 1rem',
              borderRadius: 'var(--radius-lg)',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              border: '1px solid var(--accent-light)',
            }}>
              {isProject ? (
                <FolderKanban size={36} style={{ color: color, margin: '0 auto 0.75rem', opacity: 0.8 }} />
              ) : (
                <PiggyBank size={36} style={{ color: color, margin: '0 auto 0.75rem', opacity: 0.8 }} />
              )}
              <p style={{ margin: 0, fontWeight: 600 }}>
                {isProject ? 'Aún no hay pagos registrados en este proyecto' : 'Aún no hay aportes registrados'}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                {isProject ? 'Registra pagos de repuestos, servicios o compras para llevar el control acumulado.' : 'Comienza aportando para acercarte a tu objetivo.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[...selectedGoal.deposits]
                .sort((a, b) => new Date(b.deposit_date).getTime() - new Date(a.deposit_date).getTime())
                .map((d) => {
                  const myUserId = selectedGoal.shared_members?.find(m => m.is_me)?.user_id;
                  const isMeDeposit = myUserId ? d.paid_by_user_id === myUserId : !d.paid_by_name;
                  return (
                  <div
                    key={d.id}
                    style={{
                      background: 'var(--surface-color)',
                      padding: '0.875rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--accent-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: 'var(--radius-sm)',
                        background: `${color}18`,
                        color: color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <TrendingUp size={18} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {formatCurrency(Number(d.amount), d.currency)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span>{formatDate(d.deposit_date)}</span>
                          {selectedGoal.is_shared && (
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '0.1rem 0.45rem',
                              borderRadius: 'var(--radius-full)',
                              background: !isMeDeposit ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                              color: !isMeDeposit ? '#3B82F6' : '#10B981',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}>
                              <Users size={10} />
                              {!isMeDeposit ? `${isProject ? 'Pago' : 'Aporte'} de ${d.paid_by_name}` : `${isProject ? 'Pago' : 'Aporte'} tuyo`}
                            </span>
                          )}
                          {d.note && <span>• {d.note}</span>}
                          {d.create_expense && <span style={{ color: 'var(--income-color)' }}>• Reflejado en gastos</span>}
                        </div>
                      </div>
                    </div>

                    {d.can_edit !== false && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <button
                          onClick={() => {
                            setEditingDeposit(d);
                            setShowDepositForm(true);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            padding: '0.4rem',
                            borderRadius: 'var(--radius-sm)',
                          }}
                          title="Editar aporte"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete({
                            isOpen: true,
                            depositId: d.id,
                            title: '¿Eliminar aporte?',
                            message: selectedGoal.is_shared
                              ? `Se eliminará el aporte de ${formatCurrency(Number(d.amount), d.currency)} y se sincronizará con todos los miembros.`
                              : `Se eliminará el aporte de ${formatCurrency(Number(d.amount), d.currency)}.`,
                          })}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-tertiary)',
                            cursor: 'pointer',
                            padding: '0.4rem',
                            borderRadius: 'var(--radius-sm)',
                          }}
                          title="Eliminar aporte"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })}
            </div>
          )}
        </div>

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
      </div>
    );
  }

  // VIEW: Main Goals List
  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--surface-color)',
          color: 'var(--text-primary)',
          padding: '0.75rem 1.5rem',
          borderRadius: 'var(--radius-full)',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--accent-light)',
          zIndex: 1000,
          fontSize: '0.9rem',
          fontWeight: 600,
        }}>
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.25rem',
        paddingTop: '0.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '0.4rem',
                borderRadius: 'var(--radius-full)',
              }}
            >
              <ArrowLeft size={22} />
            </button>
          )}
          <div>
            <h1 style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: 0,
              letterSpacing: '-0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span>Proyectos / Ahorros</span>
              <PiggyBank size={24} style={{ color: '#10B981' }} />
            </h1>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Fondos de reserva y cuentas por proyecto
            </span>
          </div>
        </div>

        <button
          onClick={() => { setEditingGoal(undefined); setShowGoalForm(true); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.65rem 1rem',
            background: 'var(--income-color)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            transition: 'transform 0.15s ease',
          }}
        >
          <Plus size={18} />
          <span>Nuevo</span>
        </button>
      </header>

      {/* Summary Card */}
      {(() => {
        const {
          activeGoals,
          activeSavings,
          activeProjects,
          targetSavings,
          openSavings,
          totalAll,
          totalSavings,
          totalProjects,
          totalTargetSavings,
          totalOpenSavings,
          activeProjectsPaymentsCount,
        } = getSummaryAmounts();

        // Configure card content dynamically based on typeTab ('all' | 'savings' | 'projects')
        let headerTitle = "Total General Acumulado";
        let bigAmountTotals = totalAll;
        let topBadgeIcon = <PiggyBank size={14} />;
        let topBadgeText = `${activeGoals.length} activos (${activeSavings.length} ahorros, ${activeProjects.length} proyectos)`;
        let cardGradient = 'linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, var(--surface-color) 100%)';

        if (typeTab === 'savings') {
          headerTitle = "Total Ahorrado";
          bigAmountTotals = totalSavings;
          topBadgeIcon = <PiggyBank size={14} />;
          topBadgeText = `${activeSavings.length} ${activeSavings.length === 1 ? 'fondo activo' : 'fondos activos'}`;
          cardGradient = 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, var(--surface-color) 100%)';
        } else if (typeTab === 'projects') {
          headerTitle = "Total Invertido en Proyectos";
          bigAmountTotals = totalProjects;
          topBadgeIcon = <FolderKanban size={14} />;
          topBadgeText = `${activeProjects.length} ${activeProjects.length === 1 ? 'proyecto activo' : 'proyectos activos'}`;
          cardGradient = 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, var(--surface-color) 100%)';
        }

        return (
          <div
            className="soft-card"
            onClick={cycleDisplayCurrency}
            style={{ 
              marginBottom: '1.25rem', 
              padding: '1.5rem', 
              cursor: 'pointer',
              background: cardGradient,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {headerTitle}
              </span>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-full)',
                background: typeTab === 'projects' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                color: typeTab === 'projects' ? '#3B82F6' : '#10B981',
                fontSize: '0.75rem', fontWeight: 600,
                whiteSpace: 'nowrap', flexShrink: 0
              }}>
                {topBadgeIcon}
                {topBadgeText}
              </div>
            </div>

            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {loading ? '...' : formatSummaryAmount(bigAmountTotals)}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.25rem', marginBottom: '0.75rem' }}>
              Toca para cambiar moneda
            </div>

            {/* Breakdown footer based on active tab */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              alignItems: 'center',
              paddingTop: '0.65rem',
              borderTop: '1px solid var(--accent-light)',
            }}>
              {typeTab === 'all' && (
                <>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}>
                    <span>🟢</span>
                    <span>Ahorros: {formatSummaryAmount(totalSavings)} ({activeSavings.length} {activeSavings.length === 1 ? 'activo' : 'activos'})</span>
                  </span>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}>
                    <span>🛠️</span>
                    <span>Proyectos: {formatSummaryAmount(totalProjects)} ({activeProjects.length} {activeProjects.length === 1 ? 'activo' : 'activos'} · {activeProjectsPaymentsCount} {activeProjectsPaymentsCount === 1 ? 'pago' : 'pagos'})</span>
                  </span>
                </>
              )}

              {typeTab === 'savings' && (
                <>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}>
                    <span>🎯</span>
                    <span>En Metas fijadas: {formatSummaryAmount(totalTargetSavings)} ({targetSavings.length} {targetSavings.length === 1 ? 'meta en curso' : 'metas en curso'})</span>
                  </span>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(6, 182, 212, 0.08)',
                    border: '1px solid rgba(6, 182, 212, 0.25)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}>
                    <span>🌊</span>
                    <span>En Fondos libres: {formatSummaryAmount(totalOpenSavings)} ({openSavings.length} {openSavings.length === 1 ? 'fondo continuo' : 'fondos continuos'})</span>
                  </span>
                </>
              )}

              {typeTab === 'projects' && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}>
                  <span>🛠️</span>
                  <span>{activeProjects.length} {activeProjects.length === 1 ? 'proyecto activo' : 'proyectos activos'} · {activeProjectsPaymentsCount} {activeProjectsPaymentsCount === 1 ? 'pago registrado' : 'pagos registrados'}</span>
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Type Filter Tabs: Todos | Proyectos | Ahorros */}
      <div style={{
        display: 'flex',
        background: 'var(--surface-muted)',
        padding: '0.3rem',
        borderRadius: 'var(--radius-md)',
        marginBottom: '0.5rem',
        gap: '0.25rem',
      }}>
        {[
          { key: 'all', label: `Todos (${goals.length})` },
          { key: 'projects', label: `🛠️ Proyectos (${projectsCount})` },
          { key: 'savings', label: `🐷 Ahorros (${savingsCount})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTypeTab(tab.key as any)}
            style={{
              flex: 1,
              padding: '0.5rem',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: typeTab === tab.key ? 'var(--surface-color)' : 'transparent',
              color: typeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: typeTab === tab.key ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: typeTab === tab.key ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Status Filter Pills: Activos | Completados | Todos */}
      <div style={{
        display: 'flex',
        gap: '0.4rem',
        marginBottom: '1.25rem',
        alignItems: 'center',
        overflowX: 'auto',
        paddingBottom: '0.2rem'
      }}>
        {[
          { key: 'active', label: `Activos (${activeGoalsCount})` },
          { key: 'completed', label: `Completados (${completedGoalsCount})` },
          { key: 'all', label: 'Todos los estados' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusTab(tab.key as any)}
            style={{
              padding: '0.3rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              border: statusTab === tab.key ? '1px solid var(--accent-light)' : '1px solid transparent',
              background: statusTab === tab.key ? 'var(--surface-color)' : 'transparent',
              color: statusTab === tab.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontWeight: statusTab === tab.key ? 700 : 500,
              fontSize: '0.78rem',
              cursor: 'pointer',
              boxShadow: statusTab === tab.key ? 'var(--shadow-xs)' : 'none',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Goals List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
          Cargando registros...
        </div>
      ) : filteredGoals.length === 0 ? (
        <div style={{
          background: 'var(--surface-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '3rem 1.5rem',
          textAlign: 'center',
          border: '1px solid var(--accent-light)',
        }}>
          {typeTab === 'projects' ? (
            <FolderKanban size={48} style={{ color: '#3B82F6', margin: '0 auto 1rem', opacity: 0.6 }} />
          ) : (
            <PiggyBank size={48} style={{ color: '#10B981', margin: '0 auto 1rem', opacity: 0.6 }} />
          )}
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.5rem' }}>
            {statusTab === 'completed'
              ? 'No hay registros completados en esta sección'
              : (typeTab === 'projects' ? 'No tienes proyectos o cuentas activas' : 'No tienes fondos de ahorro activos')}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem' }}>
            {typeTab === 'projects'
              ? 'Crea un proyecto para registrar gastos continuos (reparaciones, vehículo, remodelaciones).'
              : 'Crea tu primer fondo de ahorro para comenzar a reservar dinero para tus metas.'}
          </p>
          <button
            onClick={() => { setEditingGoal(undefined); setShowGoalForm(true); }}
            style={{
              padding: '0.7rem 1.25rem',
              background: typeTab === 'projects' ? '#3B82F6' : 'var(--income-color)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            {typeTab === 'projects' ? 'Nuevo Proyecto' : 'Nuevo Fondo de Ahorro'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {filteredGoals.map((goal) => {
            const isProject = goal.type === 'project';
            const hasTarget = goal.target_amount != null && Number(goal.target_amount) > 0;
            const isOpenSaving = !isProject && !hasTarget;
            const target = hasTarget ? Number(goal.target_amount) : 0;
            const saved = calculateGoalSaved(goal);
            const progress = hasTarget ? Math.min((saved / target) * 100, 100) : 0;
            const isOverBudget = isProject && hasTarget && saved > target;
            const color = goal.color || (isProject ? '#3B82F6' : '#10B981');

            return (
              <div
                key={goal.id}
                onClick={() => setSelectedGoal(goal)}
                style={{
                  background: 'var(--surface-color)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.25rem',
                  border: '1px solid var(--accent-light)',
                  boxShadow: 'var(--shadow-sm)',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Accent top stripe */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  background: color,
                }} />

                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      margin: '0 0 0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      {goal.name}
                      {goal.is_completed && (
                        <CheckCircle2 size={16} style={{ color: '#10B981', flexShrink: 0 }} />
                      )}
                    </h3>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* Type badge */}
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: isProject ? '#3B82F6' : '#10B981',
                        background: isProject ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        {isProject ? <FolderKanban size={10} /> : <PiggyBank size={10} />}
                        {isProject ? 'Proyecto' : 'Ahorro'}
                      </span>
                      {isOpenSaving && (
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: '#10B981',
                          background: 'rgba(16, 185, 129, 0.12)',
                          padding: '0.15rem 0.5rem',
                          borderRadius: 'var(--radius-full)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          border: '1px solid rgba(16, 185, 129, 0.25)'
                        }}>
                          Fondo libre
                        </span>
                      )}

                      {goal.is_shared && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveShareModalItem({ id: goal.id, name: goal.name });
                          }}
                          style={{ display: 'inline-block' }}
                          title="Gestionar miembros"
                        >
                          <MemberAvatars members={goal.shared_members} size={20} />
                        </div>
                      )}
                      {goal.category && (
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: color,
                          background: `${color}18`,
                          padding: '0.15rem 0.5rem',
                          borderRadius: 'var(--radius-full)',
                        }}>
                          {goal.category}
                        </span>
                      )}
                      {goal.target_date && (
                        <span style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}>
                          <Clock size={11} />
                          {formatDate(goal.target_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    {isOpenSaving ? (
                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Total Ahorrado:
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: color }}>
                          {formatCurrency(saved, goal.currency)}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: color }}>
                          {formatCurrency(saved, goal.currency)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {hasTarget 
                            ? `de ${formatCurrency(target, goal.currency)} ${isProject ? '(estimado)' : ''}`
                            : `Invertido (${goal.deposits?.length || 0} pagos)`}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress bar or open account info */}
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
                        transition: 'width 0.5s ease',
                      }} />
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                    }}>
                      {isOverBudget ? (
                        <span style={{ color: '#F59E0B', fontWeight: 700 }}>
                          +{formatCurrency(saved - target, goal.currency)} sobre presupuesto
                        </span>
                      ) : (
                        <span>{progress.toFixed(0)}% {isProject ? 'del presupuesto' : 'completado'}</span>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: color, fontWeight: 600 }}>
                        <span>Ver detalles</span>
                        <ChevronRight size={14} />
                      </div>
                    </div>
                  </>
                ) : isProject ? (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.45rem 0.65rem',
                    background: 'var(--surface-muted)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <FolderKanban size={13} style={{ color }} />
                      Cuenta abierta · {goal.deposits?.length || 0} pagos acumulados
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: color, fontWeight: 600 }}>
                      <span>Ver detalles</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.45rem 0.65rem',
                    background: 'rgba(16, 185, 129, 0.08)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    border: '1px solid rgba(16, 185, 129, 0.2)'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#10B981', fontWeight: 600 }}>
                      <PiggyBank size={13} />
                      Fondo libre · Acumulando ahorro
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: color, fontWeight: 600 }}>
                      <span>Ver detalles</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                )}
              </div>
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
      {showDepositForm && selectedGoal && (
        <SavingDepositForm
          initialData={editingDeposit}
          goalName={selectedGoal.name}
          goalCurrency={selectedGoal.currency}
          goalTargetAmount={selectedGoal.target_amount != null ? Number(selectedGoal.target_amount) : null}
          goalCurrentSaved={calculateGoalSaved(selectedGoal)}
          goalColor={selectedGoal.color}
          goalType={selectedGoal.type || 'saving'}
          onSubmit={handleAddOrUpdateDeposit}
          onCancel={() => { setShowDepositForm(false); setEditingDeposit(undefined); }}
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
    </div>
  );
};

export default SavingGoals;
