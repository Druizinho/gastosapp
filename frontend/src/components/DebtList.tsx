import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Edit3,
  Wallet,
  Calendar,
  AlertCircle,
  CheckCircle,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
  Tag,
  LogOut
} from 'lucide-react';
import type {
  Debt,
  DebtCreate,
  DebtUpdate,
  DebtPayment,
  DebtPaymentCreate,
  DebtPaymentUpdate,
  ExchangeRates,
  MainCurrencyPreference
} from '../types';
import {
  getDebts,
  createDebt,
  updateDebt,
  addDebtPayment,
  updateDebtPayment,
  deleteDebt,
  getRates,
  deleteDebtPayment,
  removeShareMember,
  getShareByEntity
} from '../api';
import DebtForm from './DebtForm';
import DebtPaymentForm from './DebtPaymentForm';
import ConfirmModal from './ConfirmModal';
import { MemberAvatars, ShareMembersModal } from './panas';
import { LeaveShareModal } from './panas/LeaveShareModal';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { LocalCategoryModal } from './panas/LocalCategoryModal';
import { useCategories } from '../context/CategoriesContext';
import { resolveCategoryVisuals } from '../utils/categoryVisuals';
import ListCard from './ListCard';
import ListCardBottomSheet from './ListCardBottomSheet';
import { useCurrencyPreference } from '../context/CurrencyPreferenceContext';
import {
  formatListCardAmounts,
  formatCurrencyAmount,
  convertItemAmountToMainCurrency,
  isSameCurrency,
  toNumeric
} from '../utils/currencyFormat';
import { PageHeader } from './ui/PageHeader';
import { SummaryHeroCard } from './ui/SummaryHeroCard';
import { SegmentedTabs } from './ui/SegmentedTabs';
import { EmptyState } from './ui/EmptyState';
import { CurrencyBreakdownCard } from './ui/CurrencyBreakdownCard';
import { useToast } from './ui/Toast';
import { AttributionBadge } from './ui/AttributionBadge';
import { SkeletonList } from './ui/Skeleton';

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

interface DebtListProps {
  type?: 'all' | 'owed' | 'receivable';
  onBack: () => void;
}

