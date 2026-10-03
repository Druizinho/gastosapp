from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_, delete, text
from uuid import UUID
from typing import List, Optional
from datetime import datetime, timezone

from . import models, schemas
from .push_service import send_push_notification

async def send_notification_to_user(db: AsyncSession, user_id: UUID, title: str, body: str, type: str):
    """Envía push + guarda notificación en DB para un user_id específico."""
    notification = models.Notification(
        user_id=user_id, title=title, body=body, type=type
    )
    db.add(notification)
    
    subs = await db.execute(
        select(models.PushSubscription).where(models.PushSubscription.user_id == user_id)
    )
    
    tokens_to_delete = []
    for sub in subs.scalars().all():
        success = send_push_notification(sub.fcm_token, title, body)
        if not success:
            tokens_to_delete.append(sub.fcm_token)
    
    if tokens_to_delete:
        await db.execute(
            delete(models.PushSubscription).where(
                models.PushSubscription.fcm_token.in_(tokens_to_delete)
            )
        )
    # We don't commit here so the caller can commit the whole transaction

async def find_user_by_email(db: AsyncSession, email: str) -> Optional[schemas.UserSearchResult]:
    result = await db.execute(
        text("SELECT id, email FROM auth.users WHERE email = :email"),
        {"email": email}
    )
    auth_user = result.first()
    if not auth_user:
        return None
        
    auth_id = auth_user.id
    
    profile_result = await db.execute(
        select(models.Profile).where(models.Profile.id == auth_id)
    )
    profile = profile_result.scalars().first()
    
    display_name = profile.display_name if profile and profile.display_name else auth_user.email
    
    return schemas.UserSearchResult(
        id=auth_id,
        display_name=display_name,
        email=auth_user.email
    )

def _populate_connection_response(conn: models.Connection, user_id: UUID, profiles: dict) -> schemas.ConnectionResponse:
    is_requester = conn.requester_id == user_id
    partner_id = conn.receiver_id if is_requester else conn.requester_id
    partner = profiles.get(partner_id)
    partner_name = partner.display_name if partner and partner.display_name else "Usuario"
    
    return schemas.ConnectionResponse(
        id=conn.id,
        requester_id=conn.requester_id,
        receiver_id=conn.receiver_id,
        status=conn.status,
        created_at=conn.created_at,
        updated_at=conn.updated_at,
        partner_id=partner_id,
        partner_name=partner_name,
        is_requester=is_requester
    )

async def get_connections(db: AsyncSession, user_id: UUID) -> List[schemas.ConnectionResponse]:
    result = await db.execute(
        select(models.Connection).where(
            or_(
                models.Connection.requester_id == user_id,
                models.Connection.receiver_id == user_id
            )
        ).order_by(models.Connection.created_at.desc())
    )
    connections = result.scalars().all()
    
    # Get all involved profiles
    partner_ids = set()
    for c in connections:
        partner_ids.add(c.receiver_id if c.requester_id == user_id else c.requester_id)
        
    if not partner_ids:
        return []
        
    profiles_result = await db.execute(
        select(models.Profile).where(models.Profile.id.in_(partner_ids))
    )
    profiles = {p.id: p for p in profiles_result.scalars().all()}
    
    return [_populate_connection_response(c, user_id, profiles) for c in connections]

async def create_connection_request(db: AsyncSession, requester_id: UUID, target_email: str):
    target = await find_user_by_email(db, target_email)
    if not target:
        return None, "Usuario no encontrado"
        
    if target.id == requester_id:
        return None, "No puedes conectarte contigo mismo"
        
    # Check if connection already exists
    existing = await db.execute(
        select(models.Connection).where(
            or_(
                and_(models.Connection.requester_id == requester_id, models.Connection.receiver_id == target.id),
                and_(models.Connection.requester_id == target.id, models.Connection.receiver_id == requester_id)
            )
        )
    )
    if existing.scalars().first():
        return None, "Ya existe una conexión o solicitud pendiente con este usuario"
        
    conn = models.Connection(
        requester_id=requester_id,
        receiver_id=target.id,
        status='pending'
    )
    db.add(conn)
    
    # Send notification
    requester_profile_res = await db.execute(select(models.Profile).where(models.Profile.id == requester_id))
    requester_profile = requester_profile_res.scalars().first()
    req_name = requester_profile.display_name if requester_profile and requester_profile.display_name else "Alguien"
    
    await send_notification_to_user(
        db, target.id, "Nueva solicitud de conexión", f"{req_name} quiere conectar contigo", "connection_request"
    )
    
    await db.commit()
    await db.refresh(conn)
    
    profiles = {target.id: models.Profile(id=target.id, display_name=target.display_name)}
    return _populate_connection_response(conn, requester_id, profiles), None

async def accept_connection(db: AsyncSession, connection_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.Connection).where(
            models.Connection.id == connection_id,
            models.Connection.receiver_id == user_id,
            models.Connection.status == 'pending'
        )
    )
    conn = result.scalars().first()
    if not conn:
        return None
        
    conn.status = 'accepted'
    conn.updated_at = datetime.now(timezone.utc)
    
    # Send notification to requester
    receiver_profile_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
    receiver_profile = receiver_profile_res.scalars().first()
    rec_name = receiver_profile.display_name if receiver_profile and receiver_profile.display_name else "Alguien"
    
    await send_notification_to_user(
        db, conn.requester_id, "Solicitud aceptada", f"{rec_name} aceptó tu solicitud", "connection_accepted"
    )
    
    await db.commit()
    await db.refresh(conn)
    
    req_profile_res = await db.execute(select(models.Profile).where(models.Profile.id == conn.requester_id))
    profiles = {conn.requester_id: req_profile_res.scalars().first()}
    
    return _populate_connection_response(conn, user_id, profiles)

async def reject_connection(db: AsyncSession, connection_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.Connection).where(
            models.Connection.id == connection_id,
            models.Connection.receiver_id == user_id,
            models.Connection.status == 'pending'
        )
    )
    conn = result.scalars().first()
    if not conn:
        return False
        
    conn.status = 'rejected'
    conn.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return True

async def delete_connection(db: AsyncSession, connection_id: UUID, user_id: UUID):
    result = await db.execute(
        select(models.Connection).where(
            models.Connection.id == connection_id,
            or_(
                models.Connection.requester_id == user_id,
                models.Connection.receiver_id == user_id
            )
        )
    )
    conn = result.scalars().first()
    if not conn:
        return False
        
    await db.delete(conn)
    await db.commit()
    return True
