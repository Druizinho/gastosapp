import unittest
import uuid
import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from contextlib import asynccontextmanager

from app import crud_budgets
from app.user_resolver import (
    extract_raw_meta,
    resolve_name_and_avatar,
    fetch_auth_users_map,
    find_auth_user_by_email,
    get_or_hydrate_profile,
)
from app import models


class TestUserResolverSync(unittest.TestCase):
    def test_resolve_name_from_profile_display_name(self):
        name, _ = resolve_name_and_avatar(
            display_name="Carlos Gomez",
            raw_user_meta_data={"full_name": "Ignored", "name": "Ignored"},
            email="carlos@example.com",
            default_name="Usuario"
        )
        self.assertEqual(name, "Carlos Gomez")

    def test_resolve_name_from_meta_full_name(self):
        name, _ = resolve_name_and_avatar(
            display_name=None,
            raw_user_meta_data={"full_name": "Maria Rodriguez", "name": "Maria"},
            email="maria@example.com"
        )
        self.assertEqual(name, "Maria Rodriguez")

        # Also when display_name is empty string
        name, _ = resolve_name_and_avatar(
            display_name="   ",
            raw_user_meta_data={"full_name": "Maria Rodriguez"},
            email="maria@example.com"
        )
        self.assertEqual(name, "Maria Rodriguez")

    def test_resolve_name_from_meta_name(self):
        name, _ = resolve_name_and_avatar(
            display_name="",
            raw_user_meta_data={"name": "Alejandro"},
            email="ale@example.com"
        )
        self.assertEqual(name, "Alejandro")

    def test_resolve_name_from_meta_user_name(self):
        name, _ = resolve_name_and_avatar(
            display_name=None,
            raw_user_meta_data={"user_name": "ale_dev"},
            email="ale@example.com"
        )
        self.assertEqual(name, "ale_dev")

    def test_resolve_name_from_email_prefix(self):
        name, _ = resolve_name_and_avatar(
            display_name=None,
            raw_user_meta_data={},
            email="diego.silva@example.com"
        )
        self.assertEqual(name, "diego.silva")

    def test_resolve_name_fallback_usuario(self):
        name, _ = resolve_name_and_avatar(
            display_name=None,
            raw_user_meta_data={},
            email=None,
            default_name="Usuario"
        )
        self.assertEqual(name, "Usuario")

        # Custom default name
        name, _ = resolve_name_and_avatar(
            display_name="   ",
            raw_user_meta_data=None,
            email="",
            default_name="Pana"
        )
        self.assertEqual(name, "Pana")

    def test_resolve_avatar_from_profile(self):
        _, avatar = resolve_name_and_avatar(
            avatar_url="https://res.cloudinary.com/custom_avatar.png",
            raw_user_meta_data={"avatar_url": "https://lh3.google.com/photo.jpg"}
        )
        self.assertEqual(avatar, "https://res.cloudinary.com/custom_avatar.png")

    def test_resolve_avatar_from_meta_avatar_url(self):
        _, avatar = resolve_name_and_avatar(
            avatar_url=None,
            raw_user_meta_data={"avatar_url": "https://lh3.google.com/avatar.jpg"}
        )
        self.assertEqual(avatar, "https://lh3.google.com/avatar.jpg")

        # When avatar_url is blank string
        _, avatar = resolve_name_and_avatar(
            avatar_url="   ",
            raw_user_meta_data={"avatar_url": "https://lh3.google.com/avatar.jpg"}
        )
        self.assertEqual(avatar, "https://lh3.google.com/avatar.jpg")

    def test_resolve_avatar_from_meta_picture(self):
        _, avatar = resolve_name_and_avatar(
            avatar_url=None,
            raw_user_meta_data={"picture": "https://avatars.githubusercontent.com/u/12345"}
        )
        self.assertEqual(avatar, "https://avatars.githubusercontent.com/u/12345")

    def test_resolve_avatar_none(self):
        _, avatar = resolve_name_and_avatar(
            avatar_url=None,
            raw_user_meta_data={}
        )
        self.assertIsNone(avatar)

        _, avatar = resolve_name_and_avatar(
            avatar_url="   ",
            raw_user_meta_data={"picture": "   "}
        )
        self.assertIsNone(avatar)

    def test_extract_raw_meta_formats(self):
        # Dict
        d = {"full_name": "Test User"}
        self.assertEqual(extract_raw_meta(d), d)

        # JSON String
        s = json.dumps({"name": "String User"})
        self.assertEqual(extract_raw_meta(s), {"name": "String User"})

        # None
        self.assertEqual(extract_raw_meta(None), {})

        # Invalid string
        self.assertEqual(extract_raw_meta("{not valid json"), {})

        # Non-dict JSON (e.g. integer or list)
        self.assertEqual(extract_raw_meta("[1, 2, 3]"), {})
        self.assertEqual(extract_raw_meta(12345), {})


