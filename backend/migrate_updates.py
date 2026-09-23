import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def migrate():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL no está configurada")
        return
        
    print(f"Conectando a la base de datos...")
    
    try:
        conn = await asyncpg.connect(db_url)
        
        # 1. Añadir columnas a profiles
        print("Añadiendo columnas de notificaciones a profiles...")
        queries_profiles = [
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_fixed_expenses BOOLEAN NOT NULL DEFAULT TRUE;",
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_debts BOOLEAN NOT NULL DEFAULT TRUE;",
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_incomes BOOLEAN NOT NULL DEFAULT TRUE;",
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_inactivity BOOLEAN NOT NULL DEFAULT TRUE;"
        ]
        
        for q in queries_profiles:
            await conn.execute(q)
            
        print("Columnas en profiles añadidas correctamente.")
        
        # 2. Añadir columna a fixed_expenses
        print("Añadiendo columna last_paid_month a fixed_expenses...")
        await conn.execute("ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS last_paid_month VARCHAR(7);")
        print("Columna last_paid_month añadida correctamente.")

    except Exception as e:
        print(f"Error durante la migración: {e}")
    finally:
        await conn.close()
        print("Conexión cerrada.")

if __name__ == "__main__":
    asyncio.run(migrate())
