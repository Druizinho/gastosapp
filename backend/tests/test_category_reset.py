import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

# Windows sandbox fix for proactor event loop
if sys.platform == "win32":
    try:
        from asyncio import proactor_events
        proactor_events.BaseProactorEventLoop._make_self_pipe = lambda s: (
            setattr(s, "_ssock", MagicMock()),
            setattr(s, "_csock", MagicMock()),
        )
        proactor_events.BaseProactorEventLoop._close_self_pipe = lambda s: None
        proactor_events.BaseProactorEventLoop._loop_self_reading = lambda s, f=None: None
    except Exception:
        pass

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app import models, crud
from app.routers import categories as categories_router


class TestCategoryReset(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user_id = uuid.uuid4()

    @patch("app.crud.ensure_categories_and_debts_schema", new_callable=AsyncMock)
    @patch("app.crud.get_categories", new_callable=AsyncMock)
    async def test_reset_default_categories_income(self, mock_get_categories, mock_ensure_schema):
        mock_get_categories.return_value = ["mock_income_cat_1", "mock_income_cat_2"]

        executed_stmts = []
        db = AsyncMock()
        added_items = []
        db.add_all = MagicMock(side_effect=lambda items: added_items.extend(items))
        db.commit = AsyncMock()

        async def mock_execute(stmt, *args, **kwargs):
            executed_stmts.append(stmt)
            res = MagicMock()
            # First execute is select(models.IncomeCategory.name)
            res.scalars.return_value.all.return_value = ["Freelance", "Inversiones", "Otros ingresos"]
            return res

        db.execute = AsyncMock(side_effect=mock_execute)

        res = await crud.reset_default_categories(db, user_id=self.user_id, kind="income")

        mock_ensure_schema.assert_awaited_once()
        self.assertEqual(res, ["mock_income_cat_1", "mock_income_cat_2"])
        mock_get_categories.assert_awaited_once_with(db, user_id=self.user_id, kind="income")
        
        # Verify added default income categories
        self.assertEqual(len(added_items), len(crud.DEFAULT_INCOME_CATEGORIES))
        self.assertTrue(all(isinstance(item, models.IncomeCategory) for item in added_items))
        self.assertTrue(all(item.user_id == self.user_id for item in added_items))

        # Check statement types
        stmt_texts = [str(s) for s in executed_stmts]
        # Must update estimated_incomes and incomes
        self.assertTrue(any("UPDATE estimated_incomes" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE incomes" in s for s in stmt_texts))
        # Must delete income_categories
        self.assertTrue(any("DELETE FROM income_categories" in s for s in stmt_texts))

    @patch("app.crud.ensure_categories_and_debts_schema", new_callable=AsyncMock)
    @patch("app.crud.get_categories", new_callable=AsyncMock)
    async def test_reset_default_categories_expense(self, mock_get_categories, mock_ensure_schema):
        mock_get_categories.return_value = ["mock_expense_cat_1", "mock_expense_cat_2"]

        executed_stmts = []
        db = AsyncMock()
        added_items = []
        db.add_all = MagicMock(side_effect=lambda items: added_items.extend(items))
        db.commit = AsyncMock()

        async def mock_execute(stmt, *args, **kwargs):
            executed_stmts.append(stmt)
            res = MagicMock()
            # First execute is select(models.Category.name)
            res.scalars.return_value.all.return_value = ["Restaurantes", "Viajes", "Sin Categoría"]
            return res

        db.execute = AsyncMock(side_effect=mock_execute)

        res = await crud.reset_default_categories(db, user_id=self.user_id, kind="expense")

        mock_ensure_schema.assert_awaited_once()
        self.assertEqual(res, ["mock_expense_cat_1", "mock_expense_cat_2"])
        mock_get_categories.assert_awaited_once_with(db, user_id=self.user_id, kind="expense")
        
        # Verify added default expense categories
        self.assertEqual(len(added_items), len(crud.DEFAULT_CATEGORIES))
        self.assertTrue(all(isinstance(item, models.Category) for item in added_items))
        self.assertTrue(all(item.user_id == self.user_id for item in added_items))

        # Check statement types
        stmt_texts = [str(s) for s in executed_stmts]
        self.assertTrue(any("UPDATE expenses" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE fixed_expenses" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE saving_goals" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE debts" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE debt_payments" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE saving_deposits" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE share_members" in s for s in stmt_texts))
        self.assertTrue(any("DELETE FROM budget_category_limits" in s for s in stmt_texts))
        self.assertTrue(any("DELETE FROM categories" in s for s in stmt_texts))

    @patch("app.crud.reset_default_categories", new_callable=AsyncMock)
    async def test_router_restore_endpoints(self, mock_reset):
        mock_reset.return_value = [{"id": uuid.uuid4(), "name": "Alimentación"}]
        db = AsyncMock()

        # Test expense restore endpoint
        res_exp = await categories_router.restore_default_categories(
            kind="expense", db=db, user_id=self.user_id
        )
        mock_reset.assert_awaited_with(db, user_id=self.user_id, kind="expense")
        self.assertEqual(len(res_exp), 1)

        # Test income restore endpoint
        res_inc = await categories_router.restore_default_income_categories(
            db=db, user_id=self.user_id
        )
        mock_reset.assert_awaited_with(db, user_id=self.user_id, kind="income")
        self.assertEqual(len(res_inc), 1)


if __name__ == "__main__":
    unittest.main()
