import sys
import os
import signal
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
import uuid
import datetime
import base64
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

from app import schemas, crud
from app.routers import reports as router_reports


class TestReportSchemas(unittest.TestCase):
    def test_time_series_bucket_defaults(self):
        start = datetime.date(2026, 11, 1)
        end = datetime.date(2026, 11, 1)
        bucket = schemas.TimeSeriesBucket(
            bucket_label="2026-11-01",
            start_date=start,
            end_date=end,
        )
        self.assertEqual(bucket.bucket_label, "2026-11-01")
        self.assertEqual(bucket.expense_bs, Decimal("0"))
        self.assertEqual(bucket.expense_usd, Decimal("0"))
        self.assertEqual(bucket.income_usd, Decimal("0"))

    def test_category_comparison_item(self):
        item = schemas.CategoryComparisonItem(
            category="Alimentación",
            period_a_usd=Decimal("100.00"),
            period_b_usd=Decimal("150.00"),
            delta_pct_usd=50.0,
        )
        self.assertEqual(item.category, "Alimentación")
        self.assertEqual(item.delta_pct_usd, 50.0)

    def test_send_report_email_request(self):
        req = schemas.SendReportEmailRequest(
            recipient_email="test@example.com",
            subject="Reporte Financiero",
            report_title="Resumen Noviembre 2026",
            report_subtitle="Gastos vs Ingresos",
            summary_highlights=["Gastos: $500", "Ingresos: $800"],
            filename="reporte.pdf",
            mime_type="application/pdf",
            file_base64="JVBERi0xLjQK...",
        )
        self.assertEqual(req.recipient_email, "test@example.com")
        self.assertEqual(len(req.summary_highlights), 2)


