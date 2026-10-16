import { useState, useEffect } from 'react';
import type { FixedExpenseCreate, FixedExpenseUpdate, FixedExpense, CurrencyType, ExchangeRates, Category, Connection } from '../types';
import { getRates, getCategories, getConnections } from '../api';
import { Info, Users } from 'lucide-react';

interface FixedExpenseFormProps {
  initialData?: FixedExpense | null;
  onSubmit: (data: FixedExpenseCreate | FixedExpenseUpdate) => Promise<void>;
  onCancel: () => void;
}

const FixedExpenseForm: React.FC<FixedExpenseFormProps> = ({ initialData, onSubmit, onCancel }) => {
  const [name, setName] = useState<string>(initialData?.name || '');
  const [amount, setAmount] = useState<string>(initialData?.amount.toString() || '');
  const [currency, setCurrency] = useState<CurrencyType>(initialData?.currency || 'BS');
  const [category, setCategory] = useState<string>(initialData?.category || '');
  const [paymentDay, setPaymentDay] = useState<string>(initialData?.payment_day?.toString() || '');
  const [notes, setNotes] = useState<string>(initialData?.notes || '');
  const [manualRate, setManualRate] = useState<string>('');

  const [connections, setConnections] = useState<Connection[]>([]);
  const [isSharedChecked, setIsSharedChecked] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');

  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCats, setIsLoadingCats] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setAmount(initialData.amount.toString());
      setCurrency(initialData.currency);
      setCategory(initialData.category || '');
      setPaymentDay(initialData.payment_day?.toString() || '');
      setNotes(initialData.notes || '');

      if (initialData.currency === 'EUR_BCV' && initialData.rate_eur_bs) {
        setManualRate(initialData.rate_eur_bs.toString());
      } else if (initialData.currency === 'USDT' && initialData.rate_usdt_bs) {
        setManualRate(initialData.rate_usdt_bs.toString());
      } else if (initialData.rate_usd_bs) {
        setManualRate(initialData.rate_usd_bs.toString());
      }
    }
  }, [initialData]);

  useEffect(() => {
    if (!initialData?.is_shared) {
      getConnections()
        .then(data => {
          const accepted = data.filter(c => c.status === 'accepted');
          setConnections(accepted);
        })
        .catch(err => console.error('Error fetching connections:', err));
    }
  }, [initialData]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ratesData, catsData] = await Promise.all([getRates(), getCategories()]);
        setRates(ratesData);
        setCategories(catsData);
      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        setIsLoadingCats(false);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name,
        amount: parseFloat(amount.replace(',', '.')),
        currency,
        category: category || undefined,
        payment_day: paymentDay ? parseInt(paymentDay) : null,
        notes: notes || undefined,
        manual_rate: manualRate ? parseFloat(manualRate.replace(',', '.')) : undefined,
        shared_with: !initialData?.is_shared && isSharedChecked && selectedPartnerId ? selectedPartnerId : null,
      });
      if (!initialData) {
        setName('');
        setAmount('');
        setNotes('');
        setPaymentDay('');
        setIsSharedChecked(false);
        setSelectedPartnerId('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentRate = rates?.usd_bs;

  return (
    <div className="modal-backdrop">
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
                <option value="USD_BCV">Dólar BCV</option>
                <option value="EUR_BCV">Euro BCV</option>
                <option value="BS">Bolívares</option>
                <option value="USDT">USDT (Binance)</option>
                <option value="USD_CASH">Dólares en Efectivo</option>
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
              <label>Categoría</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={isLoadingCats}>
                <option value="">Sin Categoría</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
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

          {!initialData?.is_shared && (
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
                      setSelectedPartnerId('');
                    } else if (connections.length > 0) {
                      setSelectedPartnerId(connections[0].partner_id);
                    }
                  }}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-color)', cursor: 'pointer' }}
                />
                <label htmlFor="share_fixed_expense" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Users size={16} /> Compartir con un Pana
                </label>
              </div>

              {isSharedChecked && (
                <div style={{ marginTop: '0.75rem' }}>
                  {connections.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                      <Info size={14} />
                      <span>
                        No tienes panas conectados. Ve a <strong>Herramientas &gt; Panas</strong> para conectar con otros perfiles.
                      </span>
                    </div>
                  ) : (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Seleccionar Pana
                      </label>
                      <select
                        value={selectedPartnerId}
                        onChange={(e) => setSelectedPartnerId(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.6rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--accent-light)',
                          background: 'var(--surface-color)',
                          color: 'var(--text-primary)',
                          fontSize: '0.875rem'
                        }}
                      >
                        {connections.map(c => (
                          <option key={c.partner_id} value={c.partner_id}>
                            👤 {c.partner_name}
                          </option>
                        ))}
                      </select>
                      <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        Tu pana podrá ver este gasto fijo y su estado de pago mensual sincronizado.
                      </p>
                    </div>
                  )}
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
