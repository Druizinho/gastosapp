import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit3, ArrowLeft } from 'lucide-react';
import type { Debt, DebtCreate, DebtUpdate, DebtPaymentCreate } from '../types';
import { getDebts, createDebt, updateDebt, addDebtPayment, deleteDebt } from '../api';
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
      const data = await getDebts(type, filterSettled);
      setDebts(data);
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
    const currencyKey = `amount_${debt.currency.toLowerCase().replace('_bcv', '').replace('_cash', '')}` as keyof DebtPaymentCreate;
    
    return debt.payments.reduce((acc, pay) => {
      if (pay.currency === debt.currency) return acc + Number(pay.amount);
      const converted = (pay as any)[currencyKey];
      if (converted) return acc + Number(converted);
      return acc;
    }, 0);
  };

  // VISTA: Detalle de Deuda
  if (selectedDebt && !showForm) {
    const paid = calculatePaid(selectedDebt);
    const remaining = Math.max(selectedDebt.total_amount - paid, 0);
    const progress = Math.min((paid / selectedDebt.total_amount) * 100, 100);

    return (
      <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
        <button 
          onClick={() => {
            if (showPaymentForm) setShowPaymentForm(false);
            else setSelectedDebt(null);
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.25rem',
            background: 'none', border: 'none', color: 'var(--text-secondary)',
            fontSize: '0.9rem', cursor: 'pointer', marginBottom: '1.5rem',
            padding: 0
          }}
        >
          <ArrowLeft size={16} /> {showPaymentForm ? 'Volver al detalle' : 'Volver a la lista'}
        </button>

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
          <div className="soft-card" style={{ padding: '1.5rem' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                {selectedDebt.concept}
              </h2>
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
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', 
              marginBottom: '1.25rem' 
            }}>
              <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--surface-muted)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Total</p>
                <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {formatCurrency(selectedDebt.total_amount, selectedDebt.currency)}
                </p>
              </div>
              <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--income-bg)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Abonado</p>
                <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--income-color)' }}>
                  {formatCurrency(paid, selectedDebt.currency)}
                </p>
              </div>
              <div style={{ textAlign: 'center', padding: '0.75rem', background: remaining > 0 ? 'var(--expense-bg)' : 'var(--income-bg)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Restante</p>
                <p style={{ fontSize: '1rem', fontWeight: 700, color: remaining > 0 ? themeColor : 'var(--income-color)' }}>
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
              <div style={{ width: '100%', background: 'var(--surface-muted)', borderRadius: 'var(--radius-full)', height: '8px', overflow: 'hidden' }}>
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
                marginBottom: '1.25rem', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '0.5rem'
              }}>
                ✅ ¡Deuda completamente liquidada!
              </div>
            )}

            {/* Botones de acción rápida */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button
                onClick={() => setShowPaymentForm(true)}
                disabled={remaining <= 0 || selectedDebt.is_settled}
                style={{
                  flex: 2, padding: '0.75rem', borderRadius: 'var(--radius-md)',
                  background: (remaining <= 0 || selectedDebt.is_settled) ? 'var(--surface-muted)' : themeColor, 
                  color: (remaining <= 0 || selectedDebt.is_settled) ? 'var(--text-tertiary)' : 'white',
                  border: 'none', fontWeight: 600, fontSize: '0.9rem', 
                  cursor: (remaining <= 0 || selectedDebt.is_settled) ? 'not-allowed' : 'pointer'
                }}
              >
                Registrar Abono
              </button>
              <button
                onClick={() => { setEditingDebt(selectedDebt); setShowForm(true); }}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-muted)', color: 'var(--text-secondary)',
                  border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                }}
              >
                <Edit3 size={18} />
              </button>
              <button
                onClick={() => handleDelete(selectedDebt.id)}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-md)',
                  background: 'var(--expense-bg)', color: 'var(--expense-color)',
                  border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                }}
              >
                <Trash2 size={18} />
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
                          ≈ {formatCurrency((payment as any)[`amount_${selectedDebt.currency.toLowerCase().replace('_bcv', '').replace('_cash', '')}`] || 0, selectedDebt.currency)}
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
      <header style={{ marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
        <button 
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.25rem',
            background: 'none', border: 'none', color: 'var(--text-secondary)',
            fontSize: '0.9rem', cursor: 'pointer', marginBottom: '1rem',
            padding: 0
          }}
        >
          <ArrowLeft size={16} /> Herramientas
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: themeColor, marginBottom: '0.25rem', letterSpacing: '-0.02em' }}>
              {title}
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {isOwed ? 'Personas a las que les debes dinero' : 'Personas que te deben dinero'}
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => { setEditingDebt(undefined); setShowForm(true); }}
              style={{
                width: '40px', height: '40px', borderRadius: 'var(--radius-full)',
                background: themeColor, color: 'white', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: 'var(--shadow-md)'
              }}
            >
              <Plus size={20} />
            </button>
          )}
        </div>
      </header>

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
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--accent-light)' }}>
            <button
              onClick={() => setFilterSettled(false)}
              style={{
                background: 'none', border: 'none', padding: '0.75rem 0', cursor: 'pointer',
                fontSize: '0.95rem', fontWeight: !filterSettled ? 700 : 500,
                color: !filterSettled ? themeColor : 'var(--text-secondary)',
                borderBottom: !filterSettled ? `2px solid ${themeColor}` : '2px solid transparent',
              }}
            >
              Activas
            </button>
            <button
              onClick={() => setFilterSettled(true)}
              style={{
                background: 'none', border: 'none', padding: '0.75rem 0', cursor: 'pointer',
                fontSize: '0.95rem', fontWeight: filterSettled ? 700 : 500,
                color: filterSettled ? themeColor : 'var(--text-secondary)',
                borderBottom: filterSettled ? `2px solid ${themeColor}` : '2px solid transparent',
              }}
            >
              Liquidadas
            </button>
          </div>

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
                    style={{ padding: '1.25rem', cursor: 'pointer', opacity: debt.is_settled ? 0.7 : 1 }}
                    onClick={() => {
                      const freshDebt = debts.find(d => d.id === debt.id) || debt;
                      setSelectedDebt(freshDebt);
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {debt.concept}
                      </h3>
                      <span style={{ fontSize: '1.1rem', fontWeight: 800, color: themeColor }}>
                        {formatCurrency(remaining, debt.currency)}
                      </span>
                    </div>
                    
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                      {isOwed ? 'A: ' : 'De: '}<span style={{ fontWeight: 600 }}>{debt.counterpart}</span>
                    </p>

                    <div style={{ width: '100%', background: 'var(--surface-muted)', borderRadius: 'var(--radius-full)', height: '6px', marginBottom: '0.5rem' }}>
                      <div style={{ 
                        height: '6px', 
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
