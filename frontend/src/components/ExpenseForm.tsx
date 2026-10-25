import { useState, useEffect } from 'react';
import type { ExpenseCreate, ExpenseUpdate, Expense, CurrencyType, ExchangeRates } from '../types';
import { CURRENCY_OPTIONS } from '../types';
import { getRates } from '../api';
import { Info } from 'lucide-react';
import CategorySelect from './CategorySelect';
import { useCategories } from '../context/CategoriesContext';

interface ExpenseFormProps {
  initialData?: Expense | null;
  onSubmit: (data: ExpenseCreate | ExpenseUpdate) => Promise<void>;
  onCancel: () => void;
  onCategoriesChanged?: () => void;
}

const ExpenseForm: React.FC<ExpenseFormProps> = ({ initialData, onSubmit, onCancel, onCategoriesChanged }) => {
  const { categories, refreshCategories } = useCategories();
  const [amount, setAmount] = useState<string>(initialData?.amount.toString() || '');
  const [description, setDescription] = useState<string>(initialData?.description || '');
  const [category, setCategory] = useState<string>(initialData?.category || (categories[0]?.name || 'Sin Categoría'));
  const [date, setDate] = useState<string>(initialData?.date || new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState<CurrencyType>(initialData?.currency || 'BS');
  const [manualRate, setManualRate] = useState<string>('');
  
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setAmount(initialData.amount.toString());
      setDescription(initialData.description);
      setCategory(initialData.category);
      setDate(initialData.date);
      setCurrency(initialData.currency);
      
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
    } else if (categories.length > 0 && (!category || category === 'Sin Categoría')) {
      setCategory(categories[0].name);
    }
  }, [initialData, categories]);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const ratesData = await getRates();
        setRates(ratesData);
      } catch (error) {
        console.error("Failed to fetch rates", error);
      }
    };
    fetchRates();
  }, []);

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
      <div className="expense-form-container">
        <h2>{initialData ? 'Editar Gasto' : 'Añadir Gasto'}</h2>
        <form onSubmit={handleSubmit}>
          
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
              <span>{initialData ? "Esta fue la tasa de cambio usada en su momento. Modifícala solo si deseas recalcular el gasto." : "💡 Déjalo en blanco para usar la tasa de cambio automática del sistema (BCV o Binance)."}</span>
            </div>
          </div>

          <div className="form-group">
            <label>Descripción</label>
            <input 
              type="text" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              required 
              maxLength={50}
              placeholder="¿Qué compraste? (Max. 50 caracteres)"
            />
          </div>
          
          <div className="form-group row">
            <div className="form-group half">
              <CategorySelect
                label="Categoría"
                value={category}
                onChange={(newCat) => setCategory(newCat)}
                onCategoryCreated={() => {
                  refreshCategories();
                  onCategoriesChanged?.();
                }}
                required
              />
            </div>
            <div className="form-group half">
              <label>Fecha</label>
              <input 
                type="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)} 
                required 
              />
            </div>
          </div>

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

export default ExpenseForm;
