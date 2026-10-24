-- ============================================================
-- GastosApp — Row Level Security (RLS) Policies
-- ============================================================
-- 
-- ¿Qué es RLS?
-- RLS (Row Level Security) es una función de PostgreSQL que restringe
-- qué filas puede ver, insertar, modificar o eliminar un usuario.
-- 
-- Sin RLS activado, CUALQUIER usuario autenticado con la anon key
-- de Supabase podría leer/modificar TODAS las filas de TODAS las tablas
-- (incluyendo datos de otros usuarios). 
--
-- Con RLS activado PERO sin políticas, nadie puede acceder a nada
-- (ni siquiera leer). Por eso necesitas crear políticas.
--
-- Tu backend (FastAPI + SQLAlchemy) se conecta via DATABASE_URL 
-- con el rol "postgres", que BYPASEA RLS automáticamente.
-- Así que tu backend sigue funcionando normalmente.
-- Estas políticas protegen contra acceso DIRECTO desde el cliente
-- usando la anon key de Supabase.
--
-- IMPORTANTE: Ejecutar este script completo en el SQL Editor de Supabase.
-- Si alguna política ya existe, el script la elimina primero (DROP IF EXISTS).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. PROFILES  (id = auth.uid(), no tiene user_id separado)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);


-- ════════════════════════════════════════════════════════════
-- 2. CATEGORIES
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select_own" ON public.categories;
DROP POLICY IF EXISTS "categories_insert_own" ON public.categories;
DROP POLICY IF EXISTS "categories_update_own" ON public.categories;
DROP POLICY IF EXISTS "categories_delete_own" ON public.categories;

CREATE POLICY "categories_select_own" ON public.categories
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "categories_insert_own" ON public.categories
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "categories_update_own" ON public.categories
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "categories_delete_own" ON public.categories
    FOR DELETE USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 3. EXPENSES
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select_own" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert_own" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update_own" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete_own" ON public.expenses;

CREATE POLICY "expenses_select_own" ON public.expenses
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "expenses_insert_own" ON public.expenses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "expenses_update_own" ON public.expenses
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "expenses_delete_own" ON public.expenses
    FOR DELETE USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 4. FIXED_EXPENSES
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fixed_expenses_select_own" ON public.fixed_expenses;
DROP POLICY IF EXISTS "fixed_expenses_insert_own" ON public.fixed_expenses;
DROP POLICY IF EXISTS "fixed_expenses_update_own" ON public.fixed_expenses;
DROP POLICY IF EXISTS "fixed_expenses_delete_own" ON public.fixed_expenses;

CREATE POLICY "fixed_expenses_select_own" ON public.fixed_expenses
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "fixed_expenses_insert_own" ON public.fixed_expenses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fixed_expenses_update_own" ON public.fixed_expenses
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fixed_expenses_delete_own" ON public.fixed_expenses
    FOR DELETE USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 5. FIXED_EXPENSE_CHECKS  (tabla hija, no tiene user_id propio)
--    Se verifica ownership via JOIN a fixed_expenses.user_id
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.fixed_expense_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fec_select_own" ON public.fixed_expense_checks;
DROP POLICY IF EXISTS "fec_insert_own" ON public.fixed_expense_checks;
DROP POLICY IF EXISTS "fec_update_own" ON public.fixed_expense_checks;
DROP POLICY IF EXISTS "fec_delete_own" ON public.fixed_expense_checks;

CREATE POLICY "fec_select_own" ON public.fixed_expense_checks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.fixed_expenses fe
            WHERE fe.id = fixed_expense_id AND fe.user_id = auth.uid()
        )
    );

CREATE POLICY "fec_insert_own" ON public.fixed_expense_checks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.fixed_expenses fe
            WHERE fe.id = fixed_expense_id AND fe.user_id = auth.uid()
        )
    );

CREATE POLICY "fec_update_own" ON public.fixed_expense_checks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.fixed_expenses fe
            WHERE fe.id = fixed_expense_id AND fe.user_id = auth.uid()
        )
    );

CREATE POLICY "fec_delete_own" ON public.fixed_expense_checks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.fixed_expenses fe
            WHERE fe.id = fixed_expense_id AND fe.user_id = auth.uid()
        )
    );


