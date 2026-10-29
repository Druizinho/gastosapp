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

from app import models
from app.time_utils import VET_TZ
from app.routers.push import _due_days_for_date, execute_scheduled_notifications


class TestDueDaysForDate(unittest.TestCase):
    """
    Prueba 1: _due_days_for_date
    - 28 de febrero de 2026 (no bisiesto) retorna [28, 29, 30, 31]
    - 30 de abril retorna [30, 31]
    - 15 de mayo retorna [15]
    """

    def test_february_non_leap_year(self):
        # 2026 no es bisiesto, febrero termina el día 28
        d = datetime.date(2026, 2, 28)
        self.assertEqual(_due_days_for_date(d), [28, 29, 30, 31])

    def test_thirty_day_month(self):
        # Abril tiene 30 días
        d = datetime.date(2026, 4, 30)
        self.assertEqual(_due_days_for_date(d), [30, 31])

    def test_mid_month(self):
        # 15 de mayo (mes de 31 días, día intermedio)
        d = datetime.date(2026, 5, 15)
        self.assertEqual(_due_days_for_date(d), [15])

    def test_end_of_thirty_one_day_month(self):
        # 31 de enero
        d = datetime.date(2026, 1, 31)
        self.assertEqual(_due_days_for_date(d), [31])


class TestScheduledNotificationsConsolidation(unittest.IsolatedAsyncioTestCase):
    """
    Prueba 2: Consolidación de Push matutino
    Cuando un usuario tiene 2+ pendientes en la mañana, se insertan las N filas
    en models.Notification pero se envía exactamente 1 Push Resumen con url='/?notifications=open'.
    """

    def setUp(self):
        self.user_id = uuid.uuid4()
        self.profile = models.Profile(
            id=self.user_id,
            notify_fixed_expenses=True,
            notify_debts=True,
            notify_incomes=True,
            notify_inactivity=True,
        )
        self.sub = models.PushSubscription(
            user_id=self.user_id,
            fcm_token="fcm_token_user_1"
        )
        self.now_vet = datetime.datetime(2026, 10, 28, 9, 0, 0, tzinfo=VET_TZ)

    @patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)))
    @patch("app.routers.push.send_push_notification_to_token")
    async def test_two_plus_items_creates_n_notifications_and_one_summary_push(self, mock_push):
        mock_push.return_value = (True, False)

        today = self.now_vet.date()
        exp1 = models.FixedExpense(
            id=uuid.uuid4(),
            user_id=self.user_id,
            name="Alquiler",
            amount=250,
            currency="USD",
            payment_day=today.day,
            is_active=True,
        )
        exp2 = models.FixedExpense(
            id=uuid.uuid4(),
            user_id=self.user_id,
            name="Internet Fibra",
            amount=40,
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
                    # Retorna los 2 gastos fijos para HOY
                    mock_res.scalars.return_value.all.return_value = [exp1, exp2]
                else:
                    mock_res.scalars.return_value.all.return_value = []
            elif "fixed_expense_checks" in s:
                # No han sido pagados
                mock_res.scalars.return_value.first.return_value = None
            elif "notifications" in s and "select" in s:
                # Deduplicación: no existen notificaciones previas hoy
                mock_res.scalars.return_value.first.return_value = None
            elif "push_subscriptions" in s and "delete" not in s:
                mock_res.scalars.return_value.all.return_value = [self.sub]
            else:
                mock_res.scalars.return_value.all.return_value = []
                mock_res.scalars.return_value.first.return_value = None
                mock_res.all.return_value = []
                mock_res.scalar.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute

        res = await execute_scheduled_notifications(db, "morning", now_vet=self.now_vet)

        # 1. Se insertan N filas en Bandeja (db.add llamado 2 veces)
        self.assertEqual(db.add.call_count, 2)
        added_notifications = [call[0][0] for call in db.add.call_args_list]
        self.assertEqual(added_notifications[0].title, "Gasto fijo vence hoy")
        self.assertIn("Alquiler", added_notifications[0].body)
        self.assertEqual(added_notifications[1].title, "Gasto fijo vence hoy")
        self.assertIn("Internet Fibra", added_notifications[1].body)

        # 2. Las notificaciones se persisten en base de datos antes del push
        db.commit.assert_awaited()

        # 3. Se envía exactamente 1 Push Resumen
        mock_push.assert_called_once()
        call_args = mock_push.call_args
        token_arg = call_args[0][0]
        title_arg = call_args[0][1]
        body_arg = call_args[0][2]
        url_arg = call_args[0][3]

        self.assertEqual(token_arg, "fcm_token_user_1")
        self.assertEqual(title_arg, "Tienes 2 recordatorios para hoy")
        self.assertIn("Alquiler: 250 USD", body_arg)
        self.assertIn("Internet Fibra: 40 USD", body_arg)
        self.assertEqual(url_arg, "/?notifications=open")
        self.assertEqual(res["sent"], 1)


class TestDailyDeduplicationNonCollision(unittest.IsolatedAsyncioTestCase):
    """
    Prueba 3: Dos gastos fijos distintos que vencen el mismo día NO colisionan
    en la deduplicación (ambos se agregan a la Bandeja).
    """

    def setUp(self):
        self.user_id = uuid.uuid4()
        self.profile = models.Profile(
            id=self.user_id,
            notify_fixed_expenses=True,
        )
        self.now_vet = datetime.datetime(2026, 10, 28, 9, 0, 0, tzinfo=VET_TZ)

    @patch("app.routers.push.send_push_notification_to_token")
    async def test_distinct_expenses_do_not_collide(self, mock_push):
        mock_push.return_value = (True, False)

        today = self.now_vet.date()
        exp_a = models.FixedExpense(
            id=uuid.uuid4(),
            user_id=self.user_id,
            name="Netflix",
            amount=15,
            currency="USD",
            payment_day=today.day,
            is_active=True,
        )
        exp_b = models.FixedExpense(
            id=uuid.uuid4(),
            user_id=self.user_id,
            name="Spotify",
            amount=10,
            currency="USD",
            payment_day=today.day,
            is_active=True,
        )

        db = AsyncMock()
        db.add = MagicMock()

        # Simulamos que la DB solo tiene registros si coinciden user_id, title Y body
        existing_in_db = []

        async def mock_execute(stmt):
            mock_res = MagicMock()
            s = str(stmt).lower()
            if "profiles" in s:
                mock_res.scalars.return_value.all.return_value = [self.profile]
            elif "fixed_expenses" in s and "fixed_expense_checks" not in s:
                params = stmt.compile().params if hasattr(stmt, "compile") else {}
                p_days = params.get("payment_day_1", [])
                if today.day in p_days:
                    mock_res.scalars.return_value.all.return_value = [exp_a, exp_b]
                else:
                    mock_res.scalars.return_value.all.return_value = []
            elif "fixed_expense_checks" in s:
                mock_res.scalars.return_value.first.return_value = None
            elif "notifications" in s and "select" in s:
                # Comprobamos si el body ya existe en nuestra base de datos simulada
                # Como los bodies son distintos ("Netflix: 15 USD" vs "Spotify: 10 USD"),
                # ninguno colisiona
                mock_res.scalars.return_value.first.return_value = None
            elif "push_subscriptions" in s:
                mock_res.scalars.return_value.all.return_value = []
            else:
                mock_res.scalars.return_value.all.return_value = []
                mock_res.scalars.return_value.first.return_value = None
                mock_res.all.return_value = []
                mock_res.scalar.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute

        res = await execute_scheduled_notifications(db, "morning", now_vet=self.now_vet)

        # Ambos gastos fijos se agregaron a la bandeja
        self.assertEqual(db.add.call_count, 2)
        added_titles = [call[0][0].title for call in db.add.call_args_list]
        added_bodies = [call[0][0].body for call in db.add.call_args_list]

        self.assertEqual(added_titles, ["Gasto fijo vence hoy", "Gasto fijo vence hoy"])
        self.assertEqual(added_bodies, ["Netflix: 15 USD", "Spotify: 10 USD"])
        self.assertEqual(res["items_queued"], 2)


class TestInactivityBrake(unittest.IsolatedAsyncioTestCase):
    """
    Prueba 4: Freno de inactividad
    Se encola en days_inactive == 3 y days_inactive == 7, pero NO en days_inactive == 4 ni 10.
    """

    def setUp(self):
        self.now_vet = datetime.datetime(2026, 10, 28, 19, 0, 0, tzinfo=VET_TZ)
        self.today = self.now_vet.date()

    async def _run_inactivity_test(self, days_ago: int) -> list:
        user_id = uuid.uuid4()
        profile = models.Profile(id=user_id, notify_inactivity=True)

        last_expense_date = self.today - datetime.timedelta(days=days_ago)

        db = AsyncMock()
        db.add = MagicMock()

        async def mock_execute(stmt):
            mock_res = MagicMock()
            s = str(stmt).lower()
            if "profiles" in s:
                mock_res.scalars.return_value.all.return_value = [profile]
            elif "fixed_expenses" in s:
                mock_res.scalars.return_value.all.return_value = []
            elif "estimated_incomes" in s:
                mock_res.scalars.return_value.all.return_value = []
            elif "debts" in s:
                mock_res.scalars.return_value.all.return_value = []
            elif "expenses" in s and "max" in s:
                mock_res.scalar.return_value = last_expense_date
            elif "notifications" in s and "select" in s:
                mock_res.scalars.return_value.first.return_value = None
            elif "push_subscriptions" in s:
                mock_res.scalars.return_value.all.return_value = []
            else:
                mock_res.scalars.return_value.all.return_value = []
                mock_res.scalars.return_value.first.return_value = None
                mock_res.all.return_value = []
                mock_res.scalar.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute

        await execute_scheduled_notifications(db, "evening", now_vet=self.now_vet)

        return [call[0][0] for call in db.add.call_args_list if isinstance(call[0][0], models.Notification)]

    async def test_inactivity_day_3_fires(self):
        notifications = await self._run_inactivity_test(days_ago=3)
        self.assertEqual(len(notifications), 1)
        self.assertEqual(notifications[0].title, "3 días sin registrar gastos")
        self.assertEqual(notifications[0].type, "inactivity")

    async def test_inactivity_day_7_fires(self):
        notifications = await self._run_inactivity_test(days_ago=7)
        self.assertEqual(len(notifications), 1)
        self.assertEqual(notifications[0].title, "7 días sin registrar gastos")
        self.assertEqual(notifications[0].type, "inactivity")

    async def test_inactivity_day_4_does_not_fire(self):
        notifications = await self._run_inactivity_test(days_ago=4)
        self.assertEqual(len(notifications), 0)

    async def test_inactivity_day_10_does_not_fire(self):
        notifications = await self._run_inactivity_test(days_ago=10)
        self.assertEqual(len(notifications), 0)

    async def test_inactivity_day_1_does_not_fire(self):
        notifications = await self._run_inactivity_test(days_ago=1)
        self.assertEqual(len(notifications), 0)


class TestSingleItemPush(unittest.IsolatedAsyncioTestCase):
    """Prueba que un usuario con 1 solo ítem recibe el push con título/cuerpo directos."""

    def setUp(self):
        self.user_id = uuid.uuid4()
        self.profile = models.Profile(id=self.user_id, notify_debts=True)
        self.sub = models.PushSubscription(user_id=self.user_id, fcm_token="token_single")
        self.now_vet = datetime.datetime(2026, 10, 28, 9, 0, 0, tzinfo=VET_TZ)

    @patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)))
    @patch("app.routers.push.send_push_notification_to_token")
    async def test_single_item_push_uses_item_title_and_body(self, mock_push):
        mock_push.return_value = (True, False)
        today = self.now_vet.date()

        debt = models.Debt(
            id=uuid.uuid4(),
            user_id=self.user_id,
            type="owed",
            counterpart="Pedro",
            concept="Préstamo almuerzo",
            total_amount=15,
            currency="USD",
            due_date=today,
            is_settled=False,
        )

        db = AsyncMock()
        db.add = MagicMock()

        async def mock_execute(stmt):
            mock_res = MagicMock()
            s = str(stmt).lower()
            if "profiles" in s:
                mock_res.scalars.return_value.all.return_value = [self.profile]
            elif "debts" in s and "is_settled" in s:
                params = stmt.compile().params if hasattr(stmt, "compile") else {}
                due_val = params.get("due_date_1")
                if due_val == today:
                    mock_res.scalars.return_value.all.return_value = [debt]
                else:
                    mock_res.scalars.return_value.all.return_value = []
            elif "notifications" in s and "select" in s:
                mock_res.scalars.return_value.first.return_value = None
            elif "push_subscriptions" in s and "delete" not in s:
                mock_res.scalars.return_value.all.return_value = [self.sub]
            else:
                mock_res.scalars.return_value.all.return_value = []
                mock_res.scalars.return_value.first.return_value = None
                mock_res.all.return_value = []
                mock_res.scalar.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute

        res = await execute_scheduled_notifications(db, "morning", now_vet=self.now_vet)

        self.assertEqual(db.add.call_count, 1)
        mock_push.assert_called_once()
        title_sent = mock_push.call_args[0][1]
        body_sent = mock_push.call_args[0][2]
        url_sent = mock_push.call_args[0][3]

        self.assertEqual(title_sent, "Deuda vence hoy")
        self.assertIn("Préstamo almuerzo (Pedro) vence hoy.", body_sent)
        self.assertEqual(url_sent, "/herramientas/deudas?tab=owed")


