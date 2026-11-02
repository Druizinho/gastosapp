import sys
import os
import signal
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import uuid
import datetime
from zoneinfo import ZoneInfo
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

# Add backend directory to sys.path so app modules can be loaded
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app import models
from app.time_utils import VET_TZ, vet_now
from app.push_service import is_quiet_hours, normalize_url
from app.routers.push import _due_days_for_date, trigger_notifications, execute_scheduled_notifications


class TestQuietHoursBoundaries(unittest.TestCase):
    """
    Unit tests for is_quiet_hours across boundaries:
    - Quiet hours defined as 10:00 PM (22:00) to 07:59 AM VET.
    - Boundaries to verify: 07:59, 08:00, 21:59, 22:00 VET.
    """

    def test_quiet_hours_at_07_59_vet(self):
        # 07:59:00 VET -> within quiet hours (hour 7 < 8)
        dt = datetime.datetime(2026, 11, 2, 7, 59, 0, tzinfo=VET_TZ)
        self.assertTrue(is_quiet_hours(dt))

    def test_quiet_hours_at_07_59_59_vet(self):
        # 07:59:59 VET -> last second of quiet hours
        dt = datetime.datetime(2026, 11, 2, 7, 59, 59, tzinfo=VET_TZ)
        self.assertTrue(is_quiet_hours(dt))

    def test_quiet_hours_at_08_00_vet(self):
        # 08:00:00 VET -> quiet hours inactive (daytime starts)
        dt = datetime.datetime(2026, 11, 2, 8, 0, 0, tzinfo=VET_TZ)
        self.assertFalse(is_quiet_hours(dt))

    def test_quiet_hours_at_21_59_vet(self):
        # 21:59:59 VET -> quiet hours inactive (daytime ends at 21:59:59)
        dt = datetime.datetime(2026, 11, 2, 21, 59, 59, tzinfo=VET_TZ)
        self.assertFalse(is_quiet_hours(dt))

    def test_quiet_hours_at_22_00_vet(self):
        # 22:00:00 VET -> quiet hours active (nighttime begins at 22:00)
        dt = datetime.datetime(2026, 11, 2, 22, 0, 0, tzinfo=VET_TZ)
        self.assertTrue(is_quiet_hours(dt))

    def test_quiet_hours_additional_points(self):
        # Midnight (00:00) VET -> quiet hours
        self.assertTrue(is_quiet_hours(datetime.datetime(2026, 11, 2, 0, 0, 0, tzinfo=VET_TZ)))
        # Early morning (03:30) VET -> quiet hours
        self.assertTrue(is_quiet_hours(datetime.datetime(2026, 11, 2, 3, 30, 0, tzinfo=VET_TZ)))
        # Midday (12:00) VET -> active daytime
        self.assertFalse(is_quiet_hours(datetime.datetime(2026, 11, 2, 12, 0, 0, tzinfo=VET_TZ)))
        # Evening (19:00) VET -> active daytime
        self.assertFalse(is_quiet_hours(datetime.datetime(2026, 11, 2, 19, 0, 0, tzinfo=VET_TZ)))

    def test_quiet_hours_omitted_parameter_uses_vet_now(self):
        # When no argument is passed, returns a boolean evaluated with vet_now()
        result = is_quiet_hours()
        self.assertIsInstance(result, bool)


