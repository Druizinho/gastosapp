import os
import sys
from pathlib import Path
from decimal import Decimal
from uuid import UUID, uuid4
import unittest
from unittest.mock import AsyncMock, patch

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Prevent network I/O during imports and database operations
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@127.0.0.1/db"
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: None

from app import models, schemas, sharing, crud_debts, crud_savings, crud_fixed_expenses


def sync_run(async_fn):
    """Zero-socketpair coroutine driver for Windows sandbox execution."""
    def wrapper(self, *args, **kwargs):
        coro = async_fn(self, *args, **kwargs)
        try:
            while True:
                coro.send(None)
        except StopIteration as e:
            return e.value
    return wrapper


class MockResult:
    def __init__(self, rows=None):
        self._rows = rows or []

    def scalars(self):
        class ScalarMock:
            def __init__(self, items):
                self._items = items

            def all(self):
                return list(self._items)

            def first(self):
                return self._items[0] if self._items else None

            def unique(self):
                return self

        return ScalarMock(self._rows)

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None

    def scalar(self):
        return self._rows[0] if self._rows else None


class InMemoryStore:
    def __init__(self):
        self.profiles: dict[UUID, models.Profile] = {}
        self.connections: list[models.Connection] = []
        self.debts: dict[UUID, models.Debt] = {}
        self.saving_goals: dict[UUID, models.SavingGoal] = {}
        self.fixed_expenses: dict[UUID, models.FixedExpense] = {}
        self.shares: dict[UUID, models.Share] = {}
        self.share_members: list[models.ShareMember] = []
        self.categories: list[models.Category] = []

    def add_user(self, user_id: UUID, name: str) -> models.Profile:
        p = models.Profile(id=user_id, display_name=name)
        self.profiles[user_id] = p
        return p

    def add_pana(self, u1: UUID, u2: UUID):
        c = models.Connection(id=uuid4(), requester_id=u1, receiver_id=u2, status="accepted")
        self.connections.append(c)


