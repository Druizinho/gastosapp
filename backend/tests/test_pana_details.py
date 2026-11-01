import sys
from pathlib import Path
import unittest
import uuid
import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from contextlib import asynccontextmanager
from fastapi import HTTPException

# Add backend directory to sys.path so app modules can be loaded
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app import schemas, crud_connections, models
from app.routers import connections as router_connections


class TestPanaDetailsHelpersAndSchemas(unittest.TestCase):
    def test_safe_date_and_sort_date_key_mixed_types(self):
        # 1. datetime converts to date
        dt = datetime.datetime(2026, 10, 31, 15, 30, 0)
        self.assertEqual(crud_connections._safe_date(dt), datetime.date(2026, 10, 31))

        # 2. date remains date
        d = datetime.date(2026, 5, 1)
        self.assertEqual(crud_connections._safe_date(d), d)

        # 3. ISO strings
        self.assertEqual(crud_connections._safe_date("2026-12-25"), datetime.date(2026, 12, 25))
        self.assertEqual(crud_connections._safe_date("2026-08-15T10:00:00Z"), datetime.date(2026, 8, 15))

        # 4. None and invalid strings
        self.assertIsNone(crud_connections._safe_date(None))
        self.assertIsNone(crud_connections._safe_date("invalid-date"))
        self.assertIsNone(crud_connections._safe_date(12345))

        # 5. _sort_date_key returns date.min on None or invalid
        self.assertEqual(crud_connections._sort_date_key(None), datetime.date.min)
        self.assertEqual(crud_connections._sort_date_key("corrupted"), datetime.date.min)
        self.assertEqual(crud_connections._sort_date_key(dt), datetime.date(2026, 10, 31))

        # 6. Sorting a mixed list without TypeError
        class MockItem:
            def __init__(self, payment_date):
                self.payment_date = payment_date

        items = [
            MockItem(None),
            MockItem(datetime.datetime(2026, 10, 1, 12, 0)),
            MockItem(datetime.date(2026, 10, 15)),
            MockItem("2026-10-10"),
            MockItem("not-a-date"),
        ]

        # Must not raise TypeError: '<' not supported between instances
        sorted_items = sorted(
            items,
            key=lambda x: crud_connections._sort_date_key(getattr(x, "payment_date", None)),
            reverse=True
        )

        expected_dates = [
            datetime.date(2026, 10, 15),
            datetime.date(2026, 10, 10),
            datetime.date(2026, 10, 1),
            datetime.date.min,
            datetime.date.min,
        ]
        actual_dates = [crud_connections._sort_date_key(item.payment_date) for item in sorted_items]
        self.assertEqual(actual_dates, expected_dates)

    def test_schemas_instantiation_defaults_and_none_resilience(self):
        item_id = uuid.uuid4()

        # SharedFixedExpenseBrief with defaults
        fe_def = schemas.SharedFixedExpenseBrief(id=item_id, name="Internet")
        self.assertEqual(fe_def.amount, Decimal(0))
        self.assertEqual(fe_def.currency, "BS")
        self.assertTrue(fe_def.is_active)
        self.assertFalse(fe_def.is_paid_this_month)
        self.assertEqual(fe_def.members_count, 2)
        self.assertEqual(fe_def.member_names, [])

        # SharedFixedExpenseBrief with explicit Nones
        fe_none = schemas.SharedFixedExpenseBrief(
            id=item_id,
            name="Internet",
            amount=None,
            currency=None,
            is_active=None,
            is_paid_this_month=None,
            members_count=None,
            member_names=None,
        )
        self.assertEqual(fe_none.amount, Decimal(0))
        self.assertEqual(fe_none.currency, "BS")
        self.assertTrue(fe_none.is_active)
        self.assertFalse(fe_none.is_paid_this_month)
        self.assertEqual(fe_none.members_count, 2)
        self.assertEqual(fe_none.member_names, [])

        # SharedDebtBrief with defaults
        debt_def = schemas.SharedDebtBrief(id=item_id, concept="Almuerzo", counterpart="Pedro")
        self.assertEqual(debt_def.total_amount, Decimal(0))
        self.assertEqual(debt_def.remaining_amount, Decimal(0))
        self.assertEqual(debt_def.currency, "BS")
        self.assertEqual(debt_def.type, "owed")
        self.assertFalse(debt_def.is_settled)
        self.assertEqual(debt_def.paid_percentage, 0.0)
        self.assertEqual(debt_def.members_count, 2)
        self.assertEqual(debt_def.member_names, [])

        # SharedDebtBrief with explicit Nones
        debt_none = schemas.SharedDebtBrief(
            id=item_id,
            concept="Almuerzo",
            counterpart="Pedro",
            total_amount=None,
            remaining_amount=None,
            currency=None,
            type=None,
            is_settled=None,
            paid_percentage=None,
            members_count=None,
            member_names=None,
        )
        self.assertEqual(debt_none.total_amount, Decimal(0))
        self.assertEqual(debt_none.remaining_amount, Decimal(0))
        self.assertEqual(debt_none.currency, "BS")
        self.assertEqual(debt_none.type, "owed")
        self.assertFalse(debt_none.is_settled)
        self.assertEqual(debt_none.paid_percentage, 0.0)
        self.assertEqual(debt_none.members_count, 2)
        self.assertEqual(debt_none.member_names, [])

        # SharedSavingGoalBrief with defaults
        goal_def = schemas.SharedSavingGoalBrief(id=item_id, name="Vacaciones")
        self.assertEqual(goal_def.current_amount, Decimal(0))
        self.assertEqual(goal_def.currency, "BS")
        self.assertFalse(goal_def.is_completed)
        self.assertEqual(goal_def.progress_percentage, 0.0)
        self.assertEqual(goal_def.members_count, 2)
        self.assertEqual(goal_def.member_names, [])

        # SharedSavingGoalBrief with explicit Nones
        goal_none = schemas.SharedSavingGoalBrief(
            id=item_id,
            name="Vacaciones",
            current_amount=None,
            currency=None,
            is_completed=None,
            progress_percentage=None,
            members_count=None,
            member_names=None,
        )
        self.assertEqual(goal_none.current_amount, Decimal(0))
        self.assertEqual(goal_none.currency, "BS")
        self.assertFalse(goal_none.is_completed)
        self.assertEqual(goal_none.progress_percentage, 0.0)
        self.assertEqual(goal_none.members_count, 2)
        self.assertEqual(goal_none.member_names, [])

        # SharedSubBudgetBrief with defaults
        sb_def = schemas.SharedSubBudgetBrief(id=item_id, name="Mercado", month_year="2026-10")
        self.assertEqual(sb_def.currency, "USD_BCV")
        self.assertEqual(sb_def.effective_global_limit, 0.0)
        self.assertEqual(sb_def.total_spent_budget_currency, 0.0)
        self.assertEqual(sb_def.global_spent_percentage, 0.0)
        self.assertEqual(sb_def.global_traffic_light, "green")
        self.assertEqual(sb_def.categories_count, 0)
        self.assertTrue(sb_def.is_mine)
        self.assertEqual(sb_def.members_count, 1)
        self.assertEqual(sb_def.member_names, [])

        # SharedSubBudgetBrief with explicit Nones
        sb_none = schemas.SharedSubBudgetBrief(
            id=item_id,
            name="Mercado",
            month_year="2026-10",
            currency=None,
            effective_global_limit=None,
            total_spent_budget_currency=None,
            global_spent_percentage=None,
            global_traffic_light=None,
            categories_count=None,
            is_mine=None,
            members_count=None,
            member_names=None,
        )
        self.assertEqual(sb_none.currency, "USD_BCV")
        self.assertEqual(sb_none.effective_global_limit, 0.0)
        self.assertEqual(sb_none.total_spent_budget_currency, 0.0)
        self.assertEqual(sb_none.global_spent_percentage, 0.0)
        self.assertEqual(sb_none.global_traffic_light, "green")
        self.assertEqual(sb_none.categories_count, 0)
        self.assertTrue(sb_none.is_mine)
        self.assertEqual(sb_none.members_count, 1)
        self.assertEqual(sb_none.member_names, [])

        # PanaDetail with default lists
        detail_def = schemas.PanaDetail(
            connection_id=item_id,
            partner_id=item_id,
            partner_name="Carlos",
        )
        self.assertEqual(detail_def.shared_fixed_expenses, [])
        self.assertEqual(detail_def.shared_debts, [])
        self.assertEqual(detail_def.shared_saving_goals, [])
        self.assertEqual(detail_def.shared_sub_budgets, [])

        # PanaDetail with explicit Nones
        detail_none = schemas.PanaDetail(
            connection_id=item_id,
            partner_id=item_id,
            partner_name="Carlos",
            shared_fixed_expenses=None,
            shared_debts=None,
            shared_saving_goals=None,
            shared_sub_budgets=None,
        )
        self.assertEqual(detail_none.shared_fixed_expenses, [])
        self.assertEqual(detail_none.shared_debts, [])
        self.assertEqual(detail_none.shared_saving_goals, [])
        self.assertEqual(detail_none.shared_sub_budgets, [])