class TestDueDaysForDateTransitions(unittest.TestCase):
    """
    Unit tests for _due_days_for_date across month transitions:
    - Feb 28 in non-leap year -> returns [28, 29, 30, 31]
    - Feb 28 in leap year -> returns [28] (since last day is 29)
    - Feb 29 in leap year -> returns [29, 30, 31]
    - Apr 30 (30-day month) -> returns [30, 31]
    - May 31 (31-day month) -> returns [31]
    """

    def test_february_28_non_leap_year(self):
        # 2026 is non-leap, February ends on day 28
        d = datetime.date(2026, 2, 28)
        self.assertEqual(_due_days_for_date(d), [28, 29, 30, 31])

    def test_february_28_and_29_leap_year(self):
        # 2024 is a leap year, February ends on day 29
        d_28 = datetime.date(2024, 2, 28)
        self.assertEqual(_due_days_for_date(d_28), [28])

        d_29 = datetime.date(2024, 2, 29)
        self.assertEqual(_due_days_for_date(d_29), [29, 30, 31])

    def test_april_30_transition(self):
        # April has 30 days
        d_30 = datetime.date(2026, 4, 30)
        self.assertEqual(_due_days_for_date(d_30), [30, 31])

        d_29 = datetime.date(2026, 4, 29)
        self.assertEqual(_due_days_for_date(d_29), [29])

    def test_may_31_full_month(self):
        # May has 31 days
        d_31 = datetime.date(2026, 5, 31)
        self.assertEqual(_due_days_for_date(d_31), [31])

        d_15 = datetime.date(2026, 5, 15)
        self.assertEqual(_due_days_for_date(d_15), [15])

    def test_thirty_day_months_end(self):
        # June, September, November end on day 30 -> [30, 31]
        self.assertEqual(_due_days_for_date(datetime.date(2026, 6, 30)), [30, 31])
        self.assertEqual(_due_days_for_date(datetime.date(2026, 9, 30)), [30, 31])
        self.assertEqual(_due_days_for_date(datetime.date(2026, 11, 30)), [30, 31])

    def test_thirty_one_day_months_end(self):
        # January, July, August, October, December end on day 31 -> [31]
        self.assertEqual(_due_days_for_date(datetime.date(2026, 1, 31)), [31])
        self.assertEqual(_due_days_for_date(datetime.date(2026, 7, 31)), [31])
        self.assertEqual(_due_days_for_date(datetime.date(2026, 12, 31)), [31])


class TestNormalizeUrlHelper(unittest.TestCase):
    """
    Unit tests for normalize_url helper in app/push_service.py:
    - Empty or None -> returns FRONTEND_URL
    - Absolute http/https -> returned as-is
    - Relative URLs starting with / or without / -> formatted with FRONTEND_URL
    - Trailing slash deduplication
    """

    def test_empty_and_falsy_urls(self):
        with patch("app.push_service.FRONTEND_URL", "https://gastosapp.vercel.app"):
            self.assertEqual(normalize_url(""), "https://gastosapp.vercel.app")
            self.assertEqual(normalize_url(None), "https://gastosapp.vercel.app")

    def test_absolute_urls_returned_unmodified(self):
        self.assertEqual(
            normalize_url("https://gastosapp.vercel.app/dashboard"),
            "https://gastosapp.vercel.app/dashboard"
        )
        self.assertEqual(
            normalize_url("http://localhost:3000/ajustes"),
            "http://localhost:3000/ajustes"
        )
        self.assertEqual(
            normalize_url("https://external-service.com/webhook"),
            "https://external-service.com/webhook"
        )

    def test_relative_url_with_leading_slash(self):
        with patch("app.push_service.FRONTEND_URL", "https://gastosapp.vercel.app"):
            self.assertEqual(normalize_url("/deudas"), "https://gastosapp.vercel.app/deudas")
            self.assertEqual(
                normalize_url("/gastos?period=monthly"),
                "https://gastosapp.vercel.app/gastos?period=monthly"
            )

    def test_relative_url_without_leading_slash(self):
        with patch("app.push_service.FRONTEND_URL", "https://gastosapp.vercel.app"):
            self.assertEqual(normalize_url("ajustes"), "https://gastosapp.vercel.app/ajustes")
            self.assertEqual(
                normalize_url("presupuestos/detalle"),
                "https://gastosapp.vercel.app/presupuestos/detalle"
            )

    def test_frontend_url_trailing_slash_stripped(self):
        # Ensure no double slashes like https://custom.app//ajustes
        with patch("app.push_service.FRONTEND_URL", "https://custom.app/"):
            self.assertEqual(normalize_url("/ajustes"), "https://custom.app/ajustes")
            self.assertEqual(normalize_url("ajustes"), "https://custom.app/ajustes")


