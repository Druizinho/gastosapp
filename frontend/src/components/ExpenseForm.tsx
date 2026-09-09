import { useState, useEffect } from 'react';
import type { ExpenseCreate, ExpenseUpdate, Expense, CurrencyType, ExchangeRates, Category } from '../types';
import { getRates, getCategories } from '../api';

interface ExpenseFormProps {
  initialData?: Expense | null;
  onSubmit: (data: ExpenseCreate | ExpenseUpdate) => Promise<void>;
  onCancel: () => void;
}

const ExpenseForm: React.FC<ExpenseFormProps> = ({ initialData, onSubmit, onCancel }) => {
  const [amount, setAmount] = useState<string>(initialData?.amount.toString() || '');
  const [description, setDescription] = useState<string>(initialData?.description || '');
  const [category, setCategory] = useState<string>(initialData?.category || 'Sin Categoría');
  const [date, setDate] = useState<string>(initialData?.date || new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState<CurrencyType>(initialData?.currency || 'BS_USD');
  const [manualRate, setManualRate] = useState<string>('');
  
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCats, setIsLoadingCats] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setAmount(initialData.amount.toString());
      setDescription(initialData.description);
      setCategory(initialData.category);
      setDate(initialData.date);
      setCurrency(initialData.currency);
      
      // Cargar la tasa histórica
      if (initialData.currency === 'BS_EUR' && initialData.rate_eur_bs) {
        setManualRate(initialData.rate_eur_bs.toString());
      } else if (initialData.currency === 'USDT' && initialData.rate_usdt_bs) {
        setManualRate(initialData.rate_usdt_bs.toString());
      } else if (initialData.rate_usd_bs) {
        setManualRate(initialData.rate_usd_bs.toString());
      }
    }
  }, [initialData]);

  useEffect(() => {
    const fetchRatesAndCats = async () => {
      try {
        const [ratesData, catsData] = await Promise.all([getRates(), getCategories()]);
        setRates(ratesData);
        setCategories(catsData);
        if (!initialData && catsData.length > 0) {
          setCategory(catsData[0].name);
        }
      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        setIsLoadingCats(false);
      }
    };
    fetchRatesAndCats();
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description || !category) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        amount: parseFloat(amount.replace(',', '.')),
        description,
        category,
        date,
        currency,
        manual_rate: manualRate ? parseFloat(manualRate.replace(',', '.')) : undefined
      });
      if (!initialData) {
        setAmount('');
        setDescription('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentRate = rates?.usd_bs;

  return (
    <div className="modal-backdrop">
      <div className="soft-card" style={{ maxWidth: '500px', width: '100%', padding: '2rem', animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1.5rem', textAlign: 'center' }}>
          {initialData ? 'Editar Gasto' : 'Añadir Gasto'}
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Monto</label>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Moneda</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyType)} required>
                <option value="BS_USD">Bs (Tasa Dólar BCV)</option>
                <option value="BS_EUR">Bs (Tasa Euro BCV)</option>
                <option value="USDT">USDT (Binance)</option>
                <option value="USD_CASH">Dólares en Efectivo</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Tasa de Cambio {initialData ? '(Histórica)' : ''}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>(Opcional)</span>
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
            <small style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
              {initialData ? "Esta fue la tasa usada. Modifícala solo si deseas recalcular." : "Déjalo en blanco para usar la tasa automática."}
            </small>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Descripción</label>
            <input 
              type="text" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              required 
              placeholder="¿Qué compraste?"
            />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Categoría</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} required disabled={isLoadingCats}>
                <option value="Sin Categoría">Sin Categoría</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Fecha</label>
              <input 
                type="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)} 
                required 
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button 
              type="button" 
              onClick={onCancel} 
              disabled={isSubmitting}
              style={{ flex: 1, padding: '0.875rem', borderRadius: '12px', border: 'none', background: 'var(--surface-muted)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              style={{ flex: 1, padding: '0.875rem', borderRadius: '12px', border: 'none', background: 'var(--accent-color)', color: 'white', fontWeight: 600, cursor: 'pointer' }}
            >
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseForm;
