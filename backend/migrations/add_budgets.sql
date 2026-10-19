-- Migration: Monthly Budgets & Category Limits
-- Tables for budget planning and tracking

CREATE TABLE IF NOT EXISTS public.monthly_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    currency VARCHAR(10) NOT NULL DEFAULT 'USD_BCV',
    income_mode VARCHAR(20) NOT NULL DEFAULT 'manual', -- 'manual', 'single_income', 'all_incomes'
    linked_income_id UUID REFERENCES estimated_incomes(id) ON DELETE SET NULL,
    manual_global_limit NUMERIC(12, 4),
    effective_global_limit NUMERIC(12, 4),
    is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    notified_month_start BOOLEAN NOT NULL DEFAULT FALSE,
    notified_global_80 BOOLEAN NOT NULL DEFAULT FALSE,
    notified_global_100 BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT _user_month_budget_uc UNIQUE (user_id, month_year)
);

CREATE INDEX IF NOT EXISTS idx_monthly_budgets_user_month ON public.monthly_budgets(user_id, month_year);
CREATE INDEX IF NOT EXISTS idx_monthly_budgets_income ON public.monthly_budgets(linked_income_id);

CREATE TABLE IF NOT EXISTS public.budget_category_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES monthly_budgets(id) ON DELETE CASCADE,
    category_name VARCHAR(100) NOT NULL,
    limit_amount NUMERIC(12, 4) NOT NULL CHECK (limit_amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'USD_BCV',
    notified_80 BOOLEAN NOT NULL DEFAULT FALSE,
    notified_100 BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT _budget_category_limit_uc UNIQUE (budget_id, category_name)
);

CREATE INDEX IF NOT EXISTS idx_budget_category_limits_budget ON public.budget_category_limits(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_category_limits_cat ON public.budget_category_limits(category_name);

-- RLS
ALTER TABLE public.monthly_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_category_limits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own monthly budgets') THEN
        CREATE POLICY "Users can view their own monthly budgets" ON public.monthly_budgets
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own monthly budgets') THEN
        CREATE POLICY "Users can insert their own monthly budgets" ON public.monthly_budgets
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own monthly budgets') THEN
        CREATE POLICY "Users can update their own monthly budgets" ON public.monthly_budgets
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own monthly budgets') THEN
        CREATE POLICY "Users can delete their own monthly budgets" ON public.monthly_budgets
            FOR DELETE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view category limits of their budgets') THEN
        CREATE POLICY "Users can view category limits of their budgets" ON public.budget_category_limits
            FOR SELECT USING (EXISTS (SELECT 1 FROM monthly_budgets b WHERE b.id = budget_category_limits.budget_id AND b.user_id = auth.uid()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert category limits to their budgets') THEN
        CREATE POLICY "Users can insert category limits to their budgets" ON public.budget_category_limits
            FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM monthly_budgets b WHERE b.id = budget_category_limits.budget_id AND b.user_id = auth.uid()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update category limits of their budgets') THEN
        CREATE POLICY "Users can update category limits of their budgets" ON public.budget_category_limits
            FOR UPDATE USING (EXISTS (SELECT 1 FROM monthly_budgets b WHERE b.id = budget_category_limits.budget_id AND b.user_id = auth.uid()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete category limits of their budgets') THEN
        CREATE POLICY "Users can delete category limits of their budgets" ON public.budget_category_limits
            FOR DELETE USING (EXISTS (SELECT 1 FROM monthly_budgets b WHERE b.id = budget_category_limits.budget_id AND b.user_id = auth.uid()));
    END IF;
END $$;