class TestUserResolverAsync(unittest.IsolatedAsyncioTestCase):
    async def test_fetch_auth_users_map_success(self):
        uid1 = uuid.uuid4()
        uid2 = uuid.uuid4()
        db = AsyncMock()

        @asynccontextmanager
        async def mock_begin_nested():
            yield

        db.begin_nested = mock_begin_nested

        row1 = MagicMock()
        row1.id = uid1
        row1.email = "u1@example.com"
        row1.raw_user_meta_data = {"full_name": "User One"}

        row2 = MagicMock()
        row2.id = uid2
        row2.email = "u2@example.com"
        row2.raw_user_meta_data = json.dumps({"name": "User Two"})

        mock_res = MagicMock()
        mock_res.all.return_value = [row1, row2]
        db.execute = AsyncMock(return_value=mock_res)

        res = await fetch_auth_users_map(db, [uid1, uid2])
        self.assertIn(uid1, res)
        self.assertIn(uid2, res)
        self.assertEqual(res[uid1]["email"], "u1@example.com")
        self.assertEqual(res[uid1]["raw_user_meta_data"], {"full_name": "User One"})

    async def test_fetch_auth_users_map_empty(self):
        db = AsyncMock()
        res = await fetch_auth_users_map(db, [])
        self.assertEqual(res, {})

    async def test_fetch_auth_users_map_exception_graceful_degrade(self):
        db = AsyncMock()

        @asynccontextmanager
        async def mock_begin_nested():
            yield

        db.begin_nested = mock_begin_nested
        db.execute = AsyncMock(side_effect=RuntimeError("Permission denied on auth.users"))

        res = await fetch_auth_users_map(db, [uuid.uuid4()])
        self.assertEqual(res, {})

    async def test_find_auth_user_by_email_success(self):
        uid = uuid.uuid4()
        db = AsyncMock()

        @asynccontextmanager
        async def mock_begin_nested():
            yield

        db.begin_nested = mock_begin_nested

        row = MagicMock()
        row.id = uid
        row.email = "test@example.com"
        row.raw_user_meta_data = {"full_name": "Test User", "avatar_url": "https://img.com/a.png"}

        mock_res = MagicMock()
        mock_res.first.return_value = row
        db.execute = AsyncMock(return_value=mock_res)

        user = await find_auth_user_by_email(db, "Test@Example.com")
        self.assertIsNotNone(user)
        self.assertEqual(user["id"], uid)
        self.assertEqual(user["email"], "test@example.com")
        self.assertEqual(user["raw_user_meta_data"]["full_name"], "Test User")

    async def test_find_auth_user_by_email_not_found(self):
        db = AsyncMock()

        @asynccontextmanager
        async def mock_begin_nested():
            yield

        db.begin_nested = mock_begin_nested

        mock_res = MagicMock()
        mock_res.first.return_value = None
        db.execute = AsyncMock(return_value=mock_res)

        user = await find_auth_user_by_email(db, "unknown@example.com")
        self.assertIsNone(user)

    async def test_find_auth_user_by_email_exception_graceful_degrade(self):
        db = AsyncMock()

        @asynccontextmanager
        async def mock_begin_nested():
            yield

        db.begin_nested = mock_begin_nested
        db.execute = AsyncMock(side_effect=RuntimeError("auth.users unavailable"))

        user = await find_auth_user_by_email(db, "error@example.com")
        self.assertIsNone(user)

    async def test_get_or_hydrate_profile_creates_and_hydrates(self):
        uid = uuid.uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        mock_res = MagicMock()
        mock_res.scalar_one_or_none.return_value = None
        mock_res.scalars.return_value.first.return_value = None
        db.execute = AsyncMock(return_value=mock_res)

        auth_data = {
            "id": uid,
            "email": "pana@test.com",
            "raw_user_meta_data": {"full_name": "Pana Tester", "avatar_url": "https://example.com/pana.jpg"}
        }

        profile = await get_or_hydrate_profile(db, uid, auth_data=auth_data, commit=True)
        self.assertEqual(profile.id, uid)
        self.assertEqual(profile.display_name, "Pana Tester")
        self.assertEqual(profile.avatar_url, "https://example.com/pana.jpg")
        db.add.assert_called_once_with(profile)
        db.commit.assert_awaited_once()

    async def test_get_or_hydrate_profile_existing_profile_hydrates_empty_fields(self):
        uid = uuid.uuid4()
        db = AsyncMock()

        existing_profile = models.Profile(id=uid, display_name=None, avatar_url=None)
        mock_res = MagicMock()
        mock_res.scalar_one_or_none.return_value = existing_profile
        mock_res.scalars.return_value.first.return_value = existing_profile
        db.execute = AsyncMock(return_value=mock_res)

        auth_data = {
            "id": uid,
            "email": "ana@test.com",
            "raw_user_meta_data": {"name": "Ana", "picture": "https://example.com/ana.png"}
        }

        profile = await get_or_hydrate_profile(db, uid, auth_data=auth_data, commit=False)
        self.assertEqual(profile.display_name, "Ana")
        self.assertEqual(profile.avatar_url, "https://example.com/ana.png")
        db.flush.assert_awaited_once()


