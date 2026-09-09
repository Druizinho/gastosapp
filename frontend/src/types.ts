export type CurrencyType = 'BS_USD' | 'BS_EUR' | 'USDT' | 'USD_CASH';

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
