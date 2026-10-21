-- ==============================================================================
-- CANONICAL POSTGRESQL SCHEMA FOR GASTOSAPP (V4 - 18 TABLES)
-- ==============================================================================
-- This schema represents the full, sanitized relational model with referential
-- integrity (Foreign Keys with CASCADE / SET NULL) and unified sharing architecture.

-- ------------------------------------------------------------------------------
-- 1. PROFILES (Linked to Supabase Auth)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    notify_fixed_expenses BOOLEAN NOT NULL DEFAULT true,
    notify_debts BOOLEAN NOT NULL DEFAULT true,
    notify_incomes BOOLEAN NOT NULL DEFAULT true,
    notify_inactivity BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- ------------------------------------------------------------------------------
-- 2. CATEGORIES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color VARCHAR(20) DEFAULT '#6366F1',
    icon VARCHAR(50) DEFAULT 'Package',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    CONSTRAINT _user_category_uc UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_categories_user ON public.categories(user_id);

-- ------------------------------------------------------------------------------
-- 3. EXPENSES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount NUMERIC(12, 4) NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    amount_usd NUMERIC(12, 4),
    amount_bs NUMERIC(12, 4),
    amount_eur NUMERIC(12, 4),
    amount_usdt NUMERIC(12, 4),
    rate_usd_bs NUMERIC(12, 4),
    rate_eur_bs NUMERIC(12, 4),
    rate_usdt_bs NUMERIC(12, 4)
);
CREATE INDEX IF NOT EXISTS idx_expenses_user ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date);

-- ------------------------------------------------------------------------------
-- 4. FIXED EXPENSES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fixed_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount NUMERIC(12, 4) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    amount_usd NUMERIC(12, 4),
    amount_bs NUMERIC(12, 4),
    amount_eur NUMERIC(12, 4),
    amount_usdt NUMERIC(12, 4),
    rate_usd_bs NUMERIC(12, 4),
    rate_eur_bs NUMERIC(12, 4),
    rate_usdt_bs NUMERIC(12, 4),
    category TEXT,
    payment_day NUMERIC(2, 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_paid_month VARCHAR(7),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    deactivated_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_fixed_expenses_user ON public.fixed_expenses(user_id);

-- ------------------------------------------------------------------------------
-- 5. FIXED EXPENSE CHECKS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fixed_expense_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixed_expense_id UUID NOT NULL REFERENCES public.fixed_expenses(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL,
    paid_amount NUMERIC(12, 4) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    amount_usd NUMERIC(12, 4),
    amount_bs NUMERIC(12, 4),
    amount_eur NUMERIC(12, 4),
    amount_usdt NUMERIC(12, 4),
    rate_usd_bs NUMERIC(12, 4),
    rate_eur_bs NUMERIC(12, 4),
    rate_usdt_bs NUMERIC(12, 4),
    paid_date DATE NOT NULL DEFAULT CURRENT_DATE,
    create_expense BOOLEAN NOT NULL DEFAULT false,
    expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
    notes TEXT,
    paid_by_name TEXT,
    paid_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sync_id UUID,
    mirror_check_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    CONSTRAINT _fixed_expense_month_uc UNIQUE (fixed_expense_id, month_year)
);
CREATE INDEX IF NOT EXISTS idx_fe_checks_fe_id ON public.fixed_expense_checks(fixed_expense_id);
CREATE INDEX IF NOT EXISTS idx_fe_checks_month ON public.fixed_expense_checks(month_year);

-- ------------------------------------------------------------------------------
-- 6. DEBTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type VARCHAR(12) NOT NULL, -- 'owed' or 'receivable'
    counterpart TEXT NOT NULL,
    concept TEXT NOT NULL,
    total_amount NUMERIC(12, 4) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    category VARCHAR(100) DEFAULT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    is_settled BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_debts_user ON public.debts(user_id);

-- ------------------------------------------------------------------------------
-- 7. DEBT PAYMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.debt_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
    amount NUMERIC(12, 4) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    amount_usd NUMERIC(12, 4),
    amount_bs NUMERIC(12, 4),
    amount_eur NUMERIC(12, 4),
    amount_usdt NUMERIC(12, 4),
    rate_usd_bs NUMERIC(12, 4),
    rate_eur_bs NUMERIC(12, 4),
    rate_usdt_bs NUMERIC(12, 4),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT,
    category VARCHAR(100),
    create_expense BOOLEAN NOT NULL DEFAULT false,
    expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
    paid_by_name TEXT,
    paid_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sync_id UUID,
    mirror_payment_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id ON public.debt_payments(debt_id);

-- ------------------------------------------------------------------------------
-- 8. ESTIMATED INCOMES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.estimated_incomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    expected_amount NUMERIC(12, 4) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    payment_day NUMERIC(2, 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    deactivated_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_estimated_incomes_user ON public.estimated_incomes(user_id);

-- ------------------------------------------------------------------------------
-- 9. INCOME CHECKS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.income_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    income_id UUID NOT NULL REFERENCES public.estimated_incomes(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL,
    real_amount NUMERIC(12, 4) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    amount_usd NUMERIC(12, 4),
    amount_bs NUMERIC(12, 4),
    amount_eur NUMERIC(12, 4),
    amount_usdt NUMERIC(12, 4),
    rate_usd_bs NUMERIC(12, 4),
    rate_eur_bs NUMERIC(12, 4),
    rate_usdt_bs NUMERIC(12, 4),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_partial BOOLEAN NOT NULL DEFAULT false,
    pending_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    CONSTRAINT _income_month_uc UNIQUE (income_id, month_year)
);
CREATE INDEX IF NOT EXISTS idx_income_checks_income_id ON public.income_checks(income_id);

-- ------------------------------------------------------------------------------
-- 10. PUSH SUBSCRIPTIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);

-- ------------------------------------------------------------------------------
-- 11. NOTIFICATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);

