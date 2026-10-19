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
        # Use existing profiles
        test_user_id = uuid.UUID('8b04bc8a-9b52-462d-a7b1-4b86e6cc5517') # Diego Ruiz pruebas
        other_user_id = uuid.UUID('0f3c0bb0-4fff-4abe-94db-204dca8802b9')

        test_month = "2099-01"
        next_month = "2099-02"

        created_expense_id = None
        created_cat_id = None
        other_income_id = None
        my_income_id = None

        try:
            # 1. Test get_available_budget_categories
            cat = models.Category(user_id=test_user_id, name="TestMercado", color="#10B981")
            db.add(cat)
            await db.commit()
            created_cat_id = cat.id

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
                linked_income_id=other_income.id,
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
            cloned_budget = await crud_budgets.get_or_clone_monthly_budget(db, test_user_id, next_month)
            assert cloned_budget is not None
            assert cloned_budget.month_year == next_month
            assert cloned_budget.is_confirmed is False, "Cloned budget should start unconfirmed!"
            assert len(cloned_budget.category_limits) == 2
            print("[PASS] Auto-cloning test passed (Auditor Fix #3)!")

            # Confirm cloned budget
            confirmed = await crud_budgets.confirm_monthly_budget(db, test_user_id, next_month)
            assert confirmed.is_confirmed is True
            print("[PASS] Confirm monthly budget test passed!")

            # 5. Test Category Rename and Delete Sync (Auditor Fix #6)
            # Rename "TestMercado" -> "TestSupermercado"
            await crud.update_category(
                db=db,
                category_id=cat.id,
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
                category_id=cat.id,
                user_id=test_user_id,
                reassign_to="Gastos Fijos"
            )
            created_cat_id = None
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

            # 7. Test Threshold Checking & Notification Commit (Auditor Fix #2)
            # Add an expense on test_month
            exp = schemas.ExpenseCreate(
                amount=Decimal("180.00"),
                currency=schemas.CurrencyType.USD_BCV,
                description="Servicio grande",
                category="Gastos Fijos",
                date=date(2099, 1, 15)
            )
            db_exp = await crud.create_expense(db, exp, test_user_id)
            created_expense_id = db_exp.id

            # Spent is 180 on a 150 limit => 120% (over 100%)
            view_spent = await crud_budgets.get_monthly_budget_view(db, test_user_id, test_month)
            fe_limit = next(cl for cl in view_spent.category_limits if cl.category_name == "Gastos Fijos")
            assert fe_limit.traffic_light == schemas.BudgetTrafficLight.red
            assert view_spent.total_spent_usd == Decimal("180.00")
            assert view_spent.total_spent_bs > Decimal("0")
            print("[PASS] Budget threshold calculation and traffic light test passed!")

            # Delete the expense and ensure threshold check with allow_notify=False resets without errors
            await crud.delete_expense(db, db_exp.id, test_user_id)
            created_expense_id = None
            view_cleared = await crud_budgets.get_monthly_budget_view(db, test_user_id, test_month)
            fe_limit_cleared = next(cl for cl in view_cleared.category_limits if cl.category_name == "Gastos Fijos")
            assert fe_limit_cleared.spent_percentage == 0.0
            print("[PASS] Delete expense threshold reset test passed (Auditor Fix #2)!")

        finally:
            print("Cleaning up test data...")
            if created_expense_id:
                exp_obj = await db.get(models.Expense, created_expense_id)
                if exp_obj: await db.delete(exp_obj)
            if created_cat_id:
                cat_obj = await db.get(models.Category, created_cat_id)
                if cat_obj: await db.delete(cat_obj)
            if my_income_id:
                inc_obj = await db.get(models.EstimatedIncome, my_income_id)
                if inc_obj: await db.delete(inc_obj)
            if other_income_id:
                oinc_obj = await db.get(models.EstimatedIncome, other_income_id)
                if oinc_obj: await db.delete(oinc_obj)

            # Clean up test budgets for 2099-01 and 2099-02
            b1_res = await db.execute(select(models.MonthlyBudget).where(models.MonthlyBudget.month_year.in_([test_month, next_month])))
            for b in b1_res.scalars().all():
                await db.delete(b)
            await db.commit()

    await engine.dispose()
    print("--- ALL INTEGRATION TESTS PASSED 100% GREEN! ---")

if __name__ == "__main__":
    asyncio.run(run_tests())