class TestGetPanaDetailsResilience(unittest.IsolatedAsyncioTestCase):
    async def test_get_pana_details_auth_error_and_sub_budget_fallback(self):
        user_id = uuid.uuid4()
        partner_id = uuid.uuid4()
        conn_id = uuid.uuid4()
        sub_budget_id = uuid.uuid4()
        share_id = uuid.uuid4()

        mock_conn = MagicMock()
        mock_conn.id = conn_id
        mock_conn.status = "accepted"

        mock_prof = MagicMock()
        mock_prof.id = partner_id
        mock_prof.display_name = "Pana Amigo"
        mock_prof.avatar_url = "https://example.com/p.png"

        mock_share = MagicMock()
        mock_share.id = share_id
        mock_share.owner_id = user_id
        mock_share.entity_type = "sub_budget"

        mock_share_member = MagicMock()
        mock_share_member.share_id = share_id
        mock_share_member.user_id = user_id
        mock_share_member.entity_id = sub_budget_id

        mock_anchor_budget = MagicMock()
        mock_anchor_budget.id = sub_budget_id
        mock_anchor_budget.name = "Presupuesto Ocio"
        mock_anchor_budget.month_year = "2026-10"
        mock_anchor_budget.currency = "USD_BCV"
        mock_anchor_budget.global_limit = Decimal("250.0")
        mock_anchor_budget.category_limits = []

        db = AsyncMock()

        @asynccontextmanager
        async def mock_begin_nested():
            yield

        db.begin_nested = mock_begin_nested

        # Execute side effects for queries
        async def mock_execute(query, *args, **kwargs):
            query_str = str(query)
            mock_res = MagicMock()

            # Connection query
            if "connections" in query_str:
                mock_res.scalars.return_value.first.return_value = mock_conn
                return mock_res

            # Profile query
            if "profiles" in query_str:
                mock_res.scalars.return_value.first.return_value = mock_prof
                mock_res.scalars.return_value.all.return_value = [mock_prof]
                return mock_res

            # auth.users query -> raise Exception to test resilience
            if "auth.users" in query_str:
                raise RuntimeError("Database auth table permission denied")

            # Shares query
            if "shares" in query_str and "share_members" in query_str:
                mock_res.all.return_value = [(mock_share, sub_budget_id)]
                return mock_res

            # Share members query
            if "share_members" in query_str:
                mock_res.scalars.return_value.all.return_value = [mock_share_member]
                return mock_res

            # MonthlyBudget query
            if "monthly_budgets" in query_str:
                mock_res.scalars.return_value.first.return_value = mock_anchor_budget
                return mock_res

            mock_res.scalars.return_value.all.return_value = []
            mock_res.scalars.return_value.first.return_value = None
            mock_res.all.return_value = []
            return mock_res

        db.execute = mock_execute
        db.get = AsyncMock(return_value=mock_anchor_budget)

        # Mock crud_budgets.get_monthly_budget_view to raise an exception
        with patch("app.crud_budgets.get_monthly_budget_view", side_effect=Exception("Budget calculation failed")):
            detail = await crud_connections.get_pana_details(db, user_id, partner_id)

        self.assertIsNotNone(detail)
        self.assertEqual(detail.partner_name, "Pana Amigo")
        # auth.users failed, partner_email should be None
        self.assertIsNone(detail.partner_email)
        # sub_budget should fallback to anchor_budget
        self.assertEqual(len(detail.shared_sub_budgets), 1)
        sb_item = detail.shared_sub_budgets[0]
        self.assertEqual(sb_item.id, sub_budget_id)
        self.assertEqual(sb_item.name, "Presupuesto Ocio")
        self.assertEqual(sb_item.effective_global_limit, 250.0)
        self.assertEqual(sb_item.currency, "USD_BCV")

    async def test_get_pana_details_populate_share_meta_failure_resilience(self):
        user_id = uuid.uuid4()
        partner_id = uuid.uuid4()
        conn_id = uuid.uuid4()
        fe_id = uuid.uuid4()
        share_id = uuid.uuid4()

        mock_conn = MagicMock()
        mock_conn.id = conn_id
        mock_conn.status = "accepted"

        mock_prof = MagicMock()
        mock_prof.id = partner_id
        mock_prof.display_name = "Pana Resistente"
        mock_prof.avatar_url = "https://example.com/avatar.png"

        mock_share = MagicMock()
        mock_share.id = share_id
        mock_share.owner_id = user_id
        mock_share.entity_type = "fixed_expense"

        mock_share_member = MagicMock()
        mock_share_member.share_id = share_id
        mock_share_member.user_id = user_id
        mock_share_member.entity_id = fe_id

        mock_fe = MagicMock()
        mock_fe.id = fe_id
        mock_fe.name = "Alquiler Compartido"
        mock_fe.amount = Decimal("500.00")
        mock_fe.currency = "USD_BCV"
        mock_fe.category = "Vivienda"
        mock_fe.payment_day = Decimal("15")  # Numeric/Decimal from Postgres
        mock_fe.is_active = True
        mock_fe.checks = []

        db = AsyncMock()

        @asynccontextmanager
        async def mock_begin_nested():
            yield

        db.begin_nested = mock_begin_nested

        async def mock_execute(query, *args, **kwargs):
            query_str = str(query)
            mock_res = MagicMock()

            if "connections" in query_str:
                mock_res.scalars.return_value.first.return_value = mock_conn
                return mock_res
            if "profiles" in query_str:
                mock_res.scalars.return_value.first.return_value = mock_prof
                mock_res.scalars.return_value.all.return_value = [mock_prof]
                return mock_res
            if "auth.users" in query_str:
                mock_res.first.return_value = ("amigo@example.com",)
                return mock_res
            if "shares" in query_str and "share_members" in query_str:
                mock_res.all.return_value = [(mock_share, fe_id)]
                return mock_res
            if "share_members" in query_str:
                mock_res.scalars.return_value.all.return_value = [mock_share_member]
                return mock_res
            if "fixed_expenses" in query_str:
                mock_res.scalars.return_value.unique.return_value.all.return_value = [mock_fe]
                return mock_res

            mock_res.scalars.return_value.all.return_value = []
            mock_res.scalars.return_value.first.return_value = None
            mock_res.all.return_value = []
            return mock_res

        db.execute = mock_execute

        # Verify populate_share_meta is no longer called in get_pana_details
        with patch("app.sharing.populate_share_meta", side_effect=ValueError("Invalid share role or db error")) as mock_pop:
            detail = await crud_connections.get_pana_details(db, user_id, partner_id)
            mock_pop.assert_not_called()

        self.assertIsNotNone(detail)
        self.assertEqual(detail.partner_name, "Pana Resistente")
        self.assertEqual(len(detail.shared_fixed_expenses), 1)
        fe_out = detail.shared_fixed_expenses[0]
        self.assertEqual(fe_out.id, fe_id)
        self.assertEqual(fe_out.payment_day, 15)  # Cleanly coerced from Decimal(15)
        self.assertEqual(fe_out.name, "Alquiler Compartido")


