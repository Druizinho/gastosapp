import sys
import os
import signal
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import uuid
from datetime import date, datetime
from decimal import Decimal

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

# Ensure backend directory is in sys.path so app modules import cleanly
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app import models, crud_savings, crud_debts, schemas


class TestSavingsAndDebtsSorting(unittest.IsolatedAsyncioTestCase):
    def test_debt_payments_relationship_order_by(self):
        """
        Debt.payments relationship should be ordered by payment_date DESC, created_at DESC.
        """
        order_by = models.Debt.payments.property.order_by
        self.assertTrue(order_by, "models.Debt.payments should have an order_by configuration")
        order_by_strs = [str(expr) for expr in order_by]
        self.assertEqual(
            order_by_strs,
            ["debt_payments.payment_date DESC", "debt_payments.created_at DESC"]
        )

    def test_saving_goal_deposits_relationship_order_by(self):
        """
        SavingGoal.deposits relationship should be ordered by deposit_date DESC, created_at DESC.
        """
        order_by = models.SavingGoal.deposits.property.order_by
        self.assertTrue(order_by, "models.SavingGoal.deposits should have an order_by configuration")
        order_by_strs = [str(expr) for expr in order_by]
        self.assertEqual(
            order_by_strs,
            ["saving_deposits.deposit_date DESC", "saving_deposits.created_at DESC"]
        )

    async def test_get_debts_ordering_query(self):
        """
        get_debts should order by start_date DESC, created_at DESC.
        """
        db = AsyncMock()
        captured_query = None

        async def fake_execute(query):
            nonlocal captured_query
            captured_query = query
            mock_res = MagicMock()
            mock_res.scalars.return_value.all.return_value = []
            return mock_res

        db.execute = AsyncMock(side_effect=fake_execute)

        with patch("app.crud.ensure_categories_and_debts_schema", new_callable=AsyncMock), \
             patch("app.sharing.populate_share_meta", new_callable=AsyncMock):
            await crud_debts.get_debts(db, user_id=uuid.uuid4())

        self.assertIsNotNone(captured_query, "Query was not executed")
        order_by_clauses = [str(clause) for clause in captured_query._order_by_clauses]
        self.assertEqual(
            order_by_clauses,
            ["debts.start_date DESC", "debts.created_at DESC"]
        )

    async def test_update_saving_deposit_uses_scalar_goal_id_after_expire_all(self):
        """
        update_saving_deposit should use the local scalar `goal_id` when calling
        recompute_settlement and get_saving_goal to prevent DetachedInstanceError / MissingGreenlet
        on expired deposit instances.
        """
        user_id = uuid.uuid4()
        deposit_id = uuid.uuid4()
        expected_goal_id = uuid.uuid4()

        class MockDeposit:
            def __init__(self, goal_id):
                self._goal_id = goal_id
                self.id = deposit_id
                self.amount = Decimal("100.00")
                self.currency = "USD"
                self.amount_usd = Decimal("100.00")
                self.amount_bs = Decimal("3600.00")
                self.amount_eur = None
                self.amount_usdt = None
                self.rate_usd_bs = Decimal("36.00")
                self.rate_eur_bs = None
                self.rate_usdt_bs = None
                self.deposit_date = date.today()
                self.category = "Ahorros"
                self.create_expense = False
                self.expense_id = None
                self.paid_by_user_id = user_id
                self.is_expired = False

            @property
            def goal_id(self):
                if self.is_expired:
                    raise RuntimeError("DetachedInstanceError: Instance deposit is detached/expired")
                return self._goal_id

        mock_deposit = MockDeposit(expected_goal_id)

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_deposit
        db.execute = AsyncMock(return_value=mock_result)

        def on_expire_all():
            mock_deposit.is_expired = True

        db.expire_all = MagicMock(side_effect=on_expire_all)
        db.commit = AsyncMock()
        db.flush = AsyncMock()

        deposit_update = schemas.SavingDepositUpdate(amount=150.0)

        with patch("app.sharing.get_membership", new_callable=AsyncMock) as mock_get_membership, \
             patch("app.sharing.recompute_settlement", new_callable=AsyncMock) as mock_recompute, \
             patch("app.crud_savings.get_saving_goal", new_callable=AsyncMock) as mock_get_goal, \
             patch("app.bcv_service.resolve_rates_for_update", new_callable=AsyncMock) as mock_resolve_rates:

            mock_resolve_rates.return_value = {"rate_usd_bs": Decimal("36.0")}
            mock_get_membership.return_value = None
            fake_goal = models.SavingGoal(id=expected_goal_id, user_id=user_id, name="Test Goal")
            mock_get_goal.return_value = fake_goal

            res = await crud_savings.update_saving_deposit(
                db=db,
                deposit_id=deposit_id,
                deposit_update=deposit_update,
                user_id=user_id
            )

            self.assertEqual(res, fake_goal)
            mock_recompute.assert_awaited_once_with(db, "saving_goal", [expected_goal_id])
            mock_get_goal.assert_awaited_once_with(db, expected_goal_id, user_id)


if __name__ == "__main__":
    unittest.main()
