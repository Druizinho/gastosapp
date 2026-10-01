-- Migration: Fixed Expense Checks (historial de pagos por mes)
-- Run this in Supabase SQL Editor

-- 1. Create fixed_expense_checks table (similar pattern to income_checks)
CREATE TABLE IF NOT EXISTS fixed_expense_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixed_expense_id UUID NOT NULL REFERENCES fixed_expenses(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL,  -- YYYY-MM
    paid_amount NUMERIC(12, 4) NOT NULL CHECK (paid_amount > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    -- Currency conversions at time of payment
    amount_usd NUMERIC(12, 4),
    amount_bs NUMERIC(12, 4),
    amount_eur NUMERIC(12, 4),
    amount_usdt NUMERIC(12, 4),
    rate_usd_bs NUMERIC(12, 4),
    rate_eur_bs NUMERIC(12, 4),
    rate_usdt_bs NUMERIC(12, 4),
    paid_date DATE NOT NULL DEFAULT CURRENT_DATE,
    create_expense BOOLEAN DEFAULT FALSE,  -- if true, also created a real Expense
    expense_id UUID,                       -- reference to the created Expense (nullable)
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    -- One check per expense per month
    UNIQUE(fixed_expense_id, month_year)
);

CREATE INDEX idx_fixed_expense_checks_expense ON fixed_expense_checks(fixed_expense_id);
CREATE INDEX idx_fixed_expense_checks_month ON fixed_expense_checks(month_year);

-- 2. Remove the old last_paid_month column (no longer needed, data is in checks now)
-- NOTE: If you have existing data in last_paid_month, run the migration below FIRST
--       to copy existing marks into the new checks table, then drop the column.

-- Optional: Migrate existing last_paid_month data into checks
-- INSERT INTO fixed_expense_checks (fixed_expense_id, month_year, paid_amount, currency, paid_date)
-- SELECT id, last_paid_month, amount, currency, CURRENT_DATE
-- FROM fixed_expenses
-- WHERE last_paid_month IS NOT NULL;

-- After migration, you can drop the old column:
-- ALTER TABLE fixed_expenses DROP COLUMN IF EXISTS last_paid_month;
