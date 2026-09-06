export interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  created_at: string;
}

export interface ExpenseCreate {
  amount: number;
  description: string;
  category: string;
  date?: string;
}

export interface ExpenseUpdate {
  amount?: number;
  description?: string;
  category?: string;
  date?: string;
}

export interface CategorySummary {
  category: string;
  total: number;
}

export interface SummaryResponse {
  total_spent: number;
  total_this_month: number;
  by_category: CategorySummary[];
}
