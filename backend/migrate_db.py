import asyncio
from sqlalchemy import text
from app.database import engine

async def run_migration():
    async with engine.begin() as conn:
        print("Eliminando gastos existentes...")
        await conn.execute(text("DELETE FROM expenses;"))
        
        print("Modificando columna amount...")
        await conn.execute(text("ALTER TABLE expenses ALTER COLUMN amount TYPE NUMERIC(12, 4);"))
        
        print("Agregando nuevas columnas...")
        columns_to_add = [
            "currency VARCHAR(10) NOT NULL DEFAULT 'BS_USD'",
            "amount_usd NUMERIC(12, 4)",
            "amount_bs NUMERIC(12, 4)",
            "amount_eur NUMERIC(12, 4)",
            "amount_usdt NUMERIC(12, 4)",
            "rate_usd_bs NUMERIC(12, 4)",
            "rate_eur_bs NUMERIC(12, 4)",
            "rate_usdt_bs NUMERIC(12, 4)"
        ]
        
        for col in columns_to_add:
            try:
                # Add columns one by one in case some already exist
                col_name = col.split()[0]
                await conn.execute(text(f"ALTER TABLE expenses ADD COLUMN {col};"))
                print(f"Columna {col_name} agregada.")
            except Exception as e:
                print(f"Nota: No se pudo agregar {col_name} (posiblemente ya existe). Error: {e}")

    print("Migración completada exitosamente.")

if __name__ == "__main__":
    asyncio.run(run_migration())
