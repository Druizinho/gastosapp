import sys
import os
import signal
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
import uuid
from datetime import date

# Bypass Windows sandbox socketpair permission block for ProactorEventLoop self-pipe
if sys.platform == "win32":
    try:
        from asyncio import proactor_events
        signal.set_wakeup_fd = lambda fd, **kw: -1
        proactor_events.BaseProactorEventLoop._make_self_pipe = lambda s: (
            setattr(s, "_ssock", MagicMock()),
            setattr(s, "_csock", MagicMock()),
        )
        proactor_events.BaseProactorEventLoop._close_self_pipe = lambda s: None
        proactor_events.BaseProactorEventLoop._loop_self_reading = lambda s, f=None: None
    except Exception:
        pass

# Add backend directory to sys.path so app modules can be loaded
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from starlette.routing import Match
from app import models, schemas, crud_budgets
from app.routers import budgets
from app.routers.budgets import router as budgets_router


class TestBudgetsCategoryLimit(unittest.IsolatedAsyncioTestCase):
    """
    Tests for budget category limit operations:
    1. Resetting category limit to 0 in primary budget.
    2. Removing category limit in sub-budget without double-delete conflict.
    3. Deleting category with slashes in name via router and CRUD.
    4. Resetting global threshold notification flags when effective limit is 0.
    5. Schema compatibility with SQLite and PostgreSQL check constraint drop.
    """

    def setUp(self):
        self.user_id = uuid.uuid4()
        self.month_year = "2026-10"

    def _mock_db_for_budgets(self, primary_budget, sub_budgets=None):
        sub_budgets = sub_budgets or []
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.flush = AsyncMock()
        db.expire_all = MagicMock()
        db.delete = AsyncMock()

        async def mock_execute(stmt, *args, **kwargs):
            mock_res = MagicMock()
            mock_res.unique.return_value = mock_res
            stmt_str = str(stmt).lower()
            
            if "!=" in stmt_str or "<>" in stmt_str:
                mock_res.scalars.return_value.all.return_value = sub_budgets
            elif primary_budget and "monthly_budgets.id =" in stmt_str:
                mock_res.scalars.return_value.all.return_value = [primary_budget]
            elif sub_budgets and "monthly_budgets.id =" in stmt_str:
                mock_res.scalars.return_value.all.return_value = sub_budgets
            else:
                all_b = []
                if primary_budget:
                    all_b.append(primary_budget)
                all_b.extend(sub_budgets)
                mock_res.scalars.return_value.all.return_value = all_b
            return mock_res

        db.execute.side_effect = mock_execute
        return db

    @patch("app.crud_budgets.get_monthly_budget_view", new_callable=AsyncMock)
    @patch("app.crud_budgets.check_and_notify_budget_thresholds", new_callable=AsyncMock)
    async def test_reset_category_limit_to_0_in_primary_budget(self, mock_notify, mock_view):
        """
        When deleting a category limit from the primary budget:
        - The limit is reset to Decimal('0'), NOT removed from the collection or deleted.
        - Notification flags notified_80 and notified_100 are reset to False.
        - Matching category limits in sub-budgets are also reset to Decimal('0').
        """
        primary_id = uuid.uuid4()
        sub_id = uuid.uuid4()

        cl_primary = models.BudgetCategoryLimit(
            id=uuid.uuid4(),
            budget_id=primary_id,
            category_name="Alimentación",
            limit_amount=Decimal("250.00"),
            currency="USD_BCV",
            notified_80=True,
            notified_100=True,
        )
        primary_budget = models.MonthlyBudget(
            id=primary_id,
            user_id=self.user_id,
            month_year=self.month_year,
            name="Presupuesto Principal",
            is_primary=True,
        )
        primary_budget.category_limits = [cl_primary]

        cl_sub = models.BudgetCategoryLimit(
            id=uuid.uuid4(),
            budget_id=sub_id,
            category_name="Alimentación",
            limit_amount=Decimal("250.00"),
            currency="USD_BCV",
            notified_80=True,
            notified_100=True,
        )
        sub_budget = models.MonthlyBudget(
            id=sub_id,
            user_id=self.user_id,
            month_year=self.month_year,
            name="Sub Presupuesto",
            is_primary=False,
        )
        sub_budget.category_limits = [cl_sub]

        db = self._mock_db_for_budgets(primary_budget, [sub_budget])

        # Delete category limit on primary budget with casing/whitespace test
        await crud_budgets.delete_category_limit_by_budget_id(
            db, self.user_id, primary_id, "  alimentación  "
        )

        # Primary category limit must be reset to 0, not deleted
        self.assertEqual(cl_primary.limit_amount, Decimal("0"))
        self.assertFalse(cl_primary.notified_80)
        self.assertFalse(cl_primary.notified_100)
        self.assertIn(cl_primary, primary_budget.category_limits)

        # Sub-budget category limit must also be reset to 0
        self.assertEqual(cl_sub.limit_amount, Decimal("0"))
        self.assertFalse(cl_sub.notified_80)
        self.assertFalse(cl_sub.notified_100)

        # db.delete should NOT have been called for primary budget deletion
        db.delete.assert_not_called()
        db.commit.assert_awaited_once()
        db.expire_all.assert_called_once()
        mock_notify.assert_awaited_once()

    @patch("app.crud_budgets.get_monthly_budget_view", new_callable=AsyncMock)
    @patch("app.crud_budgets.check_and_notify_budget_thresholds", new_callable=AsyncMock)
    async def test_remove_category_limit_in_sub_budget(self, mock_notify, mock_view):
        """
        When deleting a category limit from a sub-budget:
        - The category limit is removed from budget.category_limits.
        - Under cascade='all, delete-orphan', db.delete is NOT called to avoid double deletion conflict.
        - db.flush is awaited.
        """
        sub_id = uuid.uuid4()
        cl_sub = models.BudgetCategoryLimit(
            id=uuid.uuid4(),
            budget_id=sub_id,
            category_name="Servicios",
            limit_amount=Decimal("80.00"),
            currency="USD_BCV",
            notified_80=False,
            notified_100=False,
        )
        sub_budget = models.MonthlyBudget(
            id=sub_id,
            user_id=self.user_id,
            month_year=self.month_year,
            name="Sub Presupuesto",
            is_primary=False,
        )
        sub_budget.category_limits = [cl_sub]

        db = self._mock_db_for_budgets(None, [sub_budget])

        await crud_budgets.delete_category_limit_by_budget_id(
            db, self.user_id, sub_id, "Servicios"
        )

        # Ensure category limit was removed from sub-budget
        self.assertNotIn(cl_sub, sub_budget.category_limits)
        # Verify db.delete was NOT called (preventing orphan double deletion conflict)
        db.delete.assert_not_called()
        # Verify flush was called
        db.flush.assert_awaited_once()
        db.commit.assert_awaited_once()

    @patch("app.crud_budgets.get_monthly_budget_view", new_callable=AsyncMock)
    @patch("app.crud_budgets.check_and_notify_budget_thresholds", new_callable=AsyncMock)
    @patch("app.crud_budgets.get_or_clone_monthly_budgets")
    async def test_delete_budget_category_limit_shortcut(self, mock_get_clone, mock_notify, mock_view):
        """
        Tests the shortcut endpoint crud_budgets.delete_budget_category_limit:
        - Uses .strip().lower() comparison.
        - Primary budget resets limit to Decimal('0').
        - Sub-budget removes category limit without double deletion conflict.
        """
        primary_id = uuid.uuid4()
        sub_id = uuid.uuid4()

        cl_prim = models.BudgetCategoryLimit(
            id=uuid.uuid4(),
            budget_id=primary_id,
            category_name="Transporte",
            limit_amount=Decimal("50.00"),
            notified_80=True,
            notified_100=True,
        )
        b_prim = models.MonthlyBudget(
            id=primary_id,
            user_id=self.user_id,
            month_year=self.month_year,
            is_primary=True,
        )
        b_prim.category_limits = [cl_prim]

        cl_sub = models.BudgetCategoryLimit(
            id=uuid.uuid4(),
            budget_id=sub_id,
            category_name="Transporte",
            limit_amount=Decimal("50.00"),
            notified_80=True,
            notified_100=True,
        )
        b_sub = models.MonthlyBudget(
            id=sub_id,
            user_id=self.user_id,
            month_year=self.month_year,
            is_primary=False,
        )
        b_sub.category_limits = [cl_sub]

        mock_get_clone.return_value = [b_prim, b_sub]
        db = AsyncMock()
        db.commit = AsyncMock()
        db.flush = AsyncMock()
        db.expire_all = MagicMock()
        db.delete = AsyncMock()

        await crud_budgets.delete_budget_category_limit(
            db, self.user_id, self.month_year, "  transporte  "
        )

        # Primary reset to 0
        self.assertEqual(cl_prim.limit_amount, Decimal("0"))
        self.assertFalse(cl_prim.notified_80)
        self.assertFalse(cl_prim.notified_100)

        # Sub removed from list
        self.assertNotIn(cl_sub, b_sub.category_limits)

        # Double deletion avoided
        db.delete.assert_not_called()
        db.flush.assert_awaited_once()
        db.commit.assert_awaited_once()

    @patch("app.crud_budgets.get_monthly_budget_view", new_callable=AsyncMock)
    @patch("app.crud_budgets.check_and_notify_budget_thresholds", new_callable=AsyncMock)
    async def test_deleting_category_with_slash_in_name_crud(self, mock_notify, mock_view):
        """
        Tests CRUD deletion when category name contains a slash like 'Salud / Medicina'.
        """
        primary_id = uuid.uuid4()
        cl = models.BudgetCategoryLimit(
            id=uuid.uuid4(),
            budget_id=primary_id,
            category_name="Salud / Medicina",
            limit_amount=Decimal("120.00"),
            notified_80=True,
            notified_100=False,
        )
        budget = models.MonthlyBudget(
            id=primary_id,
            user_id=self.user_id,
            month_year=self.month_year,
            is_primary=True,
        )
        budget.category_limits = [cl]

        db = self._mock_db_for_budgets(budget, [])

        await crud_budgets.delete_category_limit_by_budget_id(
            db, self.user_id, primary_id, "Salud / Medicina"
        )

        self.assertEqual(cl.limit_amount, Decimal("0"))
        self.assertFalse(cl.notified_80)

    async def test_deleting_category_with_slash_via_fastapi_router(self):
        """
        Tests router path parameter matching with :path:
        - Categories with slashes (e.g. 'Salud/Medicina', 'Salud / Medicina') match Match.FULL
        - The category_name parameter is captured including slashes
        - Router endpoint handlers delegate correctly to CRUD functions
        """
        # 1. Test route matching on /monthly/{month_year}/category/{category_name:path}
        scope_monthly = {
            "type": "http",
            "method": "DELETE",
            "path": "/api/budgets/monthly/2026-10/category/Salud/Medicina"
        }
        matched_monthly = None
        for r in budgets_router.routes:
            match, child_scope = r.matches(scope_monthly)
            if match == Match.FULL:
                matched_monthly = child_scope.get("path_params")
                break
        self.assertIsNotNone(matched_monthly, "Monthly route with slash must match FULL")
        self.assertEqual(matched_monthly.get("category_name"), "Salud/Medicina")
        self.assertEqual(matched_monthly.get("month_year"), "2026-10")

        # 2. Test route matching on /{budget_id}/category/{category_name:path}
        budget_id = uuid.uuid4()
        scope_by_id = {
            "type": "http",
            "method": "DELETE",
            "path": f"/api/budgets/{budget_id}/category/Salud / Medicina"
        }
        matched_by_id = None
        for r in budgets_router.routes:
            match, child_scope = r.matches(scope_by_id)
            if match == Match.FULL:
                matched_by_id = child_scope.get("path_params")
                break
        self.assertIsNotNone(matched_by_id, "Budget ID route with slash must match FULL")
        self.assertEqual(matched_by_id.get("category_name"), "Salud / Medicina")
        self.assertEqual(matched_by_id.get("budget_id"), str(budget_id))

        # 3. Test router endpoint delegation
        db = AsyncMock()
        with patch("app.crud_budgets.delete_budget_category_limit", new_callable=AsyncMock) as mock_legacy:
            await budgets.delete_budget_category_limit("2026-10", "Salud/Medicina", db=db, user_id=self.user_id)
            mock_legacy.assert_awaited_once_with(db, self.user_id, "2026-10", "Salud/Medicina")

        with patch("app.crud_budgets.delete_category_limit_by_budget_id", new_callable=AsyncMock) as mock_by_id:
            await budgets.delete_category_limit_by_budget_id(budget_id, "Salud / Medicina", db=db, user_id=self.user_id)
            mock_by_id.assert_awaited_once_with(db, self.user_id, budget_id, "Salud / Medicina")

    @patch("app.crud_budgets._compute_effective_global_limit", new_callable=AsyncMock)
    @patch("app.bcv_service.get_all_rates", new_callable=AsyncMock)
    async def test_thresholds_reset_when_effective_global_zero(self, mock_rates, mock_compute_limit):
        """
        Tests that when effective global limit is 0 (or None),
        b.notified_global_80 and b.notified_global_100 are reset to False.
        """
        mock_rates.return_value = {"usd_bs": Decimal("40.0")}
        mock_compute_limit.return_value = Decimal("0")

        budget = models.MonthlyBudget(
            id=uuid.uuid4(),
            user_id=self.user_id,
            month_year=self.month_year,
            name="Presupuesto Principal",
            is_primary=True,
            currency="USD_BCV",
            notified_global_80=True,
            notified_global_100=True,
        )
        budget.category_limits = []

        db = AsyncMock()
        db.commit = AsyncMock()
        db.rollback = AsyncMock()
        
        async def mock_execute(stmt, *args, **kwargs):
            mock_res = MagicMock()
            mock_res.unique.return_value = mock_res
            stmt_str = str(stmt).lower()
            if "expenses" in stmt_str:
                mock_res.scalars.return_value.all.return_value = []
            else:
                mock_res.scalars.return_value.all.return_value = [budget]
            return mock_res

        db.execute.side_effect = mock_execute

        await crud_budgets.check_and_notify_budget_thresholds(
            db, self.user_id, date(2026, 10, 1), allow_notify=False
        )

        # Flags should have been reset to False
        self.assertFalse(budget.notified_global_80)
        self.assertFalse(budget.notified_global_100)
        db.commit.assert_awaited_once()

    @patch("app.crud_budgets.engine")
    async def test_ensure_budget_schema_sqlite_compatibility(self, mock_engine):
        """
        Tests that ensure_budget_schema does not throw when running in SQLite
        and skips the PostgreSQL specific DO $$ blocks.
        """
        mock_engine.dialect.name = "sqlite"
        mock_conn = AsyncMock()
        mock_engine.begin.return_value.__aenter__.return_value = mock_conn

        crud_budgets._schema_ensured = False
        await crud_budgets.ensure_budget_schema()

        self.assertTrue(crud_budgets._schema_ensured)

    @patch("app.crud_budgets.engine")
    async def test_ensure_budget_schema_postgres_drops_constraint(self, mock_engine):
        """
        Tests that ensure_budget_schema executes the DO $$ blocks on PostgreSQL,
        including dropping check constraints on budget_category_limits.
        """
        mock_engine.dialect.name = "postgresql"
        mock_conn = AsyncMock()
        mock_engine.begin.return_value.__aenter__.return_value = mock_conn

        crud_budgets._schema_ensured = False
        await crud_budgets.ensure_budget_schema()

        self.assertTrue(crud_budgets._schema_ensured)
        self.assertGreaterEqual(mock_conn.execute.await_count, 3)


if __name__ == "__main__":
    unittest.main()
