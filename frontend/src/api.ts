import axios from 'axios';
import type { Expense, ExpenseCreate, ExpenseUpdate, SummaryResponse, ExchangeRates } from './types';
import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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

export const getExpenses = async (): Promise<Expense[]> => {
  const response = await api.get('/expenses/');
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

export const deleteCategory = async (id: string): Promise<void> => {
  await api.delete(`/categories/${id}`);
};
