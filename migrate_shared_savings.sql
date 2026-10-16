-- Migration: Shared Saving Goals between Panas
-- Run this migration to support co-saving between connected accounts

CREATE TABLE IF NOT EXISTS public.shared_saving_goals (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id        UUID NOT NULL REFERENCES saving_goals(id) ON DELETE CASCADE,
    owner_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    partner_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    mirror_goal_id UUID REFERENCES saving_goals(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT _shared_saving_goal_unique UNIQUE (goal_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_saving_goals_goal ON shared_saving_goals(goal_id);
CREATE INDEX IF NOT EXISTS idx_shared_saving_goals_mirror ON shared_saving_goals(mirror_goal_id);
CREATE INDEX IF NOT EXISTS idx_shared_saving_goals_users ON shared_saving_goals(owner_id, partner_id);

ALTER TABLE public.saving_deposits ADD COLUMN IF NOT EXISTS paid_by_name VARCHAR;
ALTER TABLE public.saving_deposits ADD COLUMN IF NOT EXISTS mirror_deposit_id UUID REFERENCES saving_deposits(id) ON DELETE CASCADE;

ALTER TABLE public.shared_saving_goals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shared_saving_goals_select') THEN
        CREATE POLICY "shared_saving_goals_select" ON public.shared_saving_goals
            FOR SELECT USING (auth.uid() = owner_id OR auth.uid() = partner_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shared_saving_goals_insert') THEN
        CREATE POLICY "shared_saving_goals_insert" ON public.shared_saving_goals
            FOR INSERT WITH CHECK (auth.uid() = owner_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shared_saving_goals_delete') THEN
        CREATE POLICY "shared_saving_goals_delete" ON public.shared_saving_goals
            FOR DELETE USING (auth.uid() = owner_id OR auth.uid() = partner_id);
    END IF;
END $$;
