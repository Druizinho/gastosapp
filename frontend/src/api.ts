import axios from 'axios';
import type { Expense, ExpenseCreate, ExpenseUpdate, SummaryResponse, ExchangeRates, RangeSummaryResponse, FixedExpense, FixedExpenseCreate, FixedExpenseUpdate, FixedExpenseSummary, Debt, DebtCreate, DebtUpdate, DebtPaymentCreate } from './types';
import { supabase } from './supabaseClient';

const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
// Asegurarnos de que siempre termine en /api, incluso si en Vercel lo configuraron sin él
const API_URL = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

export const getExpenses = async (from?: string, to?: string): Promise<Expense[]> => {
  const params: any = {};
  if (from) params.date_from = from;
  if (to) params.date_to = to;
  const response = await api.get('/expenses/', { params });
  return response.data;
};

export const getRates = async (): Promise<ExchangeRates> => {
  const response = await api.get('/expenses/rates');
  return response.data;
};

export const getSummary = async (): Promise<SummaryResponse> => {
  const response = await api.get('/expenses/summary');
  return response.data;
};

export const getSummaryRange = async (from: string, to: string): Promise<RangeSummaryResponse> => {
  const response = await api.get('/expenses/summary-range', { 
    params: { date_from: from, date_to: to }
  });
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

export const getCategories = async (): Promise<any[]> => {
  const response = await api.get('/categories/');
  return response.data;
};

export const createCategory = async (category: any): Promise<any> => {
  const response = await api.post('/categories/', category);
  return response.data;
};

export const updateCategory = async (id: string, category: any): Promise<any> => {
  const response = await api.put(`/categories/${id}`, category);
  return response.data;
};

export const deleteCategory = async (id: string): Promise<void> => {
  await api.delete(`/categories/${id}`);
};

// Profile
export const getProfile = async (): Promise<any> => {
  const response = await api.get('/profile/');
  return response.data;
};

export const updateProfile = async (data: { display_name?: string; avatar_url?: string }): Promise<any> => {
  const response = await api.put('/profile/', data);
  return response.data;
};

// Fixed Expenses
export const getFixedExpenses = async (activeOnly: boolean = false): Promise<FixedExpense[]> => {
  const params: any = {};
  if (activeOnly) params.active_only = true;
  const response = await api.get('/fixed-expenses/', { params });
  return response.data;
};

export const getFixedExpenseSummary = async (): Promise<FixedExpenseSummary> => {
  const response = await api.get('/fixed-expenses/summary');
  return response.data;
};

export const createFixedExpense = async (expense: FixedExpenseCreate): Promise<FixedExpense> => {
  const response = await api.post('/fixed-expenses/', expense);
  return response.data;
};

export const updateFixedExpense = async (id: string, expense: FixedExpenseUpdate): Promise<FixedExpense> => {
  const response = await api.put(`/fixed-expenses/${id}`, expense);
  return response.data;
};

export const deleteFixedExpense = async (id: string): Promise<void> => {
  await api.delete(`/fixed-expenses/${id}`);
};

// Debts
export const getDebts = async (type: 'owed' | 'receivable', isSettled?: boolean): Promise<Debt[]> => {
  const params: any = { type };
  if (isSettled !== undefined) params.is_settled = isSettled;
  const response = await api.get('/debts/', { params });
  return response.data;
};

export const getDebt = async (id: string): Promise<Debt> => {
  const response = await api.get(`/debts/${id}`);
  return response.data;
};

export const createDebt = async (debt: DebtCreate): Promise<Debt> => {
  const response = await api.post('/debts/', debt);
  return response.data;
};

export const updateDebt = async (id: string, debt: DebtUpdate): Promise<Debt> => {
  const response = await api.put(`/debts/${id}`, debt);
  return response.data;
};

export const deleteDebt = async (id: string): Promise<void> => {
  await api.delete(`/debts/${id}`);
};

export const addDebtPayment = async (debtId: string, payment: DebtPaymentCreate): Promise<Debt> => {
  const response = await api.post(`/debts/${debtId}/payments`, payment);
  return response.data;
};

