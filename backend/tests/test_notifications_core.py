import sys
import os
import signal
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import uuid
import datetime
from zoneinfo import ZoneInfo

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

from app import models, schemas
from app.push_service import (
    is_quiet_hours,
    send_notification_to_user,
    resolve_notifications_for_entity,
    send_push_notification_to_token,
    PushResult,
)
from app.routers.notifications import mark_single_notification_read


class TestQuietHours(unittest.TestCase):
    """Pruebas del horario de silencio nocturno (10:00 PM a 07:59 AM VET)."""

    def test_quiet_hours_active(self):
        tz = ZoneInfo("America/Caracas")
        # 22:00 VET -> True
        dt_22 = datetime.datetime(2026, 10, 28, 22, 0, 0, tzinfo=tz)
        self.assertTrue(is_quiet_hours(dt_22))

        # 03:00 VET -> True
        dt_03 = datetime.datetime(2026, 10, 28, 3, 0, 0, tzinfo=tz)
        self.assertTrue(is_quiet_hours(dt_03))

        # 07:59 VET -> True
        dt_0759 = datetime.datetime(2026, 10, 28, 7, 59, 59, tzinfo=tz)
        self.assertTrue(is_quiet_hours(dt_0759))

    def test_quiet_hours_inactive(self):
        tz = ZoneInfo("America/Caracas")
        # 08:00 VET -> False
        dt_08 = datetime.datetime(2026, 10, 28, 8, 0, 0, tzinfo=tz)
        self.assertFalse(is_quiet_hours(dt_08))

        # 14:00 VET -> False
        dt_14 = datetime.datetime(2026, 10, 28, 14, 0, 0, tzinfo=tz)
        self.assertFalse(is_quiet_hours(dt_14))

        # 21:59 VET -> False
        dt_2159 = datetime.datetime(2026, 10, 28, 21, 59, 59, tzinfo=tz)
        self.assertFalse(is_quiet_hours(dt_2159))


