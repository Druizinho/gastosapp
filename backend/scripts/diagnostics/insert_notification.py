import asyncio
from app.database import SessionLocal
from app.models import Notification

# The REAL user ID from the backend logs
USER_ID = "8b04bc8a-9b52-462d-a7b1-4b86e6cc5517"

test_notifications = [
    {
        "title": "Gasto Fijo Vence Hoy",
        "body": "Netflix (14.99 USD) vence hoy. No olvides registrar el pago.",
        "type": "fixed_expenses",
    },
    {
        "title": "Deuda Vencida",
        "body": "Debes 50.00 USD por 'Almuerzo con Carlos'. La fecha limite ya paso.",
        "type": "debts",
    },
    {
        "title": "Ingreso Estimado Hoy",
        "body": "Hoy te toca recibir el pago de Freelance Web",
        "type": "incomes",
    },
    {
        "title": "Te hemos extranado",
        "body": "Llevas 3 dias sin registrar gastos. Manten tus finanzas al dia.",
        "type": "inactivity",
    },
]

async def main():
    async with SessionLocal() as s:
        for n in test_notifications:
            notif = Notification(
                user_id=USER_ID,
                title=n["title"],
                body=n["body"],
                type=n["type"],
            )
            s.add(notif)
        await s.commit()
        print(f"Inserted {len(test_notifications)} notifications for user {USER_ID}")

asyncio.run(main())
