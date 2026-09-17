import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from app.database import engine, SessionLocal
from app.crud_debts import create_debt
from app.schemas import DebtCreate
from app.schemas import CurrencyType
import uuid

async def main():
    async with SessionLocal() as db:
        debt = DebtCreate(
            type="owed",
            counterpart="Test",
            concept="Test",
            total_amount=100.0,
            currency=CurrencyType.USD_BCV,
            start_date="2026-09-17"
        )
        try:
            # We need a random uuid for user_id to test
            test_user = uuid.uuid4()
            result = await create_debt(db, debt, test_user)
            print("Success:", result.id)
        except Exception as e:
            print("Error:", str(e))
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