class MockAsyncSession:
    def __init__(self, store: InMemoryStore):
        self.store = store

    def add(self, obj):
        if isinstance(obj, models.Debt):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if getattr(obj, "payments", None) is None:
                obj.payments = []
            self.store.debts[obj.id] = obj
        elif isinstance(obj, models.SavingGoal):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if getattr(obj, "deposits", None) is None:
                obj.deposits = []
            self.store.saving_goals[obj.id] = obj
        elif isinstance(obj, models.FixedExpense):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if getattr(obj, "checks", None) is None:
                obj.checks = []
            self.store.fixed_expenses[obj.id] = obj
        elif isinstance(obj, models.Share):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if getattr(obj, "members", None) is None:
                obj.members = []
            self.store.shares[obj.id] = obj
        elif isinstance(obj, models.ShareMember):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if obj not in self.store.share_members:
                self.store.share_members.append(obj)
            s = self.store.shares.get(obj.share_id)
            if s:
                if getattr(s, "members", None) is None:
                    s.members = []
                if obj not in s.members:
                    s.members.append(obj)
                obj.share = s
            obj.profile = self.store.profiles.get(obj.user_id)
        elif isinstance(obj, models.Profile):
            self.store.profiles[obj.id] = obj
        elif isinstance(obj, models.Connection):
            self.store.connections.append(obj)

    async def delete(self, obj):
        if isinstance(obj, models.Share):
            self.store.shares.pop(obj.id, None)
            self.store.share_members = [sm for sm in self.store.share_members if sm.share_id != obj.id]
        elif isinstance(obj, models.ShareMember):
            if obj in self.store.share_members:
                self.store.share_members.remove(obj)
            s = self.store.shares.get(obj.share_id)
            if s and getattr(s, "members", None) and obj in s.members:
                s.members.remove(obj)
        elif isinstance(obj, models.Debt):
            self.store.debts.pop(obj.id, None)
        elif isinstance(obj, models.SavingGoal):
            self.store.saving_goals.pop(obj.id, None)
        elif isinstance(obj, models.FixedExpense):
            self.store.fixed_expenses.pop(obj.id, None)

    async def get(self, model_cls, entity_id):
        if model_cls == models.Share:
            return self.store.shares.get(entity_id)
        elif model_cls == models.Profile:
            return self.store.profiles.get(entity_id)
        elif model_cls == models.Debt:
            return self.store.debts.get(entity_id)
        elif model_cls == models.SavingGoal:
            return self.store.saving_goals.get(entity_id)
        elif model_cls == models.FixedExpense:
            return self.store.fixed_expenses.get(entity_id)
        return None

    async def flush(self):
        for s in self.store.shares.values():
            if not getattr(s, "id", None):
                s.id = uuid4()
        for sm in self.store.share_members:
            if not getattr(sm, "id", None):
                sm.id = uuid4()

    async def commit(self):
        await self.flush()

    async def refresh(self, obj):
        pass

    def expire_all(self):
        pass

    async def execute(self, stmt, *args, **kwargs):
        cds = getattr(stmt, "column_descriptions", [])
        entities = [cd.get("entity") for cd in cds]
        names = [cd.get("name") for cd in cds]
        compiled = stmt.compile()
        params = compiled.params
        sql = str(stmt).lower()

        # 1. Connection query
        if entities == [models.Connection] or "connections" in sql and not entities:
            uid = next((v for k, v in params.items() if isinstance(v, UUID)), None)
            matched = [
                c for c in self.store.connections
                if c.status == "accepted" and (not uid or c.requester_id == uid or c.receiver_id == uid)
            ]
            return MockResult(matched)

        # 2. Profile query
        if entities == [models.Profile]:
            target_ids = []
            for k, v in params.items():
                if isinstance(v, (UUID, str)):
                    target_ids.append(v)
                elif isinstance(v, (list, tuple, set)):
                    target_ids.extend(v)
            matched = [p for uid, p in self.store.profiles.items() if not target_ids or uid in target_ids]
            return MockResult(matched)

        # 3. Share + ShareMember joins
        if entities == [models.Share, models.ShareMember]:
            eid = next((v for k, v in params.items() if "entity_id" in k), None)
            uid = next((v for k, v in params.items() if "user_id" in k), None)
            for sm in self.store.share_members:
                if (not eid or sm.entity_id == eid) and (not uid or sm.user_id == uid):
                    sh = self.store.shares.get(sm.share_id)
                    if sh:
                        return MockResult([(sh, sm)])
            return MockResult([])

        if entities == [models.ShareMember, models.Share]:
            sids = next((v for k, v in params.items() if "share_id" in k), None)
            sid_set = set(sids) if isinstance(sids, (list, tuple, set)) else ({sids} if sids else set(self.store.shares.keys()))
            rows = []
            for sm in self.store.share_members:
                if sm.share_id in sid_set:
                    sh = self.store.shares.get(sm.share_id)
                    if sh:
                        rows.append((sm, sh))
            return MockResult(rows)

        # 4. ShareMember queries
        if entities == [models.ShareMember]:
            sid = next((v for k, v in params.items() if "share_id" in k), None)
            if sid:
                matched = [sm for sm in self.store.share_members if sm.share_id == sid]
                return MockResult(matched)

            uid = next((v for k, v in params.items() if "user_id" in k), None)
            eids = next((v for k, v in params.items() if "entity_id" in k), None)
            eid_set = set(eids) if isinstance(eids, (list, tuple, set)) else ({eids} if eids else None)
            matched = [
                sm for sm in self.store.share_members
                if (not uid or sm.user_id == uid) and (not eid_set or sm.entity_id in eid_set)
            ]
            return MockResult(matched)

        # 5. Debt queries
        if entities == [models.Debt]:
            did = next((v for k, v in params.items() if "id" in k and isinstance(v, UUID)), None)
            if did and did in self.store.debts:
                return MockResult([self.store.debts[did]])
            return MockResult(list(self.store.debts.values()))

        # 6. SavingGoal queries
        if entities == [models.SavingGoal]:
            gid = next((v for k, v in params.items() if "id" in k and isinstance(v, UUID)), None)
            if gid and gid in self.store.saving_goals:
                return MockResult([self.store.saving_goals[gid]])
            return MockResult(list(self.store.saving_goals.values()))

        # 7. FixedExpense queries
        if entities == [models.FixedExpense]:
            fid = next((v for k, v in params.items() if "id" in k and isinstance(v, UUID)), None)
            if fid and fid in self.store.fixed_expenses:
                return MockResult([self.store.fixed_expenses[fid]])
            return MockResult(list(self.store.fixed_expenses.values()))

        # 8. Category queries
        if names == ["name"] and "categories" in sql or "categories" in sql:
            return MockResult([c.name for c in self.store.categories] or ["Deudas", "Gastos Fijos", "Ahorro", "Proyectos"])

        return MockResult([])


