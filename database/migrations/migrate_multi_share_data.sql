-- ==============================================================================
-- Migration: Multi-member Sharing Architecture (Panas -> N members)
-- Phase 1: Data Migration (Idempotent)
-- ==============================================================================

DO $$
BEGIN
    -- 1. Migrate shared_debts -> shares & share_members
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shared_debts') THEN
        -- Insert shares
        INSERT INTO public.shares (id, entity_type, owner_id, created_at)
        SELECT sd.id, 'debt', sd.owner_id, sd.created_at
        FROM public.shared_debts sd
        WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = sd.owner_id)
        ON CONFLICT (id) DO NOTHING;

        -- Insert owner as admin member
        INSERT INTO public.share_members (share_id, user_id, entity_id, role, added_by, joined_at)
        SELECT sd.id, sd.owner_id, sd.debt_id, 'admin', sd.owner_id, sd.created_at
        FROM public.shared_debts sd
        WHERE EXISTS (SELECT 1 FROM public.debts WHERE id = sd.debt_id)
          AND EXISTS (SELECT 1 FROM public.profiles WHERE id = sd.owner_id)
          AND NOT EXISTS (SELECT 1 FROM public.share_members sm WHERE sm.entity_id = sd.debt_id)
        ON CONFLICT (share_id, user_id) DO NOTHING;

        -- Insert partner as admin member (if mirror exists)
        INSERT INTO public.share_members (share_id, user_id, entity_id, role, added_by, joined_at)
        SELECT sd.id, sd.partner_id, sd.mirror_debt_id, 'admin', sd.owner_id, sd.created_at
        FROM public.shared_debts sd
        WHERE sd.mirror_debt_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.debts WHERE id = sd.mirror_debt_id)
          AND EXISTS (SELECT 1 FROM public.profiles WHERE id = sd.partner_id)
          AND NOT EXISTS (SELECT 1 FROM public.share_members sm WHERE sm.entity_id = sd.mirror_debt_id)
        ON CONFLICT (share_id, user_id) DO NOTHING;
    END IF;

    -- 2. Migrate shared_fixed_expenses -> shares & share_members
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shared_fixed_expenses') THEN
        INSERT INTO public.shares (id, entity_type, owner_id, created_at)
        SELECT sfe.id, 'fixed_expense', sfe.owner_id, sfe.created_at
        FROM public.shared_fixed_expenses sfe
        WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = sfe.owner_id)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.share_members (share_id, user_id, entity_id, role, added_by, joined_at)
        SELECT sfe.id, sfe.owner_id, sfe.fixed_expense_id, 'admin', sfe.owner_id, sfe.created_at
        FROM public.shared_fixed_expenses sfe
        WHERE EXISTS (SELECT 1 FROM public.fixed_expenses WHERE id = sfe.fixed_expense_id)
          AND EXISTS (SELECT 1 FROM public.profiles WHERE id = sfe.owner_id)
          AND NOT EXISTS (SELECT 1 FROM public.share_members sm WHERE sm.entity_id = sfe.fixed_expense_id)
        ON CONFLICT (share_id, user_id) DO NOTHING;

        INSERT INTO public.share_members (share_id, user_id, entity_id, role, added_by, joined_at)
        SELECT sfe.id, sfe.partner_id, sfe.mirror_expense_id, 'admin', sfe.owner_id, sfe.created_at
        FROM public.shared_fixed_expenses sfe
        WHERE sfe.mirror_expense_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.fixed_expenses WHERE id = sfe.mirror_expense_id)
          AND EXISTS (SELECT 1 FROM public.profiles WHERE id = sfe.partner_id)
          AND NOT EXISTS (SELECT 1 FROM public.share_members sm WHERE sm.entity_id = sfe.mirror_expense_id)
        ON CONFLICT (share_id, user_id) DO NOTHING;
    END IF;

    -- 3. Migrate shared_saving_goals -> shares & share_members
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shared_saving_goals') THEN
        INSERT INTO public.shares (id, entity_type, owner_id, created_at)
        SELECT ssg.id, 'saving_goal', ssg.owner_id, ssg.created_at
        FROM public.shared_saving_goals ssg
        WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = ssg.owner_id)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.share_members (share_id, user_id, entity_id, role, added_by, joined_at)
        SELECT ssg.id, ssg.owner_id, ssg.goal_id, 'admin', ssg.owner_id, ssg.created_at
        FROM public.shared_saving_goals ssg
        WHERE EXISTS (SELECT 1 FROM public.saving_goals WHERE id = ssg.goal_id)
          AND EXISTS (SELECT 1 FROM public.profiles WHERE id = ssg.owner_id)
          AND NOT EXISTS (SELECT 1 FROM public.share_members sm WHERE sm.entity_id = ssg.goal_id)
        ON CONFLICT (share_id, user_id) DO NOTHING;

        INSERT INTO public.share_members (share_id, user_id, entity_id, role, added_by, joined_at)
        SELECT ssg.id, ssg.partner_id, ssg.mirror_goal_id, 'admin', ssg.owner_id, ssg.created_at
        FROM public.shared_saving_goals ssg
        WHERE ssg.mirror_goal_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.saving_goals WHERE id = ssg.mirror_goal_id)
          AND EXISTS (SELECT 1 FROM public.profiles WHERE id = ssg.partner_id)
          AND NOT EXISTS (SELECT 1 FROM public.share_members sm WHERE sm.entity_id = ssg.mirror_goal_id)
        ON CONFLICT (share_id, user_id) DO NOTHING;
    END IF;

    -- 4. Sync IDs for existing Debt Payments
    -- First, pairs linked by mirror_payment_id
    UPDATE public.debt_payments
    SET sync_id = LEAST(id, mirror_payment_id)
    WHERE mirror_payment_id IS NOT NULL AND sync_id IS NULL;

    -- Non-shared / individual payments get their own id as sync_id
    UPDATE public.debt_payments
    SET sync_id = id
    WHERE sync_id IS NULL;

    -- 5. Sync IDs for existing Fixed Expense Checks
    UPDATE public.fixed_expense_checks
    SET sync_id = LEAST(id, mirror_check_id)
    WHERE mirror_check_id IS NOT NULL AND sync_id IS NULL;

    UPDATE public.fixed_expense_checks
    SET sync_id = id
    WHERE sync_id IS NULL;

    -- 6. Sync IDs for existing Saving Deposits
    UPDATE public.saving_deposits
    SET sync_id = LEAST(id, mirror_deposit_id)
    WHERE mirror_deposit_id IS NOT NULL AND sync_id IS NULL;

    UPDATE public.saving_deposits
    SET sync_id = id
    WHERE sync_id IS NULL;

    -- 7. Populate paid_by_user_id for debt payments
    -- A: Try matching with display_name of share members
    UPDATE public.debt_payments dp
    SET paid_by_user_id = sm.user_id
    FROM public.share_members sm
    JOIN public.profiles p ON sm.user_id = p.id
    WHERE dp.debt_id = sm.entity_id
      AND dp.paid_by_user_id IS NULL
      AND dp.paid_by_name IS NOT NULL
      AND TRIM(LOWER(p.display_name)) = TRIM(LOWER(dp.paid_by_name));

    -- B: For non-mirrored payments, fallback to debt user_id
    UPDATE public.debt_payments dp
    SET paid_by_user_id = d.user_id
    FROM public.debts d
    WHERE dp.debt_id = d.id
      AND dp.paid_by_user_id IS NULL;

    -- 8. Populate paid_by_user_id for fixed expense checks
    UPDATE public.fixed_expense_checks fec
    SET paid_by_user_id = sm.user_id
    FROM public.share_members sm
    JOIN public.profiles p ON sm.user_id = p.id
    WHERE fec.fixed_expense_id = sm.entity_id
      AND fec.paid_by_user_id IS NULL
      AND fec.paid_by_name IS NOT NULL
      AND TRIM(LOWER(p.display_name)) = TRIM(LOWER(fec.paid_by_name));

    UPDATE public.fixed_expense_checks fec
    SET paid_by_user_id = fe.user_id
    FROM public.fixed_expenses fe
    WHERE fec.fixed_expense_id = fe.id
      AND fec.paid_by_user_id IS NULL;

    -- 9. Populate paid_by_user_id for saving deposits
    UPDATE public.saving_deposits sd
    SET paid_by_user_id = sm.user_id
    FROM public.share_members sm
    JOIN public.profiles p ON sm.user_id = p.id
    WHERE sd.goal_id = sm.entity_id
      AND sd.paid_by_user_id IS NULL
      AND sd.paid_by_name IS NOT NULL
      AND TRIM(LOWER(p.display_name)) = TRIM(LOWER(sd.paid_by_name));

    UPDATE public.saving_deposits sd
    SET paid_by_user_id = sg.user_id
    FROM public.saving_goals sg
    WHERE sd.goal_id = sg.id
      AND sd.paid_by_user_id IS NULL;

END $$;
