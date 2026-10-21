from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from uuid import UUID

from ..database import get_db
from ..auth import get_current_user
from .. import models, schemas, sharing

router = APIRouter(
    prefix="/api/shares",
    tags=["shares"]
)


@router.get("/by-entity/{entity_id}", response_model=schemas.ShareInfoOut)
async def get_share_by_entity(
    entity_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    membership = await sharing.get_membership(db, entity_id)
    if not membership:
        raise HTTPException(status_code=404, detail="Este ítem no está compartido")
    share, _ = membership
    return await sharing.build_share_info(db, share, user_id)


@router.post("/{share_id}/members", response_model=schemas.ShareInfoOut)
async def add_share_members(
    share_id: UUID,
    payload: schemas.ShareMembersAdd,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    res = await db.execute(select(models.Share).where(models.Share.id == share_id))
    share = res.scalars().first()
    if not share:
        raise HTTPException(status_code=404, detail="Recurso compartido no encontrado")

    members = await sharing.get_members(db, share.id)
    caller = next((m for m in members if m.user_id == user_id), None)
    if not caller or caller.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores pueden agregar integrantes")

    await sharing.add_members(db, share, user_id, payload.user_ids, payload.admin_ids)

    actor_prof_res = await db.execute(select(models.Profile).where(models.Profile.id == user_id))
    actor_prof = actor_prof_res.scalars().first()
    actor_name = actor_prof.display_name if actor_prof and actor_prof.display_name else "Un pana"

    item_type_label = {
        "debt": "una deuda compartida",
        "fixed_expense": "un gasto fijo compartido",
        "saving_goal": "un fondo de ahorro compartido"
    }.get(share.entity_type, "un ítem compartido")

    url_by_type = {
        "debt": "/deudas",
        "fixed_expense": "/gastos-fijos",
        "saving_goal": "/herramientas/ahorros"
    }.get(share.entity_type, "/dashboard")

    for tid in payload.user_ids:
        if tid != user_id:
            await sharing.send_notification_to_user(
                db=db,
                user_id=tid,
                title="Nuevo ítem compartido",
                body=f"{actor_name} te agregó a {item_type_label}",
                type=f"shared_{share.entity_type}_created",
                url=url_by_type
            )

    await db.commit()
    return await sharing.build_share_info(db, share, user_id)


@router.patch("/{share_id}/members/{target_user_id}", response_model=schemas.ShareInfoOut)
async def update_member_role(
    share_id: UUID,
    target_user_id: UUID,
    payload: schemas.ShareRoleUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    res = await db.execute(select(models.Share).where(models.Share.id == share_id))
    share = res.scalars().first()
    if not share:
        raise HTTPException(status_code=404, detail="Recurso compartido no encontrado")

    members = await sharing.get_members(db, share.id)
    caller = next((m for m in members if m.user_id == user_id), None)
    if not caller:
        raise HTTPException(status_code=403, detail="No eres parte de este ítem compartido")

    target = next((m for m in members if m.user_id == target_user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="El integrante no pertenece a este ítem compartido")

    sharing.assert_can_change_role(share, caller, target, payload.role.value, all_members=members)
    target.role = payload.role.value

    role_label = "Administrador" if payload.role.value == "admin" else "Miembro común"
    await sharing.send_notification_to_user(
        db=db,
        user_id=target_user_id,
        title="Rol actualizado",
        body=f"Tu rol en el ítem compartido fue cambiado a {role_label}",
        type=f"shared_{share.entity_type}_role",
        url="/dashboard"
    )

    await db.commit()
    return await sharing.build_share_info(db, share, user_id)


@router.delete("/{share_id}/members/{target_user_id}")
async def remove_share_member(
    share_id: UUID,
    target_user_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    res = await db.execute(select(models.Share).where(models.Share.id == share_id))
    share = res.scalars().first()
    if not share:
        raise HTTPException(status_code=404, detail="Recurso compartido no encontrado")

    members = await sharing.get_members(db, share.id)
    caller = next((m for m in members if m.user_id == user_id), None)
    if not caller:
        raise HTTPException(status_code=403, detail="No perteneces a este recurso compartido")

    target = next((m for m in members if m.user_id == target_user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="El integrante no pertenece a este recurso compartido")

    sharing.assert_can_remove_member(share, caller, target)
    is_voluntary = (user_id == target_user_id)

    prof_res = await db.execute(select(models.Profile).where(models.Profile.id.in_([user_id, target_user_id])))
    profs = {p.id: p for p in prof_res.scalars().all()}
    caller_name = profs.get(user_id).display_name if profs.get(user_id) and profs.get(user_id).display_name else "Un usuario"
    target_name = profs.get(target_user_id).display_name if profs.get(target_user_id) and profs.get(target_user_id).display_name else "Un usuario"

    item_type_label = {
        "debt": "la deuda compartida",
        "fixed_expense": "el gasto fijo compartido",
        "saving_goal": "el fondo de ahorro compartido"
    }.get(share.entity_type, "el ítem compartido")

    if is_voluntary:
        await sharing.notify_members(
            db=db,
            share_id=share.id,
            exclude_user_id=user_id,
            title="Un integrante salió",
            body=f"{caller_name} abandonó {item_type_label}",
            type=f"shared_{share.entity_type}_leave",
            url="/dashboard"
        )
    else:
        await sharing.send_notification_to_user(
            db=db,
            user_id=target_user_id,
            title="Fuiste removido",
            body=f"{caller_name} te retiró de {item_type_label}",
            type=f"shared_{share.entity_type}_kick",
            url="/dashboard"
        )
        await sharing.notify_members(
            db=db,
            share_id=share.id,
            exclude_user_id=target_user_id,
            title="Integrante removido",
            body=f"{caller_name} retiró a {target_name} de {item_type_label}",
            type=f"shared_{share.entity_type}_kick",
            url="/dashboard"
        )

    await sharing.remove_member(db, share, target_user_id)
    await db.commit()
    return {"message": "Miembro removido exitosamente", "voluntary": is_voluntary}
