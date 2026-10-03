export type CurrencyType = 'USD_BCV' | 'EUR_BCV' | 'BS' | 'USDT' | 'USD_CASH';

export interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  created_at: string;
  currency: CurrencyType;
  amount_usd?: number | null;
  amount_bs?: number | null;
  amount_eur?: number | null;
  amount_usdt?: number | null;
  rate_usd_bs?: number | null;
  rate_eur_bs?: number | null;
  rate_usdt_bs?: number | null;
}

export interface ExpenseCreate {
  amount: number;
  description: string;
  category: string;
  date?: string;
  currency?: CurrencyType;
  manual_rate?: number;
}

export interface ExpenseUpdate {
  amount?: number;
  description?: string;
  category?: string;
  date?: string;
  currency?: CurrencyType;
  manual_rate?: number;
}

export interface CategorySummary {
  category: string;
  total_bs: number;
  total_usd: number;
  total_eur: number;
  total_usdt: number;
}

export interface SummaryResponse {
  total_spent_bs: number;
  total_spent_usd: number;
  total_spent_eur: number;
  total_spent_usdt: number;
  total_this_month_bs: number;
  total_this_month_usd: number;
  total_this_month_eur: number;
  total_this_month_usdt: number;
  by_category: CategorySummary[];
}

export interface ExchangeRates {
  usd_bs: number | null;
  eur_bs: number | null;
  usdt_bs: number | null;
  last_updated: string | null;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  user_id: string;
}

export interface CategoryCreate {
  name: string;
  color?: string;
}

export type DatePreset = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

export interface DateFilter {
  preset: DatePreset;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}

export interface RangeSummaryResponse {
  date_from: string;
  date_to: string;
  days_in_range: number;
  total_bs: number;
  total_usd: number;
  total_eur: number;
  total_usdt: number;
  daily_avg_bs: number;
  daily_avg_usd: number;
  daily_avg_eur: number;
  daily_avg_usdt: number;
  by_category: CategorySummary[];
}

// Fixed Expenses

export interface FixedExpenseCheck {
  id: string;
  fixed_expense_id: string;
  month_year: string;
  paid_amount: number;
  currency: CurrencyType;
  paid_date: string;
  create_expense: boolean;
  expense_id: string | null;
  notes: string | null;
  created_at: string;
  amount_usd?: number | null;
  amount_bs?: number | null;
  amount_eur?: number | null;
  amount_usdt?: number | null;
  rate_usd_bs?: number | null;
  rate_eur_bs?: number | null;
  rate_usdt_bs?: number | null;
}

export interface FixedExpenseCheckCreate {
  month_year: string;
  paid_amount: number;
  currency?: CurrencyType;
  paid_date?: string;
  create_expense?: boolean;
  notes?: string;
  manual_rate?: number;
}

export interface FixedExpense {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: CurrencyType;
  category: string | null;
  payment_day: number | null;
  is_active: boolean;
  notes: string | null;
  last_paid_month?: string | null;
  created_at: string;
  amount_usd?: number | null;
  amount_bs?: number | null;
  amount_eur?: number | null;
  amount_usdt?: number | null;
  rate_usd_bs?: number | null;
  rate_eur_bs?: number | null;
  rate_usdt_bs?: number | null;
  checks: FixedExpenseCheck[];
}

export interface FixedExpenseCreate {
  name: string;
  amount: number;
  currency?: CurrencyType;
  category?: string;
  payment_day?: number | null;
  is_active?: boolean;
  notes?: string;
  manual_rate?: number;
}

export interface FixedExpenseUpdate {
  name?: string;
  amount?: number;
  currency?: CurrencyType;
  category?: string;
  payment_day?: number | null;
  is_active?: boolean;
  notes?: string;
  manual_rate?: number;
}

export interface FixedExpenseSummary {
  total_active: number;
  total_paid: number;
  total_pending: number;
  total_bs: number;
  total_usd: number;
  total_eur: number;
  total_usdt: number;
}

// Debts

export interface DebtPayment {
  id: string;
  debt_id: string;
  amount: number;
  currency: CurrencyType;
  amount_usd?: number | null;
  amount_bs?: number | null;
  amount_eur?: number | null;
  amount_usdt?: number | null;
  rate_usd_bs?: number | null;
  rate_eur_bs?: number | null;
  rate_usdt_bs?: number | null;
  payment_date: string;
  note: string | null;
  created_at: string;
}

export interface DebtPaymentCreate {
  amount: number;
  currency?: CurrencyType;
  payment_date?: string | null;
  note?: string;
  manual_rate?: number;
  register_as_expense?: boolean;
}

export interface Debt {
  id: string;
  user_id: string;
  type: 'owed' | 'receivable';
  counterpart: string;
  concept: string;
  total_amount: number;
  currency: CurrencyType;
  start_date: string;
  due_date: string | null;
  is_settled: boolean;
  notes: string | null;
  created_at: string;
  payments: DebtPayment[];
}

export interface DebtCreate {
  type: 'owed' | 'receivable';
  counterpart: string;
  concept: string;
  total_amount: number;
  currency?: CurrencyType;
  start_date?: string | null;
  due_date?: string | null;
  is_settled?: boolean;
  notes?: string;
}

export interface DebtUpdate {
  counterpart?: string;
  concept?: string;
  total_amount?: number;
  currency?: CurrencyType;
  due_date?: string | null;
  is_settled?: boolean;
  notes?: string;
}

// Estimated Income Types

export interface IncomeCheck {
  id: string;
  income_id: string;
  month_year: string;
  real_amount: number;
  currency: CurrencyType;
  payment_date: string;
  is_partial: boolean;
  pending_date: string | null;
  notes: string | null;
  created_at: string;
  amount_usd?: number | null;
  amount_bs?: number | null;
  amount_eur?: number | null;
  amount_usdt?: number | null;
  rate_usd_bs?: number | null;
  rate_eur_bs?: number | null;
  rate_usdt_bs?: number | null;
}

export interface EstimatedIncome {
  id: string;
  user_id: string;
  name: string;
  expected_amount: number;
  currency: CurrencyType;
  payment_day: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  checks: IncomeCheck[];
}

export interface EstimatedIncomeCreate {
  name: string;
  expected_amount: number;
  currency?: CurrencyType;
  payment_day?: number | null;
  is_active?: boolean;
  notes?: string;
}

export interface EstimatedIncomeUpdate {
  name?: string;
  expected_amount?: number;
  currency?: CurrencyType;
  payment_day?: number | null;
  is_active?: boolean;
  notes?: string;
}

export interface IncomeCheckCreate {
  month_year: string;
  real_amount: number;
  currency?: CurrencyType;
  payment_date?: string;
  is_partial?: boolean;
  pending_date?: string | null;
  notes?: string;
  manual_rate?: number;
}

// Notifications
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export interface UserSearchResult {
  id: string;
  display_name: string;
  email: string;
}

export interface ConnectionRequest {
  email: string;
}

export interface Connection {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
  partner_id: string;
  partner_name: string;
  is_requester: boolean;
}
