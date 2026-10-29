import { useState, useEffect } from 'react';
import type { FixedExpenseCreate, FixedExpenseUpdate, FixedExpense, CurrencyType, ExchangeRates, Connection } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import { getRates, getConnections } from '../api';
import { Info, Users } from 'lucide-react';
import { ParticipantPicker } from './panas/ParticipantPicker';
import CategorySelect from './CategorySelect';

interface FixedExpenseFormProps {
  initialData?: FixedExpense | null;
  onSubmit: (data: FixedExpenseCreate | FixedExpenseUpdate) => Promise<void>;
  onCancel: () => void;
}

const FixedExpenseForm: React.FC<FixedExpenseFormProps> = ({ initialData, onSubmit, onCancel }) => {
  const isEditing = !!initialData;
  const isSharedExpense = isEditing && !!initialData?.is_shared;
  const isReadOnlyMember = isSharedExpense && initialData?.my_role === 'member';

  const [name, setName] = useState<string>(initialData?.name || '');
  const [amount, setAmount] = useState<string>(initialData?.amount.toString() || '');
  const [currency, setCurrency] = useState<CurrencyType>(initialData?.currency || 'BS');
  const [category, setCategory] = useState<string>(initialData?.category ?? (!initialData ? 'Gastos Fijos' : ''));
  const [paymentDay, setPaymentDay] = useState<string>(initialData?.payment_day?.toString() || '');
  const [notes, setNotes] = useState<string>(initialData?.notes || '');
  const [manualRate, setManualRate] = useState<string>('');

  const [connections, setConnections] = useState<Connection[]>([]);
  const [isSharedChecked, setIsSharedChecked] = useState(() => Boolean(initialData?.is_shared));
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>(() =>
    (initialData?.shared_members || []).filter(m => (m as any).role !== 'owner' && !m.is_owner).map(m => String(m.user_id))
  );
  const [adminPartnerIds, setAdminPartnerIds] = useState<string[]>(() =>
    (initialData?.shared_members || []).filter(m => m.role === 'admin').map(m => String(m.user_id))
  );

  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setAmount(initialData.amount.toString());
      setCurrency(initialData.currency);
      setCategory(initialData.category || '');
      setPaymentDay(initialData.payment_day?.toString() || '');
      setNotes(initialData.notes || '');
      setIsSharedChecked(Boolean(initialData.is_shared));
      setSelectedPartnerIds(
        (initialData.shared_members || []).filter(m => (m as any).role !== 'owner' && !m.is_owner).map(m => String(m.user_id))
      );
      setAdminPartnerIds(
        (initialData.shared_members || []).filter(m => m.role === 'admin').map(m => String(m.user_id))
      );

      // Cargar la tasa histórica solo para divisas estándar (no inicializar rate_usd_bs para USD_CASH)
      if (initialData.currency === 'EUR_BCV' && initialData.rate_eur_bs) {
        setManualRate(initialData.rate_eur_bs.toString());
      } else if (initialData.currency === 'USDT' && initialData.rate_usdt_bs) {
        setManualRate(initialData.rate_usdt_bs.toString());
      } else if (initialData.currency === 'USD_BCV' && initialData.rate_usd_bs) {
        setManualRate(initialData.rate_usd_bs.toString());
      } else {
        setManualRate('');
      }
    }
  }, [initialData]);

  useEffect(() => {
    if (!isReadOnlyMember) {
      (getConnections as any)(true)
        .then((data: Connection[]) => {
          const accepted = data.filter(c => c.status === 'accepted');
          setConnections(accepted);
        })
        .catch((err: any) => console.error('Error fetching connections:', err));
    }
  }, [isReadOnlyMember]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const ratesData = await getRates();
        setRates(ratesData);
      } catch (error) {
        console.error("Failed to fetch rates", error);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    setIsSubmitting(true);
    try {
      const submitData: FixedExpenseCreate | FixedExpenseUpdate = {
        name,
        amount: parseFloat(amount.replace(',', '.')),
        currency,
        category: category || undefined,
        payment_day: paymentDay ? parseInt(paymentDay) : null,
        notes: notes || undefined,
        manual_rate: manualRate ? parseFloat(manualRate.replace(',', '.')) : undefined,
      };

      if (!isReadOnlyMember) {
        if (isSharedChecked) {
          submitData.shared_with_ids = selectedPartnerIds;
          submitData.admin_ids = adminPartnerIds;
          submitData.shared_with = selectedPartnerIds.length > 0 ? selectedPartnerIds[0] : null;
        } else if (initialData?.is_shared && !isSharedChecked) {
          submitData.shared_with_ids = [];
          submitData.admin_ids = [];
          submitData.shared_with = null;
        } else {
          submitData.shared_with = null;
          submitData.shared_with_ids = [];
          submitData.admin_ids = [];
        }
      }

      await onSubmit(submitData);
      if (!initialData) {
        setName('');
        setAmount('');
        setCategory('Gastos Fijos');
        setNotes('');
        setPaymentDay('');
        setIsSharedChecked(false);
        setSelectedPartnerIds([]);
        setAdminPartnerIds([]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentRate = rates?.usd_bs;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="expense-form-container">
        <h2>{initialData ? 'Editar Gasto Fijo' : 'Nuevo Gasto Fijo'}</h2>

        {initialData?.is_shared && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '0.875rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1rem',
            color: 'var(--text-primary)',
            fontSize: '0.875rem'
          }}>
            <Users size={18} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
            <span>
              Gasto fijo compartido con <strong>{initialData.shared_partner_name}</strong>. Las modificaciones y estados de pago se sincronizan en ambas cuentas.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit}>

          <div className="form-group">
            <label>Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={50}
              placeholder="Ej: Alquiler, Netflix, Internet"
            />
          </div>

          <div className="form-group row">
            <div className="form-group half">
              <label>Monto</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="0.00"
              />
            </div>
            <div className="form-group half">
              <label>Moneda</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyType)} required>
                {CURRENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tasa de Cambio {initialData ? '(Histórica)' : ''}</span>
              <span className="form-hint-inline">(Opcional)</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={manualRate}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.,]/g, '');
                setManualRate(val);
              }}
              placeholder={currentRate ? `Por defecto usa la del mercado` : "Ej. 36.50"}
            />
            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-color)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{initialData ? "Esta fue la tasa de cambio usada. Modifícala solo si deseas recalcular." : "💡 Déjalo en blanco para usar la tasa automática (BCV o Binance)."}</span>
            </div>
          </div>

          <div className="form-group row">
            <div className="form-group half">
              <CategorySelect
                label="Categoría"
                value={category}
                onChange={(newCat) => setCategory(newCat)}
                allowEmpty={true}
                emptyLabel="Sin Categoría"
              />
            </div>
            <div className="form-group half">
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Día de Pago</span>
                <span className="form-hint-inline">(Opcional)</span>
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={paymentDay}
                onChange={(e) => setPaymentDay(e.target.value)}
                placeholder="1-31"
              />
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Notas</span>
              <span className="form-hint-inline">(Opcional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={100}
              placeholder="Notas adicionales..."
            />
          </div>

          {!isReadOnlyMember && (
            <div style={{
              background: 'var(--surface-muted)',
              padding: '0.875rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--accent-light)',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  id="share_fixed_expense"
                  checked={isSharedChecked}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsSharedChecked(checked);
                    if (!checked) {
                      setSelectedPartnerIds([]);
                      setAdminPartnerIds([]);
                    }
                  }}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-color)', cursor: 'pointer' }}
                />
                <label htmlFor="share_fixed_expense" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Users size={16} /> Compartir con Panas (Grupos)
                </label>
              </div>

              {isSharedChecked && (
                <div style={{ marginTop: '0.75rem' }}>
                  <ParticipantPicker
                    connections={connections}
                    selectedIds={selectedPartnerIds}
                    adminIds={adminPartnerIds}
                    onChange={(s, a) => {
                      setSelectedPartnerIds(s);
                      setAdminPartnerIds(a);
                    }}
                    accentColor="var(--accent-color)"
                  />
                  <p style={{ margin: '0.45rem 0 0', fontSize: '0.75rem', color: 'var(--text-tertiary)', lineHeight: 1.35 }}>
                    Todos los integrantes verán este gasto fijo y su estado mensual de pago sincronizado.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="btn-cancel"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-submit"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FixedExpenseForm;