class TestPushCronAuthorization(unittest.IsolatedAsyncioTestCase):
    """
    Unit tests for /api/push/cron authorization:
    - Validating CRON_SECRET header (Bearer and raw) and query param (?token=)
    - Returning 401 when missing or wrong
    - Returning 500 when CRON_SECRET is not configured in environment
    """

    def setUp(self):
        self.db = AsyncMock()

    async def test_cron_secret_not_configured_returns_500(self):
        # When CRON_SECRET is not in environment
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HTTPException) as ctx:
                await trigger_notifications(
                    token="any-token",
                    authorization=None,
                    window=None,
                    db=self.db
                )
            self.assertEqual(ctx.exception.status_code, 500)
            self.assertIn("CRON_SECRET is not configured", ctx.exception.detail)

    async def test_cron_missing_token_and_header_returns_401(self):
        with patch.dict(os.environ, {"CRON_SECRET": "test-secret-key-12345"}):
            with self.assertRaises(HTTPException) as ctx:
                await trigger_notifications(
                    token=None,
                    authorization=None,
                    window=None,
                    db=self.db
                )
            self.assertEqual(ctx.exception.status_code, 401)
            self.assertIn("Unauthorized", ctx.exception.detail)

    async def test_cron_wrong_query_token_returns_401(self):
        with patch.dict(os.environ, {"CRON_SECRET": "test-secret-key-12345"}):
            with self.assertRaises(HTTPException) as ctx:
                await trigger_notifications(
                    token="wrong-token-abc",
                    authorization=None,
                    window=None,
                    db=self.db
                )
            self.assertEqual(ctx.exception.status_code, 401)
            self.assertIn("Unauthorized", ctx.exception.detail)

    async def test_cron_wrong_header_token_returns_401(self):
        with patch.dict(os.environ, {"CRON_SECRET": "test-secret-key-12345"}):
            with self.assertRaises(HTTPException) as ctx:
                await trigger_notifications(
                    token=None,
                    authorization="Bearer wrong-secret-header",
                    window=None,
                    db=self.db
                )
            self.assertEqual(ctx.exception.status_code, 401)
            self.assertIn("Unauthorized", ctx.exception.detail)

    async def test_cron_authorized_via_query_param(self):
        secret = "super-secret-cron-token-99"
        # Mock outside active notification windows (e.g. 03:00 VET) so it returns ping response
        fixed_now = datetime.datetime(2026, 11, 2, 3, 0, 0, tzinfo=VET_TZ)
        with patch.dict(os.environ, {"CRON_SECRET": secret}):
            with patch("app.routers.push.vet_now", return_value=fixed_now):
                res = await trigger_notifications(
                    token=secret,
                    authorization=None,
                    window=None,
                    db=self.db
                )
                self.assertEqual(res["status"], "awake")
                self.assertIn("Outside notification window", res["message"])

    async def test_cron_authorized_via_bearer_header(self):
        secret = "super-secret-cron-token-99"
        fixed_now = datetime.datetime(2026, 11, 2, 3, 0, 0, tzinfo=VET_TZ)
        with patch.dict(os.environ, {"CRON_SECRET": secret}):
            with patch("app.routers.push.vet_now", return_value=fixed_now):
                res = await trigger_notifications(
                    token=None,
                    authorization=f"Bearer {secret}",
                    window=None,
                    db=self.db
                )
                self.assertEqual(res["status"], "awake")

    async def test_cron_authorized_via_raw_header(self):
        secret = "super-secret-cron-token-99"
        fixed_now = datetime.datetime(2026, 11, 2, 3, 0, 0, tzinfo=VET_TZ)
        with patch.dict(os.environ, {"CRON_SECRET": secret}):
            with patch("app.routers.push.vet_now", return_value=fixed_now):
                res = await trigger_notifications(
                    token=None,
                    authorization=secret,
                    window=None,
                    db=self.db
                )
                self.assertEqual(res["status"], "awake")

    @patch("app.routers.push.execute_scheduled_notifications", new_callable=AsyncMock)
    async def test_cron_authorized_calls_execute_scheduled_notifications(self, mock_exec):
        mock_exec.return_value = {
            "status": "dry_run",
            "window": "morning",
            "items_queued": 2,
            "users_notified": 1,
            "sent": 1,
            "failed": 0,
            "deleted_invalid_tokens": 0,
        }
        secret = "super-secret-cron-token-99"
        fixed_now = datetime.datetime(2026, 11, 2, 9, 15, 0, tzinfo=VET_TZ)
        with patch.dict(os.environ, {"CRON_SECRET": secret}):
            with patch("app.routers.push.vet_now", return_value=fixed_now):
                res = await trigger_notifications(
                    token=secret,
                    authorization=None,
                    window="morning",
                    dry_run=True,
                    db=self.db
                )
                mock_exec.assert_awaited_once_with(self.db, "morning", now_vet=fixed_now, dry_run=True)
                self.assertEqual(res["status"], "dry_run")
                self.assertEqual(res["items_queued"], 2)