const DebtList: React.FC<DebtListProps> = ({ type: propType, onBack }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get('tab') as 'owed' | 'receivable' | null;
  const initialTab: 'all' | 'owed' | 'receivable' = queryTab || (propType === 'owed' || propType === 'receivable' ? propType : 'all');
  const [activeTab, setActiveTab] = useState<'all' | 'owed' | 'receivable'>(initialTab);
  const { categories } = useCategories();
  const { mainCurrency, setMainCurrency } = useCurrencyPreference();
  const { user } = useAuth();
  const toast = useToast();

  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterSettled, setFilterSettled] = useState(false);
  const [rates, setRates] = useState<ExchangeRates | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | undefined>(undefined);

  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [selectedDebtForSheet, setSelectedDebtForSheet] = useState<Debt | null>(null);
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
  const [editingPayment, setEditingPayment] = useState<DebtPayment | undefined>(undefined);
  const [selectedPaymentForSheet, setSelectedPaymentForSheet] = useState<DebtPayment | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; debtId?: string; paymentId?: string }>({ isOpen: false });
  const [activeShareModalItem, setActiveShareModalItem] = useState<{ id: string; name: string } | null>(null);
  const [leaveDebtModal, setLeaveDebtModal] = useState<{ isOpen: boolean; debt: Debt | null }>({ isOpen: false, debt: null });
  const [leaveDebtLoading, setLeaveDebtLoading] = useState(false);
  const [localCategoryModal, setLocalCategoryModal] = useState<{
    isOpen: boolean;
    debt: Debt | null;
  }>({ isOpen: false, debt: null });

  const handleConfirmLeaveDebt = async () => {
    const debt = leaveDebtModal.debt;
    if (!debt) return;
    setLeaveDebtLoading(true);
    try {
      let myUserId = user?.id;
      if (!myUserId) {
        myUserId = debt.shared_members?.find((m) => m.is_me)?.user_id;
      }
      if (!myUserId) {
        const { data: { user: supaUser } } = await supabase.auth.getUser();
        myUserId = supaUser?.id;
      }
      if (!myUserId) {
        throw new Error('No se pudo identificar tu ID de usuario');
      }

      let shareId = debt.share_id;
      if (!shareId) {
        const shareData = await getShareByEntity(debt.id);
        shareId = shareData.share_id;
      }
      if (!shareId) {
        throw new Error('No se encontró el identificador compartido');
      }

      await removeShareMember(shareId, myUserId);
      toast.success('Te has desvinculado de la deuda compartida');
      setDebts((prev) => prev.filter((d) => d.id !== debt.id));
      if (selectedDebt && selectedDebt.id === debt.id) {
        setSelectedDebt(null);
      }
      setSelectedDebtForSheet(null);
      setLeaveDebtModal({ isOpen: false, debt: null });
    } catch (err: any) {
      console.error('Error al desvincularse de la deuda:', err);
      toast.error(err?.response?.data?.detail || err?.message || 'Error al desvincularse de la deuda');
    } finally {
      setLeaveDebtLoading(false);
    }
  };

  const handleCategoryUpdated = async (newCategory: string) => {
    if (!localCategoryModal.debt) return;
    const debtId = localCategoryModal.debt.id;
    setDebts((prev) =>
      prev.map((d) => (d.id === debtId ? { ...d, category: newCategory } : d))
    );
    if (selectedDebt && selectedDebt.id === debtId) {
      setSelectedDebt((prev) => (prev ? { ...prev, category: newCategory } : null));
    }
    await fetchDebts(true);
    toast.success('Categoría actualizada exitosamente');
  };

  const handleTabChange = (tab: 'all' | 'owed' | 'receivable') => {
    setActiveTab(tab);
    if (tab === 'all') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };

  const fetchDebts = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [debtsData, ratesData] = await Promise.all([
        getDebts(undefined, filterSettled).catch(() =>
          Promise.all([getDebts('owed', filterSettled), getDebts('receivable', filterSettled)])
            .then(([owed, rec]) => [...owed, ...rec])
        ),
        getRates()
      ]);
      setDebts(debtsData);
      setRates(ratesData);
      setSelectedDebt(prev => {
        if (!prev) return null;
        const found = debtsData.find(d => d.id === prev.id);
        return found || prev;
      });
      setSelectedDebtForSheet(prev => {
        if (!prev) return null;
        return debtsData.find(d => d.id === prev.id) || prev;
      });
    } catch (error) {
      console.error('Error fetching debts:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filterSettled]);

  useEffect(() => {
    fetchDebts();
  }, [fetchDebts]);

  const handleCreateOrUpdate = async (data: DebtCreate | DebtUpdate) => {
    try {
      setSubmitting(true);
      let savedDebt: Debt;
      if (editingDebt) {
        savedDebt = await updateDebt(editingDebt.id, data as DebtUpdate);
      } else {
        savedDebt = await createDebt(data as DebtCreate);
      }
      setShowForm(false);
      setEditingDebt(undefined);

      setDebts(prev => {
        const exists = prev.some(d => d.id === savedDebt.id);
        if (exists) {
          return prev.map(d => d.id === savedDebt.id ? savedDebt : d);
        }
        return [savedDebt, ...prev];
      });
      setSelectedDebt(prev => (prev?.id === savedDebt.id ? savedDebt : prev));
      setSelectedDebtForSheet(prev => (prev?.id === savedDebt.id ? savedDebt : prev));

      await fetchDebts(true);
      toast.success('Guardado exitosamente');
    } catch (error: any) {
      console.error('Error saving debt:', error);
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al guardar la deuda');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddOrUpdatePayment = async (data: DebtPaymentCreate | DebtPaymentUpdate) => {
    const debtToPay = payingDebt || selectedDebt;
    if (!debtToPay) return;
    try {
      setSubmitting(true);
      let updatedDebt: Debt;
      if (editingPayment) {
        updatedDebt = await updateDebtPayment(editingPayment.id, data as DebtPaymentUpdate);
      } else {
        updatedDebt = await addDebtPayment(debtToPay.id, data as DebtPaymentCreate);
      }
      setDebts(prev => prev.map(d => d.id === updatedDebt.id ? updatedDebt : d));
      setSelectedDebt(updatedDebt);
      setSelectedDebtForSheet(prev => (prev?.id === updatedDebt.id ? updatedDebt : prev));
      setPayingDebt(null);
      setEditingPayment(undefined);
      await fetchDebts(true);

      if (editingPayment) {
        toast.success('Abono actualizado');
      } else if (updatedDebt.is_settled) {
        toast.success('🎉 ¡Deuda completamente pagada!');
      } else {
        toast.success('Abono registrado');
      }
    } catch (error: any) {
      console.error('Error saving payment:', error);
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al guardar el abono');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDebt = async (id: string) => {
    try {
      setSubmitting(true);
      await deleteDebt(id);
      setDebts(prev => prev.filter(d => d.id !== id));
      if (selectedDebt?.id === id) setSelectedDebt(null);
      if (selectedDebtForSheet?.id === id) setSelectedDebtForSheet(null);
      await fetchDebts(true);
      toast.success('Deuda eliminada');
    } catch (error: any) {
      console.error('Error deleting debt:', error);
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al eliminar la deuda');
    } finally {
      setSubmitting(false);
      setConfirmDelete({ isOpen: false });
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    try {
      setSubmitting(true);
      const updatedDebt = await deleteDebtPayment(paymentId);
      setDebts(prev => prev.map(d => d.id === updatedDebt.id ? updatedDebt : d));
      setSelectedDebt(updatedDebt);
      setSelectedDebtForSheet(prev => (prev?.id === updatedDebt.id ? updatedDebt : prev));
      await fetchDebts(true);
      toast.success('Abono eliminado');
    } catch (error: any) {
      console.error('Error deleting payment:', error);
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al eliminar el abono');
    } finally {
      setSubmitting(false);
      setConfirmDelete({ isOpen: false });
    }
  };

  const getPaymentAmountInDebtCurrency = (pay: DebtPayment, debtCurrency: string) => {
    if (pay.currency === debtCurrency) return Number(pay.amount);
    if (debtCurrency === 'USD_BCV' && pay.amount_usd != null) return Number(pay.amount_usd);
    if (debtCurrency === 'USD_CASH') {
      const payInBs = pay.amount_bs != null && !isNaN(Number(pay.amount_bs))
        ? Number(pay.amount_bs)
        : convertItemAmountToMainCurrency({ amount: Number(pay.amount), currency: pay.currency }, 'BS', rates);
      const rUsd = toNumeric(rates?.usd_bs);
      const rEur = toNumeric(rates?.eur_bs);
      const rUsdt = toNumeric(rates?.usdt_bs);
      const cashRate = Math.max(rUsd, rEur, rUsdt) || (rUsd > 0 ? rUsd : 1);
      return cashRate > 0 ? payInBs / cashRate : 0;
    }
    if (debtCurrency === 'BS' && pay.amount_bs != null) return Number(pay.amount_bs);
    if (debtCurrency === 'EUR_BCV' && pay.amount_eur != null) return Number(pay.amount_eur);
    if (debtCurrency === 'USDT' && pay.amount_usdt != null) return Number(pay.amount_usdt);
    const payInBs = convertItemAmountToMainCurrency({ amount: Number(pay.amount), currency: pay.currency, amount_bs: pay.amount_bs }, 'BS', rates);
    const debtOneUnitInBs = convertItemAmountToMainCurrency({ amount: 1, currency: debtCurrency }, 'BS', rates);
    return debtOneUnitInBs > 0 ? payInBs / debtOneUnitInBs : 0;
  };

  const calculatePaid = (debt: Debt) => {
    return debt.payments.reduce((acc, pay) => acc + getPaymentAmountInDebtCurrency(pay, debt.currency), 0);
  };

  const cycleDisplayCurrency = () => {
    const order: MainCurrencyPreference[] = ['USD', 'BS', 'EUR', 'USDT'];
    const idx = order.indexOf(mainCurrency);
    setMainCurrency(order[(idx + 1) % order.length]);
  };

  const owedCount = debts.filter(d => d.type === 'owed').length;
  const recCount = debts.filter(d => d.type === 'receivable').length;
  const displayedDebts = debts.filter(d => activeTab === 'all' || d.type === activeTab);

  const getNetMetrics = () => {
    let owedInMain = 0;
    let recInMain = 0;

    debts.forEach(debt => {
      let amountToSum = 0;
      if (filterSettled) {
        amountToSum = Number(debt.total_amount);
      } else {
        const remaining = Math.max(Number(debt.total_amount) - calculatePaid(debt), 0);
        if (remaining <= 0) return;
        amountToSum = remaining;
      }

      const converted = convertItemAmountToMainCurrency(
        { amount: amountToSum, currency: debt.currency },
        mainCurrency,
        rates
      );

      if (debt.type === 'owed') {
        owedInMain += converted;
      } else {
        recInMain += converted;
      }
    });

    const netInMain = recInMain - owedInMain;
    const isNetPositive = netInMain >= 0;

    const netFormatted = `${netInMain >= 0 ? '+' : '-'}${formatCurrencyAmount(Math.abs(netInMain), mainCurrency)}`;
    const owedFormatted = formatCurrencyAmount(owedInMain, mainCurrency);
    const recFormatted = formatCurrencyAmount(recInMain, mainCurrency);

    return {
      netFormatted,
      owedFormatted,
      recFormatted,
      isNetPositive,
    };
  };

  // VISTA: Detalle de Deuda
  if (selectedDebt) {
    const isOwed = selectedDebt.type === 'owed';
    const themeColor = isOwed ? 'var(--expense-color)' : 'var(--income-color)';
    const accentHex = isOwed ? '#EF4444' : '#10B981';
    const paid = calculatePaid(selectedDebt);
    const remaining = Math.max(Number(selectedDebt.total_amount) - paid, 0);
    const progress = Math.min((paid / Number(selectedDebt.total_amount)) * 100, 100);
    const isMember = selectedDebt.is_shared && selectedDebt.my_role === 'member';

    const remainingInMain = convertItemAmountToMainCurrency(
      { amount: remaining, currency: selectedDebt.currency },
      mainCurrency,
      rates
    );
    const paidInMain = convertItemAmountToMainCurrency(
      { amount: paid, currency: selectedDebt.currency },
      mainCurrency,
      rates
    );
    const totalInMain = convertItemAmountToMainCurrency(
      { amount: Number(selectedDebt.total_amount), currency: selectedDebt.currency },
      mainCurrency,
      rates
    );

    const detailRightAction = (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <button
          type="button"
          onClick={() => setLocalCategoryModal({ isOpen: true, debt: selectedDebt })}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-full, 9999px)',
            background: 'var(--surface-color)',
            border: '1px solid var(--accent-light, rgba(0,0,0,0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'transform 150ms ease-out',
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          title="Personalizar mi categoría"
        >
          <Tag size={16} />
        </button>
        <button
          type="button"
          onClick={() => { setEditingDebt(selectedDebt); setShowForm(true); }}
          disabled={isMember}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-full, 9999px)',
            background: 'var(--surface-color)',
            border: '1px solid var(--accent-light, rgba(0,0,0,0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isMember ? 'var(--text-tertiary)' : 'var(--text-secondary)',
            cursor: isMember ? 'not-allowed' : 'pointer',
            opacity: isMember ? 0.4 : 1,
            transition: 'transform 150ms ease-out',
          }}
          title={isMember ? "Solo administradores pueden editar la deuda" : "Editar deuda"}
        >
          <Edit3 size={16} />
        </button>
        {isMember ? (
          <button
            type="button"
            onClick={() => setLeaveDebtModal({ isOpen: true, debt: selectedDebt })}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-full, 9999px)',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--expense-color)',
              cursor: 'pointer',
              transition: 'transform 150ms ease-out',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            title="Desvincularme de la deuda"
          >
            <LogOut size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete({ isOpen: true, debtId: selectedDebt.id })}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-full, 9999px)',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--expense-color)',
              cursor: 'pointer',
              transition: 'transform 150ms ease-out',
            }}
            title="Eliminar deuda"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    );

    return (
      <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
        <PageHeader
          title={selectedDebt.concept}
          subtitle={selectedDebt.counterpart ? (isOwed ? `A: ${selectedDebt.counterpart}` : `De: ${selectedDebt.counterpart}`) : 'Detalle de Deuda'}
          onBack={() => setSelectedDebt(null)}
          rightAction={detailRightAction}
        />

        <SummaryHeroCard
          eyebrow={isOwed ? 'Saldo por Pagar' : 'Saldo por Cobrar'}
          badgeText={selectedDebt.is_settled || remaining <= 0 ? 'Liquidada' : (isOwed ? 'Debes' : 'Te deben')}
          badgeIcon={selectedDebt.is_settled || remaining <= 0 ? <CheckCircle size={12} /> : (isOwed ? <TrendingDown size={12} /> : <TrendingUp size={12} />)}
          mainAmount={formatCurrencyAmount(remainingInMain, mainCurrency)}
          mainAmountColor={remaining <= 0 || selectedDebt.is_settled ? 'var(--income-color)' : themeColor}
          statusSubtext={selectedDebt.is_settled || remaining <= 0 ? 'Deuda completamente liquidada' : (isOwed ? `Acreedor: ${selectedDebt.counterpart}` : `Deudor: ${selectedDebt.counterpart}`)}
          currencyHintText={!isSameCurrency(selectedDebt.currency, mainCurrency) ? `Orig: ${formatCurrency(remaining, selectedDebt.currency)} · Alternar (${mainCurrency})` : `Toca para alternar (${mainCurrency})`}
          onCycleCurrency={cycleDisplayCurrency}
          accentColor={accentHex}
          metrics={[
            {
              label: 'TOTAL',
              value: formatCurrencyAmount(totalInMain, mainCurrency),
              subtext: !isSameCurrency(selectedDebt.currency, mainCurrency) ? formatCurrency(Number(selectedDebt.total_amount), selectedDebt.currency) : undefined,
              valueColor: 'var(--text-primary)',
            },
            {
              label: 'ABONADO',
              value: formatCurrencyAmount(paidInMain, mainCurrency),
              subtext: !isSameCurrency(selectedDebt.currency, mainCurrency) ? formatCurrency(paid, selectedDebt.currency) : undefined,
              valueColor: 'var(--income-color)',
            },
            {
              label: 'RESTANTE',
              value: formatCurrencyAmount(remainingInMain, mainCurrency),
              subtext: !isSameCurrency(selectedDebt.currency, mainCurrency) ? formatCurrency(remaining, selectedDebt.currency) : undefined,
              valueColor: remaining > 0 ? themeColor : 'var(--income-color)',
            },
          ]}
          progress={{
            percent: progress,
            leftLabel: 'Progreso del pago',
            rightLabel: `${Math.round(progress)}%`,
            color: (remaining <= 0 || selectedDebt.is_settled) ? 'var(--income-color)' : accentHex,
          }}
        >
          {selectedDebt.is_shared && (
            <div 
              onClick={(e) => {
                e.stopPropagation();
                setActiveShareModalItem({ id: selectedDebt.id, name: selectedDebt.concept });
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6',
                padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-full)',
                fontSize: '0.78rem', fontWeight: 600, marginTop: '1rem',
                border: '1px solid rgba(59, 130, 246, 0.25)', cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Gestionar miembros de la deuda"
            >
              <MemberAvatars members={selectedDebt.shared_members} size={20} />
              <span>Gestionar panas ({selectedDebt.shared_members?.length || 2})</span>
            </div>
          )}

          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.85rem' }}
          >
            {selectedDebt.category ? (() => {
              const catObj = categories.find(c => c.name.toLowerCase() === selectedDebt.category?.toLowerCase());
              const { IconComponent, hexColor } = resolveCategoryVisuals(catObj, selectedDebt.category);
              return (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setLocalCategoryModal({ isOpen: true, debt: selectedDebt });
                  }}
                  role="button"
                  tabIndex={0}
                  title="Personalizar mi categoría"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 'var(--radius-full)',
                    background: `${hexColor}18`,
                    border: `1px solid ${hexColor}35`,
                    color: hexColor,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'transform 150ms ease-out',
                  }}
                  onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                  onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <IconComponent size={12} />
                  <span>{selectedDebt.category}</span>
                  <Tag size={10} style={{ opacity: 0.7 }} />
                </div>
              );
            })() : (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setLocalCategoryModal({ isOpen: true, debt: selectedDebt });
                }}
                role="button"
                tabIndex={0}
                title="Personalizar mi categoría"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--surface-muted)',
                  border: '1px dashed var(--border-color)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'transform 150ms ease-out',
                }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <Tag size={12} />
                <span>Mi categoría</span>
              </div>
            )}

            {selectedDebt.start_date && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <Calendar size={12} /> Desde {formatDate(selectedDebt.start_date)}
              </span>
            )}

            {selectedDebt.due_date && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                · Vence {formatDate(selectedDebt.due_date)}
              </span>
            )}
          </div>

          {(remaining <= 0 || selectedDebt.is_settled) && (
            <div 
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'rgba(16, 185, 129, 0.1)', color: '#10B981',
                padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
                fontSize: '0.88rem', fontWeight: 600, textAlign: 'center',
                marginTop: '1rem', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '0.5rem'
              }}
            >
              <CheckCircle size={16} />
              <span>¡Deuda completamente liquidada!</span>
            </div>
          )}

          {selectedDebt.is_shared && paid > 0 && (() => {
            const palette = [accentHex, '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];
            const byContributor: Record<string, { amount: number; isMe: boolean }> = {};
            const myUserId = selectedDebt.shared_members?.find(m => m.is_me)?.user_id;

            selectedDebt.payments.forEach(p => {
              const depAmount = getPaymentAmountInDebtCurrency(p, selectedDebt.currency);
              const isMe = myUserId ? p.paid_by_user_id === myUserId : !p.paid_by_name;
              const key = isMe ? 'Tú' : (p.paid_by_name || 'Miembro');
              if (!byContributor[key]) {
                byContributor[key] = { amount: 0, isMe };
              }
              byContributor[key].amount += depAmount;
            });

            const entries = Object.entries(byContributor);
            const memberStats = entries.map(([name, data], idx) => ({
              name,
              amount: data.amount,
              pct: paid > 0 ? Math.round((data.amount / paid) * 100) : 0,
              color: palette[idx % palette.length],
              isMe: data.isMe
            }));

            return (
              <div 
                onClick={(e) => e.stopPropagation()}
                style={{
                  marginTop: '1rem',
                  padding: '0.85rem 1rem',
                  background: 'var(--surface-muted, rgba(0,0,0,0.03))',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                  border: '1px solid var(--border-color, rgba(0, 0, 0, 0.07))'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Users size={14} style={{ color: '#3B82F6' }} />
                    Abonos por integrante
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    Total: {formatCurrency(paid, selectedDebt.currency)}
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
                      <span>●</span> {stat.name}: {formatCurrency(stat.amount, selectedDebt.currency)} ({stat.pct}%)
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          <div style={{ marginTop: '1rem' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPayingDebt(selectedDebt)}
              disabled={remaining <= 0 || selectedDebt.is_settled}
              style={{
                width: '100%',
                padding: '0.85rem',
                borderRadius: 'var(--radius-md)',
                background: (remaining <= 0 || selectedDebt.is_settled) ? 'var(--surface-muted)' : themeColor,
                color: (remaining <= 0 || selectedDebt.is_settled) ? 'var(--text-tertiary)' : 'white',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.92rem',
                cursor: (remaining <= 0 || selectedDebt.is_settled) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: (remaining <= 0 || selectedDebt.is_settled) ? 'none' : `0 4px 14px ${accentHex}44`,
                transition: 'transform 150ms ease-out',
              }}
              onMouseDown={(e) => {
                if (remaining > 0 && !selectedDebt.is_settled) {
                  e.currentTarget.style.transform = 'scale(0.96)';
                }
              }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <Plus size={18} />
              <span>Registrar Abono</span>
            </button>
          </div>
        </SummaryHeroCard>

        {/* Historial de Pagos Header */}
        <div style={{ marginTop: '1.75rem', marginBottom: '0.85rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Historial de Pagos ({selectedDebt.payments.length})
          </h3>
        </div>

        {selectedDebt.payments.length === 0 ? (
          <EmptyState
            title="Sin abonos registrados"
            description="No se han registrado abonos aún para esta deuda."
            compact
            actionLabel={remaining > 0 && !selectedDebt.is_settled ? 'Registrar Abono' : undefined}
            actionIcon={<Plus size={16} />}
            onAction={remaining > 0 && !selectedDebt.is_settled ? () => setPayingDebt(selectedDebt) : undefined}
            actionColor={accentHex}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {[...selectedDebt.payments]
              .sort((a, b) => new Date(b.created_at || b.payment_date).getTime() - new Date(a.created_at || a.payment_date).getTime())
              .map(payment => {
                const catObj = categories.find(c => c.name.toLowerCase() === (payment.category || selectedDebt.category || '').toLowerCase());
                const { IconComponent, hexColor } = resolveCategoryVisuals(catObj, payment.category || selectedDebt.category || 'Deudas');
                const eqVal = getPaymentAmountInDebtCurrency(payment, selectedDebt.currency);
                const amounts = formatListCardAmounts(
                  payment,
                  mainCurrency,
                  rates,
                  { amountInTarget: eqVal, targetCurrency: selectedDebt.currency }
                );

                const badgesNode = (
                  <>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: hexColor,
                      background: `${hexColor}18`,
                      border: `1px solid ${hexColor}35`,
                      padding: '0.12rem 0.5rem',
                      borderRadius: 'var(--radius-full)'
                    }}>
                      <IconComponent size={10} />
                      {payment.category || selectedDebt.category || 'Deudas'}
                    </span>

                    {payment.paid_by_name && (
                      <AttributionBadge name={payment.paid_by_name} isMe={false} icon="user" />
                    )}

                    {(payment.create_expense || payment.expense_id) && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.7rem',
                        color: '#10B981',
                        background: 'rgba(16, 185, 129, 0.1)',
                        padding: '0.12rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                        fontWeight: 600,
                        border: '1px solid rgba(16, 185, 129, 0.25)'
                      }}>
                        <Receipt size={10} />
                        Registrado en gastos
                      </span>
                    )}
                  </>
                );

                return (
                  <ListCard
                    key={payment.id}
                    statusColor={hexColor}
                    icon={<IconComponent size={18} />}
                    iconBg={`${hexColor}18`}
                    iconColor={hexColor}
                    title={payment.note?.trim() ? payment.note : (isOwed ? 'Abono realizado' : 'Abono recibido')}
                    subtitle={formatDate(payment.payment_date)}
                    badges={badgesNode}
                    primaryAmount={amounts.primaryAmount}
                    secondaryAmount={amounts.secondaryAmount}
                    onClick={() => setSelectedPaymentForSheet(payment)}
                  />
                );
              })}
          </div>
        )}

        {/* Payment Bottom Sheet */}
        <ListCardBottomSheet
          isOpen={!!selectedPaymentForSheet}
          onClose={() => setSelectedPaymentForSheet(null)}
          title="Detalle del Abono"
          subtitle={selectedPaymentForSheet ? formatDate(selectedPaymentForSheet.payment_date) : undefined}
          secondaryActions={selectedPaymentForSheet && selectedPaymentForSheet.can_edit !== false ? [
            {
              label: 'Editar Abono',
              icon: <Edit3 size={15} />,
              onClick: () => {
                const p = selectedPaymentForSheet;
                setSelectedPaymentForSheet(null);
                setEditingPayment(p);
                setPayingDebt(selectedDebt);
              }
            },
            {
              label: 'Eliminar Abono',
              icon: <Trash2 size={15} />,
              danger: true,
              onClick: () => {
                const p = selectedPaymentForSheet;
                setSelectedPaymentForSheet(null);
                setConfirmDelete({ isOpen: true, paymentId: p.id });
              }
            }
          ] : undefined}
        >
          {selectedPaymentForSheet && (
            <div>
              <CurrencyBreakdownCard
                originalAmount={Number(selectedPaymentForSheet.amount)}
                originalCurrency={selectedPaymentForSheet.currency}
                amountBs={selectedPaymentForSheet.amount_bs}
                amountUsd={selectedPaymentForSheet.amount_usd}
                amountEur={selectedPaymentForSheet.amount_eur}
                amountUsdt={selectedPaymentForSheet.amount_usdt}
                rateUsdBs={selectedPaymentForSheet.rate_usd_bs}
                rateEurBs={selectedPaymentForSheet.rate_eur_bs}
                rateUsdtBs={selectedPaymentForSheet.rate_usdt_bs}
                fallbackRates={rates}
              />

              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Fecha:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{formatDate(selectedPaymentForSheet.payment_date)}</strong>
                </div>
                {selectedPaymentForSheet.currency !== selectedDebt.currency && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Equivalente en moneda de la deuda:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {formatCurrencyAmount(getPaymentAmountInDebtCurrency(selectedPaymentForSheet, selectedDebt.currency), selectedDebt.currency)}
                    </strong>
                  </div>
                )}
                {selectedPaymentForSheet.paid_by_name && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Pagado por:</span>
                    <strong style={{ color: '#3B82F6' }}>{selectedPaymentForSheet.paid_by_name}</strong>
                  </div>
                )}
                {selectedPaymentForSheet.note && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <span>Nota:</span>
                    <span style={{ textAlign: 'right', color: 'var(--text-primary)', fontStyle: 'italic' }}>{selectedPaymentForSheet.note}</span>
                  </div>
                )}
                {(selectedPaymentForSheet.create_expense || selectedPaymentForSheet.expense_id) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10B981', fontWeight: 600, marginTop: '0.25rem' }}>
                    <Receipt size={14} />
                    <span>Registrado en gastos{selectedPaymentForSheet.category ? `: ${selectedPaymentForSheet.category}` : ''}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </ListCardBottomSheet>

        {/* Modal: Editar Deuda desde Detalle */}
        {showForm && (
          <DebtForm
            type={selectedDebt.type}
            initialData={editingDebt}
            onSubmit={handleCreateOrUpdate}
            onCancel={() => { setShowForm(false); setEditingDebt(undefined); }}
            loading={submitting}
          />
        )}

        {/* Modal: Registrar / Editar Abono */}
        {payingDebt && (
          <DebtPaymentForm
            initialData={editingPayment}
            debtConcept={payingDebt.concept}
            debtCategory={payingDebt.category}
            type={payingDebt.type}
            debtCurrency={payingDebt.currency || 'USD_BCV'}
            debtTotalAmount={payingDebt.total_amount}
            debtPaidAmount={calculatePaid(payingDebt)}
            onSubmit={handleAddOrUpdatePayment}
            onCancel={() => { setPayingDebt(null); setEditingPayment(undefined); }}
            loading={submitting}
            isShared={payingDebt.is_shared}
            sharedPartnerName={payingDebt.shared_partner_name}
          />
        )}

        {/* Modal: Personalizar Categoría Local */}
        {localCategoryModal.isOpen && localCategoryModal.debt && (
          <LocalCategoryModal
            isOpen={localCategoryModal.isOpen}
            onClose={() => setLocalCategoryModal({ isOpen: false, debt: null })}
            entityId={localCategoryModal.debt.id}
            entityTitle={localCategoryModal.debt.concept}
            currentCategory={localCategoryModal.debt.category}
            onCategoryUpdated={handleCategoryUpdated}
          />
        )}

      <ConfirmModal
          isOpen={confirmDelete.isOpen}
          title="Confirmar Eliminación"
          message={confirmDelete.debtId 
            ? '¿Estás seguro de que deseas eliminar esta deuda? Se borrará también su historial de pagos.'
            : '¿Estás seguro de que deseas eliminar este abono?'}
          onConfirm={() => {
            if (confirmDelete.debtId) {
              handleDeleteDebt(confirmDelete.debtId);
            } else if (confirmDelete.paymentId) {
              handleDeletePayment(confirmDelete.paymentId);
            }
          }}
          onCancel={() => setConfirmDelete({ isOpen: false })}
        />

        {activeShareModalItem && (
          <ShareMembersModal
            entityId={activeShareModalItem.id}
            entityType="debt"
            entityName={activeShareModalItem.name}
            onClose={() => setActiveShareModalItem(null)}
            onUpdated={() => fetchDebts(true)}
            onSelfLeave={() => {
              setActiveShareModalItem(null);
              setSelectedDebt(null);
              fetchDebts(true);
              toast.success('Has salido de la deuda compartida');
            }}
          />
        )}

        {leaveDebtModal.debt && (() => {
          const d = leaveDebtModal.debt;
          const paid = calculatePaid(d);
          const remaining = Math.max(Number(d.total_amount) - paid, 0);
          const hasPending = !d.is_settled && remaining > 0;

          return (
            <LeaveShareModal
              isOpen={leaveDebtModal.isOpen}
              onClose={() => setLeaveDebtModal({ isOpen: false, debt: null })}
              onConfirm={handleConfirmLeaveDebt}
              entityType="debt"
              entityTitle={d.concept}
              hasPendingBalance={hasPending}
              pendingBalanceAmount={remaining}
              currency={d.currency}
              loading={leaveDebtLoading}
            />
          );
        })()}
      </div>
    );
  }

  const metrics = getNetMetrics();

  // VISTA: Lista de Deudas (Main)
  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <PageHeader
        title="Deudas y Préstamos"
        subtitle="Lo que debes y lo que te deben"
        onBack={onBack}
        actionLabel="Nueva Deuda"
        actionIcon={<Plus size={18} />}
        onAction={() => { setEditingDebt(undefined); setShowForm(true); }}
        actionColor="var(--accent-color, #8B5CF6)"
      />

      {/* Summary Net Balance Card */}
      <SummaryHeroCard
        isLoading={loading}
        eyebrow={filterSettled ? 'Balance Histórico Liquidado' : 'Balance Neto Pendiente'}
        badgeText={`${debts.length} ${filterSettled ? 'liquidadas' : 'activas'}`}
        badgeIcon={<Wallet size={12} />}
        mainAmount={loading ? '...' : metrics.netFormatted}
        mainAmountColor={metrics.isNetPositive ? 'var(--income-color)' : 'var(--expense-color)'}
        statusSubtext={metrics.isNetPositive ? '(A tu favor)' : '(En contra)'}
        currencyHintText={`Toca para alternar moneda (${mainCurrency})`}
        onCycleCurrency={cycleDisplayCurrency}
        accentColor="#8B5CF6"
        metrics={[
          {
            label: 'TE DEBEN',
            value: loading ? '...' : `+${metrics.recFormatted}`,
            subtext: `${recCount} por cobrar`,
            valueColor: '#10B981',
            icon: <TrendingUp size={14} />,
          },
          {
            label: 'DEBES',
            value: loading ? '...' : `-${metrics.owedFormatted}`,
            subtext: `${owedCount} por pagar`,
            valueColor: '#EF4444',
            icon: <TrendingDown size={14} />,
          },
        ]}
      />

      {/* Main Tabs */}
      <SegmentedTabs
        tabs={[
          { id: 'all', label: 'Todas', count: debts.length },
          { id: 'owed', label: 'Por Pagar', count: owedCount },
          { id: 'receivable', label: 'Por Cobrar', count: recCount },
        ]}
        activeTab={activeTab}
        onChange={(tab) => handleTabChange(tab as 'all' | 'owed' | 'receivable')}
        style={{ marginBottom: '0.75rem' }}
      />

      {/* Filter Settled Filter Pills */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
        <SegmentedTabs
          tabs={[
            { id: 'active', label: 'Activas' },
            { id: 'settled', label: 'Liquidadas' },
          ]}
          activeTab={filterSettled ? 'settled' : 'active'}
          onChange={(tab) => setFilterSettled(tab === 'settled')}
          style={{ width: 'auto', minWidth: '220px' }}
        />
      </div>

      {loading ? (
        <div style={{ padding: '8px 0' }}><SkeletonList count={4} /></div>
      ) : displayedDebts.length === 0 ? (
        <EmptyState
          title={`No hay deudas ${activeTab === 'owed' ? 'por pagar' : activeTab === 'receivable' ? 'por cobrar' : ''} ${filterSettled ? 'liquidadas' : 'activas'}`.trim()}
          description={filterSettled ? 'No se encontraron deudas liquidadas en esta sección.' : 'Comienza registrando un préstamo o compromiso.'}
          actionLabel="Crear deuda"
          actionIcon={<Plus size={16} />}
          onAction={() => { setEditingDebt(undefined); setShowForm(true); }}
          actionColor="var(--accent-color, #8B5CF6)"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {displayedDebts.map(debt => {
            const paid = calculatePaid(debt);
            const remaining = Math.max(Number(debt.total_amount) - paid, 0);
            const progress = Math.min((paid / Number(debt.total_amount)) * 100, 100);
            const itemThemeColor = debt.type === 'owed' ? 'var(--expense-color)' : 'var(--income-color)';

            // Currency conversion to mainCurrency
            const remainingInMain = convertItemAmountToMainCurrency(
              { amount: remaining, currency: debt.currency },
              mainCurrency,
              rates
            );
            const debtInMain = convertItemAmountToMainCurrency(
              { amount: Number(debt.total_amount), currency: debt.currency },
              mainCurrency,
              rates
            );

            const primaryAmount = formatCurrencyAmount(remainingInMain, mainCurrency);
            const secondaryAmount = `de ${formatCurrencyAmount(debtInMain, mainCurrency)}`;

            let dueDateColor = 'var(--text-tertiary)';
            let isOverdue = false;
            if (debt.due_date && !debt.is_settled) {
              const due = new Date(debt.due_date + 'T12:00:00');
              const now = new Date();
              const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              if (diffDays < 0) {
                dueDateColor = 'var(--expense-color)';
                isOverdue = true;
              } else if (diffDays <= 7) {
                dueDateColor = 'var(--warning-color)';
              }
            }

            const badgesNode = (
              <>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: debt.type === 'owed' ? 'var(--expense-color)' : 'var(--income-color)',
                    background: debt.type === 'owed' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                    padding: '0.12rem 0.5rem',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  {debt.type === 'owed' ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
                  {debt.type === 'owed' ? 'Debo' : 'Me deben'}
                </span>

                {debt.is_settled ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.7rem',
                      fontWeight: 500,
                      color: 'var(--income-color)',
                      background: 'var(--surface-muted)',
                      padding: '0.12rem 0.5rem',
                      borderRadius: 'var(--radius-full)',
                    }}
                  >
                    <CheckCircle size={10} />
                    Liquidada
                  </span>
                ) : isOverdue ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.7rem',
                      fontWeight: 500,
                      color: 'var(--expense-color)',
                      background: 'rgba(239, 68, 68, 0.1)',
                      padding: '0.12rem 0.5rem',
                      borderRadius: 'var(--radius-full)',
                    }}
                  >
                    <AlertCircle size={10} />
                    Vencida
                  </span>
                ) : null}

                {debt.category ? (() => {
                  const catObj = categories.find(c => c.name.toLowerCase() === debt.category?.toLowerCase());
                  const { IconComponent, hexColor } = resolveCategoryVisuals(catObj, debt.category);
                  return (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocalCategoryModal({ isOpen: true, debt });
                      }}
                      role="button"
                      tabIndex={0}
                      title="Personalizar mi categoría"
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
                        cursor: 'pointer',
                        transition: 'transform 150ms ease-out',
                      }}
                      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      <IconComponent size={10} />
                      <span>{debt.category}</span>
                    </span>
                  );
                })() : (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocalCategoryModal({ isOpen: true, debt });
                    }}
                    role="button"
                    tabIndex={0}
                    title="Personalizar mi categoría"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      background: 'var(--surface-muted)',
                      border: '1px dashed var(--border-color)',
                      padding: '0.12rem 0.5rem',
                      borderRadius: 'var(--radius-full)',
                      cursor: 'pointer',
                      transition: 'transform 150ms ease-out',
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    <Tag size={10} />
                    <span>Categoría</span>
                  </span>
                )}

                {debt.is_shared && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveShareModalItem({ id: debt.id, name: debt.concept });
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                    title="Ver miembros compartidos"
                  >
                    <MemberAvatars members={debt.shared_members} size={20} />
                  </div>
                )}
              </>
            );

            const subtitleNode = (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>
                  {debt.type === 'owed' ? 'A:' : 'De:'} <strong>{debt.counterpart}</strong>
                </span>
                {debt.due_date && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: dueDateColor, fontWeight: isOverdue ? 600 : 400 }}>
                    <Calendar size={12} />
                    Vence: {formatDate(debt.due_date)}
                  </span>
                )}
              </span>
            );

            const quickActionNode = !debt.is_settled ? (
              <button
                type="button"
                className="list-card-quick-action"
                onClick={(e) => {
                  e.stopPropagation();
                  const freshDebt = debts.find(d => d.id === debt.id) || debt;
                  setEditingPayment(undefined);
                  setPayingDebt(freshDebt);
                }}
                title="Registrar abono"
              >
                <Plus size={20} color="#3B82F6" />
              </button>
            ) : (
              <div className="list-card-quick-action" style={{ cursor: 'default' }}>
                <CheckCircle size={20} color="var(--income-color)" />
              </div>
            );

            return (
              <ListCard
                key={debt.id}
                statusColor={debt.is_settled ? 'var(--income-color)' : itemThemeColor}
                icon={debt.type === 'owed' ? <TrendingDown size={20} /> : <TrendingUp size={20} />}
                iconBg={debt.type === 'owed' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)'}
                iconColor={debt.type === 'owed' ? 'var(--expense-color)' : 'var(--income-color)'}
                title={debt.concept}
                subtitle={subtitleNode}
                badges={badgesNode}
                primaryAmount={primaryAmount}
                secondaryAmount={secondaryAmount}
                progress={{
                  value: progress,
                  color: debt.is_settled ? 'var(--income-color)' : itemThemeColor,
                }}
                quickAction={quickActionNode}
                onClick={() => {
                  const freshDebt = debts.find(d => d.id === debt.id) || debt;
                  setSelectedDebtForSheet(freshDebt);
                }}
              />
            );
          })}
        </div>
      )}

      {/* Bottom Sheet para inspección y acciones rápidas de Deuda */}
      <ListCardBottomSheet
        isOpen={!!selectedDebtForSheet}
        onClose={() => setSelectedDebtForSheet(null)}
        title={selectedDebtForSheet?.concept || 'Detalle de Deuda'}
        subtitle={
          selectedDebtForSheet
            ? (selectedDebtForSheet.type === 'owed'
                ? `A: ${selectedDebtForSheet.counterpart}`
                : `De: ${selectedDebtForSheet.counterpart}`)
            : undefined
        }
        primaryAction={
          selectedDebtForSheet &&
          !selectedDebtForSheet.is_settled &&
          Math.max(Number(selectedDebtForSheet.total_amount) - calculatePaid(selectedDebtForSheet), 0) > 0
            ? {
                label: 'Registrar Abono',
                icon: <Plus size={18} />,
                onClick: () => {
                  const d = selectedDebtForSheet;
                  setSelectedDebtForSheet(null);
                  setEditingPayment(undefined);
                  setPayingDebt(d);
                },
              }
            : undefined
        }
        secondaryActions={
          selectedDebtForSheet
            ? [
                {
                  label: 'Personalizar mi categoría',
                  icon: <Tag size={16} />,
                  onClick: () => {
                    const d = selectedDebtForSheet;
                    setSelectedDebtForSheet(null);
                    setLocalCategoryModal({ isOpen: true, debt: d });
                  },
                },
                {
                  label: 'Ver Historial',
                  icon: <Receipt size={16} />,
                  onClick: () => {
                    const d = selectedDebtForSheet;
                    setSelectedDebtForSheet(null);
                    setSelectedDebt(d);
                  },
                },
                {
                  label: 'Editar',
                  icon: <Edit3 size={16} />,
                  disabled: selectedDebtForSheet.is_shared && selectedDebtForSheet.my_role === 'member',
                  onClick: () => {
                    const d = selectedDebtForSheet;
                    setSelectedDebtForSheet(null);
                    setEditingDebt(d);
                    setShowForm(true);
                  },
                },
                ...(selectedDebtForSheet.is_shared
                  ? [
                      {
                        label: 'Gestionar Panas',
                        icon: <Users size={16} />,
                        onClick: () => {
                          const d = selectedDebtForSheet;
                          setSelectedDebtForSheet(null);
                          setActiveShareModalItem({ id: d.id, name: d.concept });
                        },
                      },
                    ]
                  : []),
                selectedDebtForSheet.is_shared && selectedDebtForSheet.my_role === 'member'
                  ? {
                      label: 'Desvincularme',
                      icon: <LogOut size={16} />,
                      danger: true,
                      onClick: () => {
                        const d = selectedDebtForSheet;
                        setSelectedDebtForSheet(null);
                        setLeaveDebtModal({ isOpen: true, debt: d });
                      },
                    }
                  : {
                      label: 'Eliminar',
                      icon: <Trash2 size={16} />,
                      danger: true,
                      onClick: () => {
                        const d = selectedDebtForSheet;
                        setSelectedDebtForSheet(null);
                        setConfirmDelete({ isOpen: true, debtId: d.id });
                      },
                    },
              ]
            : undefined
        }
      >
        {selectedDebtForSheet && (() => {
          const paid = calculatePaid(selectedDebtForSheet);
          const remaining = Math.max(Number(selectedDebtForSheet.total_amount) - paid, 0);
          const isOwed = selectedDebtForSheet.type === 'owed';
          const statusColor = isOwed ? 'var(--expense-color)' : 'var(--income-color)';

          return (
            <div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '0.5rem',
                marginBottom: '1rem'
              }}>
                <div style={{ textAlign: 'center', padding: '0.65rem 0.4rem', background: 'var(--surface-muted)', borderRadius: 'var(--radius-md)' }}>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', margin: '0 0 0.25rem' }}>Total</p>
                  <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {formatCurrency(Number(selectedDebtForSheet.total_amount), selectedDebtForSheet.currency)}
                  </p>
                </div>
                <div style={{ textAlign: 'center', padding: '0.65rem 0.4rem', background: 'var(--income-bg)', borderRadius: 'var(--radius-md)' }}>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', margin: '0 0 0.25rem' }}>Abonado</p>
                  <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--income-color)', margin: 0 }}>
                    {formatCurrency(paid, selectedDebtForSheet.currency)}
                  </p>
                </div>
                <div style={{ textAlign: 'center', padding: '0.65rem 0.4rem', background: remaining > 0 ? 'var(--expense-bg)' : 'var(--income-bg)', borderRadius: 'var(--radius-md)' }}>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', margin: '0 0 0.25rem' }}>Restante</p>
                  <p style={{ fontSize: '0.88rem', fontWeight: 700, color: remaining > 0 ? statusColor : 'var(--income-color)', margin: 0 }}>
                    {formatCurrency(remaining, selectedDebtForSheet.currency)}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {selectedDebtForSheet.category && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Categoría:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{selectedDebtForSheet.category}</strong>
                  </div>
                )}
                {selectedDebtForSheet.start_date && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Fecha de inicio:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{formatDate(selectedDebtForSheet.start_date)}</strong>
                  </div>
                )}
                {selectedDebtForSheet.due_date && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Fecha límite:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{formatDate(selectedDebtForSheet.due_date)}</strong>
                  </div>
                )}
                {selectedDebtForSheet.notes && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <span>Notas:</span>
                    <span style={{ textAlign: 'right', color: 'var(--text-primary)', fontStyle: 'italic' }}>{selectedDebtForSheet.notes}</span>
                  </div>
                )}
                {selectedDebtForSheet.is_shared && selectedDebtForSheet.shared_members && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Panas compartidos:</span>
                    <MemberAvatars members={selectedDebtForSheet.shared_members} size={20} />
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </ListCardBottomSheet>

      {/* Modal: Crear / Editar Deuda */}
      {showForm && (
        <DebtForm
          type={editingDebt ? editingDebt.type : (activeTab === 'receivable' ? 'receivable' : 'owed')}
          initialData={editingDebt}
          onSubmit={handleCreateOrUpdate}
          onCancel={() => { setShowForm(false); setEditingDebt(undefined); }}
          loading={submitting}
        />
      )}

      {/* Modal: Registrar / Editar Abono */}
      {payingDebt && (
        <DebtPaymentForm
          initialData={editingPayment}
          debtConcept={payingDebt.concept}
          debtCategory={payingDebt.category}
          type={payingDebt.type}
          debtCurrency={payingDebt.currency || 'USD_BCV'}
          debtTotalAmount={payingDebt.total_amount}
          debtPaidAmount={calculatePaid(payingDebt)}
          onSubmit={handleAddOrUpdatePayment}
          onCancel={() => { setPayingDebt(null); setEditingPayment(undefined); }}
          loading={submitting}
          isShared={payingDebt.is_shared}
          sharedPartnerName={payingDebt.shared_partner_name}
        />
      )}

      {/* Modal: Personalizar Categoría Local */}
      {localCategoryModal.isOpen && localCategoryModal.debt && (
        <LocalCategoryModal
          isOpen={localCategoryModal.isOpen}
          onClose={() => setLocalCategoryModal({ isOpen: false, debt: null })}
          entityId={localCategoryModal.debt.id}
          entityTitle={localCategoryModal.debt.concept}
          currentCategory={localCategoryModal.debt.category}
          onCategoryUpdated={handleCategoryUpdated}
        />
      )}

      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title="Confirmar Eliminación"
        message={confirmDelete.debtId 
          ? '¿Estás seguro de que deseas eliminar esta deuda? Se borrará también su historial de pagos.'
          : '¿Estás seguro de que deseas eliminar este abono?'}
        onConfirm={() => {
          if (confirmDelete.debtId) {
            handleDeleteDebt(confirmDelete.debtId);
          } else if (confirmDelete.paymentId) {
            handleDeletePayment(confirmDelete.paymentId);
          }
        }}
        onCancel={() => setConfirmDelete({ isOpen: false })}
      />

      {activeShareModalItem && (
        <ShareMembersModal
          entityId={activeShareModalItem.id}
          entityType="debt"
          entityName={activeShareModalItem.name}
          onClose={() => setActiveShareModalItem(null)}
          onUpdated={() => fetchDebts(true)}
          onSelfLeave={() => {
            setActiveShareModalItem(null);
            fetchDebts(true);
            toast.success('Has salido de la deuda compartida');
          }}
        />
      )}

      {leaveDebtModal.debt && (() => {
        const d = leaveDebtModal.debt;
        const paid = calculatePaid(d);
        const remaining = Math.max(Number(d.total_amount) - paid, 0);
        const hasPending = !d.is_settled && remaining > 0;

        return (
          <LeaveShareModal
            isOpen={leaveDebtModal.isOpen}
            onClose={() => setLeaveDebtModal({ isOpen: false, debt: null })}
            onConfirm={handleConfirmLeaveDebt}
            entityType="debt"
            entityTitle={d.concept}
            hasPendingBalance={hasPending}
            pendingBalanceAmount={remaining}
            currency={d.currency}
            loading={leaveDebtLoading}
          />
        );
      })()}
    </div>
  );
};

export default DebtList;
