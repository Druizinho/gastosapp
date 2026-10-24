-- Migration: Tools Hub — Fixed Expenses table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS fixed_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    amount NUMERIC(12, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'BS',
    -- Currency conversions at time of creation
    amount_usd NUMERIC(12, 4),
    amount_bs NUMERIC(12, 4),
    amount_eur NUMERIC(12, 4),
    amount_usdt NUMERIC(12, 4),
    rate_usd_bs NUMERIC(12, 4),
    rate_eur_bs NUMERIC(12, 4),
    rate_usdt_bs NUMERIC(12, 4),
    category TEXT,
    payment_day INT CHECK (payment_day IS NULL OR (payment_day BETWEEN 1 AND 31)),
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX idx_fixed_expenses_user ON fixed_expenses(user_id);
