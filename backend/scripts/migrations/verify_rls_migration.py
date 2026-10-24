import asyncio
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dotenv import load_dotenv
load_dotenv()

from app.database import engine
from sqlalchemy import text

TARGET_TABLES = [
    "saving_goals",
    "saving_deposits",
    "monthly_budgets",
    "budget_category_limits",
    "shares",
    "share_members",
    "shared_saving_goals",
    "shared_debts",
    "shared_fixed_expenses"
]

async def verify_rls():
    async with engine.connect() as conn:
        print("=" * 60)
        print("VERIFICANDO ROW LEVEL SECURITY (RLS) EN SUPABASE")
        print("=" * 60)

        # 1. Verificar rowsecurity en pg_tables
        tables_query = text("""
            SELECT tablename, rowsecurity
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename = ANY(:tables)
            ORDER BY tablename;
        """)
        result = await conn.execute(tables_query, {"tables": TARGET_TABLES})
        tables_status = result.fetchall()

        print("\n1. ESTADO DE RLS POR TABLA (rowsecurity):")
        all_enabled = True
        for row in tables_status:
            tbl, rls_active = row[0], row[1]
            status_icon = "[OK] ACTIVO" if rls_active else "[FAIL] DESACTIVADO"
            if not rls_active:
                all_enabled = False
            print(f"  * {tbl.ljust(26)} : {status_icon}")

        # 2. Verificar políticas en pg_policies
        policies_query = text("""
            SELECT tablename, policyname, cmd, roles
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = ANY(:tables)
            ORDER BY tablename, policyname;
        """)
        pol_result = await conn.execute(policies_query, {"tables": TARGET_TABLES})
        policies = pol_result.fetchall()

        print(f"\n2. POLITICAS RLS ENCONTRADAS ({len(policies)} politicas):")
        current_tbl = None
        for p in policies:
            tbl, pol_name, cmd, roles = p[0], p[1], p[2], p[3]
            if tbl != current_tbl:
                current_tbl = tbl
                print(f"\n  [{tbl.upper()}]:")
            print(f"    - {pol_name.ljust(35)} [{cmd.ljust(6)}] (roles: {roles})")

        print("\n" + "=" * 60)
        if all_enabled and len(policies) > 0:
            print("[EXITO] Migracion ejecutada y verificada exitosamente!")
            print("Todas las tablas tienen RLS habilitado y sus politicas activas.")
        else:
            print("[ADVERTENCIA] Algunas tablas o politicas no se encontraron.")
        print("=" * 60)

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(verify_rls())
