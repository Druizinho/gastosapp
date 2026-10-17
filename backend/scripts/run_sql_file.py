import os
import sys
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Load backend/.env
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print(f"Error: DATABASE_URL not found in {env_path}")
    sys.exit(1)

# Ensure asyncpg driver
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)

async def run_sql_file(file_path: str):
    path = Path(file_path).resolve()
    if not path.exists():
        print(f"Error: File not found: {path}")
        sys.exit(1)

    print(f"Reading SQL file: {path.name}")
    content = path.read_text(encoding="utf-8")

    engine = create_async_engine(
        DATABASE_URL,
        connect_args={"statement_cache_size": 0}
    )

    print(f"Connecting to database and executing {path.name}...")
    try:
        async with engine.begin() as conn:
            raw_conn = await conn.get_raw_connection()
            # asyncpg's driver_connection.execute supports executing multiple SQL statements
            await raw_conn.driver_connection.execute(content)
        print(f"Successfully executed {path.name}!")
    except Exception as e:
        print(f"Error executing {path.name}: {e}")
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_sql_file.py <path_to_sql_file>")
        sys.exit(1)

    asyncio.run(run_sql_file(sys.argv[1]))
