import axios from 'axios';
import type { Expense, ExpenseCreate, ExpenseUpdate, SummaryResponse, ExchangeRates, RangeSummaryResponse, FixedExpense, FixedExpenseCreate, FixedExpenseUpdate, FixedExpenseSummary, FixedExpenseCheck, FixedExpenseCheckCreate, FixedExpenseCheckUpdate, Debt, DebtCreate, DebtUpdate, DebtPaymentCreate, DebtPaymentUpdate, EstimatedIncome, EstimatedIncomeCreate, EstimatedIncomeUpdate, IncomeCheckCreate, IncomeCheck, Connection, SavingGoal, SavingGoalCreate, SavingGoalUpdate, SavingDepositCreate, SavingDepositUpdate, SavingSummaryResponse, PanasGlobalOverview, PanaDetail, ShareRole, ShareInfoOut, UpdateLocalCategoryResponse, MonthlyBudgetResponse, MonthlyBudgetUpsert, BudgetCategoryLimitInput, MonthlyBudgetCreate, MonthlyBudgetUpdate, Category, CategoryCreate } from './types';
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

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve(token!);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest?._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !session?.access_token) {
          throw refreshError || new Error('No active session');
        }
        const newToken = session.access_token;
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

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

export const getCategories = async (): Promise<Category[]> => {
  const response = await api.get('/categories/');
  return response.data;
};

export const createCategory = async (category: CategoryCreate): Promise<Category> => {
  const response = await api.post('/categories/', category);
  return response.data;
};

export const updateCategory = async (id: string, category: Partial<CategoryCreate>): Promise<Category> => {
  const response = await api.put(`/categories/${id}`, category);
  return response.data;
};

export const deleteCategory = async (id: string, reassignTo?: string): Promise<void> => {
  await api.delete(`/categories/${id}`, {
    params: reassignTo ? { reassign_to: reassignTo } : undefined,
  });
};

