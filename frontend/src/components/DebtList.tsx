import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Edit3, ArrowLeft, Wallet, Calendar, AlertCircle, CheckCircle, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import type { Debt, DebtCreate, DebtUpdate, DebtPayment, DebtPaymentCreate, DebtPaymentUpdate, ExchangeRates } from '../types';
import { getDebts, createDebt, updateDebt, addDebtPayment, updateDebtPayment, deleteDebt, getRates, deleteDebtPayment } from '../api';
import DebtForm from './DebtForm';
import DebtPaymentForm from './DebtPaymentForm';
import ConfirmModal from './ConfirmModal';
import { MemberAvatars, ShareMembersModal } from './panas';
import { useCategories } from '../context/CategoriesContext';
import { resolveCategoryVisuals } from '../utils/categoryVisuals';

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
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [filterSettled, setFilterSettled] = useState(false);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<'usd' | 'bs' | 'eur' | 'usdt'>('usd');
  
  const [showForm, setShowForm] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | undefined>(undefined);
  
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
  const [editingPayment, setEditingPayment] = useState<DebtPayment | undefined>(undefined);

  const [confirmDelete, setConfirmDelete] = useState<{isOpen: boolean; debtId?: string; paymentId?: string}>({isOpen: false});
  const [activeShareModalItem, setActiveShareModalItem] = useState<{ id: string; name: string } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };
  
  const handleTabChange = (tab: 'all' | 'owed' | 'receivable') => {
    setActiveTab(tab);
    if (tab === 'all') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };

  const fetchDebts = async () => {
    try {
      setLoading(true);
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
        return debtsData.find(d => d.id === prev.id) || null;
      });
    } catch (error) {
      console.error('Error fetching debts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDebts();
  }, [filterSettled]);

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
      
      if (selectedDebt && editingDebt && selectedDebt.id === editingDebt.id) {
        setSelectedDebt(savedDebt);
      }
      
      await fetchDebts();
      showToast('Guardado exitosamente');
    } catch (error: any) {
      console.error('Error saving debt:', error);
      const detail = error?.response?.data?.detail;
      showToast(typeof detail === 'string' ? detail : 'Error al guardar la deuda');
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
      if (selectedDebt && selectedDebt.id === debtToPay.id) {
        setSelectedDebt(updatedDebt);
      }
      setPayingDebt(null);
      setEditingPayment(undefined);
      await fetchDebts();
      
      if (editingPayment) {
        showToast('Abono actualizado');
      } else if (updatedDebt.is_settled) {
        showToast('🎉 ¡Deuda completamente pagada!');
      } else {
        showToast('Abono registrado');
      }
    } catch (error: any) {
      console.error('Error saving payment:', error);
      const detail = error?.response?.data?.detail;
      showToast(typeof detail === 'string' ? detail : 'Error al guardar el abono');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDebt = async (id: string) => {
    try {
      setSubmitting(true);
      await deleteDebt(id);
      if (selectedDebt?.id === id) setSelectedDebt(null);
      await fetchDebts();
      showToast('Deuda eliminada');
    } catch (error: any) {
      console.error('Error deleting debt:', error);
      const detail = error?.response?.data?.detail;
      showToast(typeof detail === 'string' ? detail : 'Error al eliminar la deuda');
    } finally {
      setSubmitting(false);
      setConfirmDelete({isOpen: false});
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    try {
      setSubmitting(true);
      const updatedDebt = await deleteDebtPayment(paymentId);
      setSelectedDebt(updatedDebt);
      await fetchDebts();
      showToast('Abono eliminado');
    } catch (error: any) {
      console.error('Error deleting payment:', error);
      const detail = error?.response?.data?.detail;
      showToast(typeof detail === 'string' ? detail : 'Error al eliminar el abono');
    } finally {
      setSubmitting(false);
      setConfirmDelete({isOpen: false});
    }
  };

  const getPaymentAmountInDebtCurrency = (pay: DebtPayment, debtCurrency: string) => {
    if (pay.currency === debtCurrency) return Number(pay.amount);
    if ((debtCurrency === 'USD_BCV' || debtCurrency === 'USD_CASH') && pay.amount_usd != null) return Number(pay.amount_usd);
    if (debtCurrency === 'BS' && pay.amount_bs != null) return Number(pay.amount_bs);
    if (debtCurrency === 'EUR_BCV' && pay.amount_eur != null) return Number(pay.amount_eur);
    if (debtCurrency === 'USDT' && pay.amount_usdt != null) return Number(pay.amount_usdt);
    const payInBs = convertCurrencyAmount(Number(pay.amount), pay.currency, rates).bs;
    const debtOneUnitInBs = convertCurrencyAmount(1, debtCurrency, rates).bs;
    return debtOneUnitInBs > 0 ? payInBs / debtOneUnitInBs : 0;
  };

  const calculatePaid = (debt: Debt) => {
    return debt.payments.reduce((acc, pay) => acc + getPaymentAmountInDebtCurrency(pay, debt.currency), 0);
  };

  const convertCurrencyAmount = (amount: number, currency: string, rates: ExchangeRates | null) => {
    let amount_usd = 0;
    let amount_bs = 0;
    let amount_eur = 0;
    let amount_usdt = 0;

    if (!rates) return { usd: 0, bs: 0, eur: 0, usdt: 0 };

    const usd_bs = rates.usd_bs || 1;
    const eur_bs = rates.eur_bs || 1;
    const usdt_bs = rates.usdt_bs || 1;

    if (currency === 'USD_BCV') {
      amount_usd = amount;
      amount_bs = amount * usd_bs;
      amount_eur = amount_bs / eur_bs;
      amount_usdt = amount_bs / usdt_bs;
    } else if (currency === 'USD_CASH') {
      const available_rates = [usd_bs, eur_bs, usdt_bs].filter(r => r > 1);
      const highest_rate = available_rates.length > 0 ? Math.max(...available_rates) : 1;
      amount_bs = amount * highest_rate;
      amount_usd = amount_bs / usd_bs;
      amount_eur = amount_bs / eur_bs;
      amount_usdt = amount_bs / usdt_bs;
    } else if (currency === 'EUR_BCV') {
      amount_eur = amount;
      amount_bs = amount * eur_bs;
      amount_usd = amount_bs / usd_bs;
      amount_usdt = amount_bs / usdt_bs;
    } else if (currency === 'BS') {
      amount_bs = amount;
      amount_usd = amount / usd_bs;
      amount_eur = amount / eur_bs;
      amount_usdt = amount / usdt_bs;
    } else if (currency === 'USDT') {
      amount_usdt = amount;
      amount_bs = amount * usdt_bs;
      amount_usd = amount_bs / usd_bs;
      amount_eur = amount_bs / eur_bs;
    }
    
    return { usd: amount_usd, bs: amount_bs, eur: amount_eur, usdt: amount_usdt };
  };

  const owedCount = debts.filter(d => d.type === 'owed').length;
  const recCount = debts.filter(d => d.type === 'receivable').length;
  const displayedDebts = debts.filter(d => activeTab === 'all' || d.type === activeTab);

  const getNetMetrics = () => {
    if (!rates) {
      return {
        netFormatted: '$ 0.00',
        owedFormatted: '$ 0.00',
        recFormatted: '$ 0.00',
        isNetPositive: true,
      };
    }
    let owedBs = 0, owedUsd = 0, owedEur = 0, owedUsdt = 0;
    let recBs = 0, recUsd = 0, recEur = 0, recUsdt = 0;
    
    debts.forEach(debt => {
      let amountToSum = 0;
      if (filterSettled) {
        amountToSum = Number(debt.total_amount);
      } else {
        const remaining = Math.max(Number(debt.total_amount) - calculatePaid(debt), 0);
        if (remaining <= 0) return;
        amountToSum = remaining;
      }

      const converted = convertCurrencyAmount(amountToSum, debt.currency, rates);
      if (debt.type === 'owed') {
        owedUsd += converted.usd;
        owedBs += converted.bs;
        owedEur += converted.eur;
        owedUsdt += converted.usdt;
      } else {
        recUsd += converted.usd;
        recBs += converted.bs;
        recEur += converted.eur;
        recUsdt += converted.usdt;
      }
    });

    const netUsd = recUsd - owedUsd;
    const netBs = recBs - owedBs;
    const netEur = recEur - owedEur;
    const netUsdt = recUsdt - owedUsdt;

    const mapNet = { bs: netBs, usd: netUsd, eur: netEur, usdt: netUsdt };
    const mapOwed = { bs: owedBs, usd: owedUsd, eur: owedEur, usdt: owedUsdt };
    const mapRec = { bs: recBs, usd: recUsd, eur: recEur, usdt: recUsdt };

    const prefixMap = { bs: 'Bs. ', usd: '$ ', eur: '€ ', usdt: '' };
    const suffixMap = { bs: '', usd: '', eur: '', usdt: ' USDT' };

    const currentNet = mapNet[displayCurrency];
    const currentOwed = mapOwed[displayCurrency];
    const currentRec = mapRec[displayCurrency];

    const formatVal = (val: number, withSign: boolean = false) => {
      const absVal = Math.abs(val);
      const sign = withSign ? (val > 0.005 ? '+' : (val < -0.005 ? '-' : '')) : '';
      return `${sign}${prefixMap[displayCurrency]}${absVal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffixMap[displayCurrency]}`;
    };

    return {
      netFormatted: formatVal(currentNet, true),
      owedFormatted: formatVal(currentOwed, false),
      recFormatted: formatVal(currentRec, false),
      isNetPositive: currentNet >= 0,
    };
  };

  const cycleDisplayCurrency = () => {
    const order: Array<'bs' | 'usd' | 'eur' | 'usdt'> = ['usd', 'bs', 'eur', 'usdt'];
    const idx = order.indexOf(displayCurrency);
    setDisplayCurrency(order[(idx + 1) % order.length]);
  };

  // VISTA: Detalle de Deuda
  if (selectedDebt) {
    const isOwed = selectedDebt.type === 'owed';
    const themeColor = isOwed ? 'var(--expense-color)' : 'var(--income-color)';
    const paid = calculatePaid(selectedDebt);
    const remaining = Math.max(selectedDebt.total_amount - paid, 0);
    const progress = Math.min((paid / selectedDebt.total_amount) * 100, 100);

    return (
      <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
          <button 
            onClick={() => setSelectedDebt(null)}
            style={{
              width: '40px', height: '40px', borderRadius: 'var(--radius-full)',
              background: 'var(--surface-color)', border: 'none', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)', color: 'var(--text-primary)', flexShrink: 0
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Detalle de Deuda
            </h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
              {selectedDebt.concept}
            </p>
          </div>
        </header>

        <div className="soft-card" style={{ padding: '1rem 1.25rem' }}>
          {/* Header */}
          <div style={{ marginBottom: '1.25rem' }}>
            {selectedDebt.is_shared && (
              <div 
                onClick={() => setActiveShareModalItem({ id: selectedDebt.id, name: selectedDebt.concept })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6',
                  padding: '0.3rem 0.75rem', borderRadius: 'var(--radius-full)',
                  fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.75rem',
                  border: '1px solid rgba(59, 130, 246, 0.25)', cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Gestionar miembros de la deuda"
              >
                <MemberAvatars members={selectedDebt.shared_members} size={20} />
                <span>Gestionar panas ({selectedDebt.shared_members?.length || 2})</span>
              </div>
            )}
            {selectedDebt.category && (() => {
              const catObj = categories.find(c => c.name.toLowerCase() === selectedDebt.category?.toLowerCase());
              const { IconComponent, hexColor } = resolveCategoryVisuals(catObj, selectedDebt.category);
              return (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.2rem 0.55rem',
                  borderRadius: 'var(--radius-full)',
                  background: `${hexColor}18`,
                  border: `1px solid ${hexColor}35`,
                  color: hexColor,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  marginBottom: '0.5rem',
                }}>
                  <IconComponent size={13} />
                  <span>{selectedDebt.category}</span>
                </div>
              );
            })()}
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {isOwed ? 'A:' : 'De:'} <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedDebt.counterpart}</span>
              {selectedDebt.start_date && (
                <span style={{ marginLeft: '0.75rem', color: 'var(--text-tertiary)' }}>
                  · Desde {formatDate(selectedDebt.start_date)}
                </span>
              )}
            </p>
          </div>

          {/* Resumen numérico */}
          <div style={{ 
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', 
            marginBottom: '1rem' 
          }}>
            <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--surface-muted)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Total</p>
              <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatCurrency(selectedDebt.total_amount, selectedDebt.currency)}
              </p>
            </div>
            <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--income-bg)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Abonado</p>
              <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--income-color)' }}>
                {formatCurrency(paid, selectedDebt.currency)}
              </p>
            </div>
            <div style={{ textAlign: 'center', padding: '0.75rem', background: remaining > 0 ? 'var(--expense-bg)' : 'var(--income-bg)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Restante</p>
              <p style={{ fontSize: '0.9rem', fontWeight: 700, color: remaining > 0 ? themeColor : 'var(--income-color)' }}>
                {formatCurrency(remaining, selectedDebt.currency)}
              </p>
            </div>
          </div>

          {/* Barra de progreso */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Progreso</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{Math.round(progress)}%</span>
            </div>
            <div style={{ width: '100%', background: 'var(--surface-muted)', borderRadius: 'var(--radius-full)', height: '4px', overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                background: (remaining <= 0 || selectedDebt.is_settled) ? 'var(--income-color)' : themeColor, 
                width: `${progress}%`,
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.5s ease'
              }}></div>
            </div>
          </div>
          
          {(remaining <= 0 || selectedDebt.is_settled) && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)', color: '#10B981',
              padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
              fontSize: '0.9rem', fontWeight: 600, textAlign: 'center',
              marginBottom: '1rem', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '0.5rem'
            }}>
              ✅ ¡Deuda completamente liquidada!
            </div>
          )}

          {/* Botones de acción rápida */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              onClick={() => setPayingDebt(selectedDebt)}
              disabled={remaining <= 0 || selectedDebt.is_settled}
              style={{
                flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-md)',
                background: (remaining <= 0 || selectedDebt.is_settled) ? 'var(--surface-muted)' : themeColor, 
                color: (remaining <= 0 || selectedDebt.is_settled) ? 'var(--text-tertiary)' : 'white',
                border: 'none', fontWeight: 600, fontSize: '0.85rem', 
                cursor: (remaining <= 0 || selectedDebt.is_settled) ? 'not-allowed' : 'pointer'
              }}
            >
              Registrar Abono
            </button>
            <button
              onClick={() => { setEditingDebt(selectedDebt); setShowForm(true); }}
              disabled={selectedDebt.is_shared && selectedDebt.my_role === 'member'}
              style={{
                width: '40px', padding: '0', borderRadius: 'var(--radius-md)',
                background: 'none', color: (selectedDebt.is_shared && selectedDebt.my_role === 'member') ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                border: '1px solid var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: (selectedDebt.is_shared && selectedDebt.my_role === 'member') ? 'not-allowed' : 'pointer',
                opacity: (selectedDebt.is_shared && selectedDebt.my_role === 'member') ? 0.4 : 1
              }}
              title={selectedDebt.is_shared && selectedDebt.my_role === 'member' ? "Solo administradores pueden editar la deuda" : "Editar deuda"}
            >
              <Edit3 size={16} />
            </button>
            <button
              onClick={() => setConfirmDelete({isOpen: true, debtId: selectedDebt.id})}
              disabled={selectedDebt.is_shared && selectedDebt.my_role === 'member'}
              style={{
                width: '40px', padding: '0', borderRadius: 'var(--radius-md)',
                background: 'none', color: (selectedDebt.is_shared && selectedDebt.my_role === 'member') ? 'var(--text-tertiary)' : 'var(--expense-color)',
                border: '1px solid var(--expense-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: (selectedDebt.is_shared && selectedDebt.my_role === 'member') ? 'not-allowed' : 'pointer',
                opacity: (selectedDebt.is_shared && selectedDebt.my_role === 'member') ? 0.4 : 1
              }}
              title={selectedDebt.is_shared && selectedDebt.my_role === 'member' ? "Solo administradores pueden eliminar la deuda" : "Eliminar deuda"}
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Separador visual */}
          <div style={{ height: '1px', background: 'var(--accent-light)', marginBottom: '1.25rem' }}></div>

          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
            Historial de Pagos ({selectedDebt.payments.length})
          </h3>
          
          {selectedDebt.payments.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem 0', fontSize: '0.9rem' }}>
              No se han registrado abonos aún.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[...selectedDebt.payments]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map(payment => (
                <div key={payment.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.875rem 1rem', background: 'var(--surface-muted)', borderRadius: 'var(--radius-md)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: 'var(--radius-full)',
                      background: 'var(--income-bg)', color: 'var(--income-color)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.9rem', flexShrink: 0
                    }}>
                      💰
                    </div>
                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.1rem' }}>
                        {formatDate(payment.payment_date)}
                      </p>
                      {payment.note && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{payment.note}</p>}
                      {payment.paid_by_name && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                          fontSize: '0.7rem', color: '#3B82F6', background: 'rgba(59, 130, 246, 0.1)',
                          padding: '0.1rem 0.45rem', borderRadius: 'var(--radius-full)', marginTop: '0.2rem',
                          marginRight: '0.35rem',
                          fontWeight: 600
                        }}>
                          ✨ Pagado por {payment.paid_by_name}
                        </span>
                      )}
                      {(payment.create_expense || payment.expense_id) && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                          fontSize: '0.7rem', color: '#10B981', background: 'rgba(16, 185, 129, 0.1)',
                          padding: '0.1rem 0.45rem', borderRadius: 'var(--radius-full)', marginTop: '0.2rem',
                          fontWeight: 600, border: '1px solid rgba(16, 185, 129, 0.25)'
                        }} title="Registrado en la lista de gastos del mes">
                          <Receipt size={11} />
                          <span>Gasto{payment.category ? `: ${payment.category}` : ''}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--income-color)' }}>
                      +{formatCurrency(payment.amount, payment.currency)}
                    </p>
                    {payment.currency !== selectedDebt.currency && (
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                        ≈ {formatCurrency(getPaymentAmountInDebtCurrency(payment, selectedDebt.currency), selectedDebt.currency)}
                      </p>
                    )}
                  </div>
                  {payment.can_edit !== false && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.5rem' }}>
                      <button
                        onClick={() => {
                          setEditingPayment(payment);
                          setPayingDebt(selectedDebt);
                        }}
                        style={{
                          background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem'
                        }}
                        title="Editar abono"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete({isOpen: true, paymentId: payment.id})}
                        style={{
                          background: 'transparent', border: 'none', color: 'var(--expense-color)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem'
                        }}
                        title="Eliminar abono"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

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
            fontSize: '0.9rem',
            fontWeight: 600,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1000,
            animation: 'toastSlideUp 0.3s ease'
          }}>
            {toastMessage}
          </div>
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
          onCancel={() => setConfirmDelete({isOpen: false})}
        />

        {activeShareModalItem && (
          <ShareMembersModal
            entityId={activeShareModalItem.id}
            entityType="debt"
            entityName={activeShareModalItem.name}
            onClose={() => setActiveShareModalItem(null)}
            onUpdated={fetchDebts}
            onSelfLeave={() => {
              setActiveShareModalItem(null);
              setSelectedDebt(null);
              fetchDebts();
              showToast('Has salido de la deuda compartida');
            }}
          />
        )}
      </div>
    );
  }

  const metrics = getNetMetrics();

  // VISTA: Lista de Deudas (Main)
  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingTop: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button 
            onClick={onBack}
            style={{
              width: '40px', height: '40px', borderRadius: 'var(--radius-full)',
              background: 'var(--surface-color)', border: 'none', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)', color: 'var(--text-primary)', flexShrink: 0
            }}
          >
            <ArrowLeft size={20} />
          </button>

          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Deudas y Préstamos
            </h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
              Lo que debes y lo que te deben
            </p>
          </div>
        </div>

        <button
          onClick={() => { setEditingDebt(undefined); setShowForm(true); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.6rem 0.9rem',
            background: 'var(--accent-color, #8B5CF6)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(139, 92, 246, 0.3)',
            transition: 'transform 0.15s ease',
          }}
        >
          <Plus size={18} />
          <span>Nueva Deuda</span>
        </button>
      </header>

      {/* Summary Net Balance Card */}
      <div
        className="soft-card"
        onClick={cycleDisplayCurrency}
        style={{ 
          marginBottom: '1.25rem', padding: '1.35rem', cursor: 'pointer',
          background: metrics.isNetPositive 
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, var(--surface-color) 100%)' 
            : 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, var(--surface-color) 100%)',
          border: `1px solid ${metrics.isNetPositive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {filterSettled ? 'Balance Histórico Liquidado' : 'Balance Neto Pendiente'}
          </span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.2rem 0.55rem', borderRadius: 'var(--radius-full)',
            background: 'var(--surface-muted)', color: 'var(--text-secondary)',
            fontSize: '0.72rem', fontWeight: 600,
          }}>
            <Wallet size={12} />
            {debts.length} {filterSettled ? 'liquidadas' : 'activas'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div style={{
            fontSize: '2.1rem',
            fontWeight: 800,
            color: metrics.isNetPositive ? 'var(--income-color)' : 'var(--expense-color)',
            letterSpacing: '-0.03em',
            lineHeight: 1.1
          }}>
            {loading ? '...' : metrics.netFormatted}
          </div>
          <span style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            color: metrics.isNetPositive ? 'var(--income-color)' : 'var(--expense-color)',
            opacity: 0.9
          }}>
            {metrics.isNetPositive ? '(A tu favor)' : '(En contra)'}
          </span>
        </div>

        {/* Dual sub-metric pill row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', paddingTop: '0.75rem', borderTop: '1px solid var(--accent-light)' }}>
          <div style={{
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(16, 185, 129, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.15rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: '#10B981', fontWeight: 600 }}>
              <TrendingUp size={12} />
              <span>Te deben ({recCount})</span>
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {loading ? '...' : `+${metrics.recFormatted}`}
            </div>
          </div>

          <div style={{
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239, 68, 68, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.15rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: '#EF4444', fontWeight: 600 }}>
              <TrendingDown size={12} />
              <span>Debes ({owedCount})</span>
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {loading ? '...' : `-${metrics.owedFormatted}`}
            </div>
          </div>
        </div>

        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.5rem', textAlign: 'center' }}>
          Toca para alternar moneda (USD / Bs / EUR / USDT)
        </div>
      </div>

      {/* Sub-tabs: Todas / Por Pagar / Por Cobrar */}
      <div style={{ display: 'flex', background: 'var(--surface-muted)', borderRadius: 'var(--radius-full)', padding: '0.25rem', marginBottom: '0.75rem', gap: '0.25rem' }}>
        <button
          onClick={() => handleTabChange('all')}
          style={{
            flex: 1, padding: '0.55rem 0.35rem', border: 'none', borderRadius: 'var(--radius-full)',
            fontSize: '0.82rem', fontWeight: activeTab === 'all' ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s',
            background: activeTab === 'all' ? 'var(--surface-color)' : 'transparent',
            color: activeTab === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: activeTab === 'all' ? 'var(--shadow-sm)' : 'none'
          }}
        >
          Todas ({debts.length})
        </button>
        <button
          onClick={() => handleTabChange('owed')}
          style={{
            flex: 1, padding: '0.55rem 0.35rem', border: 'none', borderRadius: 'var(--radius-full)',
            fontSize: '0.82rem', fontWeight: activeTab === 'owed' ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s',
            background: activeTab === 'owed' ? 'var(--surface-color)' : 'transparent',
            color: activeTab === 'owed' ? 'var(--expense-color)' : 'var(--text-secondary)',
            boxShadow: activeTab === 'owed' ? 'var(--shadow-sm)' : 'none'
          }}
        >
          Por Pagar ({owedCount})
        </button>
        <button
          onClick={() => handleTabChange('receivable')}
          style={{
            flex: 1, padding: '0.55rem 0.35rem', border: 'none', borderRadius: 'var(--radius-full)',
            fontSize: '0.82rem', fontWeight: activeTab === 'receivable' ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s',
            background: activeTab === 'receivable' ? 'var(--surface-color)' : 'transparent',
            color: activeTab === 'receivable' ? 'var(--income-color)' : 'var(--text-secondary)',
            boxShadow: activeTab === 'receivable' ? 'var(--shadow-sm)' : 'none'
          }}
        >
          Por Cobrar ({recCount})
        </button>
      </div>

      {/* State filter: Activas / Liquidadas */}
      <div style={{ display: 'flex', background: 'var(--surface-muted)', borderRadius: 'var(--radius-full)', padding: '0.2rem', marginBottom: '1.25rem', width: 'fit-content', margin: '0 auto 1.25rem auto' }}>
        <button
          onClick={() => setFilterSettled(false)}
          style={{
            padding: '0.4rem 1.1rem', border: 'none', borderRadius: 'var(--radius-full)',
            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            background: !filterSettled ? 'var(--surface-color)' : 'transparent',
            color: !filterSettled ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: !filterSettled ? 'var(--shadow-sm)' : 'none'
          }}
        >
          Activas
        </button>
        <button
          onClick={() => setFilterSettled(true)}
          style={{
            padding: '0.4rem 1.1rem', border: 'none', borderRadius: 'var(--radius-full)',
            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            background: filterSettled ? 'var(--surface-color)' : 'transparent',
            color: filterSettled ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: filterSettled ? 'var(--shadow-sm)' : 'none'
          }}
        >
          Liquidadas
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>Cargando...</div>
      ) : displayedDebts.length === 0 ? (
        <div className="empty-state" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
          <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
            No hay deudas {activeTab === 'owed' ? 'por pagar' : (activeTab === 'receivable' ? 'por cobrar' : '')} {filterSettled ? 'liquidadas' : 'activas'}
          </p>
          <button
            onClick={() => { setEditingDebt(undefined); setShowForm(true); }}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'var(--accent-color, #8B5CF6)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <Plus size={16} /> Crear primera deuda
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {displayedDebts.map(debt => {
            const paid = calculatePaid(debt);
            const remaining = Math.max(debt.total_amount - paid, 0);
            const progress = Math.min((paid / debt.total_amount) * 100, 100);
            const itemThemeColor = debt.type === 'owed' ? 'var(--expense-color)' : 'var(--income-color)';
            
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

            return (
              <div 
                key={debt.id} 
                className="soft-card"
                style={{ 
                  padding: '1rem 1.25rem', cursor: 'pointer',
                  borderLeft: debt.is_settled ? '3px solid var(--income-color)' : `3px solid ${itemThemeColor}`,
                }}
                onClick={() => {
                  const freshDebt = debts.find(d => d.id === debt.id) || debt;
                  setSelectedDebt(freshDebt);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {debt.concept}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: debt.type === 'owed' ? 'var(--expense-color)' : 'var(--income-color)',
                        background: debt.type === 'owed' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                        padding: '0.12rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                      }}>
                        {debt.type === 'owed' ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
                        {debt.type === 'owed' ? 'Debo' : 'Me deben'}
                      </span>

                      {debt.is_settled ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 500, color: 'var(--income-color)', background: 'var(--surface-muted)', padding: '0.12rem 0.5rem', borderRadius: 'var(--radius-full)' }}>
                          <CheckCircle size={10} />
                          Liquidada
                        </span>
                      ) : isOverdue ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 500, color: 'var(--expense-color)', background: 'rgba(239, 68, 68, 0.1)', padding: '0.12rem 0.5rem', borderRadius: 'var(--radius-full)' }}>
                          <AlertCircle size={10} />
                          Vencida
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 500, color: itemThemeColor, background: 'var(--surface-muted)', padding: '0.12rem 0.5rem', borderRadius: 'var(--radius-full)' }}>
                          <AlertCircle size={10} />
                          Activa
                        </span>
                      )}

                      {debt.category && (() => {
                        const catObj = categories.find(c => c.name.toLowerCase() === debt.category?.toLowerCase());
                        const { IconComponent, hexColor } = resolveCategoryVisuals(catObj, debt.category);
                        return (
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
                            borderRadius: 'var(--radius-full)',
                          }}>
                            <IconComponent size={10} />
                            {debt.category}
                          </span>
                        );
                      })()}
                    </div>
                    {debt.is_shared && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveShareModalItem({ id: debt.id, name: debt.concept });
                        }}
                        style={{ marginTop: '0.35rem', display: 'inline-block' }}
                        title="Ver miembros compartidos"
                      >
                        <MemberAvatars members={debt.shared_members} size={22} />
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: debt.is_settled ? 'var(--income-color)' : itemThemeColor }}>
                      {formatCurrency(remaining, debt.currency)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Total: {formatCurrency(debt.total_amount, debt.currency)}
                    </div>
                  </div>
                </div>
                
                <div style={{ width: '100%', background: 'var(--surface-muted)', borderRadius: 'var(--radius-full)', height: '4px', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
                  <div style={{ 
                    height: '4px', 
                    background: debt.is_settled ? 'var(--income-color)' : itemThemeColor, 
                    width: `${progress}%`,
                    borderRadius: 'var(--radius-full)'
                  }}></div>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {debt.type === 'owed' ? 'A:' : 'De:'} <span style={{ fontWeight: 600 }}>{debt.counterpart}</span>
                    </span>
                    {debt.due_date && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: dueDateColor, fontWeight: isOverdue ? 600 : 400 }}>
                        <Calendar size={12} />
                        Vence: {formatDate(debt.due_date)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        const freshDebt = debts.find(d => d.id === debt.id) || debt; 
                        setEditingPayment(undefined);
                        setPayingDebt(freshDebt); 
                      }} 
                      title="Registrar abono" 
                      disabled={debt.is_settled}
                      style={{
                        width: '32px', height: '32px', borderRadius: 'var(--radius-full)',
                        background: debt.is_settled ? 'var(--surface-muted)' : 'rgba(59, 130, 246, 0.1)', border: 'none', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', cursor: debt.is_settled ? 'not-allowed' : 'pointer',
                        color: debt.is_settled ? 'var(--text-tertiary)' : '#3B82F6', transition: 'all 0.15s ease',
                      }}
                    >
                      <Plus size={16} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingDebt(debt); setShowForm(true); }} 
                      disabled={debt.is_shared && debt.my_role === 'member'}
                      title={debt.is_shared && debt.my_role === 'member' ? "Solo administradores pueden editar la deuda" : "Editar"} 
                      style={{
                        width: '32px', height: '32px', borderRadius: 'var(--radius-full)',
                        background: 'var(--surface-muted)', border: 'none', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        cursor: (debt.is_shared && debt.my_role === 'member') ? 'not-allowed' : 'pointer',
                        color: (debt.is_shared && debt.my_role === 'member') ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                        opacity: (debt.is_shared && debt.my_role === 'member') ? 0.4 : 1,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Edit3 size={14} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete({isOpen: true, debtId: debt.id}); }} 
                      disabled={debt.is_shared && debt.my_role === 'member'}
                      title={debt.is_shared && debt.my_role === 'member' ? "Solo administradores pueden eliminar la deuda" : "Eliminar"} 
                      style={{
                        width: '32px', height: '32px', borderRadius: 'var(--radius-full)',
                        background: 'var(--surface-muted)', border: 'none', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        cursor: (debt.is_shared && debt.my_role === 'member') ? 'not-allowed' : 'pointer',
                        color: (debt.is_shared && debt.my_role === 'member') ? 'var(--text-tertiary)' : 'var(--expense-color)',
                        opacity: (debt.is_shared && debt.my_role === 'member') ? 0.4 : 1,
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
          fontSize: '0.9rem',
          fontWeight: 600,
          boxShadow: 'var(--shadow-lg)',
          zIndex: 1000,
          animation: 'toastSlideUp 0.3s ease'
        }}>
          {toastMessage}
        </div>
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
        onCancel={() => setConfirmDelete({isOpen: false})}
      />

      {activeShareModalItem && (
        <ShareMembersModal
          entityId={activeShareModalItem.id}
          entityType="debt"
          entityName={activeShareModalItem.name}
          onClose={() => setActiveShareModalItem(null)}
          onUpdated={fetchDebts}
          onSelfLeave={() => {
            setActiveShareModalItem(null);
            fetchDebts();
            showToast('Has salido de la deuda compartida');
          }}
        />
      )}
    </div>
  );
};

export default DebtList;
