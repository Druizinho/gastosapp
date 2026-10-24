-- ==============================================================================
-- Migración V3: Restricciones de Integridad Financiera y Concurrencia Bidireccional
-- GastosApp — PostgreSQL / Supabase
-- ==============================================================================

-- 1. Índice único bidireccional en conexiones para prevenir solicitudes cruzadas concurrentes (PAN-07)
CREATE UNIQUE INDEX IF NOT EXISTS _connection_bidirectional_uc 
ON connections (LEAST(requester_id, receiver_id), GREATEST(requester_id, receiver_id));

-- 2. Restricción única en comprobaciones de ingreso estimado por mes (FIN-06)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = '_income_month_uc'
    ) THEN
        ALTER TABLE income_checks 
        ADD CONSTRAINT _income_month_uc UNIQUE (income_id, month_year);
    END IF;
EXCEPTION
    WHEN duplicate_table THEN NULL;
END $$;

-- 3. Restricciones CHECK de montos positivos en tablas financieras (FIN-06)

-- Gastos: monto > 0
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_expenses_amount_positive') THEN
        ALTER TABLE expenses ADD CONSTRAINT check_expenses_amount_positive CHECK (amount > 0);
    END IF;
END $$;

-- Ingresos estimados: expected_amount > 0
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_estimated_incomes_expected_amount_positive') THEN
        ALTER TABLE estimated_incomes ADD CONSTRAINT check_estimated_incomes_expected_amount_positive CHECK (expected_amount > 0);
    END IF;
END $$;

-- Cobros de ingresos reales: real_amount > 0
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_income_checks_real_amount_positive') THEN
        ALTER TABLE income_checks ADD CONSTRAINT check_income_checks_real_amount_positive CHECK (real_amount > 0);
    END IF;
END $$;

-- Presupuestos mensuales: límites no negativos si están definidos
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_monthly_budgets_manual_limit') THEN
        ALTER TABLE monthly_budgets ADD CONSTRAINT check_monthly_budgets_manual_limit CHECK (manual_global_limit IS NULL OR manual_global_limit >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_monthly_budgets_effective_limit') THEN
        ALTER TABLE monthly_budgets ADD CONSTRAINT check_monthly_budgets_effective_limit CHECK (effective_global_limit IS NULL OR effective_global_limit >= 0);
    END IF;
END $$;

-- Límites por categoría en presupuestos: limit_amount >= 0
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_budget_category_limits_amount_non_negative') THEN
        ALTER TABLE budget_category_limits ADD CONSTRAINT check_budget_category_limits_amount_non_negative CHECK (limit_amount >= 0);
    END IF;
END $$;