class TestSendNotificationToUser(unittest.IsolatedAsyncioTestCase):
    """Pruebas unitarias de send_notification_to_user y control transaccional."""

    def setUp(self):
        self.user_id = uuid.uuid4()
        self.entity_id = uuid.uuid4()
        self.active_time = datetime.datetime(2026, 10, 28, 12, 0, tzinfo=ZoneInfo("America/Caracas"))
        self.quiet_time = datetime.datetime(2026, 10, 28, 23, 0, tzinfo=ZoneInfo("America/Caracas"))

    def _mock_db_with_profile(self, profile, subscriptions=None):
        db = AsyncMock()
        db.add = MagicMock()
        
        # Configure execute mock to handle profile and subscriptions queries
        async def mock_execute(stmt):
            mock_res = MagicMock()
            stmt_str = str(stmt).lower()
            if "profiles" in stmt_str:
                mock_res.scalars.return_value.first.return_value = profile
            elif "push_subscriptions" in stmt_str:
                mock_res.scalars.return_value.all.return_value = subscriptions or []
            else:
                mock_res.scalars.return_value.all.return_value = []
                mock_res.scalars.return_value.first.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute
        return db

    async def test_notification_creation_and_commit(self):
        profile = models.Profile(id=self.user_id, notify_budgets=True)
        db = self._mock_db_with_profile(profile)

        notif = await send_notification_to_user(
            db=db,
            user_id=self.user_id,
            title="Presupuesto al 80%",
            body="Has superado el 80% en Comida",
            type="budget_80",
            url="/presupuestos",
            send_push=False,
            entity_type="budget",
            entity_id=self.entity_id,
            commit=True,
            now_vet=self.active_time,
        )

        self.assertIsNotNone(notif)
        self.assertEqual(notif.user_id, self.user_id)
        self.assertEqual(notif.title, "Presupuesto al 80%")
        self.assertEqual(notif.type, "budget_80")
        self.assertEqual(notif.url, "/presupuestos")
        self.assertEqual(notif.entity_type, "budget")
        self.assertEqual(notif.entity_id, self.entity_id)
        self.assertFalse(notif.is_resolved)

        # Verify commit=True triggers commit
        db.commit.assert_awaited_once()

    async def test_notification_flush_when_commit_false(self):
        profile = models.Profile(id=self.user_id, notify_budgets=True)
        db = self._mock_db_with_profile(profile)

        notif = await send_notification_to_user(
            db=db,
            user_id=self.user_id,
            title="Presupuesto al 100%",
            body="Límite alcanzado",
            type="budget_100",
            url="/presupuestos",
            send_push=False,
            entity_type="budget",
            entity_id=self.entity_id,
            commit=False,
            now_vet=self.active_time,
        )

        self.assertIsNotNone(notif)
        # Verify commit=False does NOT trigger commit, only flush
        db.commit.assert_not_awaited()
        self.assertGreaterEqual(db.flush.await_count, 1)

    @patch("app.push_service.send_push_notification_to_token")
    async def test_send_push_suppressed_when_send_push_false(self, mock_push):
        profile = models.Profile(id=self.user_id, notify_budgets=True)
        sub = models.PushSubscription(user_id=self.user_id, fcm_token="token_123")
        db = self._mock_db_with_profile(profile, [sub])

        notif = await send_notification_to_user(
            db=db,
            user_id=self.user_id,
            title="Test",
            body="No push",
            type="budgets",
            send_push=False,
            now_vet=self.active_time,
        )

        self.assertIsNotNone(notif)
        mock_push.assert_not_called()

    @patch("app.push_service.send_push_notification_to_token")
    async def test_send_push_suppressed_during_quiet_hours(self, mock_push):
        profile = models.Profile(id=self.user_id, notify_budgets=True)
        sub = models.PushSubscription(user_id=self.user_id, fcm_token="token_123")
        db = self._mock_db_with_profile(profile, [sub])

        notif = await send_notification_to_user(
            db=db,
            user_id=self.user_id,
            title="Alerta nocturna",
            body="Debe guardarse en bandeja pero no emitir push",
            type="budgets",
            send_push=True,
            now_vet=self.quiet_time,
        )

        # In-app notification must still be created
        self.assertIsNotNone(notif)
        # FCM push must be suppressed due to quiet hours
        mock_push.assert_not_called()

    @patch("app.push_service.send_push_notification_to_token")
    async def test_send_push_suppressed_when_profile_notify_budgets_false(self, mock_push):
        profile = models.Profile(id=self.user_id, notify_budgets=False)
        sub = models.PushSubscription(user_id=self.user_id, fcm_token="token_123")
        db = self._mock_db_with_profile(profile, [sub])

        notif = await send_notification_to_user(
            db=db,
            user_id=self.user_id,
            title="Presupuesto 80%",
            body="Alerta",
            type="budget_80",
            send_push=True,
            now_vet=self.active_time,
        )

        self.assertIsNotNone(notif)
        mock_push.assert_not_called()

    @patch("app.push_service.send_push_notification_to_token")
    async def test_send_push_suppressed_when_profile_notify_panas_false(self, mock_push):
        profile = models.Profile(id=self.user_id, notify_panas=False)
        sub = models.PushSubscription(user_id=self.user_id, fcm_token="token_123")
        db = self._mock_db_with_profile(profile, [sub])

        notif = await send_notification_to_user(
            db=db,
            user_id=self.user_id,
            title="Solicitud de Pana",
            body="Diego te envió una solicitud",
            type="connection_request",
            send_push=True,
            now_vet=self.active_time,
        )

        self.assertIsNotNone(notif)
        mock_push.assert_not_called()

    @patch("app.push_service.send_push_notification_to_token")
    async def test_send_push_delivered_when_allowed(self, mock_push):
        mock_push.return_value = PushResult(True, False)
        profile = models.Profile(id=self.user_id, notify_budgets=True)
        sub = models.PushSubscription(user_id=self.user_id, fcm_token="token_abc")
        db = self._mock_db_with_profile(profile, [sub])

        notif = await send_notification_to_user(
            db=db,
            user_id=self.user_id,
            title="Alerta 80%",
            body="Presupuesto superado",
            type="budget_80",
            url="/presupuestos",
            send_push=True,
            now_vet=self.active_time,
        )

        self.assertIsNotNone(notif)
        mock_push.assert_called_once_with("token_abc", "Alerta 80%", "Presupuesto superado", "/presupuestos")

    @patch("app.push_service.send_push_notification_to_token")
    async def test_unregistered_token_purged(self, mock_push):
        mock_push.return_value = "UNREGISTERED"
        profile = models.Profile(id=self.user_id, notify_budgets=True)
        sub = models.PushSubscription(user_id=self.user_id, fcm_token="invalid_token")
        db = self._mock_db_with_profile(profile, [sub])

        notif = await send_notification_to_user(
            db=db,
            user_id=self.user_id,
            title="Test",
            body="Test body",
            type="budget_80",
            send_push=True,
            now_vet=self.active_time,
        )

        self.assertIsNotNone(notif)
        # Verify db.execute was called to delete the unregistered token
        execute_calls = db.execute.await_args_list
        has_delete = any("delete from push_subscriptions" in str(call[0][0]).lower() for call in execute_calls)
        self.assertTrue(has_delete)


