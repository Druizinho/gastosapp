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
  const [isLoadingRates, setIsLoadingRates] = useState(true);
  const [isLoadingCats, setIsLoadingCats] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setAmount(initialData.amount.toString());
      setDescription(initialData.description);
      setCategory(initialData.category);
      setDate(initialData.date);
      setCurrency(initialData.currency);
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
        setIsLoadingRates(false);
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
        amount: parseFloat(amount),
        description,
        category,
        date,
        currency,
        manual_rate: manualRate ? parseFloat(manualRate) : undefined
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
  const showFallback = !isLoadingRates && !currentRate && currency !== 'USD_CASH';

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

          {showFallback && (
            <div className="form-group alert-box">
              <label>Network Error: Enter Manual Rate (Bs/USD)</label>
              <input 
                type="number" 
                step="0.01" 
                min="0.01" 
                value={manualRate} 
                onChange={(e) => setManualRate(e.target.value)} 
                placeholder="Ej. 36.50"
              />
            </div>
          )}

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
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                {categories.length === 0 && <option value="Sin Categoría">Sin Categoría</option>}
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
