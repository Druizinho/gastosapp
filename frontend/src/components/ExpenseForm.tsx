import React, { useState, useEffect } from 'react';
import type { ExpenseCreate, ExpenseUpdate, Expense } from '../types';

interface ExpenseFormProps {
  initialData?: Expense | null;
  onSubmit: (data: ExpenseCreate | ExpenseUpdate) => Promise<void>;
  onCancel: () => void;
}

const CATEGORIES = [
  'Food', 'Transport', 'Entertainment', 'Bills', 'Shopping', 'Other'
];

const ExpenseForm: React.FC<ExpenseFormProps> = ({ initialData, onSubmit, onCancel }) => {
  const [amount, setAmount] = useState<string>(initialData?.amount.toString() || '');
  const [description, setDescription] = useState<string>(initialData?.description || '');
  const [category, setCategory] = useState<string>(initialData?.category || CATEGORIES[0]);
  const [date, setDate] = useState<string>(initialData?.date || new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setAmount(initialData.amount.toString());
      setDescription(initialData.description);
      setCategory(initialData.category);
      setDate(initialData.date);
    }
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
        date
      });
      if (!initialData) {
        setAmount('');
        setDescription('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="expense-form-container glass-panel">
        <h2>{initialData ? 'Edit Expense' : 'Add Expense'}</h2>
        <form onSubmit={handleSubmit} className="expense-form">
          <div className="form-group">
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
              <select value={category} onChange={(e) => setCategory(e.target.value)} required>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
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
