import os
import sys
from pathlib import Path
import datetime
import unittest

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@127.0.0.1/db"
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: None

from app.main import is_self_ping_allowed
from app.time_utils import VET_TZ


class TestSelfPingWindow(unittest.TestCase):

    def test_inactive_nocturnal_hours(self):
        """
        Ventana de reposo nocturno: 01:00 AM a 06:29 AM.
        Deben retornar False: 01:00, 02:30, 05:59, 06:00, 06:29.
        """
        inactive_cases = [
            (1, 0),
            (2, 30),
            (5, 59),
            (6, 0),
            (6, 29),
        ]
        for hour, minute in inactive_cases:
            dt = datetime.datetime(2026, 10, 26, hour, minute, tzinfo=VET_TZ)
            with self.subTest(hour=hour, minute=minute):
                self.assertFalse(
                    is_self_ping_allowed(dt),
                    f"Expected False for {hour:02d}:{minute:02d} VET, got True"
                )

    def test_active_daytime_hours(self):
        """
        Ventana activa: a partir de las 06:30 AM hasta las 00:59 AM.
        Deben retornar True: 06:30, 06:31, 07:00, 12:00, 20:00, 23:59, 00:00, 00:59.
        """
        active_cases = [
            (6, 30),
            (6, 31),
            (7, 0),
            (12, 0),
            (20, 0),
            (23, 59),
            (0, 0),
            (0, 59),
        ]
        for hour, minute in active_cases:
            dt = datetime.datetime(2026, 10, 26, hour, minute, tzinfo=VET_TZ)
            with self.subTest(hour=hour, minute=minute):
                self.assertTrue(
                    is_self_ping_allowed(dt),
                    f"Expected True for {hour:02d}:{minute:02d} VET, got False"
                )


if __name__ == "__main__":
    unittest.main()
