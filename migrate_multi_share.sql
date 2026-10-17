-- ==============================================================================
-- Migration: Multi-member Sharing Architecture (Panas -> N members)
-- Phase 1: Structure Definition
-- ==============================================================================

-- 1. Shares table
CREATE TABLE IF NOT EXISTS public.shares (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('debt', 'fixed_expense', 'saving_goal')),
    owner_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Share members table
CREATE TABLE IF NOT EXISTS public.share_members (
    share_id   UUID NOT NULL REFERENCES public.shares(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    entity_id  UUID NOT NULL,
    role       VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    added_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (share_id, user_id),
    CONSTRAINT _share_member_entity_unique UNIQUE (entity_id)
);

CREATE INDEX IF NOT EXISTS idx_share_members_user ON public.share_members(user_id);
CREATE INDEX IF NOT EXISTS idx_share_members_entity ON public.share_members(entity_id);

-- 3. Synchronized child rows: sync_id and paid_by_user_id
-- Debts payments
ALTER TABLE public.debt_payments ADD COLUMN IF NOT EXISTS sync_id UUID;
ALTER TABLE public.debt_payments ADD COLUMN IF NOT EXISTS paid_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_debt_payments_sync ON public.debt_payments(sync_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_payer ON public.debt_payments(paid_by_user_id);

-- Fixed expense checks
ALTER TABLE public.fixed_expense_checks ADD COLUMN IF NOT EXISTS sync_id UUID;
ALTER TABLE public.fixed_expense_checks ADD COLUMN IF NOT EXISTS paid_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fe_checks_sync ON public.fixed_expense_checks(sync_id);
CREATE INDEX IF NOT EXISTS idx_fe_checks_payer ON public.fixed_expense_checks(paid_by_user_id);

-- Saving deposits
ALTER TABLE public.saving_deposits ADD COLUMN IF NOT EXISTS sync_id UUID;
ALTER TABLE public.saving_deposits ADD COLUMN IF NOT EXISTS paid_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_saving_dep_sync ON public.saving_deposits(sync_id);
CREATE INDEX IF NOT EXISTS idx_saving_dep_payer ON public.saving_deposits(paid_by_user_id);

-- 4. Row Level Security
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_share_member(s UUID) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.share_members
        WHERE share_id = s AND user_id = auth.uid()
    );
$$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shares_select') THEN
        CREATE POLICY "shares_select" ON public.shares
            FOR SELECT USING (public.is_share_member(id));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'share_members_select') THEN
        CREATE POLICY "share_members_select" ON public.share_members
            FOR SELECT USING (public.is_share_member(share_id));
    END IF;
END $$;
