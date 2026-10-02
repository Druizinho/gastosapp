import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Wallet, Trash2, Edit3, CheckCircle, Clock, AlertCircle, Calendar, Circle, Undo2, Pause, Play } from 'lucide-react';
import { getMonthlyIncomes, deleteEstimatedIncome, uncheckIncome, getRates, updateEstimatedIncome } from '../api';
import type { EstimatedIncome, ExchangeRates } from '../types';
import ConfirmModal from './ConfirmModal';
import EstimatedIncomeForm from './EstimatedIncomeForm.tsx'; // Form
import IncomeCheckForm from './IncomeCheckForm.tsx'; // Check

const currencyLabels: Record<string, string> = {
  'USD_BCV': '$',
  'EUR_BCV': '€',
  'BS': 'Bs.',
  'USDT': 'USDT',
  'USD_CASH': '$ Cash',
};

const formatAmount = (amount: number | null | undefined, prefix: string = '') => {
  if (amount === null || amount === undefined) return '—';
  return `${prefix}${Number(amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

interface EstimatedIncomeListProps {
  onBack: () => void;
}

const EstimatedIncomeList: React.FC<EstimatedIncomeListProps> = ({ onBack }) => {
  const [incomes, setIncomes] = useState<EstimatedIncome[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'BS' | 'EUR' | 'USDT'>('USD');
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCheckFormOpen, setIsCheckFormOpen] = useState(false);
  
  const [editingIncome, setEditingIncome] = useState<EstimatedIncome | null>(null);
  const [checkingIncome, setCheckingIncome] = useState<EstimatedIncome | null>(null);
  
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, incomeId: '' });
  const [activeTab, setActiveTab] = useState<'pending' | 'paid'>('pending');
  
  // Month selector logic
  const [currentDate, setCurrentDate] = useState(() => new Date());
  
  const getMonthYearString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const currentMonthYear = getMonthYearString(currentDate);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [data, ratesData] = await Promise.all([
        getMonthlyIncomes(currentMonthYear),
        getRates()
      ]);
      setIncomes(data);
      setRates(ratesData);
    } catch (error) {
      console.error('Error fetching incomes or rates:', error);
    } finally {
      setIsLoading(false);
    }
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
    } else if (currency === 'USDT') {
      amount_usdt = amount;
      amount_bs = amount * usdt_bs;
      amount_usd = amount_bs / usd_bs;
      amount_eur = amount_bs / eur_bs;
    } else if (currency === 'BS') {
      amount_bs = amount;
      amount_usd = amount / usd_bs;
      amount_eur = amount / eur_bs;
      amount_usdt = amount / usdt_bs;
    }

    return { usd: amount_usd, bs: amount_bs, eur: amount_eur, usdt: amount_usdt };
  };

  const getSummaryAmounts = () => {
    if (!rates) return { expected: 0, received: 0, pending: 0 };
    
    let expectedUsd = 0; let expectedBs = 0; let expectedEur = 0; let expectedUsdt = 0;
    let receivedUsd = 0; let receivedBs = 0; let receivedEur = 0; let receivedUsdt = 0;

    incomes.forEach(income => {
      // Amount expected
      const expConverted = convertCurrencyAmount(Number(income.expected_amount), income.currency, rates);
      expectedUsd += expConverted.usd;
      expectedBs += expConverted.bs;
      expectedEur += expConverted.eur;
      expectedUsdt += expConverted.usdt;

      // Amount received (if any check)
      if (income.checks && income.checks.length > 0) {
        const check = income.checks[0];
        const recConverted = convertCurrencyAmount(Number(check.real_amount), check.currency, rates);
        receivedUsd += recConverted.usd;
        receivedBs += recConverted.bs;
        receivedEur += recConverted.eur;
        receivedUsdt += recConverted.usdt;
      }
    });

    const expectedMap: Record<string, number> = { 'USD': expectedUsd, 'BS': expectedBs, 'EUR': expectedEur, 'USDT': expectedUsdt };
    const receivedMap: Record<string, number> = { 'USD': receivedUsd, 'BS': receivedBs, 'EUR': receivedEur, 'USDT': receivedUsdt };

    const expected = expectedMap[displayCurrency] || 0;
    const received = receivedMap[displayCurrency] || 0;
    
    return {
      expected,
      received,
      pending: Math.max(expected - received, 0)
    };
  };

  const cycleCurrency = () => {
    const order: ('USD' | 'BS' | 'EUR' | 'USDT')[] = ['USD', 'BS', 'EUR', 'USDT'];
    const nextIndex = (order.indexOf(displayCurrency) + 1) % order.length;
    setDisplayCurrency(order[nextIndex]);
  };

  useEffect(() => {
    fetchData();
  }, [currentMonthYear]);

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const [year, month] = e.target.value.split('-');
    setCurrentDate(new Date(Number(year), Number(month) - 1, 1));
  };

  const handleDelete = async () => {
    try {
      await deleteEstimatedIncome(confirmDelete.incomeId);
      setIncomes(incomes.filter(i => i.id !== confirmDelete.incomeId));
    } catch (error) {
      console.error('Error deleting income:', error);
    } finally {
      setConfirmDelete({ isOpen: false, incomeId: '' });
    }
  };

  const handleUncheck = async (incomeId: string) => {
    try {
      await uncheckIncome(incomeId, currentMonthYear);
      fetchData();
    } catch (error) {
      console.error('Error unchecking income:', error);
    }
  };

  const handleTogglePause = async (income: EstimatedIncome) => {
    try {
      await updateEstimatedIncome(income.id, { is_active: !income.is_active });
      fetchData();
    } catch (error) {
      console.error('Error toggling income state:', error);
    }
  };

  // Totals calculations (approximate, since currencies might mix, 
  // ideally we convert all to a base currency. For simplicity in the UI we will show native sums or just count them, 
  // but let's sum by base currency if available, or just group them).
  // For the scope of this step, let's just calculate how many are expected vs confirmed vs pending.
  const totalExpectedCount = incomes.length;
  const confirmedIncomes = incomes.filter(i => i.checks && i.checks.length > 0);
  const confirmedCount = confirmedIncomes.length;

  const renderIncomeCard = (income: EstimatedIncome) => {
    const check = income.checks && income.checks.length > 0 ? income.checks[0] : null;
    const isConfirmed = !!check;
    const isPartial = check?.is_partial;
    
    // Calculate equivalencies
    let receivedEquivalent = 0;
    let remaining = income.expected_amount;
    if (check) {
      if (check.currency === income.currency) {
        receivedEquivalent = check.real_amount;
      } else {
        const checkInBs = convertCurrencyAmount(check.real_amount, check.currency, rates).bs;
        const incomeOneUnitInBs = convertCurrencyAmount(1, income.currency, rates).bs;
        receivedEquivalent = incomeOneUnitInBs > 0 ? checkInBs / incomeOneUnitInBs : 0;
      }
      remaining = Math.max(income.expected_amount - receivedEquivalent, 0);
    }

    // Lógica de atraso
    const today = new Date();
    let isOverdue = false;
    if (!isConfirmed && income.payment_day) {
      const paymentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), income.payment_day);
      if (today > paymentDate && currentDate.getMonth() <= today.getMonth() && currentDate.getFullYear() <= today.getFullYear()) {
        isOverdue = true;
      }
    }

    return (
      <div 
        key={income.id} 
        className="soft-card" 
        style={{ 
          padding: '1rem 1.25rem',
          borderLeft: isConfirmed && !isPartial ? '3px solid var(--income-color)' : isConfirmed && isPartial ? '3px solid var(--warning-color)' : isOverdue && income.is_active ? '3px solid var(--expense-color)' : !income.is_active ? '3px solid var(--text-tertiary)' : undefined,
          opacity: !income.is_active ? 0.7 : 1,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {income.name}
            </div>
            {isConfirmed ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 500, color: isPartial ? 'var(--warning-color)' : 'var(--income-color)', background: 'var(--surface-muted)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)', marginTop: '0.25rem' }}>
                <CheckCircle size={10} />
                {isPartial ? 'Pago Parcial' : 'Pagado'}
              </span>
            ) : !income.is_active ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-tertiary)', background: 'var(--surface-muted)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)', marginTop: '0.25rem' }}>
                <Pause size={10} />
                Pausado
              </span>
            ) : isOverdue ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 500, color: 'var(--expense-color)', background: 'var(--surface-muted)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)', marginTop: '0.25rem' }}>
                <AlertCircle size={10} />
                Atrasado
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--surface-muted)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)', marginTop: '0.25rem' }}>
                <Clock size={10} />
                Pendiente
              </span>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {currencyLabels[income.currency]} {formatAmount(income.expected_amount)}
            </div>
            {isConfirmed && (
              <>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Recibido: {currencyLabels[check.currency]} {formatAmount(check.real_amount)}
                </div>
                {check.currency !== income.currency && receivedEquivalent > 0 && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                    ≈ {currencyLabels[income.currency]} {formatAmount(receivedEquivalent)}
                  </div>
                )}
                {isPartial && remaining > 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--warning-color)', fontWeight: 600 }}>
                    Faltan: {currencyLabels[income.currency]} {formatAmount(remaining)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Bottom info row and actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {income.payment_day && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                <Calendar size={12} />
                Día {income.payment_day}
              </span>
            )}
            {isConfirmed && isPartial && check.pending_date && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--warning-color)' }}>
                <AlertCircle size={12} />
                Resto: {new Date(check.pending_date).toLocaleDateString('es-VE')}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {!isConfirmed ? (
              <button 
                onClick={(e) => { e.stopPropagation(); setCheckingIncome(income); setIsCheckFormOpen(true); }} 
                title="Confirmar" 
                style={{
                  width: '32px', height: '32px', borderRadius: 'var(--radius-full)',
                  background: 'var(--surface-muted)', border: 'none', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  color: 'var(--text-tertiary)', transition: 'all 0.15s ease',
                }}
              >
                <Circle size={16} />
              </button>
            ) : (
              <button 
                onClick={(e) => { e.stopPropagation(); handleUncheck(income.id); }} 
                title="Deshacer pago" 
                style={{
                  width: '32px', height: '32px', borderRadius: 'var(--radius-full)',
                  background: 'rgba(16, 185, 129, 0.15)', border: 'none', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  color: 'var(--income-color)', transition: 'all 0.15s ease',
                }}
              >
                <Undo2 size={14} />
              </button>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); handleTogglePause(income); }} 
              title={income.is_active ? "Pausar" : "Reanudar"} 
              style={{
                width: '32px', height: '32px', borderRadius: 'var(--radius-full)',
                background: 'var(--surface-muted)', border: 'none', display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                color: income.is_active ? 'var(--text-secondary)' : '#3B82F6', transition: 'all 0.15s ease',
              }}
            >
              {income.is_active ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setEditingIncome(income); setIsFormOpen(true); }} 
              title="Editar" 
              style={{
                width: '32px', height: '32px', borderRadius: 'var(--radius-full)',
                background: 'var(--surface-muted)', border: 'none', display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                color: 'var(--text-secondary)', transition: 'all 0.15s ease',
              }}
            >
              <Edit3 size={14} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setConfirmDelete({ isOpen: true, incomeId: income.id }); }} 
              title="Eliminar" 
              style={{
                width: '32px', height: '32px', borderRadius: 'var(--radius-full)',
                background: 'var(--surface-muted)', border: 'none', display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                color: 'var(--expense-color)', transition: 'all 0.15s ease',
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const pendingIncomesList = incomes.filter(i => !(i.checks && i.checks.length > 0) && i.is_active);
  const pausedIncomesList = incomes.filter(i => !(i.checks && i.checks.length > 0) && !i.is_active);
  const paidIncomesList = incomes.filter(i => i.checks && i.checks.length > 0);

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', paddingTop: '0.5rem', flexWrap: 'nowrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={onBack}
            style={{
              width: '40px', height: '40px', borderRadius: 'var(--radius-full)',
              background: 'var(--surface-color)', border: 'none', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)', color: 'var(--text-primary)',
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wallet size={24} color="#3B82F6" />
            Ingresos
          </h1>
        </div>
        
        {/* Compact Month Navigator */}
        <div style={{ 
          position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem', 
          background: 'var(--surface-color)', padding: '0.4rem 0.6rem', 
          borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', 
          cursor: 'pointer' 
        }}>
          <Calendar size={18} color="var(--text-secondary)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {React.useMemo(() => {
              const shortMonths = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
              const [y, m] = currentMonthYear.split('-');
              return `${shortMonths[parseInt(m) - 1]} ${y}`;
            }, [currentMonthYear])}
          </span>
          <input
            type="month"
            value={currentMonthYear}
            onChange={handleMonthChange}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer'
            }}
          />
        </div>
      </header>

      {/* Monetary Summary Card */}
      <div
        className="soft-card"
        onClick={cycleCurrency}
        style={{ 
          marginBottom: '1.5rem', padding: '1.5rem', cursor: 'pointer',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.06) 0%, var(--surface-color) 100%)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Recibido
          </span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-full)',
            background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6',
            fontSize: '0.75rem', fontWeight: 600,
            whiteSpace: 'nowrap', flexShrink: 0
          }}>
            <Wallet size={14} />
            {confirmedCount} / {totalExpectedCount} confirmados
          </div>
        </div>
        
        {(() => {
          const { expected, received, pending } = getSummaryAmounts();
          const currLabel = currencyLabels[displayCurrency === 'USD' ? 'USD_BCV' : displayCurrency === 'EUR' ? 'EUR_BCV' : displayCurrency];
          
          return (
            <>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--income-color)', letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
                {isLoading ? '...' : `${currLabel} ${formatAmount(received)}`}
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.15rem' }}>ESPERADO</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {isLoading ? '...' : `${currLabel} ${formatAmount(expected)}`}
                  </div>
                </div>
                <div style={{ width: '1px', background: 'var(--border-color)' }}></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.15rem' }}>PENDIENTE</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--warning-color)' }}>
                    {isLoading ? '...' : `${currLabel} ${formatAmount(pending)}`}
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.75rem', textAlign: 'center' }}>
          Toca para cambiar moneda
        </div>
      </div>

      {/* Add button */}
      <button
        onClick={() => { setEditingIncome(null); setIsFormOpen(true); }}
        style={{
          width: '100%', padding: '0.875rem', marginBottom: '1.25rem',
          background: 'var(--surface-color)', border: '2px dashed var(--accent-light)',
          borderRadius: 'var(--radius-md)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600,
          transition: 'all 0.2s ease',
        }}
      >
        <Plus size={18} /> Añadir ingreso estimado
      </button>

      {isLoading ? (
        <div className="loading">Cargando ingresos...</div>
      ) : incomes.length === 0 ? (
        <div className="empty-state">
          <Wallet size={48} />
          <p>No tienes ingresos estimados para este mes.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Tabs */}
          <div style={{ display: 'flex', background: 'var(--surface-muted)', borderRadius: 'var(--radius-full)', padding: '0.25rem' }}>
            <button
              onClick={() => setActiveTab('pending')}
              style={{
                flex: 1, padding: '0.6rem', border: 'none', borderRadius: 'var(--radius-full)',
                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                background: activeTab === 'pending' ? 'var(--surface-color)' : 'transparent',
                color: activeTab === 'pending' ? 'var(--warning-color)' : 'var(--text-secondary)',
                boxShadow: activeTab === 'pending' ? 'var(--shadow-sm)' : 'none'
              }}
            >
              Pendientes ({pendingIncomesList.length + pausedIncomesList.length})
            </button>
            <button
              onClick={() => setActiveTab('paid')}
              style={{
                flex: 1, padding: '0.6rem', border: 'none', borderRadius: 'var(--radius-full)',
                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                background: activeTab === 'paid' ? 'var(--surface-color)' : 'transparent',
                color: activeTab === 'paid' ? '#3B82F6' : 'var(--text-secondary)',
                boxShadow: activeTab === 'paid' ? 'var(--shadow-sm)' : 'none'
              }}
            >
              Confirmados ({paidIncomesList.length})
            </button>
          </div>

          {/* Pending section */}
          {activeTab === 'pending' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {pendingIncomesList.length === 0 && pausedIncomesList.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem 0', fontSize: '0.9rem' }}>
                  No hay ingresos pendientes.
                </p>
              ) : (
                <>
                  {pendingIncomesList.map(income => renderIncomeCard(income))}

                  {pausedIncomesList.length > 0 && (
                    <>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        marginTop: '1rem', marginBottom: '0.2rem', paddingLeft: '0.25rem',
                      }}>
                        <Pause size={14} style={{ color: 'var(--text-tertiary)' }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Pausados
                        </span>
                      </div>
                      {pausedIncomesList.map(income => renderIncomeCard(income))}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Paid section */}
          {activeTab === 'paid' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {paidIncomesList.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem 0', fontSize: '0.9rem' }}>
                  Aún no has confirmado ingresos este mes.
                </p>
              ) : (
                paidIncomesList.map(income => renderIncomeCard(income))
              )}
            </div>
          )}
        </div>
      )}

      {isFormOpen && (
        <EstimatedIncomeForm
          income={editingIncome}
          onClose={() => { setIsFormOpen(false); setEditingIncome(null); }}
          onSaved={fetchData}
        />
      )}

      {isCheckFormOpen && checkingIncome && (
        <IncomeCheckForm
          income={checkingIncome}
          monthYear={currentMonthYear}
          onClose={() => { setIsCheckFormOpen(false); setCheckingIncome(null); }}
          onSaved={fetchData}
        />
      )}

      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title="Eliminar Ingreso"
        message="¿Estás seguro de que quieres eliminar este ingreso estimado? Esta acción no se puede deshacer y borrará también su historial."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, incomeId: '' })}
      />
    </div>
  );
};

export default EstimatedIncomeList;
