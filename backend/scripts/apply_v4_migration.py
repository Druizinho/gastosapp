import asyncio
import os
import sys
from sqlalchemy import text
from dotenv import load_dotenv

# Path setup
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, backend_dir)
load_dotenv(os.path.join(backend_dir, '.env'))

from app.database import engine

MIGRATION_PATH = os.path.abspath(os.path.join(backend_dir, '..', 'migrations', 'v4_schema_relationships_cleanup.sql'))

async def run_v4_migration():
    print("==================================================")
    print("EXECUTING MIGRATION V4 & SCHEMA SANITIZATION")
    print("==================================================")
    print(f"Reading migration file from: {MIGRATION_PATH}")
    
    if not os.path.exists(MIGRATION_PATH):
        raise FileNotFoundError(f"Migration file not found: {MIGRATION_PATH}")
        
    with open(MIGRATION_PATH, 'r', encoding='utf-8') as f:
        sql_content = f.read()

    print("Applying migration against Supabase database...")
    async with engine.connect() as conn:
        # Use underlying asyncpg connection for executing full multi-statement DDL/DO script
        raw_conn = await conn.get_raw_connection()
        await raw_conn.driver_connection.execute(sql_content)
        print(" [OK] Migration script executed successfully.")

    print("\n--------------------------------------------------")
    print("VERIFICATION CHECKS")
    print("--------------------------------------------------")
    async with engine.connect() as conn:
        # 1. Remaining public tables
        tables_res = await conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """))
        tables = [r[0] for r in tables_res.fetchall()]
        print(f"\nRemaining public tables ({len(tables)}):")
        for t in tables:
            print(f"  - {t}")

        # Check dropped legacy tables
        for dropped in ["shared_debts", "shared_fixed_expenses", "shared_saving_goals"]:
            if dropped in tables:
                print(f"  [ERROR] Legacy table '{dropped}' still exists!")
            else:
                print(f"  [OK] Legacy table '{dropped}' successfully removed.")

        # 2. Check active Foreign Keys
        fks_res = await conn.execute(text("""
            SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, tc.constraint_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
             AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = 'public'
            ORDER BY tc.table_name, tc.constraint_name;
        """))
        fks = fks_res.fetchall()
        print(f"\nActive Foreign Keys in public schema ({len(fks)} total):")
        fk_names = set()
        for fk in fks:
            fk_names.add(fk[3])
            print(f"  - {fk[0]}.{fk[1]} -> {fk[2]} ({fk[3]})")

        expected_new_fks = [
            'fk_categories_user',
            'fk_expenses_user',
            'fk_fixed_expenses_user',
            'fk_debts_user',
            'fk_estimated_incomes_user',
            'fk_saving_goals_user',
            'fk_notifications_user',
            'fk_push_subscriptions_user',
            'fk_fe_checks_expense'
        ]
        all_ok = True
        for efk in expected_new_fks:
            if efk in fk_names:
                print(f"  [OK] Expected FK '{efk}' is active.")
            else:
                print(f"  [ERROR] Expected FK '{efk}' was NOT found!")
                all_ok = False

        # 3. Orphan verification
        print("\nChecking for any remaining orphan rows:")
        orphan_checks = [
            ("categories", "SELECT COUNT(*) FROM public.categories WHERE user_id NOT IN (SELECT id FROM public.profiles)"),
            ("expenses", "SELECT COUNT(*) FROM public.expenses WHERE user_id NOT IN (SELECT id FROM public.profiles)"),
            ("fixed_expenses", "SELECT COUNT(*) FROM public.fixed_expenses WHERE user_id NOT IN (SELECT id FROM public.profiles)"),
            ("debts", "SELECT COUNT(*) FROM public.debts WHERE user_id NOT IN (SELECT id FROM public.profiles)"),
            ("estimated_incomes", "SELECT COUNT(*) FROM public.estimated_incomes WHERE user_id NOT IN (SELECT id FROM public.profiles)"),
            ("saving_goals", "SELECT COUNT(*) FROM public.saving_goals WHERE user_id NOT IN (SELECT id FROM public.profiles)"),
            ("notifications", "SELECT COUNT(*) FROM public.notifications WHERE user_id NOT IN (SELECT id FROM public.profiles)"),
            ("push_subscriptions", "SELECT COUNT(*) FROM public.push_subscriptions WHERE user_id NOT IN (SELECT id FROM public.profiles)"),
            ("fixed_expense_checks", "SELECT COUNT(*) FROM public.fixed_expense_checks WHERE expense_id IS NOT NULL AND expense_id NOT IN (SELECT id FROM public.expenses)")
        ]
        for tbl, query in orphan_checks:
            cnt_res = await conn.execute(text(query))
            cnt = cnt_res.scalar()
            if cnt == 0:
                print(f"  [OK] {tbl}: 0 orphans")
            else:
                print(f"  [WARNING] {tbl}: {cnt} orphans remaining")
                all_ok = False

        if all_ok:
            print("\n>>> MIGRATION V4 COMPLETED SUCCESSFULLY WITH INTEGRITY VERIFIED <<<")
        else:
            print("\n>>> MIGRATION V4 FINISHED WITH WARNINGS/ERRORS <<<")
            sys.exit(1)

if __name__ == "__main__":
    asyncio.run(run_v4_migration())
