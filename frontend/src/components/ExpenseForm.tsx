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
      
      // Cargar la tasa histórica para que el usuario la vea y no se sobreescriba con la de hoy al guardar
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
  // Mostramos el campo de tasa siempre en edición, o si es USD_CASH, o si no cargaron las tasas (offline), o simplemente como opcional siempre.
  // Vamos a mostrarlo siempre como opcional para mayor transparencia.

  return (
    <div className="modal-backdrop">
      <div className="expense-form-container glass-panel" style={{ maxWidth: '500px' }}>
        <h2>{initialData ? 'Edit Expense' : 'Add Expense'}</h2>
        <form onSubmit={handleSubmit} className="expense-form">
          
          <div className="form-group row">
            <div className="form-group half">
              <label>Amount</label>
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
              <label>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyType)} required>
                <option value="BS_USD">Bs (Tasa Dólar BCV)</option>
                <option value="BS_EUR">Bs (Tasa Euro BCV)</option>
                <option value="USDT">USDT (Binance)</option>
                <option value="USD_CASH">Dólares en Efectivo</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ color: '#cbd5e1', display: 'flex', justifyContent: 'space-between' }}>
              <span>Tasa de Cambio {initialData ? '(Histórica)' : ''}</span>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>(Opcional)</span>
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
            <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
              {initialData ? "Esta fue la tasa usada. Modifícala solo si deseas recalcular." : "Déjalo en blanco para usar la tasa automática."}
            </small>
          </div>

          <div className="form-group">
            <label>Description</label>
            <input 
              type="text" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              required 
              placeholder="What did you buy?"
            />
          </div>
          
          <div className="form-group row">
            <div className="form-group half">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} required disabled={isLoadingCats}>
                <option value="Sin Categoría">Sin Categoría</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group half">
              <label>Date</label>
              <input 
                type="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)} 
                required 
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onCancel} className="btn-cancel" disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="btn-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseForm;
