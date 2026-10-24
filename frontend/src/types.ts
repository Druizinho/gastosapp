export type CurrencyType = 'USD_BCV' | 'EUR_BCV' | 'BS' | 'USDT' | 'USD_CASH';

export interface CurrencyOption {
  value: CurrencyType;
  label: string;
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { value: 'USD_BCV', label: 'USD (BCV)' },
  { value: 'BS', label: 'Bolívares (Bs)' },
  { value: 'USD_CASH', label: 'USD (Efectivo)' },
  { value: 'EUR_BCV', label: 'EUR (BCV)' },
  { value: 'USDT', label: 'USDT (Binance)' },
];

export type ShareRole = 'admin' | 'member';

export interface ShareMemberOut {
  user_id: string;
  name: string;
  role: ShareRole;
  avatar_url?: string | null;
  is_me?: boolean;
  is_owner?: boolean;
  is_my_pana?: boolean;
  pana_request_pending?: boolean;
}

export interface ShareInfoOut {
  share_id: string;
  entity_type: string;
  my_role: ShareRole;
  owner_id: string;
  members: ShareMemberOut[];
}

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
  icon?: string | null;
  user_id: string;
  usage_count?: number;
  expense_count?: number;
  fixed_count?: number;
  debt_count?: number;
  saving_count?: number;
  budget_count?: number;
}