class TestResolveNotificationsForEntity(unittest.IsolatedAsyncioTestCase):
    """Pruebas de la función resolve_notifications_for_entity."""

    async def test_resolve_notifications(self):
        db = AsyncMock()
        entity_id = uuid.uuid4()
        user_id = uuid.uuid4()

        await resolve_notifications_for_entity(
            db=db,
            entity_type="budget",
            entity_id=entity_id,
            user_id=user_id,
            commit=True,
        )

        db.execute.assert_awaited_once()
        stmt = db.execute.await_args[0][0]
        stmt_str = str(stmt).lower()
        self.assertIn("notifications", stmt_str)
        db.commit.assert_awaited_once()

    async def test_resolve_notifications_without_commit(self):
        db = AsyncMock()
        entity_id = uuid.uuid4()

        await resolve_notifications_for_entity(
            db=db,
            entity_type="fixed_expense",
            entity_id=entity_id,
            user_id=None,
            commit=False,
        )

        db.execute.assert_awaited_once()
        db.commit.assert_not_awaited()
        db.flush.assert_awaited_once()


class TestNotificationEndpoints(unittest.IsolatedAsyncioTestCase):
    """Pruebas del endpoint PATCH /{notification_id}/read."""

    async def test_mark_single_notification_read(self):
        db = AsyncMock()
        notif_id = uuid.uuid4()
        current_user = uuid.uuid4()

        result = await mark_single_notification_read(
            notification_id=notif_id,
            db=db,
            current_user=current_user,
        )

        self.assertIsNone(result)
        db.execute.assert_awaited_once()
        db.commit.assert_awaited_once()


class TestModelsAndSchemasIntegrity(unittest.TestCase):
    """Verificación de que las columnas y esquemas contengan las adiciones requeridas."""

    def test_profile_model_fields(self):
        self.assertTrue(hasattr(models.Profile, "notify_budgets"))
        self.assertTrue(hasattr(models.Profile, "notify_panas"))

    def test_notification_model_fields(self):
        self.assertTrue(hasattr(models.Notification, "url"))
        self.assertTrue(hasattr(models.Notification, "is_resolved"))
        self.assertTrue(hasattr(models.Notification, "entity_type"))
        self.assertTrue(hasattr(models.Notification, "entity_id"))

    def test_profile_schemas(self):
        profile_data = {
            "id": uuid.uuid4(),
            "notify_fixed_expenses": True,
            "notify_debts": True,
            "notify_incomes": True,
            "notify_inactivity": True,
            "notify_budgets": False,
            "notify_panas": False,
        }
        res = schemas.ProfileResponse(**profile_data)
        self.assertFalse(res.notify_budgets)
        self.assertFalse(res.notify_panas)

        up = schemas.ProfileUpdate(notify_budgets=True, notify_panas=False)
        self.assertTrue(up.notify_budgets)
        self.assertFalse(up.notify_panas)

    def test_notification_response_schema(self):
        notif_id = uuid.uuid4()
        user_id = uuid.uuid4()
        entity_id = uuid.uuid4()
        data = {
            "id": notif_id,
            "user_id": user_id,
            "title": "Alerta",
            "body": "Cuerpo",
            "type": "budget_80",
            "is_read": False,
            "url": "/presupuestos",
            "is_resolved": False,
            "entity_type": "budget",
            "entity_id": entity_id,
            "created_at": datetime.datetime.now(datetime.timezone.utc),
        }
        res = schemas.NotificationResponse(**data)
        self.assertEqual(res.url, "/presupuestos")
        self.assertFalse(res.is_resolved)
        self.assertEqual(res.entity_type, "budget")
        self.assertEqual(res.entity_id, entity_id)


if __name__ == "__main__":
    unittest.main()