class TestRouterPanaDetails(unittest.IsolatedAsyncioTestCase):
    async def test_router_get_pana_details_success(self):
        db = AsyncMock()
        user_id = uuid.uuid4()
        partner_id = uuid.uuid4()
        mock_detail = MagicMock(spec=schemas.PanaDetail)

        with patch("app.crud_connections.get_pana_details", new=AsyncMock(return_value=mock_detail)):
            res = await router_connections.get_pana_details(partner_id, db=db, user_id=user_id)
            self.assertEqual(res, mock_detail)

    async def test_router_get_pana_details_not_found(self):
        db = AsyncMock()
        user_id = uuid.uuid4()
        partner_id = uuid.uuid4()

        with patch("app.crud_connections.get_pana_details", new=AsyncMock(return_value=None)):
            with self.assertRaises(HTTPException) as ctx:
                await router_connections.get_pana_details(partner_id, db=db, user_id=user_id)
            self.assertEqual(ctx.exception.status_code, 404)

    async def test_router_get_pana_details_500_exception(self):
        db = AsyncMock()
        user_id = uuid.uuid4()
        partner_id = uuid.uuid4()

        with patch("app.crud_connections.get_pana_details", new=AsyncMock(side_effect=RuntimeError("DB connection failed"))):
            with self.assertRaises(HTTPException) as ctx:
                await router_connections.get_pana_details(partner_id, db=db, user_id=user_id)
            self.assertEqual(ctx.exception.status_code, 500)
            self.assertIn("DB connection failed", ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()
