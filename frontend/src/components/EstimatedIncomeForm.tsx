import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { createEstimatedIncome, updateEstimatedIncome } from '../api';
import type { EstimatedIncome, EstimatedIncomeCreate, EstimatedIncomeUpdate, CurrencyType } from '../types';

interface EstimatedIncomeFormProps {
  income: EstimatedIncome | null;
  onClose: () => void;
  onSaved: () => void;
}

const EstimatedIncomeForm: React.FC<EstimatedIncomeFormProps> = ({ income, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyType>('USD_CASH');
  const [paymentDay, setPaymentDay] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (income) {
      setName(income.name);
      setExpectedAmount(income.expected_amount.toString());
      setCurrency(income.currency);
      setPaymentDay(income.payment_day ? income.payment_day.toString() : '');
      setNotes(income.notes || '');
    }
  }, [income]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(expectedAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Por favor, ingresa un monto válido.');
      return;
    }

    let dayNum: number | null = null;
    if (paymentDay.trim() !== '') {
      dayNum = parseInt(paymentDay, 10);
      if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
        setError('El día de pago debe ser entre 1 y 31.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (income) {
        const updateData: EstimatedIncomeUpdate = {
          name,
          expected_amount: amountNum,
          currency,
          payment_day: dayNum,
          notes: notes || undefined,
        };
        await updateEstimatedIncome(income.id, updateData);
      } else {
        const createData: EstimatedIncomeCreate = {
          name,
          expected_amount: amountNum,
          currency,
          payment_day: dayNum,
          notes: notes || undefined,
        };
        await createEstimatedIncome(createData);
      }
      onSaved();
    } catch (err: any) {
      console.error('Error saving income:', err);
      setError(err.response?.data?.detail || 'Error al guardar el ingreso.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="expense-form-container">
        <h2>{income ? 'Editar Ingreso Estimado' : 'Nuevo Ingreso Estimado'}</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre / Fuente</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Sueldo, Freelance, Bono..."
              required
            />
          </div>

          <div className="form-group row">
            <div className="form-group half">
              <label>Monto</label>
              <input
                type="number"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0.01"
                required
              />
            </div>
            <div className="form-group half">
              <label>Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyType)}
                required
              >
                <option value="USD_CASH">Dólares Efectivo</option>
                <option value="USDT">USDT (Binance)</option>
                <option value="USD_BCV">Dólar BCV</option>
                <option value="EUR_BCV">Euro BCV</option>
                <option value="BS">Bolívares</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Día estimado de pago</span>
              <span className="form-hint-inline">(Opcional)</span>
            </label>
            <input
              type="number"
              value={paymentDay}
              onChange={(e) => setPaymentDay(e.target.value)}
              placeholder="1-31"
              min="1"
              max="31"
            />
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
              placeholder="Detalles adicionales..."
              maxLength={100}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
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

export default EstimatedIncomeForm;
// Force IDE refresh
