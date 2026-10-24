-- ==============================================================================
-- MIGRATION V4 ROLLBACK: Revert Foreign Keys and Recreate Legacy Shared Tables
-- ==============================================================================

-- 1. Drop added foreign keys (idempotent)
ALTER TABLE IF EXISTS public.categories DROP CONSTRAINT IF EXISTS fk_categories_user;
ALTER TABLE IF EXISTS public.expenses DROP CONSTRAINT IF EXISTS fk_expenses_user;
ALTER TABLE IF EXISTS public.fixed_expenses DROP CONSTRAINT IF EXISTS fk_fixed_expenses_user;
ALTER TABLE IF EXISTS public.debts DROP CONSTRAINT IF EXISTS fk_debts_user;
ALTER TABLE IF EXISTS public.estimated_incomes DROP CONSTRAINT IF EXISTS fk_estimated_incomes_user;
ALTER TABLE IF EXISTS public.saving_goals DROP CONSTRAINT IF EXISTS fk_saving_goals_user;
ALTER TABLE IF EXISTS public.notifications DROP CONSTRAINT IF EXISTS fk_notifications_user;
ALTER TABLE IF EXISTS public.push_subscriptions DROP CONSTRAINT IF EXISTS fk_push_subscriptions_user;
ALTER TABLE IF EXISTS public.fixed_expense_checks DROP CONSTRAINT IF EXISTS fk_fe_checks_expense;

-- 2. Recreate legacy empty tables if necessary in rollback
CREATE TABLE IF NOT EXISTS public.shared_fixed_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixed_expense_id UUID NOT NULL UNIQUE REFERENCES public.fixed_expenses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    mirror_expense_id UUID REFERENCES public.fixed_expenses(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_shared_fixed_expenses_fe_id ON public.shared_fixed_expenses(fixed_expense_id);
CREATE INDEX IF NOT EXISTS idx_shared_fixed_expenses_owner_id ON public.shared_fixed_expenses(owner_id);
CREATE INDEX IF NOT EXISTS idx_shared_fixed_expenses_partner_id ON public.shared_fixed_expenses(partner_id);
CREATE INDEX IF NOT EXISTS idx_shared_fixed_expenses_mirror_id ON public.shared_fixed_expenses(mirror_expense_id);

CREATE TABLE IF NOT EXISTS public.shared_debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id UUID NOT NULL UNIQUE REFERENCES public.debts(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    mirror_debt_id UUID REFERENCES public.debts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_shared_debts_debt_id ON public.shared_debts(debt_id);
CREATE INDEX IF NOT EXISTS idx_shared_debts_owner_id ON public.shared_debts(owner_id);
CREATE INDEX IF NOT EXISTS idx_shared_debts_partner_id ON public.shared_debts(partner_id);
CREATE INDEX IF NOT EXISTS idx_shared_debts_mirror_debt_id ON public.shared_debts(mirror_debt_id);

CREATE TABLE IF NOT EXISTS public.shared_saving_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL UNIQUE REFERENCES public.saving_goals(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    mirror_goal_id UUID REFERENCES public.saving_goals(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_shared_saving_goals_goal_id ON public.shared_saving_goals(goal_id);
CREATE INDEX IF NOT EXISTS idx_shared_saving_goals_owner_id ON public.shared_saving_goals(owner_id);
CREATE INDEX IF NOT EXISTS idx_shared_saving_goals_partner_id ON public.shared_saving_goals(partner_id);
CREATE INDEX IF NOT EXISTS idx_shared_saving_goals_mirror_id ON public.shared_saving_goals(mirror_goal_id);
