from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import firebase_admin
from firebase_admin import credentials
import asyncio
import datetime
from typing import Optional
from sqlalchemy import text

from .routers import expenses, categories, profiles, fixed_expenses, debts, incomes, push, notifications, connections, savings, shares, budgets
from .database import engine, Base, SessionLocal as AsyncSessionLocal
from .time_utils import vet_now

import base64
import json

# ─── Self-Ping: mantiene el servidor despierto en Render Free Tier ───
SELF_PING_INTERVAL = 600  # 10 minutos en segundos

def is_self_ping_allowed(now_vet: datetime.datetime) -> bool:
    """
    Determina si el self-ping debe ejecutarse según la hora en Venezuela (UTC-4).
    Ventana de reposo nocturno: 01:00 AM a 06:29 AM.
    Activo: a partir de las 06:30 AM hasta las 00:59 AM.
    """
    # Inactivo si la hora está entre 1 y 5 (01:00 a 05:59)
    # O si la hora es 6 y minutos < 30 (06:00 a 06:29)
    if 1 <= now_vet.hour < 6 or (now_vet.hour == 6 and now_vet.minute < 30):
        return False
    return True

async def _self_ping_loop():
    """
    Bucle interno que hace ping a su propio endpoint /health cada 10 minutos.
    Esto garantiza que el servidor de Render nunca se duerma, sin depender
    exclusivamente de servicios externos como cron-job.org.
    """
    import httpx
    # Esperar 30 segundos a que el servidor arranque completamente
    await asyncio.sleep(30)
    
    # Determinar la URL propia del servidor
    render_url = os.environ.get("RENDER_EXTERNAL_URL")
    port = int(os.environ.get("PORT", 8000))
    
    if render_url:
        base_url = render_url  # En producción (Render)
    else:
        base_url = f"http://localhost:{port}"  # En desarrollo local
    
    health_url = f"{base_url}/health"
    print(f"🏓 Self-ping activado: {health_url} cada {SELF_PING_INTERVAL}s")
    
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            try:
                now = vet_now()
                if not is_self_ping_allowed(now):
                    print(f"💤 Self-ping en reposo nocturno ({now.strftime('%H:%M:%S')} VET). No se realiza ping.")
                    await asyncio.sleep(SELF_PING_INTERVAL)
                    continue

                response = await client.get(health_url)
                print(f"🏓 Self-ping OK ({response.status_code}) a las {now.strftime('%H:%M:%S')} VET")
            except Exception as e:
                print(f"⚠️ Self-ping falló: {e}")
            await asyncio.sleep(SELF_PING_INTERVAL)

async def ensure_notifications_schema():
    """Añade idempotentemente columnas para notificaciones y perfiles."""
    statements = [
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_budgets BOOLEAN NOT NULL DEFAULT true;",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_panas BOOLEAN NOT NULL DEFAULT true;",
        "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS url VARCHAR DEFAULT '/';",
        "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN NOT NULL DEFAULT false;",
        "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);",
        "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id UUID;",
    ]
    for stmt in statements:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception as e:
            print(f"Aviso migración notificaciones: {e}")


