import asyncio
from sqlalchemy import text
from app.database import engine

async def run_migration():
    async with engine.begin() as conn:
        print("Creando tabla categories...")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS categories (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL,
                name TEXT NOT NULL,
                color TEXT DEFAULT '#cbd5e1',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
                UNIQUE(user_id, name)
            );
        """))
        print("Creando indice idx_categories_user...")
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
        """))
        
    print("Migración completada exitosamente.")

if __name__ == "__main__":
    asyncio.run(run_migration())
