import sys
import os
import signal
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import uuid
from decimal import Decimal

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

from app import models, sharing, crud


class TestSharedInitialCategory(unittest.IsolatedAsyncioTestCase):

    async def test_resolve_initial_member_category_returns_sin_categoria(self):
        db = AsyncMock()
        target_user_id = uuid.uuid4()

        cases = [
            ("debt", "Deudas"),
            ("debt", "Alquiler"),
            ("fixed_expense", "Alquiler"),
            ("fixed_expense", "Gastos Fijos"),
            ("saving_goal", "Ahorro"),
            ("saving_goal", "Proyectos"),
        ]

        for entity_type, owner_cat in cases:
            owner_entity = MagicMock()
            owner_entity.category = owner_cat
            owner_entity.type = "saving"

            result = await sharing.resolve_initial_member_category(
                db=db,
                target_user_id=target_user_id,
                entity_type=entity_type,
                owner_entity=owner_entity,
            )
            self.assertEqual(
                result,
                "Sin Categoría",
                f"Failed for entity_type={entity_type}, owner_cat={owner_cat}",
            )

    async def test_create_share_sets_sin_categoria_for_invited_members_and_preserves_owner(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        owner_id = uuid.uuid4()
        invited_id = uuid.uuid4()

        owner_entity = MagicMock()
        owner_entity.id = uuid.uuid4()
        owner_entity.category = "Alquiler"

        added_items = []
        db.add.side_effect = lambda item: added_items.append(item)

        await sharing.create_share(
            db=db,
            entity_type="debt",
            owner_id=owner_id,
            owner_entity=owner_entity,
            target_ids=[invited_id],
        )

        owner_members = [
            item for item in added_items
            if isinstance(item, models.ShareMember) and item.user_id == owner_id
        ]
        invited_members = [
            item for item in added_items
            if isinstance(item, models.ShareMember) and item.user_id == invited_id
        ]

        self.assertEqual(len(owner_members), 1)
        self.assertEqual(owner_members[0].local_category, "Alquiler")

        self.assertEqual(len(invited_members), 1)
        self.assertEqual(invited_members[0].local_category, "Sin Categoría")

    async def test_enrich_shared_entities_never_leaks_owner_category_to_member(self):
        owner_id = uuid.uuid4()
        invited_id = uuid.uuid4()
        share_id = uuid.uuid4()
        entity_id = uuid.uuid4()

        share = models.Share(
            id=share_id,
            entity_type="debt",
            owner_id=owner_id,
        )

        owner_member = models.ShareMember(
            share_id=share_id,
            user_id=owner_id,
            entity_id=entity_id,
            role="admin",
            local_category="Alquiler",
        )

        # Test case A: invited member with local_category = None
        invited_member_none = models.ShareMember(
            share_id=share_id,
            user_id=invited_id,
            entity_id=entity_id,
            role="member",
            local_category=None,
        )

        owner_profile = models.Profile(id=owner_id, display_name="Owner User")
        invited_profile = models.Profile(id=invited_id, display_name="Invited User")

        # Mock db queries for populate_share_meta / enrich_shared_entities
        def make_db_mock(my_sm):
            mock_db = AsyncMock()
            mock_db.add = MagicMock()
            q1_res = MagicMock()
            q1_res.scalars.return_value.all.return_value = [my_sm]

            q2_res = MagicMock()
            q2_res.all.return_value = [(owner_member, share), (my_sm, share)]

            q3_res = MagicMock()
            q3_res.scalars.return_value.all.return_value = [owner_profile, invited_profile]

            q4_res = MagicMock()
            q4_res.scalars.return_value.all.return_value = []

            mock_db.execute.side_effect = [q1_res, q2_res, q3_res, q4_res]
            return mock_db

        debt_entity_a = models.Debt(
            id=entity_id,
            user_id=owner_id,
            category="Alquiler",
            concept="Debt Test",
            total_amount=Decimal("100.00"),
            currency="BS",
        )
        debt_entity_a.payments = []

        enrich_fn = getattr(sharing, "enrich_shared_entities")
        await enrich_fn(make_db_mock(invited_member_none), [debt_entity_a], invited_id, "debt")
        self.assertEqual(debt_entity_a.category, "Sin Categoría")
        self.assertNotEqual(debt_entity_a.category, "Alquiler")

        # Test case B: invited member with local_category = "Sin Categoría"
        invited_member_sc = models.ShareMember(
            share_id=share_id,
            user_id=invited_id,
            entity_id=entity_id,
            role="member",
            local_category="Sin Categoría",
        )

        debt_entity_b = models.Debt(
            id=entity_id,
            user_id=owner_id,
            category="Alquiler",
            concept="Debt Test 2",
            total_amount=Decimal("200.00"),
            currency="BS",
        )
        debt_entity_b.payments = []

        await enrich_fn(make_db_mock(invited_member_sc), [debt_entity_b], invited_id, "debt")
        self.assertEqual(debt_entity_b.category, "Sin Categoría")
        self.assertNotEqual(debt_entity_b.category, "Alquiler")

    @patch("app.crud.get_category", new_callable=AsyncMock)
    async def test_delete_category_reassigns_share_member_local_category_to_target_category(self, mock_get_cat):
        user_id = uuid.uuid4()
        cat_id = uuid.uuid4()
        db_category = models.Category(id=cat_id, user_id=user_id, name="Viajes")
        mock_get_cat.return_value = db_category

        db = AsyncMock()
        db.delete = AsyncMock()
        db.commit = AsyncMock()

        executed_statements = []

        async def mock_execute(stmt, *args, **kwargs):
            executed_statements.append(stmt)
            res = MagicMock()
            res.scalars.return_value.all.return_value = []
            return res

        db.execute = AsyncMock(side_effect=mock_execute)

        res = await crud.delete_category(db, cat_id, user_id, reassign_to=None)
        self.assertTrue(res)

        share_member_updates = [
            stmt for stmt in executed_statements
            if hasattr(stmt, "table") and stmt.table.name == "share_members"
        ]
        self.assertEqual(len(share_member_updates), 1)
        params = share_member_updates[0].compile().params
        # Check that local_category was reassigned to target_category ("Sin Categoría") rather than None
        self.assertEqual(params.get("local_category"), "Sin Categoría")

