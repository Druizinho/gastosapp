from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .routers import expenses
from .database import engine, Base

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Depending on how the db is managed, you might want to create tables here if not using migrations
    # But since we use Supabase with raw sql script, it's optional.
    # Leaving it here just in case local sqlite is used for testing in the future
    # async with engine.begin() as conn:
    #     await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()

app = FastAPI(title="GastosApp API", lifespan=lifespan)

# Allow CORS for local development frontend and any Railway frontend domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(expenses.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to GastosApp API"}
