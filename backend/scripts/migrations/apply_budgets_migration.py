import asyncio
import os
import re
from dotenv import load_dotenv

import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from app.database import engine, Base
import app.models
from sqlalchemy import text

async def apply_migration():
    print("Connecting to database...")
    sql_path = os.path.join(os.path.dirname(__file__), '..', 'migrations', 'add_budgets.sql')
    with open(sql_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by semicolons while respecting DO $$ ... END $$;
    # Or simply execute create_all first, then RLS block
    async with engine.begin() as conn:
        print("Ensuring tables via Base.metadata.create_all...")
        await conn.run_sync(Base.metadata.create_all)
        print("Base.metadata.create_all completed.")

        # Read and run specific DDL statements
        # We can extract statements using a simple parser or regex
        # For DDL:
        ddl_statements = [
            "CREATE INDEX IF NOT EXISTS idx_monthly_budgets_user_month ON public.monthly_budgets(user_id, month_year);",
            "CREATE INDEX IF NOT EXISTS idx_monthly_budgets_income ON public.monthly_budgets(linked_income_id);",
            "CREATE INDEX IF NOT EXISTS idx_budget_category_limits_budget ON public.budget_category_limits(budget_id);",
            "CREATE INDEX IF NOT EXISTS idx_budget_category_limits_cat ON public.budget_category_limits(category_name);",
            "ALTER TABLE public.monthly_budgets ENABLE ROW LEVEL SECURITY;",
            "ALTER TABLE public.budget_category_limits ENABLE ROW LEVEL SECURITY;",
            """
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own monthly budgets') THEN
                    CREATE POLICY "Users can view their own monthly budgets" ON public.monthly_budgets
                        FOR SELECT USING (auth.uid() = user_id);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own monthly budgets') THEN
                    CREATE POLICY "Users can insert their own monthly budgets" ON public.monthly_budgets
                        FOR INSERT WITH CHECK (auth.uid() = user_id);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own monthly budgets') THEN
                    CREATE POLICY "Users can update their own monthly budgets" ON public.monthly_budgets
                        FOR UPDATE USING (auth.uid() = user_id);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own monthly budgets') THEN
                    CREATE POLICY "Users can delete their own monthly budgets" ON public.monthly_budgets
                        FOR DELETE USING (auth.uid() = user_id);
                END IF;

                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view category limits of their budgets') THEN
                    CREATE POLICY "Users can view category limits of their budgets" ON public.budget_category_limits
                        FOR SELECT USING (EXISTS (SELECT 1 FROM monthly_budgets b WHERE b.id = budget_category_limits.budget_id AND b.user_id = auth.uid()));
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert category limits to their budgets') THEN
                    CREATE POLICY "Users can insert category limits to their budgets" ON public.budget_category_limits
                        FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM monthly_budgets b WHERE b.id = budget_category_limits.budget_id AND b.user_id = auth.uid()));
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update category limits of their budgets') THEN
                    CREATE POLICY "Users can update category limits of their budgets" ON public.budget_category_limits
                        FOR UPDATE USING (EXISTS (SELECT 1 FROM monthly_budgets b WHERE b.id = budget_category_limits.budget_id AND b.user_id = auth.uid()));
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete category limits of their budgets') THEN
                    CREATE POLICY "Users can delete category limits of their budgets" ON public.budget_category_limits
                        FOR DELETE USING (EXISTS (SELECT 1 FROM monthly_budgets b WHERE b.id = budget_category_limits.budget_id AND b.user_id = auth.uid()));
                END IF;
            END $$;
            """
        ]
        for s in ddl_statements:
            st = s.strip()
            if st:
                print(f"Executing: {st[:60]}...")
                await conn.execute(text(st))

    await engine.dispose()
    print("Migration finished successfully!")

if __name__ == "__main__":
    asyncio.run(apply_migration())