class TestReportCrudAndLogic(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user_id = uuid.uuid4()

    async def test_granularity_calculation_and_buckets(self):
        # 1. <= 31 days -> day
        d_from_day = datetime.date(2026, 11, 1)
        d_to_day = datetime.date(2026, 11, 15)  # 15 days

        mock_db = AsyncMock()
        with patch("app.crud.get_summary_range", new_callable=AsyncMock) as mock_summary:
            mock_summary.return_value = schemas.RangeSummaryResponse(
                date_from=d_from_day,
                date_to=d_to_day,
                days_in_range=15,
                total_bs=Decimal("0"),
                total_usd=Decimal("150"),
                total_eur=Decimal("0"),
                total_usdt=Decimal("0"),
                daily_avg_bs=Decimal("0"),
                daily_avg_usd=Decimal("10"),
                daily_avg_eur=Decimal("0"),
                daily_avg_usdt=Decimal("0"),
                income_total_bs=Decimal("0"),
                income_total_usd=Decimal("300"),
                income_total_eur=Decimal("0"),
                income_total_usdt=Decimal("0"),
                balance_bs=Decimal("0"),
                balance_usd=Decimal("150"),
                balance_eur=Decimal("0"),
                balance_usdt=Decimal("0"),
                by_category=[]
            )

            # Mock daily transactions
            # expense_result
            mock_exp_res = MagicMock()
            mock_exp_res.all.return_value = [
                (datetime.date(2026, 11, 2), Decimal("10"), Decimal("20"), Decimal("20"), Decimal("20"))
            ]
            # income_result
            mock_inc_res = MagicMock()
            mock_inc_res.all.return_value = [
                (datetime.date(2026, 11, 3), Decimal("0"), Decimal("50"), Decimal("50"), Decimal("50"))
            ]

            mock_db.execute = AsyncMock(side_effect=[mock_exp_res, mock_inc_res])

            resp = await crud.get_report_comparison(mock_db, self.user_id, d_from_day, d_to_day)
            self.assertEqual(resp.granularity_a, "day")
            self.assertEqual(len(resp.series_a), 15)
            # Find the bucket for Nov 2
            b_nov2 = next(b for b in resp.series_a if b.bucket_label == "2026-11-02")
            self.assertEqual(b_nov2.expense_usd, Decimal("20"))
            # Find the bucket for Nov 3
            b_nov3 = next(b for b in resp.series_a if b.bucket_label == "2026-11-03")
            self.assertEqual(b_nov3.income_usd, Decimal("50"))

    async def test_comparison_two_periods_and_asymmetry(self):
        # Period A: 10 days, Period B: 20 days -> is_asymmetric = True
        d_from_a = datetime.date(2026, 10, 1)
        d_to_a = datetime.date(2026, 10, 10)
        d_from_b = datetime.date(2026, 10, 11)
        d_to_b = datetime.date(2026, 10, 30)

        mock_db = AsyncMock()

        summary_a = schemas.RangeSummaryResponse(
            date_from=d_from_a,
            date_to=d_to_a,
            days_in_range=10,
            total_bs=Decimal("0"),
            total_usd=Decimal("100"),
            total_eur=Decimal("0"),
            total_usdt=Decimal("0"),
            daily_avg_bs=Decimal("0"),
            daily_avg_usd=Decimal("10"),
            daily_avg_eur=Decimal("0"),
            daily_avg_usdt=Decimal("0"),
            income_total_bs=Decimal("0"),
            income_total_usd=Decimal("200"),
            income_total_eur=Decimal("0"),
            income_total_usdt=Decimal("0"),
            balance_bs=Decimal("0"),
            balance_usd=Decimal("100"),
            balance_eur=Decimal("0"),
            balance_usdt=Decimal("0"),
            by_category=[
                schemas.CategorySummary(category="Comida", total_bs=Decimal("0"), total_usd=Decimal("80"), total_eur=Decimal("80"), total_usdt=Decimal("80")),
                schemas.CategorySummary(category="Transporte", total_bs=Decimal("0"), total_usd=Decimal("20"), total_eur=Decimal("20"), total_usdt=Decimal("20"))
            ]
        )

        summary_b = schemas.RangeSummaryResponse(
            date_from=d_from_b,
            date_to=d_to_b,
            days_in_range=20,
            total_bs=Decimal("0"),
            total_usd=Decimal("250"),
            total_eur=Decimal("0"),
            total_usdt=Decimal("0"),
            daily_avg_bs=Decimal("0"),
            daily_avg_usd=Decimal("12.5"),
            daily_avg_eur=Decimal("0"),
            daily_avg_usdt=Decimal("0"),
            income_total_bs=Decimal("0"),
            income_total_usd=Decimal("400"),
            income_total_eur=Decimal("0"),
            income_total_usdt=Decimal("0"),
            balance_bs=Decimal("0"),
            balance_usd=Decimal("150"),
            balance_eur=Decimal("0"),
            balance_usdt=Decimal("0"),
            by_category=[
                schemas.CategorySummary(category="Comida", total_bs=Decimal("0"), total_usd=Decimal("120"), total_eur=Decimal("120"), total_usdt=Decimal("120")),
                schemas.CategorySummary(category="Salud", total_bs=Decimal("0"), total_usd=Decimal("130"), total_eur=Decimal("130"), total_usdt=Decimal("130"))
            ]
        )

        with patch("app.crud.get_summary_range", new_callable=AsyncMock) as mock_summary:
            mock_summary.side_effect = [summary_a, summary_b]

            empty_res = MagicMock()
            empty_res.all.return_value = []
            mock_db.execute = AsyncMock(return_value=empty_res)

            resp = await crud.get_report_comparison(
                mock_db, self.user_id, d_from_a, d_to_a, d_from_b, d_to_b
            )

            self.assertTrue(resp.is_asymmetric)
            self.assertIsNotNone(resp.period_b)
            self.assertEqual(len(resp.category_comparison), 3)

            # Order must be descending by total (period_b_usd + period_a_usd)
            # Comida: 80 + 120 = 200
            # Salud: 0 + 130 = 130
            # Transporte: 20 + 0 = 20
            self.assertEqual(resp.category_comparison[0].category, "Comida")
            self.assertEqual(resp.category_comparison[0].period_a_usd, Decimal("80"))
            self.assertEqual(resp.category_comparison[0].period_b_usd, Decimal("120"))
            # Delta for Comida: (120 - 80) / 80 * 100 = 50.0%
            self.assertEqual(resp.category_comparison[0].delta_pct_usd, 50.0)

            self.assertEqual(resp.category_comparison[1].category, "Salud")
            # Delta for Salud: A=0 so None
            self.assertIsNone(resp.category_comparison[1].delta_pct_usd)

            self.assertEqual(resp.category_comparison[2].category, "Transporte")
            # Delta for Transporte: (0 - 20) / 20 * 100 = -100.0%
            self.assertEqual(resp.category_comparison[2].delta_pct_usd, -100.0)

    async def test_week_and_month_granularity(self):
        mock_db = AsyncMock()
        empty_res = MagicMock()
        empty_res.all.return_value = []
        mock_db.execute = AsyncMock(return_value=empty_res)

        # 60 days -> week
        d_from_w = datetime.date(2026, 9, 1)
        d_to_w = datetime.date(2026, 10, 30)
        with patch("app.crud.get_summary_range", new_callable=AsyncMock) as mock_sum:
            mock_sum.return_value = schemas.RangeSummaryResponse(
                date_from=d_from_w,
                date_to=d_to_w,
                days_in_range=60,
                total_bs=Decimal("0"), total_usd=Decimal("0"), total_eur=Decimal("0"), total_usdt=Decimal("0"),
                daily_avg_bs=Decimal("0"), daily_avg_usd=Decimal("0"), daily_avg_eur=Decimal("0"), daily_avg_usdt=Decimal("0"),
                income_total_bs=Decimal("0"), income_total_usd=Decimal("0"), income_total_eur=Decimal("0"), income_total_usdt=Decimal("0"),
                balance_bs=Decimal("0"), balance_usd=Decimal("0"), balance_eur=Decimal("0"), balance_usdt=Decimal("0"),
                by_category=[]
            )
            resp_w = await crud.get_report_comparison(mock_db, self.user_id, d_from_w, d_to_w)
            self.assertEqual(resp_w.granularity_a, "week")
            # All buckets start on Monday (weekday() == 0)
            for b in resp_w.series_a:
                self.assertEqual(b.start_date.weekday(), 0)

        # 120 days -> month
        d_from_m = datetime.date(2026, 6, 1)
        d_to_m = datetime.date(2026, 9, 28)
        with patch("app.crud.get_summary_range", new_callable=AsyncMock) as mock_sum:
            mock_sum.return_value = schemas.RangeSummaryResponse(
                date_from=d_from_m,
                date_to=d_to_m,
                days_in_range=120,
                total_bs=Decimal("0"), total_usd=Decimal("0"), total_eur=Decimal("0"), total_usdt=Decimal("0"),
                daily_avg_bs=Decimal("0"), daily_avg_usd=Decimal("0"), daily_avg_eur=Decimal("0"), daily_avg_usdt=Decimal("0"),
                income_total_bs=Decimal("0"), income_total_usd=Decimal("0"), income_total_eur=Decimal("0"), income_total_usdt=Decimal("0"),
                balance_bs=Decimal("0"), balance_usd=Decimal("0"), balance_eur=Decimal("0"), balance_usdt=Decimal("0"),
                by_category=[]
            )
            resp_m = await crud.get_report_comparison(mock_db, self.user_id, d_from_m, d_to_m)
            self.assertEqual(resp_m.granularity_a, "month")
            # Month buckets format: YYYY-MM
            self.assertEqual(len(resp_m.series_a[0].bucket_label), 7)
            self.assertIn("-", resp_m.series_a[0].bucket_label)


class TestReportEndpoints(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user_id = uuid.uuid4()

    async def test_analysis_endpoint_invalid_dates(self):
        mock_db = AsyncMock()
        # date_from > date_to
        with self.assertRaises(HTTPException) as ctx:
            await router_reports.read_analysis(
                date_from_a=datetime.date(2026, 11, 10),
                date_to_a=datetime.date(2026, 11, 1),
                db=mock_db,
                current_user=self.user_id,
            )
        self.assertEqual(ctx.exception.status_code, 400)

        # > 366 days
        with self.assertRaises(HTTPException) as ctx:
            await router_reports.read_analysis(
                date_from_a=datetime.date(2025, 1, 1),
                date_to_a=datetime.date(2026, 1, 5),
                db=mock_db,
                current_user=self.user_id,
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_send_email_validation(self):
        # Invalid email
        req_bad_email = schemas.SendReportEmailRequest(
            recipient_email="not-an-email",
            subject="Test",
            report_title="Test",
            filename="report.pdf",
            mime_type="application/pdf",
            file_base64="AAAA",
        )
        with self.assertRaises(HTTPException) as ctx:
            await router_reports.send_report_email(req_bad_email, current_user=self.user_id)
        self.assertEqual(ctx.exception.status_code, 400)

        # File too large (> 14M chars)
        req_large_file = schemas.SendReportEmailRequest(
            recipient_email="user@example.com",
            subject="Test",
            report_title="Test",
            filename="report.pdf",
            mime_type="application/pdf",
            file_base64="A" * 14_000_001,
        )
        with self.assertRaises(HTTPException) as ctx:
            await router_reports.send_report_email(req_large_file, current_user=self.user_id)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_send_email_service_unconfigured(self):
        req = schemas.SendReportEmailRequest(
            recipient_email="user@example.com",
            subject="Test",
            report_title="Test",
            filename="report.pdf",
            mime_type="application/pdf",
            file_base64="AAAA",
        )
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HTTPException) as ctx:
                await router_reports.send_report_email(req, current_user=self.user_id)
            self.assertEqual(ctx.exception.status_code, 503)

    async def test_send_email_smtp_ssl_success(self):
        sample_b64 = base64.b64encode(b"Dummy PDF Content").decode("utf-8")
        req = schemas.SendReportEmailRequest(
            recipient_email="user@example.com",
            subject="Reporte Mensual",
            report_title="Resumen Noviembre 2026",
            summary_highlights=["Gastos: $100.00", "Ingresos: $500.00"],
            filename="resumen.pdf",
            mime_type="application/pdf",
            file_base64=sample_b64,
        )

        mock_smtp = MagicMock()
        mock_smtp.__enter__.return_value = mock_smtp

        with patch.dict(os.environ, {
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "465",
            "SMTP_USER": "mailer@gastosapp.com",
            "SMTP_PASSWORD": "secretpassword",
        }):
            with patch("smtplib.SMTP_SSL", return_value=mock_smtp) as mock_ssl_cls:
                res = await router_reports.send_report_email(req, current_user=self.user_id)
                self.assertEqual(res["status"], "success")
                mock_ssl_cls.assert_called_once_with("smtp.gmail.com", 465)
                mock_smtp.login.assert_called_once_with("mailer@gastosapp.com", "secretpassword")
                mock_smtp.send_message.assert_called_once()

    async def test_send_email_resend_success(self):
        sample_b64 = base64.b64encode(b"Dummy PDF Content").decode("utf-8")
        req = schemas.SendReportEmailRequest(
            recipient_email="user@example.com",
            subject="Reporte Mensual",
            report_title="Resumen Noviembre 2026",
            filename="resumen.pdf",
            mime_type="application/pdf",
            file_base64=sample_b64,
        )

        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__.return_value = mock_resp

        with patch.dict(os.environ, {
            "RESEND_API_KEY": "re_123456789",
            "RESEND_FROM_EMAIL": "GastosApp <reports@gastosapp.com>",
        }, clear=True):
            with patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
                res = await router_reports.send_report_email(req, current_user=self.user_id)
                self.assertEqual(res["status"], "success")
                mock_urlopen.assert_called_once()

    async def test_send_email_smtp_starttls_port_587(self):
        sample_b64 = base64.b64encode(b"Dummy PDF Content").decode("utf-8")
        req = schemas.SendReportEmailRequest(
            recipient_email="user@example.com",
            subject="Reporte Mensual 587",
            report_title="Resumen Noviembre 2026",
            filename="resumen.pdf",
            mime_type="application/pdf",
            file_base64=sample_b64,
        )

        mock_smtp = MagicMock()
        mock_smtp.__enter__.return_value = mock_smtp

        with patch.dict(os.environ, {
            "SMTP_HOST": "smtp.mailgun.org",
            "SMTP_PORT": "587",
            "SMTP_USER": "postmaster@gastosapp.com",
            "SMTP_PASSWORD": "secretpassword",
        }):
            with patch("smtplib.SMTP", return_value=mock_smtp) as mock_smtp_cls:
                res = await router_reports.send_report_email(req, current_user=self.user_id)
                self.assertEqual(res["status"], "success")
                mock_smtp_cls.assert_called_once_with("smtp.mailgun.org", 587)
                mock_smtp.starttls.assert_called_once()
                mock_smtp.login.assert_called_once_with("postmaster@gastosapp.com", "secretpassword")
                mock_smtp.send_message.assert_called_once()

    async def test_analysis_endpoint_partial_period_b(self):
        mock_db = AsyncMock()
        # Only date_from_b provided
        with self.assertRaises(HTTPException) as ctx:
            await router_reports.read_analysis(
                date_from_a=datetime.date(2026, 11, 1),
                date_to_a=datetime.date(2026, 11, 15),
                date_from_b=datetime.date(2026, 10, 1),
                date_to_b=None,
                db=mock_db,
                current_user=self.user_id,
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_analysis_endpoint_success(self):
        mock_db = AsyncMock()
        mock_resp = schemas.PeriodComparisonResponse(
            granularity_a="day",
            is_asymmetric=False,
            period_a=schemas.RangeSummaryResponse(
                date_from=datetime.date(2026, 11, 1),
                date_to=datetime.date(2026, 11, 15),
                days_in_range=15,
                total_bs=Decimal("0"), total_usd=Decimal("0"), total_eur=Decimal("0"), total_usdt=Decimal("0"),
                daily_avg_bs=Decimal("0"), daily_avg_usd=Decimal("0"), daily_avg_eur=Decimal("0"), daily_avg_usdt=Decimal("0"),
                income_total_bs=Decimal("0"), income_total_usd=Decimal("0"), income_total_eur=Decimal("0"), income_total_usdt=Decimal("0"),
                balance_bs=Decimal("0"), balance_usd=Decimal("0"), balance_eur=Decimal("0"), balance_usdt=Decimal("0"),
                by_category=[]
            ),
            series_a=[]
        )
        with patch("app.crud.get_report_comparison", new_callable=AsyncMock, return_value=mock_resp):
            res = await router_reports.read_analysis(
                date_from_a=datetime.date(2026, 11, 1),
                date_to_a=datetime.date(2026, 11, 15),
                db=mock_db,
                current_user=self.user_id,
            )
            self.assertEqual(res.granularity_a, "day")
            self.assertFalse(res.is_asymmetric)


if __name__ == "__main__":
    unittest.main()
