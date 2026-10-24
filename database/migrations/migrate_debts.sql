-- Migration: Debts & Debt Payments tables
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type VARCHAR(12) NOT NULL CHECK (type IN ('owed', 'receivable')),
    -- 'owed' = lo que debemos, 'receivable' = lo que nos deben
    counterpart TEXT NOT NULL,  -- nombre del acreedor o deudor
    concept TEXT NOT NULL,
    total_amount NUMERIC(12, 4) NOT NULL CHECK (total_amount > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,              -- opcional
    is_settled BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX idx_debts_user ON debts(user_id);

CREATE TABLE IF NOT EXISTS debt_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    amount NUMERIC(12, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    -- Tasas al momento del pago (igual que expenses)
    amount_usd NUMERIC(12, 4),
    amount_bs NUMERIC(12, 4),
    amount_eur NUMERIC(12, 4),
    amount_usdt NUMERIC(12, 4),
    rate_usd_bs NUMERIC(12, 4),
    rate_eur_bs NUMERIC(12, 4),
    rate_usdt_bs NUMERIC(12, 4),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX idx_debt_payments_debt ON debt_payments(debt_id);
