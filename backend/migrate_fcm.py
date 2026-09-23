import asyncio
from sqlalchemy import text
from app.database import engine

async def run_migration():
    async with engine.begin() as conn:
        print("Eliminando tabla antigua push_subscriptions...")
        try:
            await conn.execute(text("DROP TABLE IF EXISTS push_subscriptions CASCADE;"))
        except Exception as e:
            print(f"Error al eliminar la tabla: {e}")
        
        print("Creando nueva tabla push_subscriptions para FCM...")
        create_table_sql = """
        CREATE TABLE push_subscriptions (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL,
            fcm_token VARCHAR NOT NULL UNIQUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """
        create_index_sql = """
        CREATE INDEX ix_push_subscriptions_user_id ON push_subscriptions (user_id);
        """
        try:
            await conn.execute(text(create_table_sql))
            await conn.execute(text(create_index_sql))
            print("Tabla push_subscriptions creada exitosamente.")
        except Exception as e:
            print(f"Error al crear la tabla: {e}")

    print("Migración completada exitosamente.")

if __name__ == "__main__":
    asyncio.run(run_migration())
