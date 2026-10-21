-- ============================================================
-- GastosApp — Row Level Security (RLS) Policies — Fase 2
-- Tablas: saving_goals, saving_deposits, monthly_budgets,
--         budget_category_limits, shares, share_members,
--         shared_saving_goals, shared_debts, shared_fixed_expenses
-- ============================================================
-- 
-- Este script activa Row Level Security (RLS) y añade políticas de
-- aislamiento multi-inquilino para las tablas de Ahorros, Presupuestos
-- y Grupos Compartidos que quedaron desprotegidas tras las primeras migraciones.
-- 
-- El backend (FastAPI) usa DATABASE_URL con el superusuario postgres y
-- bypasses RLS, por lo que estas políticas protegen específicamente contra
-- acceso directo desde PostgREST / Supabase Client usando la anon key.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. SAVING GOALS (Metas de Ahorro)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.saving_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saving_goals_select_own" ON public.saving_goals;
DROP POLICY IF EXISTS "saving_goals_insert_own" ON public.saving_goals;
DROP POLICY IF EXISTS "saving_goals_update_own" ON public.saving_goals;
DROP POLICY IF EXISTS "saving_goals_delete_own" ON public.saving_goals;

CREATE POLICY "saving_goals_select_own" ON public.saving_goals
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "saving_goals_insert_own" ON public.saving_goals
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "saving_goals_update_own" ON public.saving_goals
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "saving_goals_delete_own" ON public.saving_goals
    FOR DELETE USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 2. SAVING DEPOSITS (Aportes a Metas de Ahorro)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.saving_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saving_deposits_select_parent" ON public.saving_deposits;
DROP POLICY IF EXISTS "saving_deposits_insert_parent" ON public.saving_deposits;
DROP POLICY IF EXISTS "saving_deposits_update_parent" ON public.saving_deposits;
DROP POLICY IF EXISTS "saving_deposits_delete_parent" ON public.saving_deposits;

CREATE POLICY "saving_deposits_select_parent" ON public.saving_deposits
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.saving_goals g
            WHERE g.id = saving_deposits.goal_id
              AND g.user_id = auth.uid()
        )
    );

CREATE POLICY "saving_deposits_insert_parent" ON public.saving_deposits
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.saving_goals g
            WHERE g.id = saving_deposits.goal_id
              AND g.user_id = auth.uid()
        )
    );

CREATE POLICY "saving_deposits_update_parent" ON public.saving_deposits
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.saving_goals g
            WHERE g.id = saving_deposits.goal_id
              AND g.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.saving_goals g
            WHERE g.id = saving_deposits.goal_id
              AND g.user_id = auth.uid()
        )
    );

CREATE POLICY "saving_deposits_delete_parent" ON public.saving_deposits
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.saving_goals g
            WHERE g.id = saving_deposits.goal_id
              AND g.user_id = auth.uid()
        )
    );


-- ════════════════════════════════════════════════════════════
-- 3. MONTHLY BUDGETS (Presupuestos Mensuales)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.monthly_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monthly_budgets_select_own" ON public.monthly_budgets;
DROP POLICY IF EXISTS "monthly_budgets_insert_own" ON public.monthly_budgets;
DROP POLICY IF EXISTS "monthly_budgets_update_own" ON public.monthly_budgets;
DROP POLICY IF EXISTS "monthly_budgets_delete_own" ON public.monthly_budgets;

CREATE POLICY "monthly_budgets_select_own" ON public.monthly_budgets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "monthly_budgets_insert_own" ON public.monthly_budgets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "monthly_budgets_update_own" ON public.monthly_budgets
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "monthly_budgets_delete_own" ON public.monthly_budgets
    FOR DELETE USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 4. BUDGET CATEGORY LIMITS (Límites por Categoría de Presupuesto)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.budget_category_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bcl_select_parent" ON public.budget_category_limits;
DROP POLICY IF EXISTS "bcl_insert_parent" ON public.budget_category_limits;
DROP POLICY IF EXISTS "bcl_update_parent" ON public.budget_category_limits;
DROP POLICY IF EXISTS "bcl_delete_parent" ON public.budget_category_limits;

CREATE POLICY "bcl_select_parent" ON public.budget_category_limits
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.monthly_budgets b
            WHERE b.id = budget_category_limits.budget_id
              AND b.user_id = auth.uid()
        )
    );

CREATE POLICY "bcl_insert_parent" ON public.budget_category_limits
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.monthly_budgets b
            WHERE b.id = budget_category_limits.budget_id
              AND b.user_id = auth.uid()
        )
    );

