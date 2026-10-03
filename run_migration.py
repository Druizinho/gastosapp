import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os

DATABASE_URL = "postgresql+asyncpg://postgres.barkempxqqgsjyewqjxw:gastosapp123@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

async def run_migration():
    engine = create_async_engine(DATABASE_URL)
    with open("rls_connections.sql", "r") as f:
        sql = f.read()
    
    async with engine.begin() as conn:
        for statement in sql.split(';'):
            if statement.strip():
                await conn.execute(text(statement))
    
    await engine.dispose()
    print("Migration successful")

if __name__ == "__main__":
    asyncio.run(run_migration())