async def _notification_scheduler_loop():
    """
    Bucle en segundo plano que revisa cada 60 segundos si es momento de ejecutar
    el resumen matutino (9:00 AM VET) o vespertino (7:00 PM / 19:00 VET).
    """
    from .routers.push import execute_scheduled_notifications
    last_morning_date: Optional[datetime.date] = None
    last_evening_date: Optional[datetime.date] = None

    while True:
        try:
            now = vet_now()
            today = now.date()

            # Ventana matutina: 9:00 AM VET
            if now.hour == 9 and last_morning_date != today:
                try:
                    async with AsyncSessionLocal() as db:
                        await execute_scheduled_notifications(db, "morning", now_vet=now)
                    last_morning_date = today
                    print(f"⏰ Resumen matutino ejecutado exitosamente a las {now.strftime('%H:%M:%S')} VET")
                except Exception as e:
                    print(f"⚠️ Error en scheduler matutino: {e}")

            # Ventana vespertina: 7:00 PM (19:00) VET
            if now.hour == 19 and last_evening_date != today:
                try:
                    async with AsyncSessionLocal() as db:
                        await execute_scheduled_notifications(db, "evening", now_vet=now)
                    last_evening_date = today
                    print(f"🌙 Resumen vespertino ejecutado exitosamente a las {now.strftime('%H:%M:%S')} VET")
                except Exception as e:
                    print(f"⚠️ Error en scheduler vespertino: {e}")

        except Exception as e:
            print(f"⚠️ Error en bucle del scheduler de notificaciones: {e}")

        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicializar Firebase Admin
    try:
        firebase_cred_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'firebase-adminsdk.json')
        if os.path.exists(firebase_cred_path):
            cred = credentials.Certificate(firebase_cred_path)
            firebase_admin.initialize_app(cred)
            print("Firebase Admin SDK inicializado desde archivo JSON.")
        else:
            b64_cred = os.environ.get("FIREBASE_SERVICE_ACCOUNT_BASE64")
            if b64_cred:
                cred_dict = json.loads(base64.b64decode(b64_cred).decode('utf-8'))
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred)
                print("Firebase Admin SDK inicializado desde variable de entorno Base64.")
            else:
                print("ADVERTENCIA: No se encontró firebase-adminsdk.json ni la variable FIREBASE_SERVICE_ACCOUNT_BASE64. Firebase no se inicializó.")
    except ValueError:
        # Ya inicializado
        pass
    except Exception as e:
        print(f"Error inicializando Firebase Admin SDK: {e}")
    
    # Lanzar el self-ping como tarea de fondo
    ping_task = asyncio.create_task(_self_ping_loop())
    print("✅ Tarea de self-ping lanzada en segundo plano.")

    # Lanzar el scheduler de notificaciones como tarea de fondo
    scheduler_task = asyncio.create_task(_notification_scheduler_loop())
    print("✅ Tarea de scheduler de notificaciones lanzada en segundo plano.")

    # Asegurar tablas base si no existen
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        print(f"Aviso metadata create_all: {e}")

    # Asegurar migración de esquema para notificaciones
    try:
        await ensure_notifications_schema()
    except Exception as e:
        print(f"Error asegurando esquema de notificaciones: {e}")

    # Asegurar migración de esquema para presupuestos
    try:
        from .crud_budgets import ensure_budget_schema
        await ensure_budget_schema()
    except Exception as e:
        print(f"Error asegurando esquema de presupuestos: {e}")

    # Asegurar migración de esquema para categorías y deudas
    try:
        from .crud import ensure_categories_and_debts_schema
        await ensure_categories_and_debts_schema()
    except Exception as e:
        print(f"Error asegurando esquema de categorías y deudas: {e}")
    
    yield
    
    # Cancelar tareas de fondo al apagar
    ping_task.cancel()
    scheduler_task.cancel()
    try:
        await ping_task
    except asyncio.CancelledError:
        print("🛑 Self-ping detenido.")
    try:
        await scheduler_task
    except asyncio.CancelledError:
        print("🛑 Scheduler de notificaciones detenido.")
    await engine.dispose()

app = FastAPI(title="GastosApp API", lifespan=lifespan)

# Configuración de CORS segura basada en lista blanca y regex para dominios Vercel
allowed_origins_env = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,https://gastosapp.vercel.app,https://gastosapp-lilac.vercel.app"
)
allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(expenses.router)
app.include_router(categories.router)
app.include_router(profiles.router)
app.include_router(fixed_expenses.router)
app.include_router(debts.router)
app.include_router(incomes.router)
app.include_router(push.router)
app.include_router(notifications.router)
app.include_router(connections.router)
app.include_router(savings.router)
app.include_router(shares.router)
app.include_router(budgets.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to GastosApp API"}

@app.get("/health")
def health_check():
    """
    Endpoint liviano de health check. No requiere autenticación.
    Usado por el self-ping interno y opcionalmente por cron-job.org como respaldo.
    """
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4)))
    return {
        "status": "alive",
        "timestamp": now.isoformat(),
        "message": "Server is running 🟢"
    }

if __name__ == "__main__":
    import uvicorn
    # Usa dinámicamente la variable de entorno PORT asignada por Render (o 8000 en local)
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
