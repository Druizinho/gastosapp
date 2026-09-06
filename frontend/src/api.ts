import axios from 'axios';
import type { Expense, ExpenseCreate, ExpenseUpdate, SummaryResponse } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
});

export const getExpenses = async (): Promise<Expense[]> => {
  const response = await api.get('/expenses/');
  return response.data;
};

export const getSummary = async (): Promise<SummaryResponse> => {
  const response = await api.get('/expenses/summary');
  return response.data;
};

export const createExpense = async (expense: ExpenseCreate): Promise<Expense> => {
  const response = await api.post('/expenses/', expense);
  return response.data;
};

export const updateExpense = async (id: string, expense: ExpenseUpdate): Promise<Expense> => {
  const response = await api.put(`/expenses/${id}`, expense);
  return response.data;
};

export const deleteExpense = async (id: string): Promise<void> => {
  await api.delete(`/expenses/${id}`);
};