class TestShareSyncAndMutations(unittest.TestCase):

    def setUp(self):
        self.store = InMemoryStore()
        self.db = MockAsyncSession(self.store)

    @sync_run
    @patch("app.sharing.notify_members", new_callable=AsyncMock)
    @patch("app.sharing.recompute_settlement", new_callable=AsyncMock)
    async def test_update_debt_share_creation_and_member_sync(self, mock_recompute, mock_notify):
        """
        1. Create an individual debt.
        2. Update with shared_with_ids=[u2.id], verify is_shared == True and len(shared_members) == 2.
        3. Update with shared_with_ids=[u2.id, u3.id], admin_ids=[u2.id], verify len(shared_members) == 3 and u2 role is 'admin'.
        4. Update with shared_with_ids=[u3.id], verify u2 is removed and len(shared_members) == 2.
        """
        u1 = uuid4()
        u2 = uuid4()
        u3 = uuid4()

        self.store.add_user(u1, "User 1")
        self.store.add_user(u2, "User 2")
        self.store.add_user(u3, "User 3")
        self.store.add_pana(u1, u2)
        self.store.add_pana(u1, u3)

        # 1. Create individual debt
        debt_in = schemas.DebtCreate(
            concept="Préstamo Pana",
            total_amount=Decimal("120"),
            currency=schemas.CurrencyType.USD_BCV,
            type="receivable",
            counterpart="Amigos",
            category="Deudas",
        )
        debt = await crud_debts.create_debt(self.db, debt_in, u1)
        self.assertFalse(debt.is_shared)
        self.assertEqual(len(debt.shared_members), 0)

        # 2. Update with shared_with_ids=[u2] -> is_shared == True, len(shared_members) == 2
        debt = await crud_debts.update_debt(
            self.db, debt.id, schemas.DebtUpdate(shared_with_ids=[u2]), u1
        )
        self.assertTrue(debt.is_shared)
        self.assertEqual(len(debt.shared_members), 2)
        member_ids = {m.user_id for m in debt.shared_members}
        self.assertEqual(member_ids, {u1, u2})

        # 3. Update with shared_with_ids=[u2, u3], admin_ids=[u2] -> len(shared_members) == 3, u2 is 'admin'
        debt = await crud_debts.update_debt(
            self.db, debt.id, schemas.DebtUpdate(shared_with_ids=[u2, u3], admin_ids=[u2]), u1
        )
        self.assertTrue(debt.is_shared)
        self.assertEqual(len(debt.shared_members), 3)
        u2_member = next(m for m in debt.shared_members if m.user_id == u2)
        role_val = u2_member.role.value if hasattr(u2_member.role, "value") else str(u2_member.role)
        self.assertEqual(role_val, "admin")

        # 4. Update with shared_with_ids=[u3] -> u2 removed, len(shared_members) == 2
        debt = await crud_debts.update_debt(
            self.db, debt.id, schemas.DebtUpdate(shared_with_ids=[u3]), u1
        )
        self.assertTrue(debt.is_shared)
        self.assertEqual(len(debt.shared_members), 2)
        member_ids = {m.user_id for m in debt.shared_members}
        self.assertNotIn(u2, member_ids)
        self.assertIn(u3, member_ids)
        self.assertIn(u1, member_ids)

    @sync_run
    @patch("app.sharing.notify_members", new_callable=AsyncMock)
    @patch("app.sharing.recompute_settlement", new_callable=AsyncMock)
    async def test_remove_last_member_dissolves_share_and_returns_flag(self, mock_recompute, mock_notify):
        """
        1. Calling sharing.remove_member on the last non-owner member returns True (share_deleted == True).
        2. Subsequent get_debt returns is_shared == False.
        """
        u1 = uuid4()
        u2 = uuid4()

        self.store.add_user(u1, "User 1")
        self.store.add_user(u2, "User 2")
        self.store.add_pana(u1, u2)

        # Create shared debt with u2
        debt_in = schemas.DebtCreate(
            concept="Alquiler Compartido",
            total_amount=Decimal("300"),
            currency=schemas.CurrencyType.USD_BCV,
            type="receivable",
            counterpart="Roommate",
            category="Deudas",
            shared_with_ids=[u2]
        )
        debt = await crud_debts.create_debt(self.db, debt_in, u1)
        self.assertTrue(debt.is_shared)
        self.assertEqual(len(debt.shared_members), 2)

        # Get share object
        membership = await sharing.get_membership(self.db, debt.id, u1)
        self.assertIsNotNone(membership)
        share = membership[0] if isinstance(membership, (tuple, list)) else membership.share

        # Remove last non-owner member (u2)
        share_deleted = await sharing.remove_member(self.db, share, u2)
        self.assertTrue(share_deleted, "remove_member on last non-owner must return True")

        # Subsequent get_debt returns is_shared == False
        debt_after = await crud_debts.get_debt(self.db, debt.id, u1)
        self.assertFalse(debt_after.is_shared)
        self.assertEqual(len(debt_after.shared_members), 0)

    @sync_run
    @patch("app.sharing.notify_members", new_callable=AsyncMock)
    @patch("app.sharing.recompute_settlement", new_callable=AsyncMock)
    async def test_update_saving_goal_and_fixed_expense_sync_share_members(self, mock_recompute, mock_notify):
        """
        Verifies update_saving_goal and update_fixed_expense reconcile added and removed Panas
        on already-shared items and return fresh shared_members.
        """
        u1 = uuid4()
        u2 = uuid4()
        u3 = uuid4()

        self.store.add_user(u1, "User 1")
        self.store.add_user(u2, "User 2")
        self.store.add_user(u3, "User 3")
        self.store.add_pana(u1, u2)
        self.store.add_pana(u1, u3)

        # ── Saving Goal Sync ──────────────────────────────
        goal_in = schemas.SavingGoalCreate(
            name="Ahorro Playa",
            target_amount=Decimal("800"),
            currency=schemas.CurrencyType.USD_BCV,
            type="saving",
            category="Ahorro",
            shared_with_ids=[u2]
        )
        goal = await crud_savings.create_saving_goal(self.db, goal_in, u1)
        self.assertTrue(goal.is_shared)
        self.assertEqual(len(goal.shared_members), 2)

        # Reconcile added: add u3
        goal = await crud_savings.update_saving_goal(
            self.db, goal.id, schemas.SavingGoalUpdate(shared_with_ids=[u2, u3]), u1
        )
        self.assertEqual(len(goal.shared_members), 3)
        uids = {m.user_id for m in goal.shared_members}
        self.assertEqual(uids, {u1, u2, u3})

        # Reconcile removed: remove u2
        goal = await crud_savings.update_saving_goal(
            self.db, goal.id, schemas.SavingGoalUpdate(shared_with_ids=[u3]), u1
        )
        self.assertEqual(len(goal.shared_members), 2)
        uids = {m.user_id for m in goal.shared_members}
        self.assertEqual(uids, {u1, u3})
        self.assertNotIn(u2, uids)

        # ── Fixed Expense Sync ────────────────────────────
        fe_in = schemas.FixedExpenseCreate(
            name="Netflix Compartido",
            amount=Decimal("20"),
            currency=schemas.CurrencyType.USD_BCV,
            category="Gastos Fijos",
            shared_with_ids=[u2]
        )
        fe = await crud_fixed_expenses.create_fixed_expense(self.db, fe_in, u1)
        self.assertTrue(fe.is_shared)
        self.assertEqual(len(fe.shared_members), 2)

        # Reconcile added: add u3 with admin role
        fe = await crud_fixed_expenses.update_fixed_expense(
            self.db, fe.id, schemas.FixedExpenseUpdate(shared_with_ids=[u2, u3], admin_ids=[u3]), u1
        )
        self.assertEqual(len(fe.shared_members), 3)
        uids = {m.user_id for m in fe.shared_members}
        self.assertEqual(uids, {u1, u2, u3})
        u3_m = next(m for m in fe.shared_members if m.user_id == u3)
        role_val = u3_m.role.value if hasattr(u3_m.role, "value") else str(u3_m.role)
        self.assertEqual(role_val, "admin")

        # Reconcile removed: remove u2
        fe = await crud_fixed_expenses.update_fixed_expense(
            self.db, fe.id, schemas.FixedExpenseUpdate(shared_with_ids=[u3]), u1
        )
        self.assertEqual(len(fe.shared_members), 2)
        uids = {m.user_id for m in fe.shared_members}
        self.assertEqual(uids, {u1, u3})
        self.assertNotIn(u2, uids)


if __name__ == "__main__":
    unittest.main()
