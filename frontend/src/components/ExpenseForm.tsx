import { useState, useEffect, useContext } from 'react';
import type { ExpenseCreate, ExpenseUpdate, Expense, CurrencyType, ExchangeRates, Income, IncomeCreate, IncomeUpdate, EstimatedIncome } from '../types';
import { CURRENCY_OPTIONS, getCurrencyLabel } from '../types';
import { getRates, getMonthlyIncomes } from '../api';
import { Info } from 'lucide-react';
import CategorySelect from './CategorySelect';
import { useCategories } from '../context/CategoriesContext';
import { SegmentedTabs } from './ui/SegmentedTabs';
import { ToastContext } from './ui/Toast';
import { formatAmountForInput, formatRateForInput } from '../utils/currencyFormat';

interface ExpenseFormProps {
  initialData?: Expense | null;
  initialIncomeData?: Income | null;
  defaultMode?: 'expense' | 'income';
  onSubmit: (data: ExpenseCreate | ExpenseUpdate) => Promise<void>;
  onIncomeSubmit?: (data: IncomeCreate | IncomeUpdate) => Promise<void>;
  onCancel: () => void;
  onCategoriesChanged?: () => void;
}

const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ExpenseForm: React.FC<ExpenseFormProps> = ({
  initialData,
  initialIncomeData,
  defaultMode = 'expense',
  onSubmit,
  onIncomeSubmit,
  onCancel,
  onCategoriesChanged,
}) => {
  const { categories, incomeCategories, refreshCategories } = useCategories();
  const toast = useContext(ToastContext);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mode, setMode] = useState<'expense' | 'income'>(
    initialIncomeData ? 'income' : (initialData ? 'expense' : defaultMode)
  );

  const [amount, setAmount] = useState<string>(
    formatAmountForInput(initialIncomeData ? initialIncomeData.amount : initialData?.amount)
  );
  const [description, setDescription] = useState<string>(
    initialIncomeData ? initialIncomeData.description : (initialData?.description || '')
  );
  const [category, setCategory] = useState<string>(() => {
    if (initialIncomeData) return initialIncomeData.category || 'Otros ingresos';
    if (initialData) return initialData.category;
    if (defaultMode === 'income') return 'Otros ingresos';
    return categories[0]?.name || 'Sin Categoría';
  });
  const [date, setDate] = useState<string>(
    initialIncomeData ? initialIncomeData.date : (initialData?.date || getLocalToday())
  );
  const [currency, setCurrency] = useState<CurrencyType>(
    initialIncomeData ? initialIncomeData.currency : (initialData?.currency || 'BS')
  );
  const [manualRate, setManualRate] = useState<string>('');

  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingTemplates, setPendingTemplates] = useState<EstimatedIncome[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  useEffect(() => {
    if (initialIncomeData) {
      setMode('income');
      setAmount(formatAmountForInput(initialIncomeData.amount));
      setDescription(initialIncomeData.description);
      setCategory(initialIncomeData.category || 'Otros ingresos');
      setDate(initialIncomeData.date);
      setCurrency(initialIncomeData.currency);

      if (initialIncomeData.currency === 'EUR_BCV' && initialIncomeData.rate_eur_bs) {
        setManualRate(formatRateForInput(initialIncomeData.rate_eur_bs));
      } else if (initialIncomeData.currency === 'USDT' && initialIncomeData.rate_usdt_bs) {
        setManualRate(formatRateForInput(initialIncomeData.rate_usdt_bs));
      } else if (initialIncomeData.currency === 'USD_BCV' && initialIncomeData.rate_usd_bs) {
        setManualRate(formatRateForInput(initialIncomeData.rate_usd_bs));
      } else {
        setManualRate('');
      }
    } else if (initialData) {
      setMode('expense');
      setAmount(formatAmountForInput(initialData.amount));
      setDescription(initialData.description);
      setCategory(initialData.category);
      setDate(initialData.date);
      setCurrency(initialData.currency);

      // Cargar la tasa histórica solo para divisas estándar (no inicializar rate_usd_bs para USD_CASH)
      if (initialData.currency === 'EUR_BCV' && initialData.rate_eur_bs) {
        setManualRate(formatRateForInput(initialData.rate_eur_bs));
      } else if (initialData.currency === 'USDT' && initialData.rate_usdt_bs) {
        setManualRate(formatRateForInput(initialData.rate_usdt_bs));
      } else if (initialData.currency === 'USD_BCV' && initialData.rate_usd_bs) {
        setManualRate(formatRateForInput(initialData.rate_usd_bs));
      } else {
        setManualRate('');
      }
    } else {
      if (mode === 'income') {
        const categoryExistsInIncome = incomeCategories.some(
          (c) => c.name.toLowerCase() === category?.trim().toLowerCase()
        );
        if (!categoryExistsInIncome || category === 'Sin Categoría') {
          const defaultCat = incomeCategories.find((c) => c.name === 'Otros ingresos')?.name
            || incomeCategories[0]?.name
            || 'Otros ingresos';
          setCategory(defaultCat);
        }
      } else {
        const categoryExistsInExpense = categories.some(
          (c) => c.name.toLowerCase() === category?.trim().toLowerCase()
        );
        if (!categoryExistsInExpense || category === 'Otros ingresos' || !category) {
          setCategory(categories[0]?.name || 'Sin Categoría');
        }
      }
    }
  }, [initialData, initialIncomeData, categories, incomeCategories, mode]);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const currentRates = await getRates(date || undefined);
        setRates(currentRates);
      } catch (err) {
        console.error('Failed to load exchange rates inside form', err);
      }
    };
    fetchRates();
  }, [date]);

  const monthYear = date ? date.slice(0, 7) : getLocalToday().slice(0, 7);

  useEffect(() => {
    if (mode !== 'income' || initialIncomeData) {
      setPendingTemplates([]);
      setSelectedTemplateId('');
      return;
    }

    let cancelled = false;
    getMonthlyIncomes(monthYear)
      .then((data) => {
        if (cancelled) return;
        const filtered = (data || []).filter((item) => {
          if (!item.is_active) return false;
          const check = item.checks?.find((c) => c.month_year === monthYear) || item.checks?.[0];
          return !check || check.is_partial;
        });
        setPendingTemplates(filtered);
      })
      .catch((err) => {
        console.error("Failed to fetch monthly incomes", err);
        setPendingTemplates([]);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, monthYear, initialIncomeData]);

  const handleModeChange = (newMode: 'expense' | 'income') => {
    setMode(newMode);
    if (newMode === 'income') {
      const defaultIncomeCat = incomeCategories.find((c) => c.name === 'Otros ingresos')?.name
        || incomeCategories[0]?.name
        || 'Otros ingresos';
      setCategory(defaultIncomeCat);
    } else {
      setSelectedTemplateId('');
      setCategory(categories[0]?.name || 'Sin Categoría');
    }
  };

  const handleTemplateChange = (eOrId: React.ChangeEvent<HTMLSelectElement> | string) => {
    const tplId = typeof eOrId === 'string' ? eOrId : eOrId.target.value;
    const prevTemplateId = selectedTemplateId;
    setSelectedTemplateId(tplId);
    if (!tplId) return;

    const tpl = pendingTemplates.find((t) => t.id === tplId);
    if (!tpl) return;

    if (tpl.currency) {
      setCurrency(tpl.currency);
    }
    setCategory(tpl.category || 'Otros ingresos');

    const isPrevTplName = pendingTemplates.some((t) => t.name.slice(0, 50) === description.trim());
    if (!description.trim() || isPrevTplName) {
      setDescription(tpl.name.slice(0, 50));
    }

    const check = tpl.checks?.find((c) => c.month_year === monthYear) || tpl.checks?.[0];
    const expectedNum = Number(tpl.expected_amount) || 0;
    const realNum = Number(check?.real_amount) || 0;
    const remaining = check && check.is_partial && expectedNum > realNum
      ? Number((expectedNum - realNum).toFixed(2))
      : expectedNum;
    if (remaining > 0 && (!amount.trim() || Number(amount) <= 0 || prevTemplateId !== tplId)) {
      setAmount(formatAmountForInput(remaining));
    }
  };

  const isUsdtRateMissing = currency === 'USDT' && rates !== null && (rates.usdt_bs === null || rates.usdt_bs === undefined || rates.usdt_bs <= 0);
  const currentRate = currency === 'EUR_BCV' ? rates?.eur_bs : currency === 'USDT' ? rates?.usdt_bs : rates?.usd_bs;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    let effectiveCategory = category?.trim();
    if (mode === 'income') {
      const isValid = incomeCategories.length === 0 || incomeCategories.some(
        (c) => c.name.toLowerCase() === effectiveCategory?.toLowerCase()
      );
      if (!isValid || !effectiveCategory || effectiveCategory === 'Sin Categoría') {
        effectiveCategory = incomeCategories.find((c) => c.name === 'Otros ingresos')?.name
          || incomeCategories[0]?.name
          || 'Otros ingresos';
      }
    } else {
      const isValid = categories.length === 0 || categories.some(
        (c) => c.name.toLowerCase() === effectiveCategory?.toLowerCase()
      );
      if (!isValid || !effectiveCategory || effectiveCategory === 'Otros ingresos') {
        effectiveCategory = categories[0]?.name || 'Sin Categoría';
      }
    }

    if (!amount || !description || !effectiveCategory) return;

    setIsSubmitting(true);
    try {
      const parsedAmount = parseFloat(amount.replace(',', '.'));
      const parsedManualRate = manualRate ? parseFloat(manualRate.replace(',', '.')) : undefined;

      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        const errorMsg = 'Por favor ingresa un monto válido mayor a 0';
        setSubmitError(errorMsg);
        if (toast) toast.error(errorMsg);
        setIsSubmitting(false);
        return;
      }

      if (mode === 'income') {
        if (initialIncomeData) {
          if (onIncomeSubmit) {
            await onIncomeSubmit({
              amount: parsedAmount,
              description,
              category: effectiveCategory,
              date,
              currency,
              manual_rate: parsedManualRate,
            } as IncomeUpdate);
          }
        } else {
          if (onIncomeSubmit) {
            let incomeCheckTarget = null;
            if (selectedTemplateId) {
              const tpl = pendingTemplates.find((t) => t.id === selectedTemplateId);
              const check = tpl?.checks?.find((c) => c.month_year === date.slice(0, 7)) || tpl?.checks?.[0];
              const alreadyPaid = Number(check?.real_amount) || 0;
              const expectedNum = Number(tpl?.expected_amount) || 0;
              const isPartialPayment = expectedNum > 0 ? (alreadyPaid + parsedAmount) < expectedNum : false;

              incomeCheckTarget = {
                estimated_income_id: selectedTemplateId,
                month_year: date.slice(0, 7),
                is_partial: isPartialPayment,
              };
            }

            const createData: IncomeCreate = {
              amount: parsedAmount,
              description,
              category: effectiveCategory,
              date,
              currency,
              manual_rate: parsedManualRate,
              income_check_target: incomeCheckTarget,
            };
            await onIncomeSubmit(createData);
          }
        }
      } else {
        await onSubmit({
          amount: parsedAmount,
          description,
          category: effectiveCategory,
          date,
          currency,
          manual_rate: parsedManualRate,
        });
      }

      if (!initialData && !initialIncomeData) {
        setAmount('');
        setDescription('');
        setSelectedTemplateId('');
      }
    } catch (err: any) {
      console.error('Error saving:', err);
      const msg = err?.response?.data?.detail || err?.message || 'Error al guardar. Inténtalo de nuevo.';
      const errorMsg = typeof msg === 'string' ? msg : 'Error al guardar';
      setSubmitError(errorMsg);
      if (toast) {
        toast.error(errorMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEditing = Boolean(initialData || initialIncomeData);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="expense-form-container" onClick={(e) => e.stopPropagation()}>
        <h2>
          {mode === 'income'
            ? (initialIncomeData ? 'Editar Ingreso' : 'Nuevo Ingreso')
            : (initialData ? 'Editar Gasto' : 'Añadir Gasto')}
        </h2>

        {!isEditing && (
          <div style={{ marginBottom: '1.25rem' }}>
            <SegmentedTabs<'expense' | 'income'>
              tabs={[
                { id: 'expense', label: 'Gasto' },
                { id: 'income', label: 'Ingreso' },
              ]}
              activeTab={mode}
              onChange={handleModeChange}
            />
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'income' && !initialIncomeData && (
            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>¿Corresponde a un cobro pendiente?</span>
                <span className="form-hint-inline">(Opcional)</span>
              </label>
              <select value={selectedTemplateId} onChange={handleTemplateChange}>
                <option value="">Ninguno (ingreso suelto)</option>
                {pendingTemplates.map((tpl) => {
                  const check = tpl.checks?.find((c) => c.month_year === monthYear) || tpl.checks?.[0];
                  const remaining = check?.is_partial && Number(tpl.expected_amount) > Number(check.real_amount)
                    ? Number(tpl.expected_amount) - Number(check.real_amount)
                    : Number(tpl.expected_amount);
                  const currLabel = getCurrencyLabel(tpl.currency);
                  const conciseStatus = check?.is_partial
                    ? `· Resta ${currLabel} ${formatAmountForInput(remaining)}`
                    : `· ${currLabel} ${formatAmountForInput(tpl.expected_amount)}`;
                  return (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} {conciseStatus}
                    </option>
                  );
                })}
              </select>

              {selectedTemplateId && (() => {
                const tpl = pendingTemplates.find((t) => t.id === selectedTemplateId);
                if (!tpl) return null;
                const check = tpl.checks?.find((c) => c.month_year === monthYear) || tpl.checks?.[0];
                const expectedNum = Number(tpl.expected_amount) || 0;
                const realNum = Number(check?.real_amount) || 0;
                const remaining = check?.is_partial && expectedNum > realNum ? expectedNum - realNum : expectedNum;
                const isPartial = Boolean(check?.is_partial);

                return (
                  <div style={{
                    marginTop: '0.65rem',
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-sm, 12px)',
                    background: 'rgba(59, 130, 246, 0.05)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {tpl.name}
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                        background: isPartial ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                        color: isPartial ? '#D97706' : '#2563EB',
                      }}>
                        {isPartial ? 'Pago Parcial Previo' : 'Cobro Completo'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '0.75rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-tertiary)', display: 'block' }}>Esperado</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{getCurrencyLabel(tpl.currency)} {formatAmountForInput(expectedNum)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-tertiary)', display: 'block' }}>Recibido</span>
                        <strong style={{ color: isPartial ? '#D97706' : 'var(--text-secondary)' }}>{getCurrencyLabel(tpl.currency)} {formatAmountForInput(realNum)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-tertiary)', display: 'block' }}>Resta</span>
                        <strong style={{ color: '#2563EB' }}>{getCurrencyLabel(tpl.currency)} {formatAmountForInput(remaining)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

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
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>Tasa de Cambio {isEditing ? '(Histórica)' : ''}</span>
                {currency !== 'BS' && currency !== 'USD_CASH' && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.5rem',
                      borderRadius: 'var(--radius-full)',
                      background: isUsdtRateMissing ? 'rgba(239, 68, 68, 0.12)' : 'var(--surface-muted, rgba(0, 0, 0, 0.05))',
                      color: isUsdtRateMissing ? '#ef4444' : 'var(--text-secondary)',
                    }}
                  >
                    {isUsdtRateMissing
                      ? 'No hay precio en esta fecha'
                      : currentRate && Number(currentRate) > 0
                        ? `Bs. ${Number(currentRate).toFixed(2)}`
                        : 'Sin tasa'}
                  </span>
                )}
              </span>
              <span className="form-hint-inline">
                (Opcional)
              </span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={manualRate}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.,]/g, '');
                setManualRate(val);
              }}
              placeholder={
                isUsdtRateMissing
                  ? "No hay precio en esta fecha — tasa manual opcional"
                  : currentRate && Number(currentRate) > 0
                    ? `Por defecto: Bs. ${Number(currentRate).toFixed(2)}`
                    : "Ej. 36.50"
              }
            />
            {isUsdtRateMissing ? (
              <div
                style={{
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  background: 'rgba(234, 179, 8, 0.12)',
                  color: '#b45309',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  border: '1px solid rgba(234, 179, 8, 0.25)',
                }}
              >
                <Info size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#b45309' }} />
                <span>No hay precio de USDT en esta fecha. Puedes ingresar una tasa manual (opcional).</span>
              </div>
            ) : (
              <div
                style={{
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  background: 'rgba(59, 130, 246, 0.1)',
                  color: 'var(--accent-color)',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                }}
              >
                <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  {isEditing
                    ? (mode === 'income'
                        ? "Esta fue la tasa de cambio usada en su momento. Modifícala solo si deseas recalcular el ingreso."
                        : "Esta fue la tasa de cambio usada en su momento. Modifícala solo si deseas recalcular el gasto.")
                    : "💡 Déjalo en blanco para usar la tasa de cambio automática del sistema (BCV o Binance)."}
                </span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Descripción</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              maxLength={50}
              placeholder={
                mode === 'income'
                  ? "¿De qué fue el ingreso? (Max. 50 caracteres)"
                  : "¿Qué compraste? (Max. 50 caracteres)"
              }
            />
          </div>

          <div className="form-group row">
            <div className="form-group half">
              <CategorySelect
                label="Categoría"
                value={category}
                onChange={(newCat) => setCategory(newCat)}
                categories={mode === 'income' ? incomeCategories : categories}
                {...({ kind: mode } as any)}
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

          {submitError && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                borderRadius: '8px',
                fontSize: '0.85rem',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              {submitError}
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

export default ExpenseForm;
