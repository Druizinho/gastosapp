import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import re

DATABASE_URL = "postgresql+asyncpg://postgres.barkempxqqgsjyewqjxw:gastosapp123@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

statements = [
    """
    CREATE TABLE IF NOT EXISTS public.shared_debts (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        debt_id        UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
        owner_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        partner_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        mirror_debt_id UUID REFERENCES debts(id) ON DELETE CASCADE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT _shared_debt_unique UNIQUE (debt_id)
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_shared_debts_debt ON shared_debts(debt_id);",
    "CREATE INDEX IF NOT EXISTS idx_shared_debts_mirror ON shared_debts(mirror_debt_id);",
    "CREATE INDEX IF NOT EXISTS idx_shared_debts_users ON shared_debts(owner_id, partner_id);",
    "ALTER TABLE public.debt_payments ADD COLUMN IF NOT EXISTS paid_by_name VARCHAR;",
    "ALTER TABLE public.debt_payments ADD COLUMN IF NOT EXISTS mirror_payment_id UUID REFERENCES debt_payments(id) ON DELETE SET NULL;",
    "ALTER TABLE public.shared_debts ENABLE ROW LEVEL SECURITY;",
    """
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shared_debts_select') THEN
            CREATE POLICY "shared_debts_select" ON public.shared_debts
                FOR SELECT USING (auth.uid() = owner_id OR auth.uid() = partner_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shared_debts_insert') THEN
            CREATE POLICY "shared_debts_insert" ON public.shared_debts
                FOR INSERT WITH CHECK (auth.uid() = owner_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shared_debts_delete') THEN
            CREATE POLICY "shared_debts_delete" ON public.shared_debts
                FOR DELETE USING (auth.uid() = owner_id OR auth.uid() = partner_id);
        END IF;
    END $$;
    """
]

async def run_migration():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        for stmt in statements:
            s = stmt.strip()
            if s:
                print(f"Executing: {s[:50]}...")
                await conn.execute(text(s))
    await engine.dispose()
    print("Migration successful!")

if __name__ == "__main__":
    asyncio.run(run_migration())