class TestCrudConnectionsUserResolverIntegration(unittest.IsolatedAsyncioTestCase):
    def test_populate_connection_response_with_auth_users_fallback(self):
        from app.crud_connections import _populate_connection_response
        req_id = uuid.uuid4()
        rec_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        conn = models.Connection(
            id=uuid.uuid4(),
            requester_id=req_id,
            receiver_id=rec_id,
            status="accepted",
            created_at=now,
            updated_at=now
        )
        # Partner profile has no display_name and no avatar
        profiles = {
            rec_id: models.Profile(id=rec_id, display_name="", avatar_url=None)
        }
        auth_users = {
            rec_id: {
                "id": rec_id,
                "email": "luis@test.com",
                "raw_user_meta_data": {"full_name": "Luis Mendez", "avatar_url": "https://img.com/luis.png"}
            }
        }
        res = _populate_connection_response(conn, req_id, profiles, auth_users=auth_users)
        self.assertEqual(res.partner_name, "Luis Mendez")
        self.assertEqual(res.partner_avatar_url, "https://img.com/luis.png")

    async def test_find_user_by_email_hydrates_and_resolves(self):
        from app.crud_connections import find_user_by_email
        uid = uuid.uuid4()
        db = AsyncMock()

        @asynccontextmanager
        async def mock_begin_nested():
            yield

        db.begin_nested = mock_begin_nested
        db.add = MagicMock()

        # Mock SELECT from auth.users
        row = MagicMock()
        row.id = uid
        row.email = "target@example.com"
        row.raw_user_meta_data = {"full_name": "Target User", "picture": "https://img.com/t.png"}

        mock_auth_res = MagicMock()
        mock_auth_res.first.return_value = row

        # Mock Profile query (no existing profile)
        mock_prof_res = MagicMock()
        mock_prof_res.scalar_one_or_none.return_value = None
        mock_prof_res.scalars.return_value.first.return_value = None

        async def mock_execute(query, *args, **kwargs):
            q_str = str(query)
            if "auth.users" in q_str:
                return mock_auth_res
            if "profiles" in q_str:
                return mock_prof_res
            return MagicMock()

        db.execute = mock_execute

        res = await find_user_by_email(db, "target@example.com")
        self.assertIsNotNone(res)
        self.assertEqual(res.id, uid)
        self.assertEqual(res.display_name, "Target User")


class TestProfilesRouterResolverIntegration(unittest.IsolatedAsyncioTestCase):
    async def test_get_profile_calls_get_or_hydrate_profile(self):
        from app.routers import profiles as router_profiles
        from unittest.mock import patch

        uid = uuid.uuid4()
        db = AsyncMock()
        mock_profile = models.Profile(id=uid, display_name="Hydrated User", avatar_url="https://img.com/h.png")

        with patch("app.routers.profiles.get_or_hydrate_profile", new=AsyncMock(return_value=mock_profile)) as mock_hydrate, \
             patch("app.crud.seed_default_categories", new=AsyncMock()) as mock_seed:
            res = await router_profiles.get_profile(db=db, user_id=uid)
            mock_hydrate.assert_awaited_once_with(db, user_id=uid)
            mock_seed.assert_awaited_once_with(db, user_id=uid, only_if_empty=True)
            self.assertEqual(res.display_name, "Hydrated User")


if __name__ == "__main__":
    unittest.main()
