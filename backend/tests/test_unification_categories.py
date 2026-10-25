import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Prevent network I/O during imports and database operations
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@127.0.0.1/db"

import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: None

import unittest
from uuid import uuid4
from decimal import Decimal
import datetime

# Models & Schemas
from app import models, schemas
from app import crud, crud_savings, crud_incomes


class TestUnificationCategories(unittest.IsolatedAsyncioTestCase):

    def test_default_categories_contains_proyectos_and_ingresos(self):
        cat_names = [c["name"] for c in crud.DEFAULT_CATEGORIES]
        self.assertIn("Proyectos", cat_names)
        self.assertIn("Ingresos", cat_names)

        proyectos_cat = next(c for c in crud.DEFAULT_CATEGORIES if c["name"] == "Proyectos")
        self.assertEqual(proyectos_cat["icon"], "FolderKanban")
        self.assertEqual(proyectos_cat["color"], "#3B82F6")

        ingresos_cat = next(c for c in crud.DEFAULT_CATEGORIES if c["name"] == "Ingresos")
        self.assertEqual(ingresos_cat["icon"], "Wallet")
        self.assertEqual(ingresos_cat["color"], "#10B981")

    def test_models_have_category_attributes(self):
        # EstimatedIncome category column
        self.assertTrue(hasattr(models.EstimatedIncome, "category"))
        # SavingDeposit category column
        self.assertTrue(hasattr(models.SavingDeposit, "category"))
        # Category income_count attribute
        self.assertTrue(hasattr(models.Category, "income_count"))

    def test_schemas_have_category_and_income_count(self):
        # EstimatedIncomeBase
        inc = schemas.EstimatedIncomeBase(name="Sueldo", expected_amount=Decimal("1000"))
        self.assertEqual(inc.category, "Ingresos")

        # EstimatedIncomeUpdate
        inc_update = schemas.EstimatedIncomeUpdate(category="Honorarios")
        self.assertEqual(inc_update.category, "Honorarios")

        # SavingDepositBase / Create
        dep = schemas.SavingDepositCreate(amount=Decimal("50"))
        self.assertIsNone(dep.category)

        # SavingDepositUpdate
        dep_up = schemas.SavingDepositUpdate(category="Ahorro Emergencia", register_as_expense=True)
        self.assertEqual(dep_up.category, "Ahorro Emergencia")
        self.assertTrue(dep_up.register_as_expense)

        # CategoryResponse
        cat_resp = schemas.CategoryResponse(
            id=uuid4(),
            user_id=uuid4(),
            name="Ingresos",
            created_at=datetime.datetime.now(),
            income_count=5
        )
        self.assertEqual(cat_resp.income_count, 5)

    @patch("app.crud_savings.check_and_notify_budget_thresholds", new_callable=AsyncMock)
    @patch("app.crud_savings.get_saving_goal")
    @patch("app.crud_savings.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_savings.sharing.recompute_settlement", new_callable=AsyncMock)
    @patch("app.crud_savings.send_notification_to_user", new_callable=AsyncMock)
    async def test_add_saving_deposit_goal_defaults_to_ahorro(
        self, mock_notify, mock_recompute, mock_membership, mock_get_goal, mock_budget_check
    ):
        db = AsyncMock()
        mock_membership.return_value = None
        user_id = uuid4()
        goal_id = uuid4()

        db_goal = models.SavingGoal(
            id=goal_id,
            user_id=user_id,
            name="Vacaciones",
            type="saving",
            category=None,
            is_completed=False
        )
        db_goal.deposits = []
        mock_get_goal.return_value = db_goal

        mock_prof = models.Profile(id=user_id, display_name="Test User")
        profile_res = MagicMock()
        profile_res.scalars.return_value.first.return_value = mock_prof
        db.execute.return_value = profile_res

        deposit_in = schemas.SavingDepositCreate(
            amount=Decimal("100"),
            currency=schemas.CurrencyType.BS,
            register_as_expense=True
        )

        added_objects = []
        db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

        await crud_savings.add_saving_deposit(db, goal_id, user_id, deposit_in)

        # Look for created Expense
        created_expenses = [o for o in added_objects if isinstance(o, models.Expense)]
        self.assertEqual(len(created_expenses), 1)
        self.assertEqual(created_expenses[0].category, "Ahorro")

        # Look for created SavingDeposit
        created_deposits = [o for o in added_objects if isinstance(o, models.SavingDeposit)]
        self.assertEqual(len(created_deposits), 1)
        self.assertEqual(created_deposits[0].category, "Ahorro")

    @patch("app.crud_savings.check_and_notify_budget_thresholds", new_callable=AsyncMock)
    @patch("app.crud_savings.get_saving_goal")
    @patch("app.crud_savings.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_savings.sharing.recompute_settlement", new_callable=AsyncMock)
    @patch("app.crud_savings.send_notification_to_user", new_callable=AsyncMock)
    async def test_add_saving_deposit_goal_explicit_category(
        self, mock_notify, mock_recompute, mock_membership, mock_get_goal, mock_budget_check
    ):
        db = AsyncMock()
        mock_membership.return_value = None
        user_id = uuid4()
        goal_id = uuid4()

        db_goal = models.SavingGoal(
            id=goal_id,
            user_id=user_id,
            name="Fondo Libre",
            type="saving",
            category="Ahorro",
            is_completed=False
        )
        db_goal.deposits = []
        mock_get_goal.return_value = db_goal

        mock_prof = models.Profile(id=user_id, display_name="Test User")
        profile_res = MagicMock()
        profile_res.scalars.return_value.first.return_value = mock_prof
        db.execute.return_value = profile_res

        deposit_in = schemas.SavingDepositCreate(
            amount=Decimal("100"),
            currency=schemas.CurrencyType.BS,
            category="Inversiones",
            register_as_expense=True
        )

        added_objects = []
        db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

        await crud_savings.add_saving_deposit(db, goal_id, user_id, deposit_in)

        created_expenses = [o for o in added_objects if isinstance(o, models.Expense)]
        self.assertEqual(len(created_expenses), 1)
        self.assertEqual(created_expenses[0].category, "Inversiones")

        created_deposits = [o for o in added_objects if isinstance(o, models.SavingDeposit)]
        self.assertEqual(len(created_deposits), 1)
        self.assertEqual(created_deposits[0].category, "Inversiones")

    @patch("app.crud_savings.check_and_notify_budget_thresholds", new_callable=AsyncMock)
    @patch("app.crud_savings.get_saving_goal")
    @patch("app.crud_savings.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_savings.sharing.recompute_settlement", new_callable=AsyncMock)
    @patch("app.crud_savings.send_notification_to_user", new_callable=AsyncMock)
    async def test_add_saving_deposit_project_defaults_to_proyectos(
        self, mock_notify, mock_recompute, mock_membership, mock_get_goal, mock_budget_check
    ):
        db = AsyncMock()
        mock_membership.return_value = None
        user_id = uuid4()
        goal_id = uuid4()

        db_goal = models.SavingGoal(
            id=goal_id,
            user_id=user_id,
            name="Remodelación Cocina",
            type="project",
            category=None,
            is_completed=False
        )
        db_goal.deposits = []
        mock_get_goal.return_value = db_goal

        mock_prof = models.Profile(id=user_id, display_name="Test User")
        profile_res = MagicMock()
        profile_res.scalars.return_value.first.return_value = mock_prof
        db.execute.return_value = profile_res

        deposit_in = schemas.SavingDepositCreate(
            amount=Decimal("250"),
            currency=schemas.CurrencyType.BS,
            register_as_expense=True
        )

        added_objects = []
        db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

        await crud_savings.add_saving_deposit(db, goal_id, user_id, deposit_in)

        created_expenses = [o for o in added_objects if isinstance(o, models.Expense)]
        self.assertEqual(len(created_expenses), 1)
        self.assertEqual(created_expenses[0].category, "Proyectos")
        self.assertNotEqual(created_expenses[0].category, "Otros")
        self.assertNotEqual(created_expenses[0].category, "Sin Categoría")

        created_deposits = [o for o in added_objects if isinstance(o, models.SavingDeposit)]
        self.assertEqual(len(created_deposits), 1)
        self.assertEqual(created_deposits[0].category, "Proyectos")

    @patch("app.crud_incomes.get_estimated_income")
    async def test_create_estimated_income_defaults_to_ingresos(self, mock_get_income):
        db = AsyncMock()
        user_id = uuid4()
        income_in = schemas.EstimatedIncomeCreate(
            name="Sueldo Base",
            expected_amount=Decimal("500")
        )

        added_objects = []
        db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

        await crud_incomes.create_estimated_income(db, income_in, user_id)

        created_incomes = [o for o in added_objects if isinstance(o, models.EstimatedIncome)]
        self.assertEqual(len(created_incomes), 1)
        self.assertEqual(created_incomes[0].category, "Ingresos")

    @patch("app.crud_savings.check_and_notify_budget_thresholds", new_callable=AsyncMock)
    @patch("app.crud_savings.get_saving_goal")
    @patch("app.crud_savings.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_savings.sharing.recompute_settlement", new_callable=AsyncMock)
    async def test_update_saving_deposit_category_and_expense(
        self, mock_recompute, mock_membership, mock_get_goal, mock_budget_check
    ):
        db = AsyncMock()
        mock_membership.return_value = None
        user_id = uuid4()
        deposit_id = uuid4()
        expense_id = uuid4()

        deposit = models.SavingDeposit(
            id=deposit_id,
            goal_id=uuid4(),
            amount=Decimal("150"),
            currency="BS",
            deposit_date=datetime.date.today(),
            category="Ahorro",
            expense_id=expense_id,
            paid_by_user_id=user_id,
            create_expense=True
        )

        mock_expense = models.Expense(
            id=expense_id,
            user_id=user_id,
            amount=Decimal("150"),
            currency="BS",
            category="Ahorro"
        )

        def mock_execute(query, *args, **kwargs):
            res = MagicMock()
            q_str = str(query)
            if "saving_deposits" in q_str:
                res.scalars.return_value.first.return_value = deposit
            elif "expenses" in q_str:
                res.scalars.return_value.first.return_value = mock_expense
            return res

        db.execute.side_effect = mock_execute

        update_data = schemas.SavingDepositUpdate(category="Inversión")
        await crud_savings.update_saving_deposit(db, deposit_id, user_id, update_data)

        self.assertEqual(deposit.category, "Inversión")
        self.assertEqual(mock_expense.category, "Inversión")

    @patch("app.crud_savings.get_saving_goal")
    @patch("app.crud_savings.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_savings.sharing.recompute_settlement", new_callable=AsyncMock)
    @patch("app.crud_savings.check_and_notify_budget_thresholds", new_callable=AsyncMock)
    async def test_update_saving_deposit_toggle_register_as_expense_on(
        self, mock_budget_check, mock_recompute, mock_membership, mock_get_goal
    ):
        db = AsyncMock()
        mock_membership.return_value = None
        user_id = uuid4()
        deposit_id = uuid4()
        goal_id = uuid4()

        deposit = models.SavingDeposit(
            id=deposit_id,
            goal_id=goal_id,
            amount=Decimal("150"),
            currency="BS",
            deposit_date=datetime.date.today(),
            category="Ahorro",
            expense_id=None,
            paid_by_user_id=user_id,
            create_expense=False
        )

        db_goal = models.SavingGoal(
            id=goal_id,
            user_id=user_id,
            name="Fondo Vacaciones",
            type="saving",
            category="Ahorro"
        )

        def mock_execute(query, *args, **kwargs):
            res = MagicMock()
            q_str = str(query)
            if "saving_deposits" in q_str:
                res.scalars.return_value.first.return_value = deposit
            elif "saving_goals" in q_str:
                res.scalars.return_value.first.return_value = db_goal
            return res

        db.execute.side_effect = mock_execute
        added_objects = []
        db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

        update_data = schemas.SavingDepositUpdate(register_as_expense=True)
        await crud_savings.update_saving_deposit(db, deposit_id, user_id, update_data)

        self.assertTrue(deposit.create_expense)
        created_expenses = [o for o in added_objects if isinstance(o, models.Expense)]
        self.assertEqual(len(created_expenses), 1)
        self.assertEqual(created_expenses[0].category, "Ahorro")
        self.assertEqual(deposit.expense_id, created_expenses[0].id)

    @patch("app.crud_savings.get_saving_goal")
    @patch("app.crud_savings.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_savings.sharing.recompute_settlement", new_callable=AsyncMock)
    @patch("app.crud_savings.check_and_notify_budget_thresholds", new_callable=AsyncMock)
    async def test_update_saving_deposit_toggle_register_as_expense_off(
        self, mock_budget_check, mock_recompute, mock_membership, mock_get_goal
    ):
        db = AsyncMock()
        mock_membership.return_value = None
        user_id = uuid4()
        deposit_id = uuid4()
        expense_id = uuid4()

        deposit = models.SavingDeposit(
            id=deposit_id,
            goal_id=uuid4(),
            amount=Decimal("150"),
            currency="BS",
            deposit_date=datetime.date.today(),
            category="Ahorro",
            expense_id=expense_id,
            paid_by_user_id=user_id,
            create_expense=True
        )

        mock_expense = models.Expense(
            id=expense_id,
            user_id=user_id,
            amount=Decimal("150"),
            currency="BS",
            category="Ahorro"
        )

        def mock_execute(query, *args, **kwargs):
            res = MagicMock()
            q_str = str(query)
            if "saving_deposits" in q_str:
                res.scalars.return_value.first.return_value = deposit
            elif "expenses" in q_str:
                res.scalars.return_value.first.return_value = mock_expense
            return res

        db.execute.side_effect = mock_execute
        deleted_objects = []
        db.delete = AsyncMock(side_effect=lambda obj: deleted_objects.append(obj))

        update_data = schemas.SavingDepositUpdate(register_as_expense=False)
        await crud_savings.update_saving_deposit(db, deposit_id, user_id, update_data)

        self.assertFalse(deposit.create_expense)
        self.assertIsNone(deposit.expense_id)
        self.assertIn(mock_expense, deleted_objects)

    @patch("app.crud_savings.get_saving_goal")
    async def test_create_saving_goal_category_defaults(self, mock_get_goal):
        db = AsyncMock()
        user_id = uuid4()

        # Goal type saving
        added_objects = []
        db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))
        goal_in_saving = schemas.SavingGoalCreate(name="Mi Meta", type="saving")
        await crud_savings.create_saving_goal(db, goal_in_saving, user_id)
        self.assertEqual(len(added_objects), 1)
        self.assertEqual(added_objects[0].category, "Ahorro")

        # Goal type project
        added_objects.clear()
        goal_in_project = schemas.SavingGoalCreate(name="Mi Proyecto", type="project")
        await crud_savings.create_saving_goal(db, goal_in_project, user_id)
        self.assertEqual(len(added_objects), 1)
        self.assertEqual(added_objects[0].category, "Proyectos")

    def test_crud_schema_definitions(self):
        # Verify schema ensure function includes columns
        import inspect
        src = inspect.getsource(crud.ensure_categories_and_debts_schema)
        self.assertIn("estimated_incomes ADD COLUMN IF NOT EXISTS category", src)
        self.assertIn("saving_deposits ADD COLUMN IF NOT EXISTS category", src)
        self.assertIn("'proyectos'", src)
        self.assertIn("'ingresos'", src)
        self.assertIn("UPDATE expenses", src)
        self.assertIn("currency = 'USD_CASH'", src)

