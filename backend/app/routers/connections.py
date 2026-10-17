from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID

from .. import crud_connections, schemas, auth
from ..database import get_db

router = APIRouter(
    prefix="/api/connections",
    tags=["connections"],
)

@router.get("/", response_model=List[schemas.ConnectionResponse])
async def get_my_connections(
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user)
):
    return await crud_connections.get_connections(db, user_id)

@router.get("/overview", response_model=schemas.PanasGlobalOverview)
async def get_panas_overview(
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user)
):
    return await crud_connections.get_panas_overview(db, user_id)

@router.get("/partner/{partner_id}/details", response_model=schemas.PanaDetail)
async def get_pana_details(
    partner_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user)
):
    detail = await crud_connections.get_pana_details(db, user_id, partner_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Pana no encontrado o no conectado")
    return detail

@router.post("/request", response_model=schemas.ConnectionResponse)
async def request_connection(
    req: schemas.ConnectionRequest,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user)
):
    conn, error = await crud_connections.create_connection_request(db, user_id, req.email)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return conn

@router.post("/request-by-user/{target_user_id}", response_model=schemas.ConnectionResponse)
async def request_connection_by_user(
    target_user_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user)
):
    conn, error = await crud_connections.create_connection_request_by_user_id(db, user_id, target_user_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return conn

@router.put("/{connection_id}/accept", response_model=schemas.ConnectionResponse)
async def accept_connection(
    connection_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user)
):
    conn = await crud_connections.accept_connection(db, connection_id, user_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada o no válida")
    return conn

@router.put("/{connection_id}/reject")
async def reject_connection(
    connection_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user)
):
    success = await crud_connections.reject_connection(db, connection_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada o no válida")
    return {"message": "Solicitud rechazada"}

@router.delete("/{connection_id}")
async def delete_connection(
    connection_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(auth.get_current_user)
):
    success = await crud_connections.delete_connection(db, connection_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conexión no encontrada")
    return {"message": "Conexión eliminada"}