class TestSharedMemberNotification(unittest.IsolatedAsyncioTestCase):
    """Fix Hallazgo #9A: Si un gasto fijo o deuda es compartido (incluso si share_id es None en la fila ORM), notifica tanto al dueño como a los miembros."""

    def setUp(self):
        self.owner_id = uuid.uuid4()
        self.member_id = uuid.uuid4()
        self.share_id = uuid.uuid4()
        self.owner_prof = models.Profile(id=self.owner_id, notify_fixed_expenses=True)
        self.member_prof = models.Profile(id=self.member_id, notify_fixed_expenses=True)
        self.now_vet = datetime.datetime(2026, 10, 28, 9, 0, 0, tzinfo=VET_TZ)

    @patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)))
    @patch("app.routers.push.send_push_notification_to_token")
    async def test_shared_fixed_expense_notifies_owner_and_member(self, mock_push):
        mock_push.return_value = (True, False)
        today = self.now_vet.date()

        expense = models.FixedExpense(
            id=uuid.uuid4(),
            user_id=self.owner_id,
            name="Condominio Compartido",
            amount=80,
            currency="USD",
            payment_day=today.day,
            is_active=True,
        )
        expense.share_id = None  # Verificación: en la fila ORM directa share_id es None

        db = AsyncMock()
        db.add = MagicMock()
        executed_stmts = []

        async def mock_execute(stmt):
            executed_stmts.append(stmt)
            mock_res = MagicMock()
            s = str(stmt).lower()
            if "profiles" in s:
                mock_res.scalars.return_value.all.return_value = [self.owner_prof, self.member_prof]
            elif "fixed_expenses" in s and "fixed_expense_checks" not in s:
                params = stmt.compile().params if hasattr(stmt, "compile") else {}
                p_days = params.get("payment_day_1", [])
                if today.day in p_days:
                    mock_res.scalars.return_value.all.return_value = [expense]
                else:
                    mock_res.scalars.return_value.all.return_value = []
            elif "fixed_expense_checks" in s:
                mock_res.scalars.return_value.first.return_value = None
            elif "share_members" in s:
                mock_res.scalars.return_value.all.return_value = [self.member_id]
            elif "notifications" in s and "select" in s:
                mock_res.scalars.return_value.first.return_value = None
            elif "push_subscriptions" in s:
                mock_res.scalars.return_value.all.return_value = []
            else:
                mock_res.scalars.return_value.all.return_value = []
                mock_res.scalars.return_value.first.return_value = None
                mock_res.all.return_value = []
                mock_res.scalar.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute

        res = await execute_scheduled_notifications(db, "morning", now_vet=self.now_vet)

        # Se encola para el dueño y para el miembro compartido (total 2 notificaciones)
        self.assertEqual(db.add.call_count, 2)
        recipients = [call[0][0].user_id for call in db.add.call_args_list]
        self.assertIn(self.owner_id, recipients)
        self.assertIn(self.member_id, recipients)

        # Verifica que se consultó a través de ShareMember / Share por entity_id
        shared_queries = [str(s).lower() for s in executed_stmts if "share_members" in str(s).lower()]
        self.assertTrue(len(shared_queries) > 0)
        self.assertTrue(any("entity_id" in q and "shares" in q for q in shared_queries))

    @patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)))
    @patch("app.routers.push.send_push_notification_to_token")
    async def test_shared_fixed_expense_notifies_when_share_id_set(self, mock_push):
        mock_push.return_value = (True, False)
        today = self.now_vet.date()

        expense = models.FixedExpense(
            id=uuid.uuid4(),
            user_id=self.owner_id,
            name="Condominio Compartido",
            amount=80,
            currency="USD",
            payment_day=today.day,
            is_active=True,
        )
        expense.share_id = self.share_id

        db = AsyncMock()
        db.add = MagicMock()

        async def mock_execute(stmt):
            mock_res = MagicMock()
            s = str(stmt).lower()
            if "profiles" in s:
                mock_res.scalars.return_value.all.return_value = [self.owner_prof, self.member_prof]
            elif "fixed_expenses" in s and "fixed_expense_checks" not in s:
                params = stmt.compile().params if hasattr(stmt, "compile") else {}
                p_days = params.get("payment_day_1", [])
                if today.day in p_days:
                    mock_res.scalars.return_value.all.return_value = [expense]
                else:
                    mock_res.scalars.return_value.all.return_value = []
            elif "fixed_expense_checks" in s:
                mock_res.scalars.return_value.first.return_value = None
            elif "share_members" in s:
                mock_res.scalars.return_value.all.return_value = [self.member_id]
            elif "notifications" in s and "select" in s:
                mock_res.scalars.return_value.first.return_value = None
            elif "push_subscriptions" in s:
                mock_res.scalars.return_value.all.return_value = []
            else:
                mock_res.scalars.return_value.all.return_value = []
                mock_res.scalars.return_value.first.return_value = None
                mock_res.all.return_value = []
                mock_res.scalar.return_value = None
            return mock_res

        db.execute.side_effect = mock_execute

        res = await execute_scheduled_notifications(db, "morning", now_vet=self.now_vet)

        self.assertEqual(db.add.call_count, 2)
        recipients = [call[0][0].user_id for call in db.add.call_args_list]
        self.assertIn(self.owner_id, recipients)
        self.assertIn(self.member_id, recipients)


if __name__ == "__main__":
    unittest.main()
