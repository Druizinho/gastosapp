CREATE TABLE IF NOT EXISTS public.shared_fixed_expenses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixed_expense_id  UUID NOT NULL REFERENCES fixed_expenses(id) ON DELETE CASCADE,
    owner_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    partner_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    mirror_expense_id UUID REFERENCES fixed_expenses(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT _shared_fe_unique UNIQUE (fixed_expense_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_fe_expense ON shared_fixed_expenses(fixed_expense_id);
CREATE INDEX IF NOT EXISTS idx_shared_fe_mirror ON shared_fixed_expenses(mirror_expense_id);
CREATE INDEX IF NOT EXISTS idx_shared_fe_users ON shared_fixed_expenses(owner_id, partner_id);

ALTER TABLE public.fixed_expense_checks ADD COLUMN IF NOT EXISTS paid_by_name VARCHAR;
ALTER TABLE public.fixed_expense_checks ADD COLUMN IF NOT EXISTS mirror_check_id UUID REFERENCES fixed_expense_checks(id) ON DELETE SET NULL;

ALTER TABLE public.shared_fixed_expenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shared_fixed_expenses_select') THEN
        CREATE POLICY "shared_fixed_expenses_select" ON public.shared_fixed_expenses
            FOR SELECT USING (auth.uid() = owner_id OR auth.uid() = partner_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shared_fixed_expenses_insert') THEN
        CREATE POLICY "shared_fixed_expenses_insert" ON public.shared_fixed_expenses
            FOR INSERT WITH CHECK (auth.uid() = owner_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shared_fixed_expenses_delete') THEN
        CREATE POLICY "shared_fixed_expenses_delete" ON public.shared_fixed_expenses
            FOR DELETE USING (auth.uid() = owner_id OR auth.uid() = partner_id);
    END IF;
END $$;