class TestUSDCash(unittest.TestCase):

    def test_convert_amount_usd_cash_uses_highest_rate_and_calculates_usd_bcv_equivalent(self):
        from app import bcv_service
        rates = {
            "usd_bs": Decimal("50.0000"),
            "eur_bs": Decimal("55.0000"),
            "usdt_bs": Decimal("60.0000")
        }
        # $10 USD_CASH: highest rate is USDT (60 Bs).
        # amount_bs = 10 * 60 = 600 Bs.
        # amount_usd (BCV equivalent) = 600 / 50 = 12 USD BCV (NOT 1:1, not 10!).
        # amount_eur = 600 / 55 = 10.9091 EUR.
        # amount_usdt = 600 / 60 = 10 USDT.
        res = bcv_service.convert_amount(
            amount=Decimal("10.0000"),
            currency="USD_CASH",
            rates=rates
        )
        self.assertEqual(res["amount_bs"], Decimal("600.0000"))
        self.assertEqual(res["amount_usd"], Decimal("12.0000"))
        self.assertEqual(res["amount_eur"], Decimal("10.9091"))
        self.assertEqual(res["amount_usdt"], Decimal("10.0000"))
        # Preserves reference rates
        self.assertEqual(res["rate_usd_bs"], Decimal("50.0000"))
        self.assertEqual(res["rate_eur_bs"], Decimal("55.0000"))
        self.assertEqual(res["rate_usdt_bs"], Decimal("60.0000"))

    def test_convert_amount_usd_cash_with_manual_rate(self):
        from app import bcv_service
        rates = {
            "usd_bs": Decimal("50.0000"),
            "eur_bs": Decimal("55.0000"),
            "usdt_bs": Decimal("60.0000")
        }
        # Explicit manual cash rate of 65 Bs/$
        res = bcv_service.convert_amount(
            amount=Decimal("10.0000"),
            currency="USD_CASH",
            rates=rates,
            manual_rate=Decimal("65.0000")
        )
        self.assertEqual(res["amount_bs"], Decimal("650.0000"))
        self.assertEqual(res["amount_usd"], Decimal("13.0000")) # 650 / 50 = 13 USD BCV
        self.assertEqual(res["amount_eur"], Decimal("11.8182")) # 650 / 55
        self.assertEqual(res["amount_usdt"], Decimal("10.8333")) # 650 / 60
        self.assertEqual(res["rate_usd_bs"], Decimal("50.0000")) # Keeps BCV rate intact

    def test_sharing_sum_children_in_currency_usd_cash(self):
        from app import sharing
        # Payment 1: 10 USD_CASH into USD_CASH goal -> 1:1 = 10
        ch1 = MagicMock(currency="USD_CASH", amount=Decimal("10"), amount_bs=Decimal("600"), amount_usd=Decimal("12"), rate_usd_bs=Decimal("50"), rate_usdt_bs=Decimal("60"), rate_eur_bs=None)
        total = sharing.sum_children_in_currency([ch1], target_currency="USD_CASH")
        self.assertEqual(total, Decimal("10"))

        # Payment 2: 600 BS into USD_CASH goal -> 600 / max(50, 60) = 10 USD_CASH
        ch2 = MagicMock(currency="BS", amount=Decimal("600"), amount_bs=Decimal("600"), amount_usd=Decimal("12"), rate_usd_bs=Decimal("50"), rate_usdt_bs=Decimal("60"), rate_eur_bs=None)
        total2 = sharing.sum_children_in_currency([ch2], target_currency="USD_CASH")
        self.assertEqual(total2, Decimal("10"))

        # Payment 3: 10 USD_CASH into USD_BCV goal -> uses amount_usd = 12 USD BCV
        total3 = sharing.sum_children_in_currency([ch1], target_currency="USD_BCV")
        self.assertEqual(total3, Decimal("12"))


if __name__ == "__main__":
    unittest.main()