-- ------------------------------------------------------------------------------
-- 12. CONNECTIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status VARCHAR(10) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    CONSTRAINT _connection_unique UNIQUE (requester_id, receiver_id)
);
CREATE INDEX IF NOT EXISTS idx_connections_requester ON public.connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_connections_receiver ON public.connections(receiver_id);

-- ------------------------------------------------------------------------------
-- 13. SAVING GOALS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saving_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    target_amount NUMERIC(12, 4) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    amount_usd NUMERIC(12, 4),
    amount_bs NUMERIC(12, 4),
    amount_eur NUMERIC(12, 4),
    amount_usdt NUMERIC(12, 4),
    rate_usd_bs NUMERIC(12, 4),
    rate_eur_bs NUMERIC(12, 4),
    rate_usdt_bs NUMERIC(12, 4),
    target_date DATE,
    category VARCHAR(100),
    color VARCHAR(20) DEFAULT '#10B981',
    icon VARCHAR(50) DEFAULT 'piggy-bank',
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_saving_goals_user ON public.saving_goals(user_id);

-- ------------------------------------------------------------------------------
-- 14. SAVING DEPOSITS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saving_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES public.saving_goals(id) ON DELETE CASCADE,
    amount NUMERIC(12, 4) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    amount_usd NUMERIC(12, 4),
    amount_bs NUMERIC(12, 4),
    amount_eur NUMERIC(12, 4),
    amount_usdt NUMERIC(12, 4),
    rate_usd_bs NUMERIC(12, 4),
    rate_eur_bs NUMERIC(12, 4),
    rate_usdt_bs NUMERIC(12, 4),
    deposit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT,
    create_expense BOOLEAN NOT NULL DEFAULT false,
    expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
    paid_by_name TEXT,
    paid_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sync_id UUID,
    mirror_deposit_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_saving_deposits_goal_id ON public.saving_deposits(goal_id);

-- ------------------------------------------------------------------------------
-- 15. SHARES (Unified Multi-user Sharing Architecture)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(20) NOT NULL, -- 'debt', 'fixed_expense', 'saving_goal'
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_shares_owner_id ON public.shares(owner_id);

-- ------------------------------------------------------------------------------
-- 16. SHARE MEMBERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.share_members (
    share_id UUID NOT NULL REFERENCES public.shares(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL UNIQUE,
    role VARCHAR(10) NOT NULL DEFAULT 'member', -- 'admin', 'member'
    added_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    PRIMARY KEY (share_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_share_members_user_id ON public.share_members(user_id);
CREATE INDEX IF NOT EXISTS idx_share_members_entity_id ON public.share_members(entity_id);

-- ------------------------------------------------------------------------------
-- 17. MONTHLY BUDGETS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL, -- YYYY-MM
    name VARCHAR(100) NOT NULL DEFAULT 'Presupuesto Principal',
    currency VARCHAR(10) NOT NULL DEFAULT 'USD_BCV',
    income_mode VARCHAR(20) NOT NULL DEFAULT 'manual', -- 'manual', 'single_income', 'all_incomes'
    linked_income_id UUID REFERENCES public.estimated_incomes(id) ON DELETE SET NULL,
    manual_global_limit NUMERIC(12, 4),
    effective_global_limit NUMERIC(12, 4),
    is_confirmed BOOLEAN NOT NULL DEFAULT false,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    notified_month_start BOOLEAN NOT NULL DEFAULT false,
    notified_global_80 BOOLEAN NOT NULL DEFAULT false,
    notified_global_100 BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    CONSTRAINT _user_month_budget_name_uc UNIQUE (user_id, month_year, name)
);
CREATE INDEX IF NOT EXISTS idx_monthly_budgets_user_month ON public.monthly_budgets(user_id, month_year);

-- ------------------------------------------------------------------------------
-- 18. BUDGET CATEGORY LIMITS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_category_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES public.monthly_budgets(id) ON DELETE CASCADE,
    category_name VARCHAR(100) NOT NULL,
    limit_amount NUMERIC(12, 4) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD_BCV',
    notified_80 BOOLEAN NOT NULL DEFAULT false,
    notified_100 BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    CONSTRAINT _budget_category_limit_uc UNIQUE (budget_id, category_name)
);
CREATE INDEX IF NOT EXISTS idx_budget_cat_limits_budget_id ON public.budget_category_limits(budget_id);
