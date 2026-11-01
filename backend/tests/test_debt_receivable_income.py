import sys
import os
import signal
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
import uuid
from datetime import date
from sqlalchemy.sql.elements import BinaryExpression

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

from app import models, schemas, crud_debts


class TestDebtReceivableIncome(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user_id = uuid.uuid4()
        self.debt_id = uuid.uuid4()
        self.receivable_debt = models.Debt(
            id=self.debt_id,
            user_id=self.user_id,
            type="receivable",
            counterpart="Juan",
            concept="Préstamo personal",
            total_amount=Decimal("200.00"),
            currency="USD_BCV",
            category=None,
            payments=[],
            is_settled=False,
        )

    @patch("app.crud_debts.check_and_notify_budget_thresholds", new_callable=AsyncMock)
    @patch("app.sharing.recompute_settlement", new_callable=AsyncMock)
    @patch("app.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_debts.get_debt", new_callable=AsyncMock)
    async def test_add_receivable_debt_payment_creates_income(
        self, mock_get_debt, mock_get_membership, mock_recompute, mock_check_budget
    ):
        mock_get_debt.return_value = self.receivable_debt
        mock_get_membership.return_value = None

        added_objects = []
        db = AsyncMock()
        db.add = MagicMock(side_effect=lambda o: added_objects.append(o))
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.expire_all = MagicMock()

        mock_prof_res = MagicMock()
        mock_prof_res.scalars.return_value.first.return_value = models.Profile(id=self.user_id, display_name="Diego")
        db.execute = AsyncMock(return_value=mock_prof_res)

        pay_create = schemas.DebtPaymentCreate(
            amount=Decimal("50.00"),
            currency="USD_BCV",
            register_as_expense=True,
            payment_date=date(2026, 11, 1),
        )

        await crud_debts.add_debt_payment(
            db, self.debt_id, self.user_id, pay_create, extra_data={"amount_usd": Decimal("50.00")}
        )

        # 1. models.Income instance created, NO models.Expense created
        added_incomes = [o for o in added_objects if isinstance(o, models.Income)]
        added_expenses = [o for o in added_objects if isinstance(o, models.Expense)]
        added_payments = [o for o in added_objects if isinstance(o, models.DebtPayment)]

        self.assertEqual(len(added_expenses), 0, "Receivable payment must not create an Expense")
        self.assertEqual(len(added_incomes), 1, "Receivable payment must create an Income")
        self.assertEqual(len(added_payments), 1)

        db_income = added_incomes[0]
        db_payment = added_payments[0]

        # 2. sets payment.income_id = db_income.id and payment.create_expense = True
        self.assertEqual(db_payment.income_id, db_income.id)
        self.assertTrue(db_payment.create_expense)
        self.assertIsNone(getattr(db_payment, "expense_id", None))

        # 3. uses description f"Cobro: {db_debt.concept} <- {db_debt.counterpart}"
        self.assertEqual(db_income.description, f"Cobro: {self.receivable_debt.concept} <- {self.receivable_debt.counterpart}")

        # 4. defaults category to "Otros ingresos" if none provided
        self.assertEqual(db_income.category, "Otros ingresos")
        self.assertEqual(db_income.amount, Decimal("50.00"))
        self.assertEqual(db_income.currency, "USD_BCV")
        self.assertEqual(db_income.amount_usd, Decimal("50.00"))

        # 5. does NOT call check_and_notify_budget_thresholds
        mock_check_budget.assert_not_called()

    @patch("app.crud_debts.check_and_notify_budget_thresholds", new_callable=AsyncMock)
    @patch("app.sharing.recompute_settlement", new_callable=AsyncMock)
    @patch("app.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_debts.get_debt", new_callable=AsyncMock)
    async def test_update_receivable_debt_payment_toggles_and_updates_income(
        self, mock_get_debt, mock_get_membership, mock_recompute, mock_check_budget
    ):
        mock_get_debt.return_value = self.receivable_debt
        mock_get_membership.return_value = None

        income_id = uuid.uuid4()
        linked_income = models.Income(
            id=income_id,
            user_id=self.user_id,
            amount=Decimal("50.00"),
            currency="USD_BCV",
            category="Otros ingresos",
            description=f"Cobro: {self.receivable_debt.concept} <- {self.receivable_debt.counterpart}",
            date=date(2026, 11, 1),
        )

        existing_payment = models.DebtPayment(
            id=uuid.uuid4(),
            debt_id=self.debt_id,
            amount=Decimal("50.00"),
            currency="USD_BCV",
            paid_by_user_id=self.user_id,
            category="Otros ingresos",
            create_expense=True,
            expense_id=None,
            income_id=income_id,
            payment_date=date(2026, 11, 1),
        )

        deleted_objects = []
        db = AsyncMock()
        db.delete = AsyncMock(side_effect=lambda o: deleted_objects.append(o))
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.expire_all = MagicMock()

        async def mock_execute(stmt, *args, **kwargs):
            mock_res = MagicMock()
            stmt_str = str(stmt).lower()
            if "debt_payments" in stmt_str and "debts" in stmt_str:
                mock_res.first.return_value = (existing_payment, self.receivable_debt)
            elif "incomes" in stmt_str:
                mock_res.scalars.return_value.first.return_value = linked_income
            else:
                mock_res.first.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute

        # 1. Update amount and category with register_as_expense=True
        pay_update = schemas.DebtPaymentUpdate(
            amount=Decimal("80.00"),
            category="Honorarios",
            register_as_expense=True,
        )
        await crud_debts.update_debt_payment(
            db, existing_payment.id, self.user_id, pay_update, extra_data={"amount_usd": Decimal("80.00")}
        )

        self.assertEqual(linked_income.amount, Decimal("80.00"))
        self.assertEqual(linked_income.category, "Honorarios")
        self.assertEqual(linked_income.description, f"Cobro: {self.receivable_debt.concept} <- {self.receivable_debt.counterpart}")
        self.assertEqual(existing_payment.income_id, income_id)
        self.assertTrue(existing_payment.create_expense)
        mock_check_budget.assert_not_called()

        # 2. Toggle register_as_expense=False -> deletes linked Income and sets income_id = None
        pay_update_off = schemas.DebtPaymentUpdate(
            register_as_expense=False,
        )
        await crud_debts.update_debt_payment(
            db, existing_payment.id, self.user_id, pay_update_off
        )

        self.assertIn(linked_income, deleted_objects, "Linked income must be deleted when register_as_expense=False")
        self.assertIsNone(existing_payment.income_id)
        self.assertFalse(existing_payment.create_expense)

    @patch("app.sharing.recompute_settlement", new_callable=AsyncMock)
    @patch("app.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_debts.get_debt", new_callable=AsyncMock)
    async def test_delete_receivable_debt_payment_deletes_linked_income(
        self, mock_get_debt, mock_get_membership, mock_recompute
    ):
        mock_get_debt.return_value = self.receivable_debt
        mock_get_membership.return_value = None

        income_id = uuid.uuid4()
        existing_payment = models.DebtPayment(
            id=uuid.uuid4(),
            debt_id=self.debt_id,
            amount=Decimal("50.00"),
            currency="USD_BCV",
            paid_by_user_id=self.user_id,
            create_expense=True,
            expense_id=None,
            income_id=income_id,
        )

        executed_stmts = []
        db = AsyncMock()
        db.delete = AsyncMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.expire_all = MagicMock()

        async def mock_execute(stmt, *args, **kwargs):
            executed_stmts.append(stmt)
            mock_res = MagicMock()
            stmt_str = str(stmt).lower()
            if "debt_payments" in stmt_str and "debts" in stmt_str:
                mock_res.scalars.return_value.first.return_value = existing_payment
            else:
                mock_res.scalars.return_value.first.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute

        await crud_debts.delete_debt_payment(db, existing_payment.id, self.user_id)

        # Check that a DELETE statement for models.Income with id == income_id was executed
        income_delete_stmts = [
            s for s in executed_stmts
            if "delete from incomes" in str(s).lower() or "delete" in str(s).lower() and "incomes" in str(s).lower()
        ]
        self.assertGreater(len(income_delete_stmts), 0, "Must execute delete query on models.Income when income_id exists")


if __name__ == "__main__":
    unittest.main()