export const seedDefaultCategories = async (): Promise<Category[]> => {
  const response = await api.post('/categories/seed-defaults');
  return response.data;
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

export const getMonthlyFixedExpenses = async (monthYear: string): Promise<FixedExpense[]> => {
  const response = await api.get(`/fixed-expenses/monthly/${monthYear}`);
  return response.data;
};

export const getFixedExpenseSummary = async (month?: string): Promise<FixedExpenseSummary> => {
  const params: any = {};
  if (month) params.month = month;
  const response = await api.get('/fixed-expenses/summary', { params });
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

export const deleteFixedExpense = async (id: string, month_year?: string): Promise<void> => {
  await api.delete(`/fixed-expenses/${id}`, { params: month_year ? { month_year } : {} });
};

export const checkFixedExpense = async (id: string, data: FixedExpenseCheckCreate): Promise<FixedExpenseCheck> => {
  const response = await api.post(`/fixed-expenses/${id}/checks`, data);
  return response.data;
};

export const uncheckFixedExpense = async (id: string, monthYear: string): Promise<void> => {
  await api.delete(`/fixed-expenses/${id}/checks/${monthYear}`);
};

// Legacy — kept for backward compat
export const markFixedExpensePaid = async (id: string, paid: boolean): Promise<FixedExpense> => {
  const response = await api.post(`/fixed-expenses/${id}/mark-paid?paid=${paid}`);
  return response.data;
};

// Debts
export const getDebts = async (type?: 'owed' | 'receivable', isSettled?: boolean): Promise<Debt[]> => {
  const params: any = {};
  if (type) params.type = type;
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

export const deleteDebtPayment = async (paymentId: string): Promise<Debt> => {
  const response = await api.delete(`/debts/payments/${paymentId}`);
  return response.data;
};

// Estimated Incomes

export const getEstimatedIncomes = async (active_only: boolean = false): Promise<EstimatedIncome[]> => {
  const response = await api.get('/incomes/', { params: { active_only } });
  return response.data;
};

export const getMonthlyIncomes = async (month_year: string): Promise<EstimatedIncome[]> => {
  const response = await api.get(`/incomes/monthly/${month_year}`);
  return response.data;
};

export const createEstimatedIncome = async (income: EstimatedIncomeCreate): Promise<EstimatedIncome> => {
  const response = await api.post('/incomes/', income);
  return response.data;
};

export const updateEstimatedIncome = async (incomeId: string, income: EstimatedIncomeUpdate): Promise<EstimatedIncome> => {
  const response = await api.put(`/incomes/${incomeId}`, income);
  return response.data;
};

export const deleteEstimatedIncome = async (incomeId: string, month_year?: string): Promise<void> => {
  await api.delete(`/incomes/${incomeId}`, { params: month_year ? { month_year } : {} });
};

export const checkIncome = async (incomeId: string, check: IncomeCheckCreate): Promise<IncomeCheck> => {
  const response = await api.post(`/incomes/${incomeId}/checks`, check);
  return response.data;
};

export const uncheckIncome = async (incomeId: string, month_year: string): Promise<void> => {
  await api.delete(`/incomes/${incomeId}/checks/${month_year}`);
};

// Push Notifications
export const subscribeToPush = async (subscription: { fcm_token: string }): Promise<any> => {
  const response = await api.post('/push/subscribe', subscription);
  return response.data;
};

export const unsubscribeFromPush = async (fcm_token: string): Promise<void> => {
  await api.post('/push/unsubscribe', null, { params: { fcm_token } });
};

export const sendTestPush = async (): Promise<any> => {
  const response = await api.post('/push/test');
  return response.data;
};

// Notifications
export const getNotifications = async (unreadOnly: boolean = false): Promise<any[]> => {
  const response = await api.get('/notifications/', { params: { unread_only: unreadOnly } });
  return response.data;
};

export const markNotificationsAsRead = async (): Promise<void> => {
  await api.patch('/notifications/mark-read');
};

// Connections
export const getConnections = async (): Promise<Connection[]> => {
  const response = await api.get('/connections/');
  return response.data;
};

export const requestConnection = async (email: string): Promise<Connection> => {
  const response = await api.post('/connections/request', { email });
  return response.data;
};

export const acceptConnection = async (connectionId: string): Promise<Connection> => {
  const response = await api.put(`/connections/${connectionId}/accept`);
  return response.data;
};

export const rejectConnection = async (connectionId: string): Promise<void> => {
  await api.put(`/connections/${connectionId}/reject`);
};

export const deleteConnection = async (connectionId: string): Promise<void> => {
  await api.delete(`/connections/${connectionId}`);
};

export const getPanasOverview = async (): Promise<PanasGlobalOverview> => {
  const response = await api.get('/connections/overview');
  return response.data;
};

export const getPanaDetails = async (partnerId: string): Promise<PanaDetail> => {
  const response = await api.get(`/connections/partner/${partnerId}/details`);
  return response.data;
};

// Saving Goals
export const getSavingGoals = async (isCompleted?: boolean, isActive?: boolean): Promise<SavingGoal[]> => {
  const params: any = {};
  if (isCompleted !== undefined) params.is_completed = isCompleted;
  if (isActive !== undefined) params.is_active = isActive;
  const response = await api.get('/savings/', { params });
  return response.data;
};

export const getSavingGoal = async (id: string): Promise<SavingGoal> => {
  const response = await api.get(`/savings/${id}`);
  return response.data;
};

export const getSavingsSummary = async (): Promise<SavingSummaryResponse> => {
  const response = await api.get('/savings/summary');
  return response.data;
};

export const createSavingGoal = async (goal: SavingGoalCreate): Promise<SavingGoal> => {
  const response = await api.post('/savings/', goal);
  return response.data;
};

export const updateSavingGoal = async (id: string, goal: SavingGoalUpdate): Promise<SavingGoal> => {
  const response = await api.put(`/savings/${id}`, goal);
  return response.data;
};

export const deleteSavingGoal = async (id: string): Promise<void> => {
  await api.delete(`/savings/${id}`);
};

export const addSavingDeposit = async (goalId: string, deposit: SavingDepositCreate): Promise<SavingGoal> => {
  const response = await api.post(`/savings/${goalId}/deposits`, deposit);
  return response.data;
};

export const deleteSavingDeposit = async (depositId: string): Promise<SavingGoal> => {
  const response = await api.delete(`/savings/deposits/${depositId}`);
  return response.data;
};

// Shares & Multi-member groups
export const getShareByEntity = async (entityId: string): Promise<ShareInfoOut> => {
  const response = await api.get(`/shares/by-entity/${entityId}`);
  return response.data;
};

export const addShareMembers = async (shareId: string, userIds: string[], adminIds: string[] = []): Promise<ShareInfoOut> => {
  const response = await api.post(`/shares/${shareId}/members`, { user_ids: userIds, admin_ids: adminIds });
  return response.data;
};

export const updateShareMemberRole = async (shareId: string, targetUserId: string, role: ShareRole): Promise<ShareInfoOut> => {
  const response = await api.patch(`/shares/${shareId}/members/${targetUserId}`, { role });
  return response.data;
};

export const removeShareMember = async (shareId: string, targetUserId: string): Promise<{ message: string; voluntary: boolean }> => {
  const response = await api.delete(`/shares/${shareId}/members/${targetUserId}`);
  return response.data;
};

export const updateEntityLocalCategory = async (
  entityId: string,
  category: string
): Promise<UpdateLocalCategoryResponse> => {
  const response = await api.patch<UpdateLocalCategoryResponse>(
    `/shares/by-entity/${entityId}/category`,
    { category }
  );
  return response.data;
};

export const requestConnectionByUserId = async (targetUserId: string): Promise<Connection> => {
  const response = await api.post(`/connections/request-by-user/${targetUserId}`);
  return response.data;
};

export const updateDebtPayment = async (paymentId: string, paymentUpdate: DebtPaymentUpdate): Promise<Debt> => {
  const response = await api.put(`/debts/payments/${paymentId}`, paymentUpdate);
  return response.data;
};

export const updateFixedExpenseCheck = async (checkId: string, checkUpdate: FixedExpenseCheckUpdate): Promise<FixedExpenseCheck> => {
  const response = await api.put(`/fixed-expenses/checks/${checkId}`, checkUpdate);
  return response.data;
};

export const updateSavingDeposit = async (depositId: string, depositUpdate: SavingDepositUpdate): Promise<SavingGoal> => {
  const response = await api.put(`/savings/deposits/${depositId}`, depositUpdate);
  return response.data;
};

// Budgets
export const getBudgetCategories = async (): Promise<string[]> => {
  const response = await api.get('/budgets/categories');
  return response.data;
};

export const getMonthlyBudget = async (monthYear: string): Promise<MonthlyBudgetResponse> => {
  const response = await api.get(`/budgets/monthly/${monthYear}`);
  return response.data;
};

export const upsertMonthlyBudget = async (monthYear: string, payload: MonthlyBudgetUpsert): Promise<MonthlyBudgetResponse> => {
  const response = await api.put(`/budgets/monthly/${monthYear}`, payload);
  return response.data;
};

export const confirmMonthlyBudget = async (monthYear: string): Promise<MonthlyBudgetResponse> => {
  const response = await api.post(`/budgets/monthly/${monthYear}/confirm`);
  return response.data;
};

export const upsertBudgetCategoryLimit = async (monthYear: string, item: BudgetCategoryLimitInput): Promise<MonthlyBudgetResponse> => {
  const response = await api.put(`/budgets/monthly/${monthYear}/category`, item);
  return response.data;
};

export const deleteBudgetCategoryLimit = async (monthYear: string, categoryName: string): Promise<MonthlyBudgetResponse> => {
  const response = await api.delete(`/budgets/monthly/${monthYear}/category/${encodeURIComponent(categoryName)}`);
  return response.data;
};

export const createMonthlyBudget = async (monthYear: string, payload: MonthlyBudgetCreate): Promise<MonthlyBudgetResponse> => {
  const response = await api.post(`/budgets/monthly/${monthYear}`, payload);
  return response.data;
};

export const updateMonthlyBudgetById = async (budgetId: string, payload: MonthlyBudgetUpdate): Promise<MonthlyBudgetResponse> => {
  const response = await api.put(`/budgets/${budgetId}`, payload);
  return response.data;
};

export const setPrimaryMonthlyBudget = async (budgetId: string): Promise<MonthlyBudgetResponse> => {
  const response = await api.post(`/budgets/${budgetId}/primary`);
  return response.data;
};

export const deleteMonthlyBudgetById = async (budgetId: string): Promise<MonthlyBudgetResponse> => {
  const response = await api.delete(`/budgets/${budgetId}`);
  return response.data;
};

export const upsertCategoryLimitByBudgetId = async (budgetId: string, item: BudgetCategoryLimitInput): Promise<MonthlyBudgetResponse> => {
  const response = await api.put(`/budgets/${budgetId}/category`, item);
  return response.data;
};

export const deleteCategoryLimitByBudgetId = async (budgetId: string, categoryName: string): Promise<MonthlyBudgetResponse> => {
  const response = await api.delete(`/budgets/${budgetId}/category/${encodeURIComponent(categoryName)}`);
  return response.data;
};




