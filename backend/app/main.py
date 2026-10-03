from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import firebase_admin
from firebase_admin import credentials
import asyncio
import datetime

from .routers import expenses, categories, profiles, fixed_expenses, debts, incomes, push, notifications, connections
from .database import engine, Base

import base64
import json

# ─── Self-Ping: mantiene el servidor despierto en Render Free Tier ───
SELF_PING_INTERVAL = 600  # 10 minutos en segundos

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
                response = await client.get(health_url)
                now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4)))
                print(f"🏓 Self-ping OK ({response.status_code}) a las {now.strftime('%H:%M:%S')}")
            except Exception as e:
                print(f"⚠️ Self-ping falló: {e}")
            await asyncio.sleep(SELF_PING_INTERVAL)

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
    
    yield
    
    # Cancelar el self-ping al apagar
    ping_task.cancel()
    try:
        await ping_task
    except asyncio.CancelledError:
        print("🛑 Self-ping detenido.")
    await engine.dispose()

app = FastAPI(title="GastosApp API", lifespan=lifespan)

# Configuración de CORS permitiendo todos los orígenes para conectar con Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
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
