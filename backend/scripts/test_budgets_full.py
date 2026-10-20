import asyncio
import os
import sys
import uuid
from decimal import Decimal
from datetime import date

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from app.database import engine, SessionLocal
from app import models, schemas, crud, crud_budgets
from fastapi import HTTPException
from sqlalchemy.future import select

async def run_tests():
    print("--- Starting Budget Integration Tests ---")
    async with SessionLocal() as db:
        # Use existing test user (must exist in profiles due to foreign key)
        test_user_id = uuid.UUID('8b04bc8a-9b52-462d-a7b1-4b86e6cc5517') # Diego Ruiz pruebas
        other_user_id = uuid.UUID('0f3c0bb0-4fff-4abe-94db-204dca8802b9')

        prior_month = "2098-12"
        test_month = "2099-01"
        next_month = "2099-02"
        future_month = "2099-03"

        created_expense_ids = []
        created_cat_ids = []
        other_income_id = None
        my_income_id = None

        try:
            # 0. Clean prior leftovers if any
            clean_res = await db.execute(select(models.MonthlyBudget).where(
                models.MonthlyBudget.user_id == test_user_id,
                models.MonthlyBudget.month_year.in_([prior_month, test_month, next_month, future_month])
            ))
            for b in clean_res.scalars().all():
                await db.delete(b)
            await db.commit()

            # Create clean baseline budget in prior_month so test_month clones exactly 1 budget
            base_budget = models.MonthlyBudget(
                user_id=test_user_id,
                month_year=prior_month,
                name="Presupuesto Principal",
                currency="USD_BCV",
                income_mode="manual",
                manual_global_limit=Decimal("500.00"),
                is_confirmed=True,
                is_primary=True,
                notified_month_start=True
            )
            db.add(base_budget)
            await db.commit()

            # 1. Test get_available_budget_categories
            test_cats_to_ensure = ["TestMercado", "Gastos Fijos", "Deudas", "Ahorro"]
            created_cat_ids = []
            for cname in test_cats_to_ensure:
                existing_cat = (await db.execute(select(models.Category).where(
                    models.Category.user_id == test_user_id,
                    models.Category.name == cname
                ))).scalars().first()
                if not existing_cat:
                    new_c = models.Category(user_id=test_user_id, name=cname, color="#10B981")
                    db.add(new_c)
                    await db.commit()
                    created_cat_ids.append(new_c.id)

            test_mercado_cat = (await db.execute(select(models.Category).where(
                models.Category.user_id == test_user_id,
                models.Category.name == "TestMercado"
            ))).scalars().first()
            created_cat_id = test_mercado_cat.id

            avail_cats = await crud_budgets.get_available_budget_categories(db, test_user_id)
            print("Available categories count:", len(avail_cats))
            assert "TestMercado" in avail_cats
            assert "Gastos Fijos" in avail_cats
            assert "Deudas" in avail_cats
            assert "Ahorro" in avail_cats
            print("[PASS] Available categories test passed!")

            # 2. Test IDOR protection on linked_income_id (Auditor Fix #5)
            other_income = models.EstimatedIncome(
                user_id=other_user_id,
                name="Ingreso ajeno",
                expected_amount=Decimal("1000.00"),
                currency="USD_BCV"
            )
            db.add(other_income)
            await db.commit()
            other_income_id = other_income.id

            idor_payload = schemas.MonthlyBudgetUpsert(
                currency=schemas.CurrencyType.USD_BCV,
                income_mode=schemas.BudgetIncomeMode.single_income,
                linked_income_id=other_income_id,
                manual_global_limit=None,
                category_limits=[]
            )

            idor_caught = False
            try:
                await crud_budgets.upsert_monthly_budget(db, test_user_id, test_month, idor_payload)
            except HTTPException as e:
                if e.status_code == 404:
                    idor_caught = True
            assert idor_caught, "Auditor Fix #5 failed: IDOR on linked_income_id was NOT caught!"
            print("[PASS] IDOR protection test passed (Auditor Fix #5)!")

            # 3. Test upsert_monthly_budget with user's own income & manual limits
            my_income = models.EstimatedIncome(
                user_id=test_user_id,
                name="Mi Sueldo Test",
                expected_amount=Decimal("800.00"),
                currency="USD_BCV"
            )
            db.add(my_income)
            await db.commit()
            my_income_id = my_income.id

            valid_payload = schemas.MonthlyBudgetUpsert(
                currency=schemas.CurrencyType.USD_BCV,
                income_mode=schemas.BudgetIncomeMode.manual,
                manual_global_limit=Decimal("500.00"),
                category_limits=[
                    schemas.BudgetCategoryLimitInput(category_name="TestMercado", limit_amount=Decimal("200.00")),
                    schemas.BudgetCategoryLimitInput(category_name="Gastos Fijos", limit_amount=Decimal("150.00")),
                ]
            )
            upsert_res = await crud_budgets.upsert_monthly_budget(db, test_user_id, test_month, valid_payload)
            assert upsert_res.exists is True
            assert upsert_res.is_confirmed is True
            assert len(upsert_res.category_limits) == 2
            assert Decimal(str(upsert_res.effective_global_limit)) == Decimal("500.00")
            print("[PASS] Upsert monthly budget passed!")

            # 4. Test auto-cloning to next month (Auditor Fix #3 & #4)
            cloned_budgets = await crud_budgets.get_or_clone_monthly_budgets(db, test_user_id, next_month)
            assert len(cloned_budgets) >= 1
            cloned_b1 = cloned_budgets[0]
            assert cloned_b1.month_year == next_month
            assert cloned_b1.is_confirmed is False, "Cloned budget should start unconfirmed!"
            assert len(cloned_b1.category_limits) == 2
            print("[PASS] Auto-cloning test passed (Auditor Fix #3)!")

            # Confirm cloned budget
            confirmed = await crud_budgets.confirm_monthly_budget(db, test_user_id, next_month)
            assert confirmed.is_confirmed is True
            print("[PASS] Confirm monthly budget test passed!")

            # 5. Test Category Rename and Delete Sync (Auditor Fix #6)
            # Rename "TestMercado" -> "TestSupermercado"
            await crud.update_category(
                db=db,
                category_id=created_cat_id,
                category_update=schemas.CategoryCreate(name="TestSupermercado", color="#10B981"),
                user_id=test_user_id
            )
            # Check limits on test_month
            view_after_rename = await crud_budgets.get_monthly_budget_view(db, test_user_id, test_month)
            renamed_limit_names = [cl.category_name for cl in view_after_rename.category_limits]
            assert "TestSupermercado" in renamed_limit_names
            assert "TestMercado" not in renamed_limit_names
            print("[PASS] Category rename sync test passed (Auditor Fix #6)!")

            # Delete "TestSupermercado" with reassign_to="Gastos Fijos"
            await crud.delete_category(
                db=db,
                category_id=created_cat_id,
                user_id=test_user_id,
                reassign_to="Gastos Fijos"
            )
            created_cat_ids = []
            view_after_delete = await crud_budgets.get_monthly_budget_view(db, test_user_id, test_month)
            deleted_limit_names = [cl.category_name for cl in view_after_delete.category_limits]
            assert "TestSupermercado" not in deleted_limit_names
            print("[PASS] Category delete sync test passed (Auditor Fix #6)!")

            # 6. Test Single Category Upsert & Category Currency (L2 Spec)
            cat_payload = schemas.BudgetCategoryLimitInput(
                category_name="Gastos Fijos",
                limit_amount=Decimal("3000.00"),
                currency=schemas.CurrencyType.BS
            )
            cat_res = await crud_budgets.upsert_budget_category_limit(db, test_user_id, test_month, cat_payload)
            fe_limit_bs = next(cl for cl in cat_res.category_limits if cl.category_name == "Gastos Fijos")
            assert fe_limit_bs.limit_amount == Decimal("3000.00")
            assert str(fe_limit_bs.currency) == "BS" or fe_limit_bs.currency == schemas.CurrencyType.BS
            assert cat_res.allocated_bs > Decimal("0")
            assert cat_res.allocated_usd > Decimal("0")
            print("[PASS] Single category upsert with BS currency passed!")

            # Test single category delete (L2 Spec)
            del_res = await crud_budgets.delete_budget_category_limit(db, test_user_id, test_month, "Gastos Fijos")
            fe_exists = any(cl.category_name == "Gastos Fijos" for cl in del_res.category_limits)
            assert not fe_exists, "Gastos Fijos should have been deleted from limits!"
            print("[PASS] Single category delete passed!")

            # Re-add Gastos Fijos with USD_BCV for remaining tests
            await crud_budgets.upsert_budget_category_limit(
                db, test_user_id, test_month,
                schemas.BudgetCategoryLimitInput(category_name="Gastos Fijos", limit_amount=Decimal("150.00"), currency=schemas.CurrencyType.USD_BCV)
            )

            # 7. Multi-Budget Spec: Create second budget in the same month
            b2_create = schemas.MonthlyBudgetCreate(
                name="Presupuesto Negocio",
                currency=schemas.CurrencyType.USD_BCV,
                income_mode=schemas.BudgetIncomeMode.manual,
                manual_global_limit=Decimal("400.00"),
                notes="Presupuesto para operaciones del negocio"
            )
            b2_res = await crud_budgets.create_monthly_budget(db, test_user_id, test_month, b2_create)
            b2 = next(b for b in b2_res.budgets if b.name == "Presupuesto Negocio")
            assert b2.name == "Presupuesto Negocio"
            assert b2.manual_global_limit == Decimal("400.00")
            print("[PASS] Multi-budget creation passed!")

            # Check view has 2 budgets
            view_mb = await crud_budgets.get_monthly_budget_view(db, test_user_id, test_month)
            assert len(view_mb.budgets) == 2
            assert any(b.name == "Presupuesto Principal" for b in view_mb.budgets)
            assert any(b.name == "Presupuesto Negocio" for b in view_mb.budgets)
            print("[PASS] Master view shows multiple budgets!")

            # 8. Add category limit in second budget for "Gastos Fijos" (Cross-budget / duplicate category)
            await crud_budgets.upsert_category_limit_by_budget_id(
                db=db,
                budget_id=b2.id,
                user_id=test_user_id,
                item=schemas.BudgetCategoryLimitInput(
                    category_name="Gastos Fijos",
                    limit_amount=Decimal("100.00"),
                    currency=schemas.CurrencyType.USD_BCV
                )
            )

            # Also add "Ahorro" in second budget
            await crud_budgets.upsert_category_limit_by_budget_id(
                db=db,
                budget_id=b2.id,
                user_id=test_user_id,
                item=schemas.BudgetCategoryLimitInput(
                    category_name="Ahorro",
                    limit_amount=Decimal("50.00"),
                    currency=schemas.CurrencyType.USD_BCV
                )
            )

            # View again and verify also_in_budgets (suppressed in primary budget, active in non-primary)
            view_cross = await crud_budgets.get_monthly_budget_view(db, test_user_id, test_month)
            # Find b1 (primary) and b2 in view
            b1_view = next(b for b in view_cross.budgets if b.is_primary)
            b1_gf = next(cl for cl in b1_view.category_limits if cl.category_name == "Gastos Fijos")
            assert b1_view.is_primary is True
            assert b1_gf.also_in_budgets == [], "Primary budget must NOT show also_in_budgets alert"

            b2_view = next(b for b in view_cross.budgets if b.id == b2.id)
            assert len(b2_view.category_limits) == 2
            b2_gf = next(cl for cl in b2_view.category_limits if cl.category_name == "Gastos Fijos")
            assert "Presupuesto Principal" in b2_gf.also_in_budgets, "Non-primary budget must show also_in_budgets alert"
            print("[PASS] Cross-budget also_in_budgets tracking verified (hidden in primary, visible in other budgets)!")

            # 9. Test expense deduplication in consolidated view
            exp1 = schemas.ExpenseCreate(
                amount=Decimal("50.00"),
                currency=schemas.CurrencyType.USD_BCV,
                description="Internet oficina",
                category="Gastos Fijos",
                date=date(2099, 1, 10)
            )
            db_exp1 = await crud.create_expense(db, exp1, test_user_id)
            created_expense_ids.append(db_exp1.id)

            view_after_exp = await crud_budgets.get_monthly_budget_view(db, test_user_id, test_month)
            # Total spent in consolidated view must be exactly 50 USD, NOT 100 USD (deduplicated)
            assert view_after_exp.total_spent_usd == Decimal("50.00"), f"Expected 50.00 but got {view_after_exp.total_spent_usd}"
            # In consolidated category_limits, Gastos Fijos appears only once
            gf_limits = [cl for cl in view_after_exp.category_limits if cl.category_name == "Gastos Fijos"]
            assert len(gf_limits) == 1
            assert gf_limits[0].spent_usd == Decimal("50.00")
            print("[PASS] Expense deduplication across multi-budget consolidated view verified!")

            # 10. Test Multi-Budget auto-cloning to future month (2099-03)
            # First clean next_month (2099-02) so 2099-01 (which has both budgets) is the prior month
            clean_next = await db.execute(select(models.MonthlyBudget).where(
                models.MonthlyBudget.user_id == test_user_id,
                models.MonthlyBudget.month_year == next_month
            ))
            for b in clean_next.scalars().all():
                await db.delete(b)
            await db.commit()

            cloned_future = await crud_budgets.get_or_clone_monthly_budgets(db, test_user_id, future_month)
            assert len(cloned_future) == 2
            cloned_names = [b.name for b in cloned_future]
            assert "Presupuesto Principal" in cloned_names
            assert "Presupuesto Negocio" in cloned_names
            # Check invariant: exactly one primary
            assert sum(1 for b in cloned_future if b.is_primary) == 1
            print("[PASS] Multi-budget cloning of all active budgets verified!")

            # 11. Test budget update (PUT /api/budgets/{id})
            b2_update = schemas.MonthlyBudgetUpdate(
                name="Presupuesto Negocio Actualizado",
                manual_global_limit=Decimal("450.00")
            )
            b2_updated_res = await crud_budgets.update_monthly_budget_by_id(db, test_user_id, b2.id, b2_update)
            b2_updated = next(b for b in b2_updated_res.budgets if b.id == b2.id)
            assert b2_updated.name == "Presupuesto Negocio Actualizado"
            assert b2_updated.manual_global_limit == Decimal("450.00")
            print("[PASS] Update monthly budget by ID verified!")

            # 11b. Test set_primary_monthly_budget
            set_prim_res = await crud_budgets.set_primary_monthly_budget(db, test_user_id, b2.id)
            b2_prim = next(b for b in set_prim_res.budgets if b.id == b2.id)
            b1_other = next(b for b in set_prim_res.budgets if b.id != b2.id)
            assert b2_prim.is_primary is True
            assert b1_other.is_primary is False
            assert set_prim_res.name == "Presupuesto Negocio Actualizado"
            print("[PASS] Set primary monthly budget verified!")

            # 12. Test delete category limit from specific budget
            del_cat_res = await crud_budgets.delete_category_limit_by_budget_id(db, test_user_id, b2.id, "Ahorro")
            b2_del_cat = next(b for b in del_cat_res.budgets if b.id == b2.id)
            assert not any(cl.category_name == "Ahorro" for cl in b2_del_cat.category_limits)
            print("[PASS] Delete category limit by budget ID verified!")

            # 13. Test delete monthly budget by ID (was primary, should promote remaining budget to primary)
            del_b2_res = await crud_budgets.delete_monthly_budget_by_id(db, test_user_id, b2.id)
            assert len(del_b2_res.budgets) == 1
            assert del_b2_res.budgets[0].name == "Presupuesto Principal"
            assert del_b2_res.budgets[0].is_primary is True
            print("[PASS] Delete monthly budget by ID and primary fallback verified!")

        finally:
            print("Cleaning up test data...")
            for eid in created_expense_ids:
                exp_obj = await db.get(models.Expense, eid)
                if exp_obj: await db.delete(exp_obj)
            for cid in created_cat_ids:
                cat_obj = await db.get(models.Category, cid)
                if cat_obj: await db.delete(cat_obj)
            if my_income_id:
                inc_obj = await db.get(models.EstimatedIncome, my_income_id)
                if inc_obj: await db.delete(inc_obj)
            if other_income_id:
                oinc_obj = await db.get(models.EstimatedIncome, other_income_id)
                if oinc_obj: await db.delete(oinc_obj)

            # Clean up test budgets for 2098-12, 2099-01, 2099-02, 2099-03
            b_res = await db.execute(select(models.MonthlyBudget).where(
                models.MonthlyBudget.month_year.in_([prior_month, test_month, next_month, future_month])
            ))
            for b in b_res.scalars().all():
                await db.delete(b)
            await db.commit()

    await engine.dispose()
    print("--- ALL INTEGRATION TESTS PASSED 100% GREEN! ---")

if __name__ == "__main__":
    asyncio.run(run_tests())
