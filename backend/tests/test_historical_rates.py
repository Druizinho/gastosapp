import sys
import os
import signal
import uuid
import io
import csv
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone

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

from fastapi import HTTPException
from app import bcv_service, models
from app.time_utils import vet_today
from app.schemas import ExpenseCreate, ExpenseUpdate, IncomeCreate, IncomeUpdate, IncomeCheckCreate, CurrencyType


class TestHistoricalRates(unittest.IsolatedAsyncioTestCase):
    """Pruebas unitarias para tasas históricas, snapshots, daily_rates y fallback de BCV."""

    def setUp(self):
        bcv_service.historical_rates_cache.clear()

    # 1. get_rates_for_date for None or today -> returns live rates with is_historical=False, rate_date=today
    async def test_get_rates_for_today_or_none_uses_live_rates(self):
        live_mock = {
            "usd_bs": Decimal("40.0"),
            "eur_bs": Decimal("43.5"),
            "usdt_bs": Decimal("45.0"),
        }
        with patch("app.bcv_service.get_all_rates", AsyncMock(return_value=live_mock)):
            today = vet_today()

            # When target_date is None
            rates_none = await bcv_service.get_rates_for_date(None)
            self.assertEqual(rates_none["usd_bs"], Decimal("40.0"))
            self.assertEqual(rates_none["eur_bs"], Decimal("43.5"))
            self.assertEqual(rates_none["usdt_bs"], Decimal("45.0"))
            self.assertFalse(rates_none["is_historical"])
            self.assertEqual(rates_none["rate_date"], today)

            # When target_date is today
            rates_today = await bcv_service.get_rates_for_date(today)
            self.assertEqual(rates_today["usd_bs"], Decimal("40.0"))
            self.assertFalse(rates_today["is_historical"])
            self.assertEqual(rates_today["rate_date"], today)

            # When target_date is future
            future_date = today + timedelta(days=2)
            rates_future = await bcv_service.get_rates_for_date(future_date)
            self.assertEqual(rates_future["usd_bs"], Decimal("40.0"))
            self.assertFalse(rates_future["is_historical"])
            self.assertEqual(rates_future["rate_date"], today)

    # 2. get_rates_for_date for past weekday in daily_rates (e.g. 2026-04-10 with usd_bs=100, eur_bs=110, usdt_bs=None)
    #    -> returns exact daily_rates row with usdt_bs=None (NO mathematical extrapolation!), is_historical=True, rate_date=date(2026, 4, 10)
    async def test_get_rates_for_past_date_in_daily_rates_no_extrapolation(self):
        target = date(2026, 4, 10)
        mock_row = MagicMock()
        mock_row.fecha = target
        mock_row.usd_bs = Decimal("100.0000")
        mock_row.eur_bs = Decimal("110.0000")
        mock_row.usdt_bs = None
        mock_row.updated_at = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)

        mock_db = AsyncMock()
        mock_res = MagicMock()
        mock_res.scalars.return_value.first.return_value = mock_row
        mock_db.execute.return_value = mock_res

        rates = await bcv_service.get_rates_for_date(target, db=mock_db)

        self.assertEqual(rates["usd_bs"], Decimal("100.0000"))
        self.assertEqual(rates["eur_bs"], Decimal("110.0000"))
        self.assertIsNone(rates["usdt_bs"])  # Must NOT extrapolate USDT
        self.assertTrue(rates["is_historical"])
        self.assertEqual(rates["rate_date"], target)
        self.assertIn(target.isoformat(), bcv_service.historical_rates_cache)

    # 3. get_rates_for_date for weekend/holiday (2026-01-18 Sunday) where Friday 2026-01-16 is in daily_rates
    #    -> returns Friday's rates with rate_date=date(2026, 1, 16) and is_historical=True
    async def test_get_rates_for_weekend_holiday_returns_prior_date(self):
        sunday_date = date(2026, 1, 18)
        friday_date = date(2026, 1, 16)

        mock_row = MagicMock()
        mock_row.fecha = friday_date
        mock_row.usd_bs = Decimal("36.5000")
        mock_row.eur_bs = Decimal("39.0000")
        mock_row.usdt_bs = Decimal("41.0000")
        mock_row.updated_at = datetime(2026, 1, 16, 18, 0, 0, tzinfo=timezone.utc)

        mock_db = AsyncMock()
        mock_res = MagicMock()
        mock_res.scalars.return_value.first.return_value = mock_row
        mock_db.execute.return_value = mock_res

        rates = await bcv_service.get_rates_for_date(sunday_date, db=mock_db)

        self.assertEqual(rates["usd_bs"], Decimal("36.5000"))
        self.assertEqual(rates["eur_bs"], Decimal("39.0000"))
        self.assertEqual(rates["usdt_bs"], Decimal("41.0000"))
        self.assertEqual(rates["rate_date"], friday_date)
        self.assertTrue(rates["is_historical"])

    # 4. get_rates_for_date when no row exists within 7 days
    #    -> returns usd_bs=None, eur_bs=None, usdt_bs=None, is_historical=True, rate_date=target_date
    #       (does NOT query other users' expenses/incomes and does NOT invent rates)
    async def test_get_rates_for_past_date_when_no_row_within_7_days(self):
        old_date = date(2025, 1, 1)

        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        mock_res = MagicMock()
        mock_res.scalars.return_value.first.return_value = None
        mock_db.execute.return_value = mock_res

        rates = await bcv_service.get_rates_for_date(old_date, db=mock_db)

        self.assertIsNone(rates["usd_bs"])
        self.assertIsNone(rates["eur_bs"])
        self.assertIsNone(rates["usdt_bs"])
        self.assertTrue(rates["is_historical"])
        self.assertEqual(rates["rate_date"], old_date)
        # Must not cache empty results
        self.assertNotIn(old_date.isoformat(), bcv_service.historical_rates_cache)

    # 5. convert_amount with usdt_bs=None:
    #    - currency="USD_BCV" -> succeeds, amount_usdt is None, rate_usdt_bs is None.
    #    - currency="USDT" and manual_rate=None -> succeeds (no HTTPException), 1:1 USD fallback.
    #    - currency="USDT" and manual_rate=Decimal("125.50") -> succeeds using manual_rate.
    def test_convert_amount_with_null_usdt(self):
        rates = {
            "usd_bs": Decimal("100.0"),
            "eur_bs": Decimal("110.0"),
            "usdt_bs": None,
        }

        # 5a: currency="USD_BCV"
        res_usd = bcv_service.convert_amount(
            amount=Decimal("10.0"),
            currency="USD_BCV",
            rates=rates,
        )
        self.assertEqual(res_usd["amount_usd"], Decimal("10.0000"))
        self.assertEqual(res_usd["amount_bs"], Decimal("1000.0000"))
        self.assertIsNone(res_usd["amount_usdt"])
        self.assertIsNone(res_usd["rate_usdt_bs"])

        # 5b: currency="USDT" and manual_rate=None -> succeeds without HTTPException, 1:1 USD fallback
        res_usdt = bcv_service.convert_amount(
            amount=Decimal("10.0"),
            currency="USDT",
            rates=rates,
            manual_rate=None,
        )
        self.assertEqual(res_usdt["amount_usdt"], Decimal("10.0000"))
        self.assertEqual(res_usdt["amount_usd"], Decimal("10.0000"))
        self.assertEqual(res_usdt["amount_bs"], Decimal("1000.0000"))
        self.assertIsNone(res_usdt["rate_usdt_bs"])

        # 5c: currency="USDT" and manual_rate=Decimal("125.50") -> succeeds
        res_usdt_manual = bcv_service.convert_amount(
            amount=Decimal("10.0"),
            currency="USDT",
            rates=rates,
            manual_rate=Decimal("125.50"),
        )
        self.assertEqual(res_usdt_manual["amount_usdt"], Decimal("10.0000"))
        self.assertEqual(res_usdt_manual["amount_bs"], Decimal("1255.0000"))
        self.assertEqual(res_usdt_manual["rate_usdt_bs"], Decimal("125.50"))

    # 6. seed_historical_rates & save_today_rates_to_db
    async def test_save_today_rates_to_db(self):
        today = vet_today()
        live_rates = {
            "usd_bs": Decimal("42.5000"),
            "eur_bs": Decimal("46.0000"),
            "usdt_bs": Decimal("48.0000"),
        }

        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        mock_res = MagicMock()
        mock_res.scalars.return_value.first.return_value = None
        mock_db.execute.return_value = mock_res

        with patch("app.bcv_service.get_all_rates", AsyncMock(return_value=live_rates)):
            res = await bcv_service.save_today_rates_to_db(db=mock_db)

            self.assertIsNotNone(res)
            self.assertEqual(res["fecha"], today)
            self.assertEqual(res["usd_bs"], Decimal("42.5000"))
            mock_db.commit.assert_awaited_once()

    async def test_seed_historical_rates_all_sources(self):
        # 1. bcv.today json (skipping weekend duplicates where date != effective_date)
        bcv_today_data = [
            {"date": "2026-04-10", "effective_date": "2026-04-10", "USD": 95.0, "EUR": 105.0},
            {"date": "2026-04-11", "effective_date": "2026-04-10", "USD": 95.0, "EUR": 105.0},  # Duplicate weekend!
        ]

        # 2. ve.dolarapi.com/v1/historicos/dolares
        dolarapi_usd = [
            {"fuente": "oficial", "fecha": "2026-04-10T12:00:00Z", "promedio": 95.5},
            {"fuente": "paralelo", "fecha": "2026-04-10T12:00:00Z", "promedio": 120.0},
            {"fuente": "oficial", "fecha": "2026-04-09T12:00:00Z", "promedio": 94.0},
        ]

        # 3. ve.dolarapi.com/v1/historicos/euros
        dolarapi_eur = [
            {"fuente": "oficial", "fecha": "2026-04-10T12:00:00Z", "promedio": 106.0},
            {"fuente": "oficial", "fecha": "2026-04-09T12:00:00Z", "promedio": 104.0},
        ]

        # 4. usdt.com.ve/data/usdt-ves-historical.csv with comments, captured_at, buy/sell rate
        usdt_csv = (
            "# USDT Historical rates\n"
            "# Another comment\n"
            "captured_at,source,buy_rate,sell_rate\n"
            "2026-04-10T10:00:00Z,binance,110.0,112.0\n"
            "2026-04-10T14:00:00Z,binance,111.0,113.0\n"
            "2026-04-10T12:00:00Z,bybit,108.0,109.0\n"
            "2026-04-10T12:00:00Z,bcv,95.5,95.5\n"
            "2026-04-09T12:00:00Z,bybit,105.0,107.0\n"
        )

        async def mock_get(url, *args, **kwargs):
            resp = MagicMock()
            resp.status_code = 200
            if "bcv.today" in url:
                resp.json.return_value = bcv_today_data
            elif "dolares" in url:
                resp.json.return_value = dolarapi_usd
            elif "euros" in url:
                resp.json.return_value = dolarapi_eur
            elif "usdt-ves-historical.csv" in url:
                resp.text = usdt_csv
            else:
                resp.status_code = 404
            return resp

        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        mock_res = MagicMock()
        mock_res.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_res

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.get = AsyncMock(side_effect=mock_get)

        with patch("httpx.AsyncClient", return_value=mock_client):
            count = await bcv_service.seed_historical_rates(db=mock_db)

            self.assertGreater(count, 0)
            mock_db.commit.assert_awaited_once()

    async def test_seed_historical_rates_generic_csv_columns(self):
        # Test CSV with generic fecha,promedio columns
        usdt_csv = (
            "# Generic CSV\n"
            "fecha,promedio\n"
            "2026-04-10,115.5\n"
        )
        dolarapi_usd = [
            {"fuente": "oficial", "fecha": "2026-04-10", "promedio": 95.0}
        ]

        async def mock_get(url, *args, **kwargs):
            resp = MagicMock()
            resp.status_code = 200
            if "dolares" in url:
                resp.json.return_value = dolarapi_usd
            elif "euros" in url:
                resp.json.return_value = []
            elif "bcv.today" in url:
                resp.json.return_value = []
            elif "usdt-ves-historical.csv" in url:
                resp.text = usdt_csv
            return resp

        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        mock_res = MagicMock()
        mock_res.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_res

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.get = AsyncMock(side_effect=mock_get)

        with patch("httpx.AsyncClient", return_value=mock_client):
            count = await bcv_service.seed_historical_rates(db=mock_db)
            self.assertEqual(count, 1)

    # 7. Router GET /api/expenses/rates?target_date=... returning rate_date and is_historical
    async def test_router_expenses_read_rates_returns_rate_date_and_is_historical(self):
        from app.routers import expenses
        mock_db = AsyncMock()
        rates_dict = {
            "usd_bs": Decimal("45.0"),
            "eur_bs": Decimal("48.0"),
            "usdt_bs": Decimal("49.0"),
            "rate_date": date(2026, 1, 20),
            "is_historical": True,
            "last_updated": datetime(2026, 1, 20, 12, 0, 0, tzinfo=timezone.utc),
        }
        with patch("app.bcv_service.get_rates_for_date", AsyncMock(return_value=rates_dict)) as mock_get:
            res = await expenses.read_rates(target_date=date(2026, 1, 20), db=mock_db)
            mock_get.assert_awaited_once_with(target_date=date(2026, 1, 20), db=mock_db)
            self.assertEqual(res.usd_bs, Decimal("45.0"))
            self.assertEqual(res.rate_date, date(2026, 1, 20))
            self.assertTrue(res.is_historical)

    # 8. resolve_rates_for_update preserves snapshot and None for missing EUR/USDT
    async def test_resolve_rates_for_update_snapshot_immutability_preserves_none(self):
        rec_date = date(2026, 2, 1)
        existing_record = MagicMock()
        existing_record.rate_usd_bs = Decimal("35.0")
        existing_record.rate_eur_bs = None  # Historical rate did not have EUR
        existing_record.rate_usdt_bs = None  # Historical rate did not have USDT

        rates = await bcv_service.resolve_rates_for_update(
            existing_record=existing_record,
            target_date=rec_date,
            existing_date=rec_date,
            db=None,
        )

        self.assertEqual(rates["usd_bs"], Decimal("35.0"))
        self.assertIsNone(rates["eur_bs"])
        self.assertIsNone(rates["usdt_bs"])

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
            "rate_date": new_date,
            "is_historical": True,
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

    def test_convert_amount_dual_key_conventions(self):
        # Rates with modern keys
        modern_rates = {"usd_bs": Decimal("40.0"), "eur_bs": Decimal("43.0"), "usdt_bs": Decimal("45.0")}
        res1 = bcv_service.convert_amount(Decimal("10.0"), "USD_BCV", modern_rates)
        self.assertEqual(res1["amount_bs"], Decimal("400.0000"))

        # Rates with legacy keys
        legacy_rates = {"usd_bcv": Decimal("40.0"), "eur_bcv": Decimal("43.0"), "usdt_binance": Decimal("45.0")}
        res2 = bcv_service.convert_amount(Decimal("10.0"), "USD_BCV", legacy_rates)
        self.assertEqual(res2["amount_bs"], Decimal("400.0000"))

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
