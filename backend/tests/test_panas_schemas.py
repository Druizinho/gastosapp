import sys
from pathlib import Path
import unittest
import uuid
import datetime
from decimal import Decimal

# Add backend directory to sys.path so app modules can be loaded
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from unittest.mock import MagicMock
from app import schemas, crud_connections


class TestPanasSchemas(unittest.TestCase):
    def test_connection_response_accepts_partner_avatar_url(self):
        # 1. With partner_avatar_url provided
        res = schemas.ConnectionResponse(
            id=uuid.uuid4(),
            requester_id=uuid.uuid4(),
            receiver_id=uuid.uuid4(),
            status="accepted",
            created_at=datetime.datetime.now(datetime.timezone.utc),
            updated_at=datetime.datetime.now(datetime.timezone.utc),
            partner_id=uuid.uuid4(),
            partner_name="Test Partner",
            partner_avatar_url="https://example.com/avatar.png",
            is_requester=True,
        )
        self.assertEqual(res.partner_avatar_url, "https://example.com/avatar.png")
        dump = res.model_dump()
        self.assertIn("partner_avatar_url", dump)
        self.assertEqual(dump["partner_avatar_url"], "https://example.com/avatar.png")

        # 2. Default partner_avatar_url is None
        res_default = schemas.ConnectionResponse(
            id=uuid.uuid4(),
            requester_id=uuid.uuid4(),
            receiver_id=uuid.uuid4(),
            status="accepted",
            created_at=datetime.datetime.now(datetime.timezone.utc),
            updated_at=datetime.datetime.now(datetime.timezone.utc),
            partner_id=uuid.uuid4(),
            partner_name="Test Partner",
            is_requester=False,
        )
        self.assertIsNone(res_default.partner_avatar_url)
        dump_default = res_default.model_dump()
        self.assertIn("partner_avatar_url", dump_default)
        self.assertIsNone(dump_default["partner_avatar_url"])

    def test_pana_summary_accepts_partner_avatar_url(self):
        # 1. With partner_avatar_url provided
        summary = schemas.PanaSummary(
            id=uuid.uuid4(),
            partner_id=uuid.uuid4(),
            partner_name="Test Partner",
            partner_avatar_url="https://example.com/avatar.png",
            partner_email="partner@example.com",
            status="accepted",
            created_at=datetime.datetime.now(datetime.timezone.utc),
        )
        self.assertEqual(summary.partner_avatar_url, "https://example.com/avatar.png")
        dump = summary.model_dump()
        self.assertIn("partner_avatar_url", dump)
        self.assertEqual(dump["partner_avatar_url"], "https://example.com/avatar.png")

        # 2. Default partner_avatar_url is None
        summary_default = schemas.PanaSummary(
            id=uuid.uuid4(),
            partner_id=uuid.uuid4(),
            partner_name="Test Partner",
            status="accepted",
            created_at=datetime.datetime.now(datetime.timezone.utc),
        )
        self.assertIsNone(summary_default.partner_avatar_url)
        dump_default = summary_default.model_dump()
        self.assertIn("partner_avatar_url", dump_default)
        self.assertIsNone(dump_default["partner_avatar_url"])

    def test_pana_detail_accepts_partner_avatar_url(self):
        # 1. With partner_avatar_url provided
        detail = schemas.PanaDetail(
            connection_id=uuid.uuid4(),
            partner_id=uuid.uuid4(),
            partner_name="Test Partner",
            partner_avatar_url="https://example.com/avatar.png",
            partner_email="partner@example.com",
            shared_fixed_expenses=[],
            shared_debts=[],
        )
        self.assertEqual(detail.partner_avatar_url, "https://example.com/avatar.png")
        dump = detail.model_dump()
        self.assertIn("partner_avatar_url", dump)
        self.assertEqual(dump["partner_avatar_url"], "https://example.com/avatar.png")

        # 2. Default partner_avatar_url is None
        detail_default = schemas.PanaDetail(
            connection_id=uuid.uuid4(),
            partner_id=uuid.uuid4(),
            partner_name="Test Partner",
            shared_fixed_expenses=[],
            shared_debts=[],
        )
        self.assertIsNone(detail_default.partner_avatar_url)
        dump_default = detail_default.model_dump()
        self.assertIn("partner_avatar_url", dump_default)
        self.assertIsNone(dump_default["partner_avatar_url"])

    def test_populate_connection_response_includes_avatar_url(self):
        user_id = uuid.uuid4()
        partner_id = uuid.uuid4()
        conn = MagicMock()
        conn.id = uuid.uuid4()
        conn.requester_id = user_id
        conn.receiver_id = partner_id
        conn.status = "accepted"
        conn.created_at = datetime.datetime.now(datetime.timezone.utc)
        conn.updated_at = datetime.datetime.now(datetime.timezone.utc)

        partner_profile = MagicMock()
        partner_profile.display_name = "Pana Amigo"
        partner_profile.avatar_url = "https://example.com/avatar.jpg"

        profiles = {partner_id: partner_profile}
        res = crud_connections._populate_connection_response(conn, user_id, profiles)
        self.assertEqual(res.partner_avatar_url, "https://example.com/avatar.jpg")
        self.assertEqual(res.partner_name, "Pana Amigo")

    def test_populate_connection_response_without_avatar_url(self):
        user_id = uuid.uuid4()
        partner_id = uuid.uuid4()
        conn = MagicMock()
        conn.id = uuid.uuid4()
        conn.requester_id = partner_id
        conn.receiver_id = user_id
        conn.status = "accepted"
        conn.created_at = datetime.datetime.now(datetime.timezone.utc)
        conn.updated_at = datetime.datetime.now(datetime.timezone.utc)

        profiles = {}
        res = crud_connections._populate_connection_response(conn, user_id, profiles)
        self.assertIsNone(res.partner_avatar_url)
        self.assertEqual(res.partner_name, "Usuario")


if __name__ == "__main__":
    unittest.main()
