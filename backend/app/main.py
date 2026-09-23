from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import firebase_admin
from firebase_admin import credentials

from .routers import expenses, categories, profiles, fixed_expenses, debts, incomes, push
from .database import engine, Base

import base64
import json

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
        
    yield
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

@app.get("/")
def read_root():
    return {"message": "Welcome to GastosApp API"}

if __name__ == "__main__":
    import uvicorn
    # Usa dinámicamente la variable de entorno PORT asignada por Render (o 8000 en local)
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
