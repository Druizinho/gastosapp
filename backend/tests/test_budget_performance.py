import os
import sys
from pathlib import Path
from decimal import Decimal
from datetime import datetime, timezone
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4
from types import SimpleNamespace

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@127.0.0.1/db"
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: None

from app import models, schemas, crud_budgets, bcv_service


class FakeAsyncioRunner:
    """Safe runner for IsolatedAsyncioTestCase in sandboxed Windows environments."""
    def get_loop(self):
        return None

    def close(self):
        pass

    def run(self, coro, context=None):
        try:
            while True:
                coro.send(None)
        except StopIteration as e:
            return e.value


class TestBudgetPerformance(unittest.IsolatedAsyncioTestCase):

    def _setupAsyncioRunner(self):
        self._asyncioRunner = FakeAsyncioRunner()

    async def asyncSetUp(self):
        from app import crud
        crud._categories_debts_schema_ensured = True
        crud_budgets._schema_ensured = True
        bcv_service.rates_cache.clear()
        bcv_service._last_valid_rates = {
            "usd_bs": None,
            "eur_bs": None,
            "usdt_bs": None
        }

    async def test_instant_rates_on_cold_cache(self):
        """
        Verifies get_rates_instant_or_cached returns immediately without throwing:
        1. Fallback dict on completely cold cache
        2. Last valid rates when populated
        3. Fresh cache when valid
        """
        with patch("app.bcv_service._trigger_background_rates_update") as mock_trigger:
            # 1. Cold cache fallback
            bcv_service.rates_cache.clear()
            bcv_service._last_valid_rates = {"usd_bs": None, "eur_bs": None, "usdt_bs": None}

            rates = bcv_service.get_rates_instant_or_cached()
            self.assertIsInstance(rates, dict)
            self.assertEqual(rates.get("usd_bs"), 1.0)
            self.assertEqual(rates.get("eur_bs"), 1.0)
            self.assertEqual(rates.get("usdt_bs"), 1.0)
            self.assertEqual(rates.get("usd_cash_bs"), 1.0)
            self.assertIn("updated_at", rates)
            mock_trigger.assert_called()

            # 2. Populated last valid rates
            bcv_service.rates_cache.clear()
            bcv_service._last_valid_rates = {
                "usd_bs": Decimal("45.5"),
                "eur_bs": Decimal("49.2"),
                "usdt_bs": Decimal("46.0")
            }
            rates_valid = bcv_service.get_rates_instant_or_cached()
            self.assertEqual(rates_valid.get("usd_bs"), Decimal("45.5"))
            self.assertEqual(rates_valid.get("eur_bs"), Decimal("49.2"))

            # 3. Fresh cache
            bcv_service.rates_cache["rates"] = {
                "usd_bs": Decimal("50.0"),
                "eur_bs": Decimal("55.0"),
                "usdt_bs": Decimal("52.0")
            }
            rates_cached = bcv_service.get_rates_instant_or_cached()
            self.assertEqual(rates_cached.get("usd_bs"), Decimal("50.0"))
            self.assertEqual(rates_cached.get("eur_bs"), Decimal("55.0"))

    async def test_budget_view_sql_aggregation(self):
        """
        Verifies get_monthly_budget_view produces correct category spending
        and totals via SQL aggregation directly, without loading raw expense ORM objects.
        """
        user_id = uuid4()
        month_year = "2026-10"

        # Mock rates
        bcv_service.rates_cache["rates"] = {
            "usd_bs": Decimal("50.0"),
            "eur_bs": Decimal("55.0"),
            "usdt_bs": Decimal("50.0")
        }

        # Setup primary budget
        primary_b = models.MonthlyBudget(
            id=uuid4(),
            user_id=user_id,
            name="Presupuesto Principal",
            month_year=month_year,
            currency="USD_BCV",
            income_mode="manual",
            manual_global_limit=Decimal("1000"),
            is_confirmed=True,
            is_primary=True,
            category_limits=[
                models.BudgetCategoryLimit(
                    id=uuid4(),
                    category_name="Comida",
                    limit_amount=Decimal("200"),
                    currency="USD_BCV"
                ),
                models.BudgetCategoryLimit(
                    id=uuid4(),
                    category_name="Casa",
                    limit_amount=Decimal("500"),
                    currency="USD_BCV"
                )
            ]
        )

        # Mock SQL aggregation rows returned by db.execute
        # Category: Comida ($50), Casa ($100), Ocio ($30 - unbudgeted)
        agg_rows = [
            SimpleNamespace(category="Comida", spent_usd=Decimal("50.00"), spent_bs=Decimal("2500.00"), spent_eur=Decimal("45.00"), spent_usdt=Decimal("50.00")),
            SimpleNamespace(category="Casa", spent_usd=Decimal("100.00"), spent_bs=Decimal("5000.00"), spent_eur=Decimal("90.00"), spent_usdt=Decimal("100.00")),
            SimpleNamespace(category="Ocio", spent_usd=Decimal("30.00"), spent_bs=Decimal("1500.00"), spent_eur=Decimal("27.00"), spent_usdt=Decimal("30.00")),
        ]

        queries_executed = []

        async def fake_execute(stmt, *args, **kwargs):
            sql_str = str(stmt).lower()
            queries_executed.append(sql_str)
            mock_res = MagicMock()

            if "count" in sql_str:
                mock_res.scalar.return_value = 0
                return mock_res

            # Category query for available budget categories
            if "categories" in sql_str:
                mock_res.scalars.return_value.all.return_value = ["Comida", "Casa"]
                return mock_res

            # SQL Aggregation query on expenses
            if "coalesce" in sql_str and "sum" in sql_str:
                mock_res.all.return_value = agg_rows
                return mock_res

            # Shares query
            if "shares" in sql_str:
                mock_res.scalars.return_value.all.return_value = []
                return mock_res

            # Connections
            if "connections" in sql_str:
                mock_res.scalars.return_value.all.return_value = []
                return mock_res

            # Default
            mock_res.scalars.return_value.all.return_value = []
            mock_res.all.return_value = []
            mock_res.first.return_value = None
            return mock_res

        db = AsyncMock()
        db.execute = fake_execute

        with patch("app.crud_budgets.get_or_clone_monthly_budgets", new_callable=AsyncMock) as mock_get_budgets:
            mock_get_budgets.return_value = [primary_b]
            res = await crud_budgets.get_monthly_budget_view(db, user_id, month_year)

        # 1. Total spent verification (50 + 100 + 30 = 180)
        self.assertEqual(res.total_spent_usd, Decimal("180.00"))
        self.assertEqual(res.total_spent_budget_currency, Decimal("180.00"))

        # 2. Category spending breakdown
        spend_map = {cs.category_name: cs for cs in res.category_spending}
        self.assertIn("Comida", spend_map)
        self.assertEqual(spend_map["Comida"].spent_usd, Decimal("50.00"))
        self.assertIn("Casa", spend_map)
        self.assertEqual(spend_map["Casa"].spent_usd, Decimal("100.00"))
        self.assertIn("Ocio", spend_map)
        self.assertEqual(spend_map["Ocio"].spent_usd, Decimal("30.00"))

        # 3. Primary budget category limits
        b_summary = next(b for b in res.budgets if b.is_primary)
        cl_map = {cl.category_name: cl for cl in b_summary.category_limits}
        self.assertEqual(cl_map["Comida"].spent_amount, Decimal("50.00"))
        self.assertEqual(cl_map["Comida"].remaining_amount, Decimal("150.00"))
        self.assertEqual(cl_map["Casa"].spent_amount, Decimal("100.00"))
        self.assertEqual(cl_map["Casa"].remaining_amount, Decimal("400.00"))

        # 4. Unbudgeted categories
        self.assertIn("Ocio", res.unbudgeted_categories)
        self.assertEqual(res.unbudgeted_spent_usd, Decimal("30.00"))

        # 5. Verify SQL aggregation was performed
        has_agg_query = any("coalesce" in q and "sum" in q for q in queries_executed)
        self.assertTrue(has_agg_query, "SQL aggregation query was not executed!")

    async def test_shared_budget_view_no_recursion(self):
        """
        Verifies shared budgets compute inherited limits and owner spending directly
        without calling get_monthly_budget_view recursively for the owner.
        """
        user_owner = uuid4()
        user_member = uuid4()
        month_year = "2026-10"

        bcv_service.rates_cache["rates"] = {
            "usd_bs": Decimal("50.0"),
            "eur_bs": Decimal("55.0"),
            "usdt_bs": Decimal("50.0")
        }

        # User Member primary budget
        member_primary = models.MonthlyBudget(
            id=uuid4(),
            user_id=user_member,
            name="Presupuesto Member",
            month_year=month_year,
            currency="USD_BCV",
            income_mode="manual",
            manual_global_limit=Decimal("500"),
            is_confirmed=True,
            is_primary=True,
            category_limits=[
                models.BudgetCategoryLimit(id=uuid4(), category_name="General", limit_amount=Decimal("500"), currency="USD_BCV")
            ]
        )

        # User Owner primary budget + shared sub-budget "Viaje"
        owner_sub_id = uuid4()
        owner_primary = models.MonthlyBudget(
            id=uuid4(),
            user_id=user_owner,
            name="Presupuesto Owner",
            month_year=month_year,
            currency="USD_BCV",
            income_mode="manual",
            manual_global_limit=Decimal("1500"),
            is_confirmed=True,
            is_primary=True,
            category_limits=[
                models.BudgetCategoryLimit(id=uuid4(), category_name="Viajes", limit_amount=Decimal("600"), currency="USD_BCV")
            ]
        )
        owner_sub = models.MonthlyBudget(
            id=owner_sub_id,
            user_id=user_owner,
            name="Viaje",
            month_year=month_year,
            currency="USD_BCV",
            income_mode="manual",
            is_confirmed=True,
            is_primary=False,
            category_limits=[
                models.BudgetCategoryLimit(id=uuid4(), category_name="Viajes", limit_amount=Decimal("600"), currency="USD_BCV")
            ]
        )

        # Share setup
        share_id = uuid4()
        share = models.Share(
            id=share_id,
            owner_id=user_owner,
            entity_type="sub_budget",
            created_at=datetime.now(timezone.utc)
        )
        mem_owner = models.ShareMember(share_id=share_id, user_id=user_owner, entity_id=owner_sub_id, role="admin")
        mem_member = models.ShareMember(share_id=share_id, user_id=user_member, entity_id=owner_sub_id, role="member")
        share.members = [mem_owner, mem_member]

        owner_profile = models.Profile(id=user_owner, display_name="Owner User")
        member_profile = models.Profile(id=user_member, display_name="Member User")

        # Mock owner spending aggregation: Viajes -> $150
        owner_agg_rows = [
            SimpleNamespace(category="Viajes", spent_usd=Decimal("150.00"), spent_bs=Decimal("7500.00"), spent_eur=Decimal("135.00"), spent_usdt=Decimal("150.00")),
        ]

        async def fake_execute(stmt, *args, **kwargs):
            sql_str = str(stmt).lower()
            mock_res = MagicMock()

            if "categories" in sql_str:
                mock_res.scalars.return_value.all.return_value = ["General"]
                return mock_res

            # Expense aggregation
            if "coalesce" in sql_str and "sum" in sql_str:
                compiled = stmt.compile()
                uid = next((v for k, v in compiled.params.items() if "user_id" in k), None)
                if uid == user_owner:
                    mock_res.all.return_value = owner_agg_rows
                else:
                    mock_res.all.return_value = []
                return mock_res

            if "shares" in sql_str:
                mock_res.scalars.return_value.all.return_value = [share]
                return mock_res

            if "connections" in sql_str:
                conn = models.Connection(id=uuid4(), requester_id=user_owner, receiver_id=user_member, status="accepted")
                mock_res.scalars.return_value.all.return_value = [conn]
                return mock_res

            if "profiles" in sql_str:
                mock_res.scalars.return_value.all.return_value = [owner_profile, member_profile]
                return mock_res

            mock_res.scalars.return_value.all.return_value = []
            mock_res.all.return_value = []
            return mock_res

        db = AsyncMock()
        db.execute = fake_execute

        async def fake_get(model_cls, entity_id):
            if model_cls == models.MonthlyBudget and entity_id == owner_sub_id:
                return owner_sub
            if model_cls == models.Profile:
                if entity_id == user_owner: return owner_profile
                if entity_id == user_member: return member_profile
            return None

        db.get = fake_get

        async def fake_get_or_clone(db_arg, target_user, target_my, allow_auto_clone=True):
            if target_user == user_member:
                return [member_primary]
            elif target_user == user_owner:
                return [owner_primary, owner_sub]
            return []

        call_log = []
        original_get_view = crud_budgets.get_monthly_budget_view

        async def spy_get_monthly_budget_view(db_arg, u_id, my, *args, **kwargs):
            call_log.append(u_id)
            return await original_get_view(db_arg, u_id, my, *args, **kwargs)

        with patch("app.crud_budgets.get_or_clone_monthly_budgets", side_effect=fake_get_or_clone), \
             patch("app.crud_budgets.get_monthly_budget_view", side_effect=spy_get_monthly_budget_view):
            res = await crud_budgets.get_monthly_budget_view(db, user_member, month_year)

        # Verify NO recursive call to get_monthly_budget_view for user_owner!
        self.assertEqual(call_log, [user_member], f"Unexpected recursive calls detected: {call_log}")

        # Verify shared_with_me_budgets content
        self.assertEqual(len(res.shared_with_me_budgets), 1)
        shared_sb = res.shared_with_me_budgets[0]
        self.assertEqual(shared_sb.name, "Viaje")
        self.assertTrue(shared_sb.is_shared)
        self.assertTrue(shared_sb.is_read_only)
        self.assertEqual(shared_sb.owner_id, user_owner)
        self.assertEqual(shared_sb.shared_by, "Owner User")

        # Verify inherited category limits and owner spending
        cl_viajes = next((cl for cl in shared_sb.category_limits if cl.category_name == "Viajes"), None)
        self.assertIsNotNone(cl_viajes)
        self.assertEqual(cl_viajes.limit_amount, Decimal("600.00"))
        self.assertEqual(cl_viajes.spent_amount, Decimal("150.00"))
        self.assertEqual(shared_sb.total_spent_usd, Decimal("150.00"))


if __name__ == "__main__":
    unittest.main()
