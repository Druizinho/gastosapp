import os
import sys
from pathlib import Path
from decimal import Decimal
import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@127.0.0.1/db"
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: None

from app import database, bcv_service


class TestBCVServiceAndEnginePooling(unittest.IsolatedAsyncioTestCase):

    def _setupAsyncioRunner(self):
        self._asyncioRunner = asyncio.Runner(debug=True, loop_factory=self.loop_factory)

    def setUp(self):
        bcv_service.rates_cache.clear()
        bcv_service._last_valid_rates = {
            "usd_bs": None,
            "eur_bs": None,
            "usdt_bs": None
        }

    def test_database_engine_connection_pooling(self):
        """Verify async engine is configured with remote Supabase connection pooling."""
        pool = database.engine.pool
        self.assertEqual(pool.size(), 10)
        self.assertEqual(pool._max_overflow, 20)
        self.assertEqual(pool._recycle, 300)
        self.assertTrue(pool._pre_ping)
        self.assertEqual(database.engine.echo, False)

    @patch("app.bcv_service.get_bcv_rates", new_callable=AsyncMock)
    @patch("app.bcv_service.get_binance_rate", new_callable=AsyncMock)
    async def test_refresh_rates_locked_concurrent_gather(self, mock_binance, mock_bcv):
        """Verify _refresh_rates_locked fetches BCV and Binance concurrently using asyncio.gather."""
        order_called = []

        async def fake_bcv():
            order_called.append("bcv_start")
            await asyncio.sleep(0.01)
            order_called.append("bcv_end")
            return Decimal("52.5"), Decimal("56.1")

        async def fake_binance():
            order_called.append("binance_start")
            await asyncio.sleep(0.01)
            order_called.append("binance_end")
            return Decimal("53.0")

        mock_bcv.side_effect = fake_bcv
        mock_binance.side_effect = fake_binance

        rates = await bcv_service._refresh_rates_locked()

        self.assertEqual(rates["usd_bs"], Decimal("52.5"))
        self.assertEqual(rates["eur_bs"], Decimal("56.1"))
        self.assertEqual(rates["usdt_bs"], Decimal("53.0"))

        # Both functions must start before either finishes (concurrent via asyncio.gather)
        self.assertIn("bcv_start", order_called)
        self.assertIn("binance_start", order_called)
        first_two = order_called[:2]
        self.assertIn("bcv_start", first_two)
        self.assertIn("binance_start", first_two)

        # Cache should now be populated
        self.assertIn("rates", bcv_service.rates_cache)
        self.assertEqual(bcv_service._last_valid_rates["usd_bs"], Decimal("52.5"))

    async def test_get_all_rates_cache_hit(self):
        """When rates_cache is warm, immediately return cached copy without network calls."""
        cached_data = {
            "usd_bs": Decimal("40.0"),
            "eur_bs": Decimal("43.0"),
            "usdt_bs": Decimal("41.0")
        }
        bcv_service.rates_cache["rates"] = cached_data

        with patch("app.bcv_service._refresh_rates_locked", new_callable=AsyncMock) as mock_refresh, \
             patch("app.bcv_service._trigger_background_rates_update") as mock_trigger:
            res = await bcv_service.get_all_rates()
            self.assertEqual(res, cached_data)
            self.assertIsNot(res, cached_data)  # must be a copy
            mock_refresh.assert_not_called()
            mock_trigger.assert_not_called()

    async def test_get_all_rates_stale_while_revalidate(self):
        """When cache expired but _last_valid_rates exists, immediately return stale rates and trigger background update."""
        last_valid = {
            "usd_bs": Decimal("45.0"),
            "eur_bs": Decimal("48.0"),
            "usdt_bs": Decimal("46.0")
        }
        bcv_service._last_valid_rates = last_valid.copy()
        bcv_service.rates_cache.clear()

        with patch("app.bcv_service._trigger_background_rates_update") as mock_trigger, \
             patch("app.bcv_service._refresh_rates_locked", new_callable=AsyncMock) as mock_refresh:
            res = await bcv_service.get_all_rates()

            self.assertEqual(res, last_valid)
            self.assertIsNot(res, bcv_service._last_valid_rates)  # must be a copy
            mock_trigger.assert_called_once()
            mock_refresh.assert_not_called()

    async def test_get_all_rates_cold_start(self):
        """When cache empty and _last_valid_rates is None (true cold start), await _refresh_rates_locked."""
        bcv_service.rates_cache.clear()
        bcv_service._last_valid_rates = {"usd_bs": None, "eur_bs": None, "usdt_bs": None}

        fresh_rates = {
            "usd_bs": Decimal("50.0"),
            "eur_bs": Decimal("54.0"),
            "usdt_bs": Decimal("51.0")
        }

        with patch("app.bcv_service._refresh_rates_locked", new_callable=AsyncMock) as mock_refresh:
            mock_refresh.return_value = fresh_rates

            res = await bcv_service.get_all_rates()
            self.assertEqual(res, fresh_rates)
            mock_refresh.assert_awaited_once()


    async def test_trigger_background_rates_update_spawns_task(self):
        """Verify _trigger_background_rates_update schedules _refresh_rates_locked on running loop."""
        with patch("app.bcv_service._refresh_rates_locked", new_callable=AsyncMock) as mock_refresh:
            bcv_service._trigger_background_rates_update()
            await asyncio.sleep(0.01)
            mock_refresh.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