-- ════════════════════════════════════════════════════════════
-- 6. DEBTS
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "debts_select_own" ON public.debts;
DROP POLICY IF EXISTS "debts_insert_own" ON public.debts;
DROP POLICY IF EXISTS "debts_update_own" ON public.debts;
DROP POLICY IF EXISTS "debts_delete_own" ON public.debts;

CREATE POLICY "debts_select_own" ON public.debts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "debts_insert_own" ON public.debts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "debts_update_own" ON public.debts
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "debts_delete_own" ON public.debts
    FOR DELETE USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 7. DEBT_PAYMENTS  (tabla hija, verifica via debts.user_id)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dp_select_own" ON public.debt_payments;
DROP POLICY IF EXISTS "dp_insert_own" ON public.debt_payments;
DROP POLICY IF EXISTS "dp_update_own" ON public.debt_payments;
DROP POLICY IF EXISTS "dp_delete_own" ON public.debt_payments;

CREATE POLICY "dp_select_own" ON public.debt_payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.debts d
            WHERE d.id = debt_id AND d.user_id = auth.uid()
        )
    );

CREATE POLICY "dp_insert_own" ON public.debt_payments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.debts d
            WHERE d.id = debt_id AND d.user_id = auth.uid()
        )
    );

CREATE POLICY "dp_update_own" ON public.debt_payments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.debts d
            WHERE d.id = debt_id AND d.user_id = auth.uid()
        )
    );

CREATE POLICY "dp_delete_own" ON public.debt_payments
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.debts d
            WHERE d.id = debt_id AND d.user_id = auth.uid()
        )
    );


-- ════════════════════════════════════════════════════════════
-- 8. ESTIMATED_INCOMES
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.estimated_incomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "incomes_select_own" ON public.estimated_incomes;
DROP POLICY IF EXISTS "incomes_insert_own" ON public.estimated_incomes;
DROP POLICY IF EXISTS "incomes_update_own" ON public.estimated_incomes;
DROP POLICY IF EXISTS "incomes_delete_own" ON public.estimated_incomes;

CREATE POLICY "incomes_select_own" ON public.estimated_incomes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "incomes_insert_own" ON public.estimated_incomes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "incomes_update_own" ON public.estimated_incomes
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "incomes_delete_own" ON public.estimated_incomes
    FOR DELETE USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 9. INCOME_CHECKS  (tabla hija, verifica via estimated_incomes.user_id)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.income_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ic_select_own" ON public.income_checks;
DROP POLICY IF EXISTS "ic_insert_own" ON public.income_checks;
DROP POLICY IF EXISTS "ic_update_own" ON public.income_checks;
DROP POLICY IF EXISTS "ic_delete_own" ON public.income_checks;

CREATE POLICY "ic_select_own" ON public.income_checks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.estimated_incomes ei
            WHERE ei.id = income_id AND ei.user_id = auth.uid()
        )
    );

CREATE POLICY "ic_insert_own" ON public.income_checks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.estimated_incomes ei
            WHERE ei.id = income_id AND ei.user_id = auth.uid()
        )
    );

CREATE POLICY "ic_update_own" ON public.income_checks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.estimated_incomes ei
            WHERE ei.id = income_id AND ei.user_id = auth.uid()
        )
    );

CREATE POLICY "ic_delete_own" ON public.income_checks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.estimated_incomes ei
            WHERE ei.id = income_id AND ei.user_id = auth.uid()
        )
    );


-- ════════════════════════════════════════════════════════════
-- 10. PUSH_SUBSCRIPTIONS
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_select_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_insert_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_delete_own" ON public.push_subscriptions;

CREATE POLICY "push_select_own" ON public.push_subscriptions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "push_insert_own" ON public.push_subscriptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_delete_own" ON public.push_subscriptions
    FOR DELETE USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 11. NOTIFICATIONS
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;

CREATE POLICY "notif_select_own" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notif_update_own" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- INSERT y DELETE de notificaciones solo desde el backend (rol postgres).
-- El backend bypasea RLS al conectarse con DATABASE_URL.


-- ════════════════════════════════════════════════════════════
-- VERIFICACIÓN: Listar todas las políticas creadas
-- ════════════════════════════════════════════════════════════
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
