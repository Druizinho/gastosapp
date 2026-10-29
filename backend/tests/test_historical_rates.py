import sys
import os
import signal
import uuid
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
from datetime import date, timedelta

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

from app import bcv_service, models
from app.time_utils import vet_today
from app.schemas import ExpenseCreate, ExpenseUpdate, IncomeCreate, IncomeUpdate, IncomeCheckCreate, CurrencyType


class TestHistoricalRates(unittest.IsolatedAsyncioTestCase):
    """Pruebas unitarias para tasas históricas, snapshots y fallback de BCV."""

    def setUp(self):
        bcv_service.historical_rates_cache.clear()

    async def test_get_rates_for_today_or_none_uses_live_rates(self):
        live_mock = {
            "usd_bs": Decimal("40.0"),
            "eur_bs": Decimal("43.5"),
            "usdt_bs": Decimal("45.0"),
        }
        with patch("app.bcv_service.get_all_rates", AsyncMock(return_value=live_mock)):
            # When target_date is None
            rates_none = await bcv_service.get_rates_for_date(None)
            self.assertEqual(rates_none["usd_bs"], Decimal("40.0"))
            self.assertEqual(rates_none["eur_bs"], Decimal("43.5"))
            self.assertEqual(rates_none["usdt_bs"], Decimal("45.0"))

            # When target_date is today or future
            today = vet_today()
            rates_today = await bcv_service.get_rates_for_date(today)
            self.assertEqual(rates_today["usd_bs"], Decimal("40.0"))

            future_date = today + timedelta(days=2)
            rates_future = await bcv_service.get_rates_for_date(future_date)
            self.assertEqual(rates_future["usd_bs"], Decimal("40.0"))

    async def test_get_rates_for_past_date_uses_db_snapshot_first(self):
        past_date = date(2026, 1, 15)
        db_snapshot = {
            "usd_bs": Decimal("36.5"),
            "eur_bs": Decimal("39.0"),
            "usdt_bs": Decimal("41.0"),
        }

        mock_db = AsyncMock()
        with patch("app.bcv_service._query_db_rates_for_date", AsyncMock(return_value=db_snapshot)) as mock_query, \
             patch("app.bcv_service.fetch_historical_bcv_api", AsyncMock(return_value=Decimal("99.9"))) as mock_api:

            rates = await bcv_service.get_rates_for_date(past_date, db=mock_db)

            mock_query.assert_awaited_once_with(mock_db, past_date)
            mock_api.assert_not_awaited()
            self.assertEqual(rates["usd_bs"], Decimal("36.5"))
            self.assertEqual(rates["eur_bs"], Decimal("39.0"))
            self.assertEqual(rates["usdt_bs"], Decimal("41.0"))

    async def test_get_rates_for_past_date_queries_historical_api_and_scales_proportionally(self):
        past_date = date(2026, 1, 10)
        live_rates = {
            "usd_bs": Decimal("60.0"),
            "eur_bs": Decimal("66.0"),   # ratio = 1.10
            "usdt_bs": Decimal("63.0"),  # ratio = 1.05
        }

        with patch("app.bcv_service._query_db_rates_for_date", AsyncMock(return_value=None)), \
             patch("app.bcv_service.fetch_historical_bcv_api", AsyncMock(return_value=Decimal("30.0"))), \
             patch("app.bcv_service.get_all_rates", AsyncMock(return_value=live_rates)):

            rates = await bcv_service.get_rates_for_date(past_date, db=None)

            self.assertEqual(rates["usd_bs"], Decimal("30.0"))
            # 30.0 * (66.0 / 60.0) = 33.0
            self.assertEqual(rates["eur_bs"], Decimal("33.0000"))
            # 30.0 * (63.0 / 60.0) = 31.5
            self.assertEqual(rates["usdt_bs"], Decimal("31.5000"))

            # Also verify it got cached
            self.assertIn(past_date.isoformat(), bcv_service.historical_rates_cache)
            cached = bcv_service.historical_rates_cache[past_date.isoformat()]
            self.assertEqual(cached["usd_bs"], Decimal("30.0"))

    async def test_get_rates_for_past_date_graceful_fallback_on_api_failure(self):
        past_date = date(2026, 1, 5)
        live_rates = {
            "usd_bs": Decimal("40.0"),
            "eur_bs": Decimal("44.0"),
            "usdt_bs": Decimal("42.0"),
        }

        with patch("app.bcv_service._query_db_rates_for_date", AsyncMock(return_value=None)), \
             patch("app.bcv_service.fetch_historical_bcv_api", AsyncMock(return_value=None)), \
             patch("app.bcv_service.get_all_rates", AsyncMock(return_value=live_rates)):

            rates = await bcv_service.get_rates_for_date(past_date, db=None)

            self.assertEqual(rates["usd_bs"], Decimal("40.0"))
            self.assertEqual(rates["eur_bs"], Decimal("44.0"))
            self.assertEqual(rates["usdt_bs"], Decimal("42.0"))

    async def test_resolve_rates_for_update_snapshot_immutability_when_date_unchanged(self):
        rec_date = date(2026, 2, 1)
        existing_record = MagicMock()
        existing_record.rate_usd_bs = Decimal("35.0")
        existing_record.rate_eur_bs = Decimal("38.0")
        existing_record.rate_usdt_bs = Decimal("39.0")

        # When date is not changed
        rates = await bcv_service.resolve_rates_for_update(
            existing_record=existing_record,
            target_date=rec_date,
            existing_date=rec_date,
            db=None,
        )

        self.assertEqual(rates["usd_bs"], Decimal("35.0"))
        self.assertEqual(rates["eur_bs"], Decimal("38.0"))
        self.assertEqual(rates["usdt_bs"], Decimal("39.0"))

    async def test_resolve_rates_for_update_fetches_new_date_rate_when_date_changed(self):
        old_date = date(2026, 2, 1)
        new_date = date(2026, 3, 1)

        existing_record = MagicMock()
        existing_record.rate_usd_bs = Decimal("35.0")
        existing_record.rate_eur_bs = Decimal("38.0")
        existing_record.rate_usdt_bs = Decimal("39.0")

        new_rates = {
            "usd_bs": Decimal("48.0"),
            "eur_bs": Decimal("52.0"),
            "usdt_bs": Decimal("50.0"),
        }

        with patch("app.bcv_service.get_rates_for_date", AsyncMock(return_value=new_rates)) as mock_get_rates:
            rates = await bcv_service.resolve_rates_for_update(
                existing_record=existing_record,
                target_date=new_date,
                existing_date=old_date,
                db=None,
            )

            mock_get_rates.assert_awaited_once_with(new_date, db=None)
            self.assertEqual(rates["usd_bs"], Decimal("48.0"))
            self.assertEqual(rates["eur_bs"], Decimal("52.0"))
            self.assertEqual(rates["usdt_bs"], Decimal("50.0"))

    def test_resolve_manual_rate_for_update_preserves_usd_cash_custom_rate(self):
        # 1. Explicit manual rate takes highest priority
        rate_explicit = bcv_service.resolve_manual_rate_for_update(
            existing_record=None,
            new_currency="USD_CASH",
            explicit_manual_rate=Decimal("52.5"),
            date_changed=False,
        )
        self.assertEqual(rate_explicit, Decimal("52.5"))

        # 2. Date unchanged, currency remains USD_CASH -> extracts custom effective rate
        existing_rec = MagicMock()
        existing_rec.currency = "USD_CASH"
        existing_rec.amount = Decimal("100.00")
        existing_rec.amount_bs = Decimal("4500.00")

        rate_preserved = bcv_service.resolve_manual_rate_for_update(
            existing_record=existing_rec,
            new_currency="USD_CASH",
            explicit_manual_rate=None,
            date_changed=False,
        )
        # 4500.00 / 100.00 = 45.0000
        self.assertEqual(rate_preserved, Decimal("45.0000"))

        # 3. Date changed -> resets custom manual rate (returns None)
        rate_date_changed = bcv_service.resolve_manual_rate_for_update(
            existing_record=existing_rec,
            new_currency="USD_CASH",
            explicit_manual_rate=None,
            date_changed=True,
        )
        self.assertIsNone(rate_date_changed)

        # 4. Currency changed from USD_CASH to BS -> resets manual rate (returns None)
        rate_curr_changed = bcv_service.resolve_manual_rate_for_update(
            existing_record=existing_rec,
            new_currency="BS",
            explicit_manual_rate=None,
            date_changed=False,
        )
        self.assertIsNone(rate_curr_changed)

    async def test_fetch_historical_bcv_api_filtering_and_fallback(self):
        target = date(2026, 1, 15)
        sample_api_data = [
            {"fuente": "oficial", "fecha": "2026-01-14T12:00:00Z", "promedio": 35.8},
            {"fuente": "oficial", "fecha": "2026-01-15T12:00:00Z", "promedio": 36.2},
            {"fuente": "paralelo", "fecha": "2026-01-15T12:00:00Z", "promedio": 42.0},
        ]

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = sample_api_data

        with patch("httpx.AsyncClient.get", AsyncMock(return_value=mock_resp)):
            val = await bcv_service.fetch_historical_bcv_api(target)
            self.assertEqual(val, Decimal("36.2"))

            # Prior date match when exact date missing
            val_prior = await bcv_service.fetch_historical_bcv_api(date(2026, 1, 16))
            self.assertEqual(val_prior, Decimal("36.2"))

    def test_convert_amount_dual_key_conventions(self):
        # Rates with modern keys
        modern_rates = {"usd_bs": Decimal("40.0"), "eur_bs": Decimal("43.0"), "usdt_bs": Decimal("45.0")}
        res1 = bcv_service.convert_amount(Decimal("10.0"), "USD_BCV", modern_rates)
        self.assertEqual(res1["amount_bs"], Decimal("400.0000"))

        # Rates with legacy keys
        legacy_rates = {"usd_bcv": Decimal("40.0"), "eur_bcv": Decimal("43.0"), "usdt_binance": Decimal("45.0")}
        res2 = bcv_service.convert_amount(Decimal("10.0"), "USD_BCV", legacy_rates)
        self.assertEqual(res2["amount_bs"], Decimal("400.0000"))

    async def test_query_db_rates_for_date_exact_and_window(self):
        mock_db = AsyncMock()
        mock_res = MagicMock()
        mock_rec = MagicMock()
        mock_rec.rate_usd_bs = Decimal("37.2")
        mock_rec.rate_eur_bs = Decimal("40.1")
        mock_rec.rate_usdt_bs = Decimal("42.0")
        mock_res.scalars.return_value.first.return_value = mock_rec
        mock_db.execute.return_value = mock_res

        res = await bcv_service._query_db_rates_for_date(mock_db, date(2026, 1, 15))
        self.assertEqual(res["usd_bs"], Decimal("37.2"))
        self.assertEqual(res["eur_bs"], Decimal("40.1"))
        self.assertEqual(res["usdt_bs"], Decimal("42.0"))

    async def test_router_expenses_read_rates(self):
        from app.routers import expenses
        mock_db = AsyncMock()
        rates_dict = {"usd_bs": Decimal("45.0"), "eur_bs": Decimal("48.0"), "usdt_bs": Decimal("49.0")}
        with patch("app.bcv_service.get_rates_for_date", AsyncMock(return_value=rates_dict)) as mock_get:
            res = await expenses.read_rates(target_date=date(2026, 1, 20), db=mock_db)
            mock_get.assert_awaited_once_with(target_date=date(2026, 1, 20), db=mock_db)
            self.assertEqual(res.usd_bs, Decimal("45.0"))

    async def test_router_expenses_create_expense_uses_historical_date(self):
        from app.routers import expenses
        mock_db = AsyncMock()
        user_id = uuid.uuid4()
        exp_in = ExpenseCreate(
            amount=Decimal("100"),
            description="Supermercado",
            category="Alimentación",
            date=date(2026, 1, 10),
            currency=CurrencyType.USD_BCV,
        )
        rates_dict = {"usd_bs": Decimal("35.0"), "eur_bs": Decimal("38.0"), "usdt_bs": Decimal("39.0")}
        with patch("app.bcv_service.get_rates_for_date", AsyncMock(return_value=rates_dict)) as mock_get, \
             patch("app.crud.create_expense", AsyncMock()) as mock_create:
            await expenses.create_expense(expense=exp_in, db=mock_db, user_id=user_id)
            mock_get.assert_awaited_once_with(target_date=date(2026, 1, 10), db=mock_db)
            mock_create.assert_awaited_once()
            call_kwargs = mock_create.call_args.kwargs
            self.assertEqual(call_kwargs["extra_data"]["rate_usd_bs"], Decimal("35.0"))
            self.assertEqual(call_kwargs["extra_data"]["amount_bs"], Decimal("3500.0000"))

    async def test_router_expenses_update_expense_preserves_snapshot_when_date_unchanged(self):
        from app.routers import expenses
        mock_db = AsyncMock()
        user_id = uuid.uuid4()
        exp_id = uuid.uuid4()

        db_exp = MagicMock()
        db_exp.amount = Decimal("50")
        db_exp.currency = "USD_BCV"
        db_exp.date = date(2026, 1, 10)
        db_exp.rate_usd_bs = Decimal("35.0")
        db_exp.rate_eur_bs = Decimal("38.0")
        db_exp.rate_usdt_bs = Decimal("39.0")

        rates_dict = {"usd_bs": Decimal("35.0"), "eur_bs": Decimal("38.0"), "usdt_bs": Decimal("39.0")}
        with patch("app.crud.get_expense", AsyncMock(return_value=db_exp)), \
             patch("app.crud.update_expense", AsyncMock()) as mock_update, \
             patch("app.bcv_service.resolve_rates_for_update", AsyncMock(return_value=rates_dict)) as mock_res:

            exp_up = ExpenseUpdate(amount=Decimal("80"))
            await expenses.update_expense(expense_id=exp_id, expense=exp_up, db=mock_db, user_id=user_id)
            mock_res.assert_awaited_once()
            mock_update.assert_awaited_once()
            call_kwargs = mock_update.call_args.kwargs
            self.assertEqual(call_kwargs["extra_data"]["rate_usd_bs"], Decimal("35.0"))
            self.assertEqual(call_kwargs["extra_data"]["amount_bs"], Decimal("2800.0000"))

    async def test_router_incomes_check_income_uses_payment_date(self):
        from app.routers import incomes
        mock_db = AsyncMock()
        user_id = uuid.uuid4()
        inc_id = uuid.uuid4()
        chk = IncomeCheckCreate(
            month_year="2026-01",
            real_amount=Decimal("200"),
            currency=CurrencyType.USD_BCV,
            payment_date=date(2026, 1, 12),
        )
        rates_dict = {"usd_bs": Decimal("36.0"), "eur_bs": Decimal("39.0"), "usdt_bs": Decimal("40.0")}
        with patch("app.bcv_service.get_rates_for_date", AsyncMock(return_value=rates_dict)) as mock_get, \
             patch("app.crud_incomes.check_income", AsyncMock()) as mock_chk:
            await incomes.check_income(income_id=inc_id, check=chk, db=mock_db, user_id=user_id)
            mock_get.assert_awaited_once_with(target_date=date(2026, 1, 12), db=mock_db)
            mock_chk.assert_awaited_once()

    async def test_router_incomes_create_income_uses_income_date(self):
        from app.routers import incomes
        mock_db = AsyncMock()
        user_id = uuid.uuid4()
        inc = IncomeCreate(
            amount=Decimal("150"),
            description="Bono",
            category="Otros ingresos",
            currency=CurrencyType.USD_BCV,
            date=date(2026, 1, 8),
        )
        rates_dict = {"usd_bs": Decimal("34.0"), "eur_bs": Decimal("37.0"), "usdt_bs": Decimal("38.0")}
        with patch("app.bcv_service.get_rates_for_date", AsyncMock(return_value=rates_dict)) as mock_get, \
             patch("app.crud_incomes.create_income", AsyncMock()) as mock_create:
            await incomes.create_income(income=inc, db=mock_db, user_id=user_id)
            mock_get.assert_awaited_once_with(target_date=date(2026, 1, 8), db=mock_db)
            mock_create.assert_awaited_once()

    async def test_router_incomes_update_income_resolves_rates(self):
        from app.routers import incomes
        mock_db = AsyncMock()
        user_id = uuid.uuid4()
        inc_id = uuid.uuid4()

        db_inc = MagicMock()
        db_inc.amount = Decimal("100")
        db_inc.currency = "USD_BCV"
        db_inc.date = date(2026, 1, 8)
        db_inc.rate_usd_bs = Decimal("34.0")
        db_inc.rate_eur_bs = Decimal("37.0")
        db_inc.rate_usdt_bs = Decimal("38.0")

        rates_dict = {"usd_bs": Decimal("34.0"), "eur_bs": Decimal("37.0"), "usdt_bs": Decimal("38.0")}
        with patch("app.crud_incomes.get_income", AsyncMock(return_value=db_inc)), \
             patch("app.crud_incomes.update_income", AsyncMock()) as mock_update, \
             patch("app.bcv_service.resolve_rates_for_update", AsyncMock(return_value=rates_dict)) as mock_res:

            inc_up = IncomeUpdate(amount=Decimal("120"))
            await incomes.update_income(income_id=inc_id, income=inc_up, db=mock_db, user_id=user_id)
            mock_res.assert_awaited_once()
            mock_update.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
