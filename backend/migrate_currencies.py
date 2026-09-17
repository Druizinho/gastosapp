import asyncio
from sqlalchemy import text
from app.database import engine

async def run_migration():
    async with engine.begin() as conn:
        print("Migrating currencies...")
        await conn.execute(text("UPDATE expenses SET currency = 'BS' WHERE currency IN ('BS_USD', 'BS_EUR');"))
        await conn.execute(text("ALTER TABLE expenses ALTER COLUMN currency SET DEFAULT 'BS';"))
    print("Migración completada exitosamente.")

if __name__ == "__main__":
    asyncio.run(run_migration())