export interface CategoryCreate {
  name: string;
  color?: string;
  icon?: string;
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
  paid_by_name?: string | null;
  paid_by_user_id?: string | null;
  sync_id?: string | null;
  can_edit?: boolean;
  mirror_check_id?: string | null;
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

export interface FixedExpenseCheckUpdate {
  paid_amount?: number;
  currency?: CurrencyType;
  paid_date?: string;
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
  deactivated_at?: string | null;
  amount_usd?: number | null;
  amount_bs?: number | null;
  amount_eur?: number | null;
  amount_usdt?: number | null;
  rate_usd_bs?: number | null;
  rate_eur_bs?: number | null;
  rate_usdt_bs?: number | null;
  is_shared?: boolean;
  share_id?: string | null;
  my_role?: ShareRole | null;
  shared_members?: ShareMemberOut[];
  shared_partner_name?: string | null;
  shared_by?: string | null;
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
  shared_with?: string | null;
  shared_with_ids?: string[];
  admin_ids?: string[];
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
  shared_with?: string | null;
  shared_with_ids?: string[];
  admin_ids?: string[];
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
  category?: string | null;
  create_expense?: boolean;
  expense_id?: string | null;
  paid_by_name?: string | null;
  paid_by_user_id?: string | null;
  sync_id?: string | null;
  can_edit?: boolean;
  mirror_payment_id?: string | null;
  created_at: string;
}

export interface DebtPaymentCreate {
  amount: number;
  currency?: CurrencyType;
  payment_date?: string | null;
  note?: string;
  manual_rate?: number;
  register_as_expense?: boolean;
  create_expense?: boolean;
  category?: string | null;
}

export interface DebtPaymentUpdate {
  amount?: number;
  currency?: CurrencyType;
  payment_date?: string | null;
  note?: string | null;
  manual_rate?: number;
  category?: string | null;
  register_as_expense?: boolean;
  create_expense?: boolean;
}

export interface Debt {
  id: string;
  user_id: string;
  type: 'owed' | 'receivable';
  counterpart: string;
  concept: string;
  category?: string | null;
  total_amount: number;
  currency: CurrencyType;
  start_date: string;
  due_date: string | null;
  is_settled: boolean;
  notes: string | null;
  created_at: string;
  payments: DebtPayment[];
  is_shared?: boolean;
  share_id?: string | null;
  my_role?: ShareRole | null;
  shared_members?: ShareMemberOut[];
  shared_partner_name?: string | null;
  shared_by?: string | null;
}

export interface DebtCreate {
  type: 'owed' | 'receivable';
  counterpart: string;
  concept: string;
  category?: string | null;
  total_amount: number;
  currency?: CurrencyType;
  start_date?: string | null;
  due_date?: string | null;
  is_settled?: boolean;
  notes?: string;
  shared_with?: string | null;
  shared_with_ids?: string[];
  admin_ids?: string[];
}

export interface DebtUpdate {
  counterpart?: string;
  concept?: string;
  category?: string | null;
  total_amount?: number;
  currency?: CurrencyType;
  due_date?: string | null;
  is_settled?: boolean;
  notes?: string;
  shared_with?: string | null;
  shared_with_ids?: string[];
  admin_ids?: string[];
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
  deactivated_at?: string | null;
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

// Panas Types
export interface SharedFixedExpenseBrief {
  id: string;
  name: string;
  amount: number;
  currency: string;
  category: string | null;
  payment_day: number | null;
  is_active: boolean;
  is_paid_this_month: boolean;
  paid_by_name: string | null;
  paid_date: string | null;
  members_count?: number;
  member_names?: string[];
}

export interface SharedDebtBrief {
  id: string;
  concept: string;
  counterpart: string;
  total_amount: number;
  remaining_amount: number;
  currency: string;
  type: string;
  is_settled: boolean;
  paid_percentage: number;
  last_payment_by: string | null;
  last_payment_date: string | null;
  members_count?: number;
  member_names?: string[];
}

export interface SharedSavingGoalBrief {
  id: string;
  name: string;
  target_amount: number | null;
  type?: 'saving' | 'project';
  current_amount: number;
  currency: string;
  category: string | null;
  color: string | null;
  icon: string | null;
  is_completed: boolean;
  progress_percentage: number;
  last_deposit_by: string | null;
  last_deposit_amount: number | null;
  last_deposit_date: string | null;
  members_count?: number;
  member_names?: string[];
}

export interface PanaSummary {
  id: string;
  partner_id: string;
  partner_name: string;
  partner_email: string | null;
  status: string;
  created_at: string;
  shared_fixed_expenses_count: number;
  pending_fixed_expenses_this_month: number;
  shared_debts_count: number;
  total_debts_remaining: number;
  debts_currency_summary: Record<string, number>;
  shared_saving_goals_count: number;
}

export interface PanasGlobalOverview {
  panas: PanaSummary[];
  total_active_panas: number;
  total_shared_fixed_expenses: number;
  pending_shared_fixed_expenses_this_month: number;
  total_shared_debts: number;
  shared_debts_remaining_by_currency: Record<string, number>;
  total_shared_saving_goals: number;
}

export interface PanaDetail {
  connection_id: string;
  partner_id: string;
  partner_name: string;
  partner_email: string | null;
  shared_fixed_expenses: SharedFixedExpenseBrief[];
  shared_debts: SharedDebtBrief[];
  shared_saving_goals: SharedSavingGoalBrief[];
}


// Saving Goals
export interface SavingDeposit {
  id: string;
  goal_id: string;
  amount: number;
  currency: CurrencyType;
  deposit_date: string;
  note: string | null;
  create_expense: boolean;
  expense_id: string | null;
  created_at: string;
  amount_usd?: number | null;
  amount_bs?: number | null;
  amount_eur?: number | null;
  amount_usdt?: number | null;
  rate_usd_bs?: number | null;
  rate_eur_bs?: number | null;
  rate_usdt_bs?: number | null;
  paid_by_name?: string | null;
  paid_by_user_id?: string | null;
  sync_id?: string | null;
  can_edit?: boolean;
  mirror_deposit_id?: string | null;
}

export interface SavingDepositCreate {
  amount: number;
  currency?: CurrencyType;
  deposit_date?: string;
  note?: string;
  manual_rate?: number;
  register_as_expense?: boolean;
}

export interface SavingDepositUpdate {
  amount?: number;
  currency?: CurrencyType;
  deposit_date?: string;
  note?: string | null;
  manual_rate?: number;
}

export interface SavingGoal {
  id: string;
  user_id: string;
  name: string;
  type?: 'saving' | 'project';
  target_amount: number | null;
  currency: CurrencyType;
  target_date: string | null;
  category: string | null;
  color: string;
  icon: string;
  is_completed: boolean;
  completed_at: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  amount_usd?: number | null;
  amount_bs?: number | null;
  amount_eur?: number | null;
  amount_usdt?: number | null;
  rate_usd_bs?: number | null;
  rate_eur_bs?: number | null;
  rate_usdt_bs?: number | null;
  deposits: SavingDeposit[];
  is_shared?: boolean;
  share_id?: string | null;
  my_role?: ShareRole | null;
  shared_members?: ShareMemberOut[];
  shared_partner_name?: string | null;
  shared_by?: string | null;
}

export interface SavingGoalCreate {
  name: string;
  type?: 'saving' | 'project';
  target_amount?: number | null;
  currency?: CurrencyType;
  target_date?: string | null;
  category?: string;
  color?: string;
  icon?: string;
  notes?: string;
  manual_rate?: number;
  shared_with?: string | null;
  shared_with_ids?: string[];
  admin_ids?: string[];
}

export interface SavingGoalUpdate {
  name?: string;
  type?: 'saving' | 'project';
  target_amount?: number | null;
  currency?: CurrencyType;
  target_date?: string | null;
  category?: string;
  color?: string;
  icon?: string;
  is_completed?: boolean;
  is_active?: boolean;
  notes?: string;
  manual_rate?: number;
  shared_with?: string | null;
  shared_with_ids?: string[];
  admin_ids?: string[];
}

export interface SavingSummaryResponse {
  total_goals: number;
  active_goals: number;
  completed_goals: number;
  total_saved_bs: number;
  total_saved_usd: number;
  total_saved_eur: number;
  total_saved_usdt: number;
}

// Presupuestos (Budgets)
export type BudgetIncomeMode = 'manual' | 'single_income' | 'all_incomes';
export type BudgetTrafficLight = 'green' | 'yellow' | 'red';

export interface BudgetCategoryLimitInput {
  category_name: string;
  limit_amount: number;
  currency?: CurrencyType;
}

export interface BudgetCategorySummaryOut {
  category_name: string;
  limit_amount: number;
  spent_amount: number;
  remaining_amount: number;
  currency: CurrencyType;
  spent_percentage: number;
  traffic_light: BudgetTrafficLight;
  spent_usd: number;
  spent_bs: number;
  spent_eur: number;
  spent_usdt: number;
  limit_usd: number;
  limit_bs: number;
  limit_eur: number;
  limit_usdt: number;
  also_in_budgets?: string[];
  is_inherited?: boolean;
  needs_limit?: boolean;
}

export interface CategoryMonthSpendOut {
  category_name: string;
  spent_usd: number;
  spent_bs: number;
  spent_eur: number;
  spent_usdt: number;
}

export interface SingleBudgetOut {
  id: string;
  name: string;
  month_year: string;
  currency: CurrencyType;
  income_mode: BudgetIncomeMode;
  linked_income_id?: string | null;
  manual_global_limit?: number | null;
  effective_global_limit?: number | null;
  global_limit_usd?: number | null;
  global_limit_bs?: number | null;
  global_limit_eur?: number | null;
  global_limit_usdt?: number | null;
  total_spent_budget_currency: number;
  total_spent_usd: number;
  total_spent_bs: number;
  total_spent_eur: number;
  total_spent_usdt: number;
  global_spent_percentage: number;
  global_traffic_light: BudgetTrafficLight;
  is_confirmed: boolean;
  is_primary: boolean;
  allocated_budget_currency: number;
  allocated_usd: number;
  allocated_bs: number;
  allocated_eur: number;
  allocated_usdt: number;
  category_limits: BudgetCategorySummaryOut[];
  categories_count: number;
}

export interface MonthlyBudgetCreate {
  name: string;
  currency?: CurrencyType;
  income_mode?: BudgetIncomeMode;
  linked_income_id?: string | null;
  manual_global_limit?: number | null;
  is_primary?: boolean;
  categories?: string[];
}

export interface MonthlyBudgetUpdate {
  name?: string;
  currency?: CurrencyType;
  income_mode?: BudgetIncomeMode;
  linked_income_id?: string | null;
  manual_global_limit?: number | null;
  is_primary?: boolean;
  categories?: string[];
}

export interface MonthlyBudgetUpsert {
  currency: CurrencyType;
  income_mode: BudgetIncomeMode;
  linked_income_id?: string | null;
  manual_global_limit?: number | null;
  category_limits?: BudgetCategoryLimitInput[] | null;
}

export interface MonthlyBudgetResponse {
  id?: string | null;
  name?: string | null;
  month_year: string;
  currency: CurrencyType;
  income_mode: BudgetIncomeMode;
  linked_income_id?: string | null;
  manual_global_limit?: number | null;
  effective_global_limit?: number | null;
  global_limit_usd?: number | null;
  global_limit_bs?: number | null;
  global_limit_eur?: number | null;
  global_limit_usdt?: number | null;
  total_spent_budget_currency: number;
  total_spent_usd: number;
  total_spent_bs: number;
  total_spent_eur: number;
  total_spent_usdt: number;
  global_spent_percentage: number;
  global_traffic_light: BudgetTrafficLight;
  is_confirmed: boolean;
  allocated_budget_currency: number;
  allocated_usd: number;
  allocated_bs: number;
  allocated_eur: number;
  allocated_usdt: number;
  category_limits: BudgetCategorySummaryOut[];
  unbudgeted_spent_budget_currency: number;
  unbudgeted_spent_usd: number;
  unbudgeted_spent_bs: number;
  unbudgeted_spent_eur: number;
  unbudgeted_spent_usdt: number;
  unbudgeted_categories: string[];
  exists: boolean;
  budgets?: SingleBudgetOut[];
  available_categories?: string[];
  category_spending?: CategoryMonthSpendOut[];
}

