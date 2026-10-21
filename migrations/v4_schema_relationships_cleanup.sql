-- ==============================================================================
-- MIGRATION V4: Schema Relationships Cleanup, Orphan Purge, and Foreign Keys
-- ==============================================================================

DO $$
BEGIN
    -- 1. Purgar únicamente las filas huérfanas de usuarios inexistentes en profiles
    DELETE FROM public.estimated_incomes WHERE user_id NOT IN (SELECT id FROM public.profiles);
    DELETE FROM public.categories WHERE user_id NOT IN (SELECT id FROM public.profiles);
    DELETE FROM public.fixed_expenses WHERE user_id NOT IN (SELECT id FROM public.profiles);
    DELETE FROM public.debts WHERE user_id NOT IN (SELECT id FROM public.profiles);
    UPDATE public.fixed_expense_checks 
       SET expense_id = NULL 
     WHERE expense_id IS NOT NULL 
       AND expense_id NOT IN (SELECT id FROM public.expenses);

    -- 2. Añadir Foreign Keys con CASCADE / SET NULL (100% idempotente)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_categories_user') THEN
        ALTER TABLE public.categories
            ADD CONSTRAINT fk_categories_user
            FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_expenses_user') THEN
        ALTER TABLE public.expenses
            ADD CONSTRAINT fk_expenses_user
            FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fixed_expenses_user') THEN
        ALTER TABLE public.fixed_expenses
            ADD CONSTRAINT fk_fixed_expenses_user
            FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_debts_user') THEN
        ALTER TABLE public.debts
            ADD CONSTRAINT fk_debts_user
            FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_estimated_incomes_user') THEN
        ALTER TABLE public.estimated_incomes
            ADD CONSTRAINT fk_estimated_incomes_user
            FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_saving_goals_user') THEN
        ALTER TABLE public.saving_goals
            ADD CONSTRAINT fk_saving_goals_user
            FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notifications_user') THEN
        ALTER TABLE public.notifications
            ADD CONSTRAINT fk_notifications_user
            FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_push_subscriptions_user') THEN
        ALTER TABLE public.push_subscriptions
            ADD CONSTRAINT fk_push_subscriptions_user
            FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fe_checks_expense') THEN
        ALTER TABLE public.fixed_expense_checks
            ADD CONSTRAINT fk_fe_checks_expense
            FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Retirar tablas legacy (0 filas)
DROP TABLE IF EXISTS public.shared_debts CASCADE;
DROP TABLE IF EXISTS public.shared_fixed_expenses CASCADE;
DROP TABLE IF EXISTS public.shared_saving_goals CASCADE;

-- 4. Limpiar políticas RLS duplicadas antiguas
DROP POLICY IF EXISTS "Users can delete category limits of their budgets" ON public.budget_category_limits;
DROP POLICY IF EXISTS "Users can insert category limits to their budgets" ON public.budget_category_limits;
DROP POLICY IF EXISTS "Users can update category limits of their budgets" ON public.budget_category_limits;
DROP POLICY IF EXISTS "Users can view category limits of their budgets" ON public.budget_category_limits;
DROP POLICY IF EXISTS "Users can delete their own monthly budgets" ON public.monthly_budgets;
DROP POLICY IF EXISTS "Users can insert their own monthly budgets" ON public.monthly_budgets;
DROP POLICY IF EXISTS "Users can update their own monthly budgets" ON public.monthly_budgets;
DROP POLICY IF EXISTS "Users can view their own monthly budgets" ON public.monthly_budgets;
DROP POLICY IF EXISTS "saving_deposits_delete" ON public.saving_deposits;
DROP POLICY IF EXISTS "saving_deposits_insert" ON public.saving_deposits;
DROP POLICY IF EXISTS "saving_deposits_select" ON public.saving_deposits;
DROP POLICY IF EXISTS "saving_deposits_update" ON public.saving_deposits;
DROP POLICY IF EXISTS "saving_goals_delete" ON public.saving_goals;
DROP POLICY IF EXISTS "saving_goals_insert" ON public.saving_goals;
DROP POLICY IF EXISTS "saving_goals_select" ON public.saving_goals;
DROP POLICY IF EXISTS "saving_goals_update" ON public.saving_goals;
