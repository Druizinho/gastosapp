import asyncio
import os
import sys
import uuid
from decimal import Decimal
from datetime import date

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from app.database import SessionLocal
from app import models, schemas, crud, crud_budgets
from app.bcv_service import rates_cache
from fastapi import HTTPException
from sqlalchemy.future import select

crud_budgets._schema_ensured = True
crud._categories_debts_schema_ensured = True
rates_cache['rates'] = {
    "usd_bs": Decimal("40.0"),
    "eur_bs": Decimal("44.0"),
    "usdt_bs": Decimal("48.0")
}

async def run_tests():
    print("==================================================")
    print("STARTING TEST SUITE: BUDGET REFACTOR V2")
    print("==================================================")
    
    async with SessionLocal() as db:
        test_user_id = uuid.UUID('8b04bc8a-9b52-462d-a7b1-4b86e6cc5517')
        test_month = "2099-07"
        created_expenses = []

        try:
            # Cleanup any existing test budgets in test_month
            res = await db.execute(
                select(models.MonthlyBudget).where(
                    models.MonthlyBudget.user_id == test_user_id,
                    models.MonthlyBudget.month_year == test_month
                )
            )
            for b in res.scalars().all():
                await db.delete(b)
            await db.commit()

            # ----------------------------------------------------
            # TEST 1: "Sin Categoría" Protected & Persisted in DB
            # ----------------------------------------------------
            print("\n[TEST 1] Verifying 'Sin Categoría' in Database...")
            cats = await crud.get_categories(db, test_user_id)
            all_cat_names = [c.name.strip().lower() for c in cats]
            sin_cat = next((c for c in cats if c.name.strip().lower() == "sin categoría"), None)
            assert sin_cat is not None, "Sin Categoría must exist in DB"
            sin_cat_id = sin_cat.id
            assert sin_cat.icon == "HelpCircle", f"Expected HelpCircle, got {sin_cat.icon}"
            assert sin_cat.color == "#64748B", f"Expected #64748B, got {sin_cat.color}"
            print("  [OK] 'Sin Categoría' found in DB with correct icon and color.")

            # Test 1.1: Cannot rename "Sin Categoría"
            try:
                await crud.update_category(
                    db,
                    sin_cat_id,
                    schemas.CategoryCreate(name="Nueva Sin Cat", icon="HelpCircle", color="#64748B"),
                    test_user_id
                )
                assert False, "Should have raised HTTPException 400 on rename"
            except HTTPException as e:
                assert e.status_code == 400
                print(f"  [OK] Renaming rejected correctly: {e.detail}")

            # Test 1.2: Cannot delete "Sin Categoría"
            try:
                await crud.delete_category(db, sin_cat_id, test_user_id)
                assert False, "Should have raised HTTPException 400 on delete"
            except HTTPException as e:
                assert e.status_code == 400
                print(f"  [OK] Deleting rejected correctly: {e.detail}")

            # Test 1.3: Creating expense with empty category defaults to "Sin Categoría"
            exp_data = schemas.ExpenseCreate(
                amount=Decimal("15.50"),
                description="Gasto sin categoría test",
                category="",
                currency=schemas.CurrencyType.USD_BCV,
                date=date(2099, 7, 10)
            )
            db_exp = await crud.create_expense(db, exp_data, test_user_id)
            created_expenses.append(db_exp.id)
            assert db_exp.category == "Sin Categoría", f"Expected 'Sin Categoría', got {db_exp.category}"
            print("  [OK] Expense with empty category was assigned 'Sin Categoría'.")

            # Test 1.4: Cannot create manual category named "Sin Categoría"
            try:
                await crud.create_category(
                    db,
                    schemas.CategoryCreate(name="Sin Categoría", icon="HelpCircle", color="#64748B"),
                    test_user_id
                )
                assert False, "Should have raised HTTPException 400 on creating Sin Categoría"
            except HTTPException as e:
                assert e.status_code == 400
                print(f"  [OK] Manual creation of 'Sin Categoría' blocked: {e.detail}")

            # ----------------------------------------------------
            # TEST 2: Primary Budget Auto-Population & Ceilings
            # ----------------------------------------------------
            print("\n[TEST 2] Verifying Primary Budget & Ceiling Invariant...")
            view_res = await crud_budgets.get_monthly_budget_view(db, test_user_id, test_month)
            assert view_res.exists is True
            assert len(view_res.budgets) >= 1
            primary_b = next((b for b in view_res.budgets if b.is_primary), None)
            assert primary_b is not None, "Primary budget must exist"
            print(f"  [OK] Primary budget '{primary_b.name}' active.")

            # Test 2.1: Deleting Primary budget is rejected
            try:
                await crud_budgets.delete_monthly_budget_by_id(db, test_user_id, primary_b.id)
                assert False, "Should have rejected deleting Primary budget"
            except HTTPException as e:
                assert e.status_code == 400
                print(f"  [OK] Deleting Primary budget blocked: {e.detail}")

            # All user categories must be in primary budget
            all_cat_names_set = set(all_cat_names)
            primary_cat_names = {cl.category_name.strip().lower() for cl in primary_b.category_limits}
            for cname in all_cat_names_set:
                assert cname in primary_cat_names, f"Category '{cname}' missing from Primary budget"
            print(f"  [OK] All {len(all_cat_names_set)} categories (including Sin Categoría) present in Primary budget.")

            # With no limits set yet, ceiling is 0
            # Test ceiling = sum of category limits
            initial_ceiling = primary_b.effective_global_limit or 0
            sum_limits = sum(cl.limit_amount for cl in primary_b.category_limits)
            assert initial_ceiling == sum_limits, f"Ceiling {initial_ceiling} must equal sum of limits {sum_limits}"
            print(f"  [OK] Invariant verified: Ceiling ({initial_ceiling}) == Sum of Category Limits ({sum_limits}).")

            # ----------------------------------------------------
            # TEST 3: Assigning Limit in Primary Budget
            # ----------------------------------------------------
            print("\n[TEST 3] Assigning Category Limit in Primary Budget...")
            upsert_res = await crud_budgets.upsert_category_limit_by_budget_id(
                db,
                test_user_id,
                primary_b.id,
                schemas.BudgetCategoryLimitInput(
                    category_name="Alimentación",
                    limit_amount=Decimal("250.00"),
                    currency=schemas.CurrencyType.USD_BCV
                )
            )
            up_primary = next(b for b in upsert_res.budgets if b.id == primary_b.id)
            alim_cl = next(cl for cl in up_primary.category_limits if cl.category_name.lower() == "alimentación")
            assert alim_cl.limit_amount == Decimal("250.00")
            assert alim_cl.needs_limit is False
            assert up_primary.effective_global_limit >= Decimal("250.00")
            print(f"  [OK] 'Alimentación' limit updated to 250 USD_BCV. Primary ceiling: {up_primary.effective_global_limit}")

            # Assign limit to "Sin Categoría"
            upsert_res2 = await crud_budgets.upsert_category_limit_by_budget_id(
                db,
                test_user_id,
                primary_b.id,
                schemas.BudgetCategoryLimitInput(
                    category_name="Sin Categoría",
                    limit_amount=Decimal("50.00"),
                    currency=schemas.CurrencyType.USD_BCV
                )
            )
            up_primary2 = next(b for b in upsert_res2.budgets if b.id == primary_b.id)
            sin_cl = next(cl for cl in up_primary2.category_limits if cl.category_name.lower() == "sin categoría")
            assert sin_cl.limit_amount == Decimal("50.00")
            assert sin_cl.needs_limit is False
            print(f"  [OK] 'Sin Categoría' limit set to 50 USD_BCV. Needs limit is now False.")

            # ----------------------------------------------------
            # TEST 4: Sub-Budget Creation & Inheritance
            # ----------------------------------------------------
            print("\n[TEST 4] Creating Sub-Budget & Verifying Limit Inheritance...")
            sub_res = await crud_budgets.create_monthly_budget(
                db,
                test_user_id,
                test_month,
                schemas.MonthlyBudgetCreate(
                    name="Grupo Mercado & Varios",
                    currency=schemas.CurrencyType.USD_BCV,
                    is_primary=False,
                    categories=["Alimentación", "Sin Categoría"]
                )
            )
            sub_b = next((b for b in sub_res.budgets if not b.is_primary and b.name == "Grupo Mercado & Varios"), None)
            assert sub_b is not None, "Sub-budget must be created"
            assert len(sub_b.category_limits) == 2

            sub_alim = next(cl for cl in sub_b.category_limits if cl.category_name.lower() == "alimentación")
            sub_sin = next(cl for cl in sub_b.category_limits if cl.category_name.lower() == "sin categoría")
            assert sub_alim.limit_amount == Decimal("250.00"), f"Expected 250, got {sub_alim.limit_amount}"
            assert sub_alim.is_inherited is True
            assert sub_sin.limit_amount == Decimal("50.00"), f"Expected 50, got {sub_sin.limit_amount}"
            assert sub_sin.is_inherited is True
            assert sub_b.effective_global_limit == Decimal("300.00"), f"Expected 300 ceiling, got {sub_b.effective_global_limit}"
            print(f"  [OK] Sub-budget inherited limits directly from Primary (250 + 50 = 300 ceiling).")

            # Test 4.1: Sub-budget directly upserting category limit is blocked
            try:
                await crud_budgets.upsert_category_limit_by_budget_id(
                    db,
                    test_user_id,
                    sub_b.id,
                    schemas.BudgetCategoryLimitInput(
                        category_name="Alimentación",
                        limit_amount=Decimal("999.00"),
                        currency=schemas.CurrencyType.USD_BCV
                    )
                )
                assert False, "Should have rejected upserting on sub-budget"
            except HTTPException as e:
                assert e.status_code == 400
                print(f"  [OK] Direct limit edit on sub-budget blocked as expected: {e.detail}")

            # ----------------------------------------------------
            # TEST 5: Real-time Propagation Primary -> Sub-budget
            # ----------------------------------------------------
            print("\n[TEST 5] Updating Limit in Primary propagates to Sub-budget...")
            prop_res = await crud_budgets.upsert_category_limit_by_budget_id(
                db,
                test_user_id,
                primary_b.id,
                schemas.BudgetCategoryLimitInput(
                    category_name="Alimentación",
                    limit_amount=Decimal("400.00"),
                    currency=schemas.CurrencyType.USD_BCV
                )
            )
            prop_sub = next(b for b in prop_res.budgets if b.id == sub_b.id)
            prop_alim = next(cl for cl in prop_sub.category_limits if cl.category_name.lower() == "alimentación")
            assert prop_alim.limit_amount == Decimal("400.00"), f"Expected 400 inherited, got {prop_alim.limit_amount}"
            assert prop_sub.effective_global_limit == Decimal("450.00")
            print(f"  [OK] Propagated: Sub-budget Alimentación is now 400, ceiling is 450.")

            # ----------------------------------------------------
            # TEST 6: Category Deletion Behavior (Sub vs Primary)
            # ----------------------------------------------------
            print("\n[TEST 6] Deleting Category in Sub-budget vs Primary...")
            # 6.1 Delete from Sub-budget removes from group
            del_sub_res = await crud_budgets.delete_category_limit_by_budget_id(
                db,
                test_user_id,
                sub_b.id,
                "Sin Categoría"
            )
            del_sub_b = next(b for b in del_sub_res.budgets if b.id == sub_b.id)
            del_primary_b = next(b for b in del_sub_res.budgets if b.id == primary_b.id)
            assert not any(cl.category_name.lower() == "sin categoría" for cl in del_sub_b.category_limits)
            # But Primary must still have it!
            assert any(cl.category_name.lower() == "sin categoría" for cl in del_primary_b.category_limits)
            print("  [OK] Removed 'Sin Categoría' from sub-budget group, kept intact in Primary.")

            # 6.2 Delete from Primary resets limit to 0
            del_prim_res = await crud_budgets.delete_category_limit_by_budget_id(
                db,
                test_user_id,
                primary_b.id,
                "Alimentación"
            )
            prim_after = next(b for b in del_prim_res.budgets if b.id == primary_b.id)
            sub_after = next(b for b in del_prim_res.budgets if b.id == sub_b.id)
            prim_alim_after = next(cl for cl in prim_after.category_limits if cl.category_name.lower() == "alimentación")
            assert prim_alim_after.limit_amount == Decimal("0.00")
            assert prim_alim_after.needs_limit is True
            # Sub-budget also inherits 0
            sub_alim_after = next(cl for cl in sub_after.category_limits if cl.category_name.lower() == "alimentación")
            assert sub_alim_after.limit_amount == Decimal("0.00")
            print("  [OK] Reset 'Alimentación' to 0 in Primary and sub-budget. Needs limit is True.")

            print("\n==================================================")
            print("ALL 6 BUDGET REFACTOR V2 TEST SUITES PASSED (100% SUCCESS)!")
            print("==================================================")

        finally:
            # Cleanup test artifacts
            clean_res = await db.execute(
                select(models.MonthlyBudget).where(
                    models.MonthlyBudget.user_id == test_user_id,
                    models.MonthlyBudget.month_year == test_month
                )
            )
            for b in clean_res.scalars().all():
                await db.delete(b)
            for eid in created_expenses:
                e_obj = await db.get(models.Expense, eid)
                if e_obj:
                    await db.delete(e_obj)
            await db.commit()

if __name__ == "__main__":
    asyncio.run(run_tests())