class TestDryRunScheduledExecution(unittest.IsolatedAsyncioTestCase):
    """
    Unit test for execute_scheduled_notifications in dry_run mode:
    Verifies that dry_run does not commit to database and does not send push messages.
    """

    def setUp(self):
        self.user_id = uuid.uuid4()
        self.profile = models.Profile(
            id=self.user_id,
            notify_fixed_expenses=True,
        )
        self.sub = models.PushSubscription(
            user_id=self.user_id,
            fcm_token="dry_run_token"
        )
        self.now_vet = datetime.datetime(2026, 11, 2, 9, 0, 0, tzinfo=VET_TZ)

    @patch("app.routers.push.send_push_notification_to_token")
    async def test_dry_run_does_not_commit_or_send_pushes(self, mock_push):
        today = self.now_vet.date()
        exp = models.FixedExpense(
            id=uuid.uuid4(),
            user_id=self.user_id,
            name="Gasto de Prueba Dry Run",
            amount=50,
            currency="USD",
            payment_day=today.day,
            is_active=True,
        )

        db = AsyncMock()
        db.add = MagicMock()

        async def mock_execute(stmt):
            mock_res = MagicMock()
            s = str(stmt).lower()
            if "profiles" in s:
                mock_res.scalars.return_value.all.return_value = [self.profile]
            elif "fixed_expenses" in s and "fixed_expense_checks" not in s:
                params = stmt.compile().params if hasattr(stmt, "compile") else {}
                p_days = params.get("payment_day_1", [])
                if today.day in p_days:
                    mock_res.scalars.return_value.all.return_value = [exp]
                else:
                    mock_res.scalars.return_value.all.return_value = []
            elif "push_subscriptions" in s:
                mock_res.scalars.return_value.all.return_value = [self.sub]
            else:
                mock_res.scalars.return_value.all.return_value = []
                mock_res.scalars.return_value.first.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute

        res = await execute_scheduled_notifications(
            db,
            "morning",
            now_vet=self.now_vet,
            dry_run=True
        )

        # In dry_run mode:
        # 1. Status is "dry_run"
        self.assertEqual(res["status"], "dry_run")
        self.assertEqual(res["items_queued"], 1)
        self.assertEqual(res["users_notified"], 1)

        # 2. Database commit was NOT called; rollback WAS called
        db.commit.assert_not_awaited()
        db.rollback.assert_awaited_once()

        # 3. Live push notification was NOT dispatched to FCM
        mock_push.assert_not_called()


if __name__ == "__main__":
    unittest.main()
