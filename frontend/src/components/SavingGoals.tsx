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
  Users
} from 'lucide-react';
import type { SavingGoal, SavingGoalCreate, SavingGoalUpdate, SavingDepositCreate, ExchangeRates } from '../types';
import {
  getSavingGoals,
  createSavingGoal,
  updateSavingGoal,
  deleteSavingGoal,
  addSavingDeposit,
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

  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'all'>('active');
  const [displayCurrency, setDisplayCurrency] = useState<'usd' | 'bs' | 'eur' | 'usdt'>('usd');

  const [selectedGoal, setSelectedGoal] = useState<SavingGoal | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingGoal | undefined>(undefined);
  const [showDepositForm, setShowDepositForm] = useState(false);
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

  // Global totals across all goals
  const getSummaryAmounts = () => {
    const totalSaved = { usd: 0, bs: 0, eur: 0, usdt: 0 };
    const totalTarget = { usd: 0, bs: 0, eur: 0, usdt: 0 };

    goals.forEach(goal => {
      const targetConv = convertAmount(Number(goal.target_amount), goal.currency);
      totalTarget.usd += targetConv.usd;
      totalTarget.bs += targetConv.bs;
      totalTarget.eur += targetConv.eur;
      totalTarget.usdt += targetConv.usdt;

      if (goal.deposits && goal.deposits.length > 0) {
        goal.deposits.forEach(d => {
          if (d.amount_bs) {
            totalSaved.bs += Number(d.amount_bs);
            totalSaved.usd += Number(d.amount_usd || 0);
            totalSaved.eur += Number(d.amount_eur || 0);
            totalSaved.usdt += Number(d.amount_usdt || 0);
          } else {
            const depConv = convertAmount(Number(d.amount), d.currency);
            totalSaved.usd += depConv.usd;
            totalSaved.bs += depConv.bs;
            totalSaved.eur += depConv.eur;
            totalSaved.usdt += depConv.usdt;
          }
        });
      }
    });

    return { totalSaved, totalTarget };
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

  const handleSaveGoal = async (data: SavingGoalCreate | SavingGoalUpdate) => {
    try {
      setSubmitting(true);
      let saved: SavingGoal;
      if (editingGoal) {
        saved = await updateSavingGoal(editingGoal.id, data as SavingGoalUpdate);
        showToast('Fondo actualizado exitosamente');
      } else {
        saved = await createSavingGoal(data as SavingGoalCreate);
        showToast('¡Fondo de ahorro creado! 🐷');
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
      showToast(typeof detail === 'string' ? detail : 'Error al guardar fondo');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddDeposit = async (data: SavingDepositCreate) => {
    if (!selectedGoal) return;
    try {
      setSubmitting(true);
      const updated = await addSavingDeposit(selectedGoal.id, data);
      setSelectedGoal(updated);
      setShowDepositForm(false);
      await fetchData();

      if (updated.is_completed) {
        showToast('🎉 ¡Felicidades! Fondo completado al 100%');
      } else {
        showToast('Aporte registrado correctamente');
      }
    } catch (error) {
      console.error('Error adding deposit:', error);
      showToast('Error al registrar aporte');
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
      showToast('Fondo eliminado');
    } catch (error) {
      console.error('Error deleting goal:', error);
      showToast('Error al eliminar fondo');
    } finally {
      setSubmitting(false);
      setConfirmDelete({ isOpen: false });
    }
  };

  const handleDeleteDeposit = async (depositId: string) => {
    if (!selectedGoal) return;
    try {
      setSubmitting(true);
      const updated = await deleteSavingDeposit(depositId);
      setSelectedGoal(updated);
      await fetchData();
      showToast('Aporte eliminado');
    } catch (error) {
      console.error('Error deleting deposit:', error);
      showToast('Error al eliminar aporte');
    } finally {
      setSubmitting(false);
      setConfirmDelete({ isOpen: false });
    }
  };

  // Filtered goals
  const filteredGoals = goals.filter(g => {
    if (activeTab === 'active') return !g.is_completed && g.is_active;
    if (activeTab === 'completed') return g.is_completed;
    return true;
  });

  const activeGoalsCount = goals.filter(g => !g.is_completed && g.is_active).length;
  const completedGoalsCount = goals.filter(g => g.is_completed).length;

  // VIEW: Detail View of a Single Goal
  if (selectedGoal && !showGoalForm && !showDepositForm) {
    const saved = calculateGoalSaved(selectedGoal);
    const target = Number(selectedGoal.target_amount);
    const progress = Math.min((saved / (target || 1)) * 100, 100);
    const remaining = Math.max(target - saved, 0);
    const color = selectedGoal.color || '#10B981';

    const savedConv = convertAmount(saved, selectedGoal.currency);
    const targetConv = convertAmount(target, selectedGoal.currency);
    const remainingConv = convertAmount(remaining, selectedGoal.currency);

    return (
      <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
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
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingTop: '0.5rem' }}>
          <button
            onClick={() => setSelectedGoal(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '0.5rem',
              borderRadius: 'var(--radius-full)',
            }}
          >
            <ArrowLeft size={22} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              {selectedGoal.name}
            </h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Fondo de Ahorro • Aportes
            </span>
          </div>
          <button
            onClick={() => { setEditingGoal(selectedGoal); setShowGoalForm(true); }}
            disabled={selectedGoal.is_shared && selectedGoal.my_role === 'member'}
            title={selectedGoal.is_shared && selectedGoal.my_role === 'member' ? "Solo administradores pueden editar el fondo" : "Editar fondo"}
            style={{
              padding: '0.5rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-color)',
              color: (selectedGoal.is_shared && selectedGoal.my_role === 'member') ? 'var(--text-tertiary)' : 'var(--text-secondary)',
              border: '1px solid var(--accent-light)',
              cursor: (selectedGoal.is_shared && selectedGoal.my_role === 'member') ? 'not-allowed' : 'pointer',
              opacity: (selectedGoal.is_shared && selectedGoal.my_role === 'member') ? 0.4 : 1,
            }}
          >
            <Edit3 size={18} />
          </button>
          <button
            onClick={() => setConfirmDelete({
              isOpen: true,
              goalId: selectedGoal.id,
              title: '¿Eliminar Fondo?',
              message: selectedGoal.is_shared
                ? `Este fondo está compartido con tus panas (${selectedGoal.shared_members?.length || 2} miembros). Al eliminarlo, también se eliminará para todos y se perderá el historial sincronizado.`
                : 'Se eliminará el fondo de ahorro y todo su historial de aportes.',
            })}
            disabled={selectedGoal.is_shared && selectedGoal.my_role === 'member'}
            title={selectedGoal.is_shared && selectedGoal.my_role === 'member' ? "Solo administradores pueden eliminar el fondo" : "Eliminar fondo"}
            style={{
              padding: '0.5rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-color)',
              color: (selectedGoal.is_shared && selectedGoal.my_role === 'member') ? 'var(--text-tertiary)' : 'var(--expense-color)',
              border: '1px solid var(--expense-bg)',
              cursor: (selectedGoal.is_shared && selectedGoal.my_role === 'member') ? 'not-allowed' : 'pointer',
              opacity: (selectedGoal.is_shared && selectedGoal.my_role === 'member') ? 0.4 : 1,
            }}
          >
            <Trash2 size={18} />
          </button>
        </header>

        {/* Goal Hero Card */}
        <div 
          className="soft-card"
          onClick={cycleDisplayCurrency}
          style={{
            background: 'var(--surface-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
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
                title="Gestionar miembros del fondo de ahorro"
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
                Completado 🎉
              </span>
            )}
          </div>

          {/* Amounts display */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>
                Ahorrado actualmente
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
                Monto Objetivo
              </span>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                {formatSummaryAmount(targetConv)}
              </span>
              {displayCurrency !== (selectedGoal.currency.toLowerCase().startsWith('usd') ? 'usd' : selectedGoal.currency.toLowerCase().startsWith('eur') ? 'eur' : selectedGoal.currency.toLowerCase()) && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'block' }}>
                  ≈ {formatCurrency(target, selectedGoal.currency)}
                </span>
              )}
            </div>
          </div>

          {/* Progress bar */}
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
              background: color,
              borderRadius: 'var(--radius-full)',
              transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>{progress.toFixed(1)}% alcanzado</span>
            <span>
              {remaining > 0 ? `Faltan ${formatSummaryAmount(remainingConv)}` : '¡Objetivo superado!'}
            </span>
          </div>

          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.5rem', textAlign: 'center' }}>
            Toca para cambiar moneda ({displayCurrency.toUpperCase()})
          </div>

          {/* Shared breakdown if applicable */}
          {selectedGoal.is_shared && saved > 0 && (() => {
            const palette = [color, '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];
            const byContributor: Record<string, { amount: number; isMe: boolean }> = {};

            selectedGoal.deposits.forEach(d => {
              let depAmount = Number(d.amount);
              if (d.currency !== selectedGoal.currency) {
                if (selectedGoal.currency === 'USD_BCV' && d.amount_usd) depAmount = Number(d.amount_usd);
                else if (selectedGoal.currency === 'BS' && d.amount_bs) depAmount = Number(d.amount_bs);
                else if (selectedGoal.currency === 'EUR_BCV' && d.amount_eur) depAmount = Number(d.amount_eur);
                else if (selectedGoal.currency === 'USDT' && d.amount_usdt) depAmount = Number(d.amount_usdt);
                else if (selectedGoal.currency === 'USD_CASH' && d.amount_usd) depAmount = Number(d.amount_usd);
              }

              const isMe = !d.paid_by_name;
              const key = isMe ? 'Tú' : d.paid_by_name!;
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
                    Aportes del fondo conjunto
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

          {/* Action button */}
          <button
            onClick={() => setShowDepositForm(true)}
            style={{
              width: '100%',
              marginTop: '1.25rem',
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
            Hacer Aporte
          </button>
        </div>

        {/* Deposit History */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Historial de Aportes ({selectedGoal.deposits.length})
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
              <PiggyBank size={36} style={{ color: color, margin: '0 auto 0.75rem', opacity: 0.8 }} />
              <p style={{ margin: 0, fontWeight: 600 }}>Aún no hay aportes registrados</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                Comienza aportando para acercarte a tu objetivo.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[...selectedGoal.deposits]
                .sort((a, b) => new Date(b.deposit_date).getTime() - new Date(a.deposit_date).getTime())
                .map((d) => (
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
                              background: d.paid_by_name ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                              color: d.paid_by_name ? '#3B82F6' : '#10B981',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}>
                              <Users size={10} />
                              {d.paid_by_name ? `Aporte de ${d.paid_by_name}` : 'Aporte tuyo'}
                            </span>
                          )}
                          {d.note && <span>• {d.note}</span>}
                          {d.create_expense && <span style={{ color: 'var(--income-color)' }}>• Reflejado en gastos</span>}
                        </div>
                      </div>
                    </div>

                    {d.can_edit !== false && (
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
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
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
              <span>Ahorros</span>
              <PiggyBank size={24} style={{ color: '#10B981' }} />
            </h1>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Gestiona tus fondos de ahorro y reserva
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
          <span>Nuevo Fondo de Ahorro</span>
        </button>
      </header>

      {/* Summary Card */}
      {(() => {
        const { totalSaved, totalTarget } = getSummaryAmounts();
        const totalTargetVal = totalTarget[displayCurrency] || 0;
        const totalSavedVal = totalSaved[displayCurrency] || 0;
        const globalProgress = totalTargetVal > 0 ? Math.min((totalSavedVal / totalTargetVal) * 100, 100) : 0;

        return (
          <div
            className="soft-card"
            onClick={cycleDisplayCurrency}
            style={{ 
              marginBottom: '1.5rem', 
              padding: '1.5rem', 
              cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, var(--surface-color) 100%)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Ahorrado Acumulado
              </span>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-full)',
                background: 'rgba(16, 185, 129, 0.1)', color: '#10B981',
                fontSize: '0.75rem', fontWeight: 600,
                whiteSpace: 'nowrap', flexShrink: 0
              }}>
                <PiggyBank size={14} />
                {activeGoalsCount} activos
              </div>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {loading ? '...' : formatSummaryAmount(totalSaved)}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.25rem', marginBottom: totalTargetVal > 0 ? '0.75rem' : '0' }}>
              Toca para cambiar moneda
            </div>

            {totalTargetVal > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {completedGoalsCount} de {goals.length} fondos completados
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10B981' }}>
                    {Math.round(globalProgress)}%
                  </span>
                </div>
                <div style={{ width: '100%', background: 'var(--surface-muted)', borderRadius: 'var(--radius-full)', height: '6px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    background: '#10B981', 
                    width: `${Math.min(globalProgress, 100)}%`,
                    borderRadius: 'var(--radius-full)',
                    transition: 'width 0.5s ease'
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                  <span>Meta total: {formatSummaryAmount(totalTarget)}</span>
                  <span>{completedGoalsCount} logrados</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        background: 'var(--surface-muted)',
        padding: '0.3rem',
        borderRadius: 'var(--radius-md)',
        marginBottom: '1.25rem',
        gap: '0.25rem',
      }}>
        {[
          { key: 'active', label: `Activos (${activeGoalsCount})` },
          { key: 'completed', label: `Completados (${completedGoalsCount})` },
          { key: 'all', label: `Todos (${goals.length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              flex: 1,
              padding: '0.5rem',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: activeTab === tab.key ? 'var(--surface-color)' : 'transparent',
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.key ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: activeTab === tab.key ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Goals List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
          Cargando fondos de ahorro...
        </div>
      ) : filteredGoals.length === 0 ? (
        <div style={{
          background: 'var(--surface-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '3rem 1.5rem',
          textAlign: 'center',
          border: '1px solid var(--accent-light)',
        }}>
          <PiggyBank size={48} style={{ color: '#10B981', margin: '0 auto 1rem', opacity: 0.6 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.5rem' }}>
            {activeTab === 'completed' ? 'Aún no has completado fondos de ahorro' : 'No tienes fondos de ahorro activos'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem' }}>
            Crea tu primer fondo de ahorro para comenzar a reservar dinero para tus metas.
          </p>
          <button
            onClick={() => { setEditingGoal(undefined); setShowGoalForm(true); }}
            style={{
              padding: '0.7rem 1.25rem',
              background: 'var(--income-color)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Nuevo Fondo de Ahorro
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {filteredGoals.map((goal) => {
            const saved = calculateGoalSaved(goal);
            const target = Number(goal.target_amount);
            const progress = Math.min((saved / (target || 1)) * 100, 100);
            const color = goal.color || '#10B981';

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
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {goal.is_shared && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveShareModalItem({ id: goal.id, name: goal.name });
                          }}
                          style={{ display: 'inline-block' }}
                          title="Gestionar miembros del fondo de ahorro"
                        >
                          <MemberAvatars members={goal.shared_members} size={22} />
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
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: color }}>
                      {formatCurrency(saved, goal.currency)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      de {formatCurrency(target, goal.currency)}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
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
                    background: color,
                    borderRadius: 'var(--radius-full)',
                    transition: 'width 0.5s ease',
                  }} />
                </div>

                {/* Footer info */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}>
                  <span>{progress.toFixed(0)}% completado</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: color, fontWeight: 600 }}>
                    <span>Ver detalles</span>
                    <ChevronRight size={14} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Crear / Editar Fondo de Ahorro */}
      {showGoalForm && (
        <SavingGoalForm
          initialData={editingGoal}
          onSubmit={handleSaveGoal}
          onCancel={() => { setShowGoalForm(false); setEditingGoal(undefined); }}
          loading={submitting}
        />
      )}

      {/* Modal: Aporte */}
      {showDepositForm && selectedGoal && (
        <SavingDepositForm
          goalName={selectedGoal.name}
          goalCurrency={selectedGoal.currency}
          goalTargetAmount={Number(selectedGoal.target_amount)}
          goalCurrentSaved={calculateGoalSaved(selectedGoal)}
          goalColor={selectedGoal.color}
          onSubmit={handleAddDeposit}
          onCancel={() => setShowDepositForm(false)}
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
