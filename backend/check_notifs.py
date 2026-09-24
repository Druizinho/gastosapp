import asyncio
from app.database import SessionLocal
from app.models import Notification
from sqlalchemy.future import select

async def main():
    async with SessionLocal() as s:
        r = await s.execute(select(Notification))
        notifs = r.scalars().all()
        if not notifs:
            print("NO NOTIFICATIONS FOUND IN DATABASE")
        else:
            print(f"FOUND {len(notifs)} NOTIFICATIONS:")
            for n in notifs:
                print(f"  ID={n.id}")
                print(f"  user={n.user_id}")
                print(f"  title={n.title.encode('ascii', 'replace').decode()}")
                print(f"  read={n.is_read}")
                print(f"  type={n.type}")
                print("  ---")

asyncio.run(main())