CREATE POLICY "bcl_update_parent" ON public.budget_category_limits
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.monthly_budgets b
            WHERE b.id = budget_category_limits.budget_id
              AND b.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.monthly_budgets b
            WHERE b.id = budget_category_limits.budget_id
              AND b.user_id = auth.uid()
        )
    );

CREATE POLICY "bcl_delete_parent" ON public.budget_category_limits
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.monthly_budgets b
            WHERE b.id = budget_category_limits.budget_id
              AND b.user_id = auth.uid()
        )
    );


-- ════════════════════════════════════════════════════════════
-- 5. SHARES (Grupos Compartidos)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shares_select_member" ON public.shares;
DROP POLICY IF EXISTS "shares_insert_owner" ON public.shares;
DROP POLICY IF EXISTS "shares_update_admin" ON public.shares;
DROP POLICY IF EXISTS "shares_delete_owner" ON public.shares;

CREATE POLICY "shares_select_member" ON public.shares
    FOR SELECT USING (
        owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.share_members sm
            WHERE sm.share_id = shares.id
              AND sm.user_id = auth.uid()
        )
    );

CREATE POLICY "shares_insert_owner" ON public.shares
    FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "shares_update_admin" ON public.shares
    FOR UPDATE USING (
        owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.share_members sm
            WHERE sm.share_id = shares.id
              AND sm.user_id = auth.uid()
              AND sm.role = 'admin'
        )
    );

CREATE POLICY "shares_delete_owner" ON public.shares
    FOR DELETE USING (owner_id = auth.uid());


-- ════════════════════════════════════════════════════════════
-- 6. SHARE MEMBERS (Miembros de Grupos Compartidos)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.share_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "share_members_select_peer" ON public.share_members;
DROP POLICY IF EXISTS "share_members_insert_authorized" ON public.share_members;
DROP POLICY IF EXISTS "share_members_update_owner" ON public.share_members;
DROP POLICY IF EXISTS "share_members_delete_authorized" ON public.share_members;

CREATE POLICY "share_members_select_peer" ON public.share_members
    FOR SELECT USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.share_members peer
            WHERE peer.share_id = share_members.share_id
              AND peer.user_id = auth.uid()
        )
    );

CREATE POLICY "share_members_insert_authorized" ON public.share_members
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.shares s
            WHERE s.id = share_members.share_id
              AND s.owner_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.share_members admin_member
            WHERE admin_member.share_id = share_members.share_id
              AND admin_member.user_id = auth.uid()
              AND admin_member.role = 'admin'
        )
    );

CREATE POLICY "share_members_update_owner" ON public.share_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.shares s
            WHERE s.id = share_members.share_id
              AND s.owner_id = auth.uid()
        )
    );

CREATE POLICY "share_members_delete_authorized" ON public.share_members
    FOR DELETE USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.shares s
            WHERE s.id = share_members.share_id
              AND s.owner_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.share_members admin_member
            WHERE admin_member.share_id = share_members.share_id
              AND admin_member.user_id = auth.uid()
              AND admin_member.role = 'admin'
        )
    );


-- ════════════════════════════════════════════════════════════
-- 7. TABLAS COMPARTIDAS LEGACY (shared_saving_goals, shared_debts, shared_fixed_expenses)
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shared_saving_goals') THEN
        ALTER TABLE public.shared_saving_goals ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "shared_savings_access" ON public.shared_saving_goals;
        CREATE POLICY "shared_savings_access" ON public.shared_saving_goals
            FOR ALL USING (owner_id = auth.uid() OR partner_id = auth.uid())
            WITH CHECK (owner_id = auth.uid() OR partner_id = auth.uid());
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shared_debts') THEN
        ALTER TABLE public.shared_debts ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "shared_debts_access" ON public.shared_debts;
        CREATE POLICY "shared_debts_access" ON public.shared_debts
            FOR ALL USING (owner_id = auth.uid() OR partner_id = auth.uid())
            WITH CHECK (owner_id = auth.uid() OR partner_id = auth.uid());
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shared_fixed_expenses') THEN
        ALTER TABLE public.shared_fixed_expenses ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "shared_fe_access" ON public.shared_fixed_expenses;
        CREATE POLICY "shared_fe_access" ON public.shared_fixed_expenses
            FOR ALL USING (owner_id = auth.uid() OR partner_id = auth.uid())
            WITH CHECK (owner_id = auth.uid() OR partner_id = auth.uid());
    END IF;
END $$;
