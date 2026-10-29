import sys
import os
import signal
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
import uuid
from datetime import datetime, timezone

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

from app import models, crud_budgets


class TestBudgetsContinuousRollover(unittest.IsolatedAsyncioTestCase):
    """
    Tests for continuous monthly budget rollover and month-start notification polish:
    1. test_clone_prior_budgets_is_confirmed_true:
       Auto-cloned monthly budgets must have is_confirmed=True upon creation.
    2. test_month_start_notification_positive:
       Start-of-month notification triggers when notified_month_start=False regardless of is_confirmed,
       using updated title and body.
    3. test_confirm_monthly_budget_idempotency:
       confirm_monthly_budget remains idempotent and keeps budgets confirmed.
    """

    def setUp(self):
        self.user_id = uuid.uuid4()
        self.current_month = datetime.now(timezone.utc).strftime("%Y-%m")

    @patch("app.crud_budgets.ensure_budget_schema", new_callable=AsyncMock)
    @patch("app.crud_budgets.send_notification_to_user", new_callable=AsyncMock)
    async def test_clone_prior_budgets_is_confirmed_true(self, mock_notify, mock_schema):
        """
        When budgets are cloned from a prior month, each new MonthlyBudget
        must have is_confirmed=True so users are not blocked by unconfirmed banners.
        """
        prior_my = "2026-09"
        target_my = "2026-10"

        prior_budget = models.MonthlyBudget(
            id=uuid.uuid4(),
            user_id=self.user_id,
            month_year=prior_my,
            name="Presupuesto Principal",
            currency="USD_BCV",
            income_mode="manual",
            manual_global_limit=Decimal("500.00"),
            is_confirmed=True,
            is_primary=True,
            notified_month_start=True,
        )
        prior_budget.category_limits = []

        added_objects = []
        db = AsyncMock()
        db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))
        db.commit = AsyncMock()
        db.flush = AsyncMock()
        db.rollback = AsyncMock()
        db.expire_all = MagicMock()

        query_count = 0

        async def mock_execute(stmt, *args, **kwargs):
            nonlocal query_count
            query_count += 1
            mock_res = MagicMock()
            mock_res.unique.return_value = mock_res
            stmt_str = str(stmt).lower()

            if "month_year <" in stmt_str or "< :month_year_1" in stmt_str:
                mock_res.scalar_one_or_none.return_value = prior_my
                return mock_res
            elif "share_members" in stmt_str:
                mock_res.scalars.return_value.all.return_value = []
                return mock_res
            elif query_count == 1:
                # 1st query: check target month budgets -> none exist yet
                mock_res.scalars.return_value.all.return_value = []
                return mock_res
            elif query_count == 3:
                # 3rd query: fetch prior month budgets -> return prior_budget
                mock_res.scalars.return_value.all.return_value = [prior_budget]
                return mock_res
            else:
                # Subsequent queries: re-fetch cloned budgets
                mock_res.scalars.return_value.all.return_value = list(added_objects)
                return mock_res

        db.execute.side_effect = mock_execute

        # Execute get_or_clone_monthly_budgets for target month
        result = await crud_budgets.get_or_clone_monthly_budgets(
            db, self.user_id, target_my, allow_auto_clone=True
        )

        cloned_monthly_budgets = [o for o in added_objects if isinstance(o, models.MonthlyBudget)]
        self.assertGreater(len(cloned_monthly_budgets), 0, "At least one MonthlyBudget should be added to db")
        for b in cloned_monthly_budgets:
            self.assertTrue(
                b.is_confirmed,
                f"Cloned budget '{b.name}' must have is_confirmed=True, found is_confirmed={b.is_confirmed}"
            )

    @patch("app.crud_budgets.ensure_budget_schema", new_callable=AsyncMock)
    @patch("app.crud_budgets.send_notification_to_user", new_callable=AsyncMock)
    async def test_month_start_notification_positive(self, mock_notify, mock_schema):
        """
        When monthly budgets exist for current_month with notified_month_start=False,
        even if is_confirmed=True, the month-start notification must be sent with the updated copy.
        """
        primary_b = models.MonthlyBudget(
            id=uuid.uuid4(),
            user_id=self.user_id,
            month_year=self.current_month,
            name="Presupuesto Principal",
            currency="USD_BCV",
            income_mode="manual",
            manual_global_limit=Decimal("600.00"),
            is_confirmed=True,
            is_primary=True,
            notified_month_start=False,
        )
        primary_b.category_limits = []

        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.flush = AsyncMock()
        db.expire_all = MagicMock()

        async def mock_execute(stmt, *args, **kwargs):
            mock_res = MagicMock()
            mock_res.unique.return_value = mock_res
            mock_res.scalars.return_value.all.return_value = [primary_b]
            return mock_res

        db.execute.side_effect = mock_execute

        budgets = await crud_budgets.get_or_clone_monthly_budgets(
            db, self.user_id, self.current_month, allow_auto_clone=True
        )

        # send_notification_to_user must have been invoked with updated copy
        mock_notify.assert_awaited_once()
        _, kwargs = mock_notify.call_args
        self.assertEqual(kwargs.get("title"), "Nuevo mes: Presupuestos activos")
        self.assertEqual(
            kwargs.get("body"),
            "Tus límites del mes anterior siguen activos. Puedes revisarlos o ajustarlos cuando lo desees."
        )
        self.assertTrue(primary_b.notified_month_start, "notified_month_start should be set to True")
        db.commit.assert_awaited()

    @patch("app.crud_budgets.get_or_clone_monthly_budgets", new_callable=AsyncMock)
    @patch("app.crud_budgets.get_monthly_budget_view", new_callable=AsyncMock)
    async def test_confirm_monthly_budget_idempotency(self, mock_view, mock_get_or_clone):
        """
        confirm_monthly_budget confirms all budgets and remains idempotent across multiple calls.
        """
        b1 = models.MonthlyBudget(
            id=uuid.uuid4(),
            user_id=self.user_id,
            month_year=self.current_month,
            name="Presupuesto Principal",
            currency="USD_BCV",
            is_confirmed=True,
            is_primary=True,
            notified_month_start=True,
        )
        b2 = models.MonthlyBudget(
            id=uuid.uuid4(),
            user_id=self.user_id,
            month_year=self.current_month,
            name="Sub Presupuesto",
            currency="USD_BCV",
            is_confirmed=True,
            is_primary=False,
            notified_month_start=True,
        )
        mock_get_or_clone.return_value = [b1, b2]

        db = AsyncMock()
        db.commit = AsyncMock()
        db.expire_all = MagicMock()

        # Call 1
        res1 = await crud_budgets.confirm_monthly_budget(db, self.user_id, self.current_month)
        self.assertTrue(b1.is_confirmed)
        self.assertTrue(b2.is_confirmed)
        db.commit.assert_awaited()
        db.expire_all.assert_called()

        # Call 2 (Idempotent replay)
        res2 = await crud_budgets.confirm_monthly_budget(db, self.user_id, self.current_month)
        self.assertTrue(b1.is_confirmed)
        self.assertTrue(b2.is_confirmed)
        self.assertEqual(db.commit.await_count, 2)
        self.assertEqual(mock_view.await_count, 2)


if __name__ == "__main__":
    unittest.main()
