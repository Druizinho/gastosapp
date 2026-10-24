import os
import sys
import asyncio
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from scripts.run_sql_file import run_sql_file

MIGRATION_PATH = backend_dir.parent / "migrations" / "v5_proyectos_ahorros.sql"

async def main():
    print(f"Applying migration: {MIGRATION_PATH.name}")
    await run_sql_file(str(MIGRATION_PATH))
    print("Migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
