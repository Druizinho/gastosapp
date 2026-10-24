-- Migration: Saving Goals & Deposits tables
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS saving_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    target_amount NUMERIC(12, 4) NOT NULL CHECK (target_amount > 0),
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
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_saving_goals_user ON saving_goals(user_id);

CREATE TABLE IF NOT EXISTS saving_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES saving_goals(id) ON DELETE CASCADE,
    amount NUMERIC(12, 4) NOT NULL CHECK (amount > 0),
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
    create_expense BOOLEAN NOT NULL DEFAULT FALSE,
    expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_saving_deposits_goal ON saving_deposits(goal_id);

-- RLS
ALTER TABLE saving_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE saving_deposits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own saving goals') THEN
        CREATE POLICY "Users can view their own saving goals" ON saving_goals
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own saving goals') THEN
        CREATE POLICY "Users can insert their own saving goals" ON saving_goals
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own saving goals') THEN
        CREATE POLICY "Users can update their own saving goals" ON saving_goals
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own saving goals') THEN
        CREATE POLICY "Users can delete their own saving goals" ON saving_goals
            FOR DELETE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view deposits of their goals') THEN
        CREATE POLICY "Users can view deposits of their goals" ON saving_deposits
            FOR SELECT USING (EXISTS (SELECT 1 FROM saving_goals g WHERE g.id = saving_deposits.goal_id AND g.user_id = auth.uid()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert deposits to their goals') THEN
        CREATE POLICY "Users can insert deposits to their goals" ON saving_deposits
            FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM saving_goals g WHERE g.id = saving_deposits.goal_id AND g.user_id = auth.uid()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update deposits of their goals') THEN
        CREATE POLICY "Users can update deposits of their goals" ON saving_deposits
            FOR UPDATE USING (EXISTS (SELECT 1 FROM saving_goals g WHERE g.id = saving_deposits.goal_id AND g.user_id = auth.uid()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete deposits of their goals') THEN
        CREATE POLICY "Users can delete deposits of their goals" ON saving_deposits
            FOR DELETE USING (EXISTS (SELECT 1 FROM saving_goals g WHERE g.id = saving_deposits.goal_id AND g.user_id = auth.uid()));
    END IF;
END $$;
