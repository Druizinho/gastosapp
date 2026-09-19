import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv
import os

load_dotenv("backend/.env")

# The database URL needs the +asyncpg driver for async engine
db_url = os.getenv("DATABASE_URL").replace("postgresql://", "postgresql+asyncpg://")
engine = create_async_engine(db_url)

async def add_column():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE estimated_incomes ADD COLUMN deactivated_at TIMESTAMP WITH TIME ZONE;"))
            print("Column added successfully!")
        except Exception as e:
            print("Error or already exists:", e)

asyncio.run(add_column())
