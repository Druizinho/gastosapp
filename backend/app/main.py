from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

from .routers import expenses, categories
from .database import engine, Base

@asynccontextmanager
async def lifespan(app: FastAPI):
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
@app.get("/")
def read_root():
    return {"message": "Welcome to GastosApp API"}

if __name__ == "__main__":
    import uvicorn
    # Usa dinámicamente la variable de entorno PORT asignada por Render (o 8000 en local)
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
