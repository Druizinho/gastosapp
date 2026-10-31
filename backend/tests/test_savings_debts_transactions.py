import sys
import os
import signal
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
import uuid
from datetime import date
from types import SimpleNamespace
from fastapi import HTTPException

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

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app import models, schemas, crud_savings, crud_debts, sharing


class TestSavingsDebtsTransactions(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user_id = uuid.uuid4()
        self.goal_id = uuid.uuid4()
        self.debt_id = uuid.uuid4()

    def test_sum_children_in_currency_with_withdrawals_and_increases(self):
        # 1. Savings: deposits (positive) and withdrawals (negative)
        dep1 = SimpleNamespace(amount=Decimal("100.00"), currency="USD_BCV", transaction_type="deposit")
        dep2 = SimpleNamespace(amount=Decimal("30.00"), currency="USD_BCV", transaction_type="withdrawal")
        dep3 = SimpleNamespace(amount=Decimal("20.00"), currency="USD_BCV", transaction_type="deposit")
        total_saving = sharing.sum_children_in_currency([dep1, dep2, dep3], "USD_BCV")
        self.assertEqual(total_saving, Decimal("90.00"))

        # 2. Debts: payments (positive) and increases (negative)
        pay1 = SimpleNamespace(amount=Decimal("50.00"), currency="USD_BCV", transaction_type="payment")
        inc1 = SimpleNamespace(amount=Decimal("20.00"), currency="USD_BCV", transaction_type="increase")
        total_debt = sharing.sum_children_in_currency([pay1, inc1], "USD_BCV")
        self.assertEqual(total_debt, Decimal("30.00"))

    @patch("app.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_savings.get_saving_goal", new_callable=AsyncMock)
    async def test_saving_withdrawal_rejected_for_project(self, mock_get_goal, mock_get_membership):
        mock_get_membership.return_value = None

        # Goal is of type "project"
        project_goal = models.SavingGoal(
            id=self.goal_id,
            user_id=self.user_id,
            name="Remodelación",
            type="project",
            currency="USD_BCV",
            target_amount=Decimal("500.00"),
            deposits=[]
        )
        mock_get_goal.return_value = project_goal

        mock_prof_res = MagicMock()
        mock_prof_res.scalars.return_value.first.return_value = models.Profile(id=self.user_id, display_name="Diego")

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_prof_res)
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        # 1. Reject on add_saving_deposit
        dep_create = schemas.SavingDepositCreate(
            amount=Decimal("50.00"),
            currency="USD_BCV",
            transaction_type="withdrawal"
        )
        with self.assertRaises(HTTPException) as ctx:
            await crud_savings.add_saving_deposit(db, self.goal_id, self.user_id, dep_create)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Los proyectos no admiten retiros", ctx.exception.detail)

        # 2. Reject on update_saving_deposit
        existing_deposit = models.SavingDeposit(
            id=uuid.uuid4(),
            goal_id=self.goal_id,
            amount=Decimal("50.00"),
            currency="USD_BCV",
            transaction_type="deposit",
            paid_by_user_id=self.user_id
        )

        async def mock_execute(stmt, *args, **kwargs):
            mock_res = MagicMock()
            stmt_str = str(stmt).lower()
            if "saving_deposits" in stmt_str and "saving_goals" in stmt_str:
                mock_res.scalars.return_value.first.return_value = existing_deposit
            elif "saving_goals" in stmt_str:
                mock_res.scalars.return_value.first.return_value = project_goal
            else:
                mock_res.scalars.return_value.first.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute

        dep_update = schemas.SavingDepositUpdate(transaction_type="withdrawal")
        with self.assertRaises(HTTPException) as ctx:
            await crud_savings.update_saving_deposit(db, existing_deposit.id, self.user_id, dep_update)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Los proyectos no admiten retiros", ctx.exception.detail)

    @patch("app.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_savings.get_saving_goal", new_callable=AsyncMock)
    async def test_saving_withdrawal_exceeding_balance_rejected(self, mock_get_goal, mock_get_membership):
        mock_get_membership.return_value = None

        dep1 = models.SavingDeposit(
            id=uuid.uuid4(),
            goal_id=self.goal_id,
            amount=Decimal("50.00"),
            currency="USD_BCV",
            transaction_type="deposit",
            paid_by_user_id=self.user_id
        )
        saving_goal = models.SavingGoal(
            id=self.goal_id,
            user_id=self.user_id,
            name="Ahorro Viaje",
            type="saving",
            currency="USD_BCV",
            target_amount=Decimal("500.00"),
            deposits=[dep1]
        )
        mock_get_goal.return_value = saving_goal

        mock_prof_res = MagicMock()
        mock_prof_res.scalars.return_value.first.return_value = models.Profile(id=self.user_id, display_name="Diego")

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_prof_res)
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        # 1. Add withdrawal of 60 when balance is 50 -> rejected
        dep_create = schemas.SavingDepositCreate(
            amount=Decimal("60.00"),
            currency="USD_BCV",
            transaction_type="withdrawal"
        )
        with self.assertRaises(HTTPException) as ctx:
            await crud_savings.add_saving_deposit(db, self.goal_id, self.user_id, dep_create)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("El monto del retiro supera el saldo disponible en el ahorro", ctx.exception.detail)

        # 2. Update deposit to withdrawal of 60 when other deposits have 0 (or balance is exceeded) -> rejected
        dep2 = models.SavingDeposit(
            id=uuid.uuid4(),
            goal_id=self.goal_id,
            amount=Decimal("20.00"),
            currency="USD_BCV",
            transaction_type="deposit",
            paid_by_user_id=self.user_id
        )
        saving_goal.deposits = [dep1, dep2]

        async def mock_execute(stmt, *args, **kwargs):
            mock_res = MagicMock()
            stmt_str = str(stmt).lower()
            if "saving_deposits" in stmt_str and "saving_goals" in stmt_str:
                mock_res.scalars.return_value.first.return_value = dep2
            elif "saving_goals" in stmt_str:
                mock_res.scalars.return_value.first.return_value = saving_goal
            else:
                mock_res.scalars.return_value.first.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute

        # dep1 is 50, dep2 is updated to withdrawal of 60 -> available in other deposits is 50 < 60
        dep_update = schemas.SavingDepositUpdate(
            amount=Decimal("60.00"),
            transaction_type="withdrawal"
        )
        with self.assertRaises(HTTPException) as ctx:
            await crud_savings.update_saving_deposit(
                db, dep2.id, self.user_id, dep_update, extra_data={"amount_usd": Decimal("60.00")}
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("El monto del retiro supera el saldo disponible en el ahorro", ctx.exception.detail)

    @patch("app.sharing.recompute_settlement", new_callable=AsyncMock)
    @patch("app.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_savings.get_saving_goal", new_callable=AsyncMock)
    async def test_saving_withdrawal_forces_no_expense_and_deletes_linked_expense_on_update(
        self, mock_get_goal, mock_get_membership, mock_recompute
    ):
        mock_get_membership.return_value = None

        dep1 = models.SavingDeposit(
            id=uuid.uuid4(),
            goal_id=self.goal_id,
            amount=Decimal("100.00"),
            currency="USD_BCV",
            transaction_type="deposit",
            paid_by_user_id=self.user_id
        )
        saving_goal = models.SavingGoal(
            id=self.goal_id,
            user_id=self.user_id,
            name="Ahorro Emergencia",
            type="saving",
            currency="USD_BCV",
            target_amount=Decimal("500.00"),
            deposits=[dep1]
        )
        mock_get_goal.return_value = saving_goal

        added_objects = []
        deleted_objects = []
        db = AsyncMock()
        db.add = MagicMock(side_effect=lambda o: added_objects.append(o))
        db.delete = AsyncMock(side_effect=lambda o: deleted_objects.append(o))
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.expire_all = MagicMock()

        # 1. Add withdrawal with register_as_expense=True -> should force register_as_expense=False
        dep_create = schemas.SavingDepositCreate(
            amount=Decimal("20.00"),
            currency="USD_BCV",
            transaction_type="withdrawal",
            register_as_expense=True
        )

        async def mock_execute_add(stmt, *args, **kwargs):
            mock_res = MagicMock()
            stmt_str = str(stmt).lower()
            if "profiles" in stmt_str:
                mock_prof = models.Profile(id=self.user_id, display_name="Diego")
                mock_res.scalars.return_value.first.return_value = mock_prof
            return mock_res

        db.execute.side_effect = mock_execute_add

        await crud_savings.add_saving_deposit(db, self.goal_id, self.user_id, dep_create)

        added_expenses = [o for o in added_objects if isinstance(o, models.Expense)]
        self.assertEqual(len(added_expenses), 0, "Withdrawal should never create an Expense record on add")
        added_deposits = [o for o in added_objects if isinstance(o, models.SavingDeposit)]
        self.assertEqual(len(added_deposits), 1)
        self.assertFalse(added_deposits[0].create_expense)
        self.assertIsNone(added_deposits[0].expense_id)

        # 2. Update existing deposit with linked expense to withdrawal -> delete linked expense
        linked_exp_id = uuid.uuid4()
        linked_expense = models.Expense(
            id=linked_exp_id,
            user_id=self.user_id,
            amount=Decimal("40.00"),
            currency="USD_BCV",
            description="Aporte de Ahorro",
            category="Ahorro"
        )
        dep_with_expense = models.SavingDeposit(
            id=uuid.uuid4(),
            goal_id=self.goal_id,
            amount=Decimal("40.00"),
            currency="USD_BCV",
            transaction_type="deposit",
            paid_by_user_id=self.user_id,
            expense_id=linked_exp_id,
            create_expense=True
        )
        saving_goal.deposits = [dep1, dep_with_expense]

        db.get = AsyncMock(return_value=linked_expense)

        async def mock_execute_update(stmt, *args, **kwargs):
            mock_res = MagicMock()
            stmt_str = str(stmt).lower()
            if "saving_deposits" in stmt_str and "saving_goals" in stmt_str:
                mock_res.scalars.return_value.first.return_value = dep_with_expense
            elif "saving_goals" in stmt_str:
                mock_res.scalars.return_value.first.return_value = saving_goal
            elif "expenses" in stmt_str:
                mock_res.scalars.return_value.first.return_value = linked_expense
            else:
                mock_res.scalars.return_value.first.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute_update

        dep_update = schemas.SavingDepositUpdate(
            transaction_type="withdrawal"
        )
        await crud_savings.update_saving_deposit(db, dep_with_expense.id, self.user_id, dep_update)

        self.assertIn(linked_expense, deleted_objects, "Linked expense must be deleted when updated to withdrawal")
        self.assertIsNone(dep_with_expense.expense_id)
        self.assertFalse(dep_with_expense.create_expense)

    @patch("app.crud_savings.get_saving_goals", new_callable=AsyncMock)
    async def test_savings_summary_subtracts_withdrawals(self, mock_get_goals):
        goal = models.SavingGoal(
            id=self.goal_id,
            user_id=self.user_id,
            name="Meta Mixta",
            type="saving",
            currency="USD_BCV",
            target_amount=Decimal("500.00"),
            is_active=True,
            is_completed=False,
            deposits=[
                models.SavingDeposit(
                    amount=Decimal("100.00"),
                    currency="USD_BCV",
                    amount_usd=Decimal("100.00"),
                    amount_bs=Decimal("4000.00"),
                    amount_eur=Decimal("90.00"),
                    amount_usdt=Decimal("100.00"),
                    transaction_type="deposit"
                ),
                models.SavingDeposit(
                    amount=Decimal("30.00"),
                    currency="USD_BCV",
                    amount_usd=Decimal("30.00"),
                    amount_bs=Decimal("1200.00"),
                    amount_eur=Decimal("27.00"),
                    amount_usdt=Decimal("30.00"),
                    transaction_type="withdrawal"
                )
            ]
        )
        mock_get_goals.return_value = [goal]

        db = AsyncMock()
        summary = await crud_savings.get_savings_summary(db, self.user_id)

        self.assertEqual(summary.total_saved_usd, Decimal("70.00"))
        self.assertEqual(summary.total_saved_bs, Decimal("2800.00"))
        self.assertEqual(summary.total_saved_eur, Decimal("63.00"))
        self.assertEqual(summary.total_saved_usdt, Decimal("70.00"))

    @patch("app.sharing.recompute_settlement", new_callable=AsyncMock)
    @patch("app.sharing.get_membership", new_callable=AsyncMock)
    @patch("app.crud_debts.get_debt", new_callable=AsyncMock)
    async def test_debt_increase_forces_no_expense_and_recomputes_settlement(
        self, mock_get_debt, mock_get_membership, mock_recompute
    ):
        mock_get_membership.return_value = None

        db_debt = models.Debt(
            id=self.debt_id,
            user_id=self.user_id,
            concept="Préstamo",
            counterpart="Banco",
            total_amount=Decimal("200.00"),
            currency="USD_BCV",
            payments=[],
            is_settled=False
        )
        mock_get_debt.return_value = db_debt

        added_objects = []
        deleted_objects = []
        db = AsyncMock()
        db.add = MagicMock(side_effect=lambda o: added_objects.append(o))
        db.delete = AsyncMock(side_effect=lambda o: deleted_objects.append(o))
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.expire_all = MagicMock()

        # 1. Add debt payment with transaction_type="increase" and register_as_expense=True
        pay_create = schemas.DebtPaymentCreate(
            amount=Decimal("50.00"),
            currency="USD_BCV",
            transaction_type="increase",
            register_as_expense=True
        )

        async def mock_execute_add(stmt, *args, **kwargs):
            mock_res = MagicMock()
            stmt_str = str(stmt).lower()
            if "profiles" in stmt_str:
                mock_prof = models.Profile(id=self.user_id, display_name="Diego")
                mock_res.scalars.return_value.first.return_value = mock_prof
            return mock_res

        db.execute.side_effect = mock_execute_add

        await crud_debts.add_debt_payment(db, self.debt_id, self.user_id, pay_create)

        added_expenses = [o for o in added_objects if isinstance(o, models.Expense)]
        self.assertEqual(len(added_expenses), 0, "Debt increase should never create an Expense record")
        added_payments = [o for o in added_objects if isinstance(o, models.DebtPayment)]
        self.assertEqual(len(added_payments), 1)
        self.assertFalse(added_payments[0].create_expense)
        self.assertIsNone(added_payments[0].expense_id)
        mock_recompute.assert_called_with(db, "debt", [self.debt_id])

        # 2. Update existing payment with linked expense to transaction_type="increase"
        linked_exp_id = uuid.uuid4()
        linked_expense = models.Expense(
            id=linked_exp_id,
            user_id=self.user_id,
            amount=Decimal("30.00"),
            currency="USD_BCV",
            description="Abono a deuda",
            category="Deudas"
        )
        existing_payment = models.DebtPayment(
            id=uuid.uuid4(),
            debt_id=self.debt_id,
            amount=Decimal("30.00"),
            currency="USD_BCV",
            transaction_type="payment",
            paid_by_user_id=self.user_id,
            expense_id=linked_exp_id,
            create_expense=True
        )

        async def mock_execute_update(stmt, *args, **kwargs):
            mock_res = MagicMock()
            stmt_str = str(stmt).lower()
            if "debt_payments" in stmt_str and "debts" in stmt_str:
                mock_res.first.return_value = (existing_payment, db_debt)
            elif "expenses" in stmt_str:
                mock_res.scalars.return_value.first.return_value = linked_expense
            else:
                mock_res.first.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute_update

        pay_update = schemas.DebtPaymentUpdate(transaction_type="increase")
        await crud_debts.update_debt_payment(db, existing_payment.id, self.user_id, pay_update)

        self.assertIn(linked_expense, deleted_objects, "Linked expense must be deleted when updated to increase")
        self.assertIsNone(existing_payment.expense_id)
        self.assertFalse(existing_payment.create_expense)
        self.assertEqual(existing_payment.transaction_type, "increase")


if __name__ == "__main__":
    unittest.main()
