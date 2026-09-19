import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit3, ArrowLeft, Wallet } from 'lucide-react';
import type { Debt, DebtCreate, DebtUpdate, DebtPaymentCreate, ExchangeRates } from '../types';
import { getDebts, createDebt, updateDebt, addDebtPayment, deleteDebt, getRates } from '../api';
import DebtForm from './DebtForm';
import DebtPaymentForm from './DebtPaymentForm';

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
  type: 'owed' | 'receivable';
  onBack: () => void;
}

const DebtList: React.FC<DebtListProps> = ({ type, onBack }) => {
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
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };
  
  const isOwed = type === 'owed';
  const title = isOwed ? 'Lo que Debo' : 'Me Deben';
  
  const themeColor = isOwed ? 'var(--expense-color)' : 'var(--income-color)';

  const fetchDebts = async () => {
    try {
      setLoading(true);
      const [debtsData, ratesData] = await Promise.all([
        getDebts(type, filterSettled),
        getRates()
      ]);
      setDebts(debtsData);
      setRates(ratesData);
    } catch (error) {
      console.error('Error fetching debts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDebts();
  }, [type, filterSettled]);

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
    } catch (error) {
      console.error('Error saving debt:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddPayment = async (data: DebtPaymentCreate) => {
    if (!selectedDebt) return;
    try {
      setSubmitting(true);
      const updatedDebt = await addDebtPayment(selectedDebt.id, data);
      setSelectedDebt(updatedDebt);
      setShowPaymentForm(false);
      await fetchDebts();
      
      if (updatedDebt.is_settled) {
        showToast('🎉 ¡Deuda completamente pagada!');
      } else {
        showToast('Abono registrado');
      }
    } catch (error) {
      console.error('Error adding payment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar esta deuda? Se borrará también su historial de pagos.')) return;
    try {
      setSubmitting(true);
      await deleteDebt(id);
      if (selectedDebt?.id === id) setSelectedDebt(null);
      await fetchDebts();
      showToast('Deuda eliminada');
    } catch (error) {
      console.error('Error deleting debt:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const calculatePaid = (debt: Debt) => {
    return debt.payments.reduce((acc, pay) => {
      if (pay.currency === debt.currency) return acc + Number(pay.amount);
      const payInBs = convertCurrencyAmount(Number(pay.amount), pay.currency, rates).bs;
      const debtOneUnitInBs = convertCurrencyAmount(1, debt.currency, rates).bs;
      const converted = debtOneUnitInBs > 0 ? payInBs / debtOneUnitInBs : 0;
      return acc + converted;
    }, 0);
  };

  const convertCurrencyAmount = (amount: number, currency: string, rates: ExchangeRates) => {
    let amount_usd = 0;
    let amount_bs = 0;
    let amount_eur = 0;
    let amount_usdt = 0;

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

  const getSummaryAmount = () => {
    if (!rates) return '0.00';
    let totalBs = 0, totalUsd = 0, totalEur = 0, totalUsdt = 0;
    
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
      totalUsd += converted.usd;
      totalBs += converted.bs;
      totalEur += converted.eur;
      totalUsdt += converted.usdt;
    });

    const map = { bs: totalBs, usd: totalUsd, eur: totalEur, usdt: totalUsdt };
    const prefixMap = { bs: 'Bs. ', usd: '$ ', eur: '€ ', usdt: '' };
    const suffixMap = { bs: '', usd: '', eur: '', usdt: ' USDT' };
    return `${prefixMap[displayCurrency]}${Number(map[displayCurrency]).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffixMap[displayCurrency]}`;
  };

  const cycleDisplayCurrency = () => {
    const order: Array<'bs' | 'usd' | 'eur' | 'usdt'> = ['usd', 'bs', 'eur', 'usdt'];
    const idx = order.indexOf(displayCurrency);
    setDisplayCurrency(order[(idx + 1) % order.length]);
  };

  // VISTA: Detalle de Deuda
  if (selectedDebt && !showForm) {
    const paid = calculatePaid(selectedDebt);
    const remaining = Math.max(selectedDebt.total_amount - paid, 0);
    const progress = Math.min((paid / selectedDebt.total_amount) * 100, 100);

    return (
      <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
          <button 
            onClick={() => {
              if (showPaymentForm) setShowPaymentForm(false);
              else setSelectedDebt(null);
            }}
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
              {showPaymentForm ? 'Registrar Abono' : 'Detalle de Deuda'}
            </h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
              {selectedDebt.concept}
            </p>
          </div>
        </header>

        {showPaymentForm ? (
          <div className="soft-card" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
              Registrar Abono - {selectedDebt?.concept}
            </h2>
            <DebtPaymentForm
              debtCurrency={selectedDebt?.currency || 'USD_BCV'}
              debtTotalAmount={selectedDebt.total_amount}
              debtPaidAmount={paid}
              onSubmit={handleAddPayment}
              onCancel={() => setShowPaymentForm(false)}
              loading={submitting}
            />
          </div>
        ) : (
          <div className="soft-card" style={{ padding: '1rem 1.25rem' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.25rem' }}>
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
                onClick={() => setShowPaymentForm(true)}
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
                style={{
                  width: '40px', padding: '0', borderRadius: 'var(--radius-md)',
                  background: 'none', color: 'var(--text-secondary)',
                  border: '1px solid var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                }}
              >
                <Edit3 size={16} />
              </button>
              <button
                onClick={() => handleDelete(selectedDebt.id)}
                style={{
                  width: '40px', padding: '0', borderRadius: 'var(--radius-md)',
                  background: 'none', color: 'var(--expense-color)',
                  border: '1px solid var(--expense-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                }}
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
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--income-color)' }}>
                        +{formatCurrency(payment.amount, payment.currency)}
                      </p>
                      {payment.currency !== selectedDebt.currency && (
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                          ≈ {formatCurrency((() => {
                            const payInBs = convertCurrencyAmount(Number(payment.amount), payment.currency, rates).bs;
                            const debtOneUnitInBs = convertCurrencyAmount(1, selectedDebt.currency, rates).bs;
                            return debtOneUnitInBs > 0 ? payInBs / debtOneUnitInBs : 0;
                          })(), selectedDebt.currency)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // VISTA: Lista de Deudas (Main)
  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
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
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: themeColor, margin: 0 }}>
            {title}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
            {isOwed ? 'A quién le debes' : 'Quién te debe'}
          </p>
        </div>
      </header>

      {/* Summary card */}
      <div
        className="soft-card"
        onClick={cycleDisplayCurrency}
        style={{ 
          marginBottom: '1.5rem', padding: '1.5rem', cursor: 'pointer',
          background: isOwed ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.06) 0%, var(--surface-color) 100%)' : 'linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, var(--surface-color) 100%)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {filterSettled ? 'Deuda Total Liquidada' : 'Deuda Total Activa'}
          </span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-full)',
            background: isOwed ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: isOwed ? '#EF4444' : '#10B981',
            fontSize: '0.75rem', fontWeight: 600,
          }}>
            <Wallet size={14} />
            {debts.length} {filterSettled ? 'liquidadas' : 'activas'}
          </div>
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          {loading ? '...' : getSummaryAmount()}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
          Toca para cambiar moneda
        </div>
      </div>

      {showForm ? (
        <div className="soft-card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
            {editingDebt ? 'Editar Deuda' : 'Nueva Deuda'}
          </h2>
          <DebtForm
            type={type}
            initialData={editingDebt}
            onSubmit={handleCreateOrUpdate}
            onCancel={() => { setShowForm(false); setEditingDebt(undefined); }}
            loading={submitting}
          />
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', background: 'var(--surface-muted)', borderRadius: 'var(--radius-full)', padding: '0.25rem', marginBottom: '1.5rem' }}>
            <button
              onClick={() => setFilterSettled(false)}
              style={{
                flex: 1, padding: '0.6rem', border: 'none', borderRadius: 'var(--radius-full)',
                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                background: !filterSettled ? 'var(--surface-color)' : 'transparent',
                color: !filterSettled ? themeColor : 'var(--text-secondary)',
                boxShadow: !filterSettled ? 'var(--shadow-sm)' : 'none'
              }}
            >
              Activas
            </button>
            <button
              onClick={() => setFilterSettled(true)}
              style={{
                flex: 1, padding: '0.6rem', border: 'none', borderRadius: 'var(--radius-full)',
                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                background: filterSettled ? 'var(--surface-color)' : 'transparent',
                color: filterSettled ? themeColor : 'var(--text-secondary)',
                boxShadow: filterSettled ? 'var(--shadow-sm)' : 'none'
              }}
            >
              Liquidadas
            </button>
          </div>

          {!showForm && (
            <button
              onClick={() => { setEditingDebt(undefined); setShowForm(true); }}
              style={{
                width: '100%', padding: '0.875rem', marginBottom: '1.25rem',
                background: 'var(--surface-color)', border: '2px dashed var(--accent-light)',
                borderRadius: 'var(--radius-md)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600,
                transition: 'all 0.2s ease',
              }}
            >
              <Plus size={18} /> Añadir deuda
            </button>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>Cargando...</div>
          ) : debts.length === 0 ? (
            <div className="empty-state">
              <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '0.5rem' }}>
                No hay deudas {filterSettled ? 'pagadas' : 'activas'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {debts.map(debt => {
                const paid = calculatePaid(debt);
                const remaining = Math.max(debt.total_amount - paid, 0);
                const progress = Math.min((paid / debt.total_amount) * 100, 100);

                return (
                  <div 
                    key={debt.id} 
                    className="soft-card"
                    style={{ padding: '1rem 1.25rem', cursor: 'pointer', opacity: debt.is_settled ? 0.7 : 1 }}
                    onClick={() => {
                      const freshDebt = debts.find(d => d.id === debt.id) || debt;
                      setSelectedDebt(freshDebt);
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {debt.concept}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: themeColor }}>
                          {formatCurrency(remaining, debt.currency)}
                        </span>
                        {filterSettled && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(debt.id);
                            }}
                            style={{
                              background: 'transparent', border: 'none', color: 'var(--text-tertiary)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem'
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                      {isOwed ? 'A: ' : 'De: '}<span style={{ fontWeight: 600 }}>{debt.counterpart}</span>
                    </p>

                    <div style={{ width: '100%', background: 'var(--surface-muted)', borderRadius: 'var(--radius-full)', height: '4px', marginBottom: '0.75rem' }}>
                      <div style={{ 
                        height: '4px', 
                        background: themeColor, 
                        width: `${progress}%`,
                        borderRadius: 'var(--radius-full)'
                      }}></div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      <span>Abonado: {formatCurrency(paid, debt.currency)}</span>
                      <span>Total: {formatCurrency(debt.total_amount, debt.currency)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
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
    </div>
  );
};

export default DebtList;
