from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
import json
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app import models


def extract_raw_meta(raw_meta: Any) -> dict:
    """Safely parse dict or JSON string into dict; returns {} on None or parse error."""
    if raw_meta is None:
        return {}
    if isinstance(raw_meta, dict):
        return raw_meta
    if isinstance(raw_meta, str):
        try:
            parsed = json.loads(raw_meta)
            if isinstance(parsed, dict):
                return parsed
            return {}
        except Exception:
            return {}
    return {}


def resolve_name_and_avatar(
    display_name: Optional[str] = None,
    avatar_url: Optional[str] = None,
    raw_user_meta_data: Any = None,
    email: Optional[str] = None,
    default_name: str = "Usuario"
) -> Tuple[str, Optional[str]]:
    """
    Resolves display name and avatar according to fallback hierarchies:
    Name fallback:
      display_name.strip() (if non-empty) -> meta.get('full_name') -> meta.get('name') ->
      meta.get('user_name') -> email.split('@')[0] -> default_name.
    Avatar fallback:
      avatar_url.strip() (if non-empty) -> meta.get('avatar_url') -> meta.get('picture') -> None.
    """
    meta = extract_raw_meta(raw_user_meta_data)

    resolved_name: Optional[str] = None
    if display_name and isinstance(display_name, str) and display_name.strip():
        resolved_name = display_name.strip()
    elif meta.get("full_name") and isinstance(meta["full_name"], str) and meta["full_name"].strip():
        resolved_name = meta["full_name"].strip()
    elif meta.get("name") and isinstance(meta["name"], str) and meta["name"].strip():
        resolved_name = meta["name"].strip()
    elif meta.get("user_name") and isinstance(meta["user_name"], str) and meta["user_name"].strip():
        resolved_name = meta["user_name"].strip()
    elif email and isinstance(email, str) and email.strip():
        clean_email = email.strip()
        prefix = clean_email.split("@")[0].strip() if "@" in clean_email else clean_email
        if prefix:
            resolved_name = prefix

    if not resolved_name:
        resolved_name = default_name

    resolved_avatar: Optional[str] = None
    if avatar_url and isinstance(avatar_url, str) and avatar_url.strip():
        resolved_avatar = avatar_url.strip()
    elif meta.get("avatar_url") and isinstance(meta["avatar_url"], str) and meta["avatar_url"].strip():
        resolved_avatar = meta["avatar_url"].strip()
    elif meta.get("picture") and isinstance(meta["picture"], str) and meta["picture"].strip():
        resolved_avatar = meta["picture"].strip()
    else:
        resolved_avatar = None

    return resolved_name, resolved_avatar


async def fetch_auth_users_map(db: AsyncSession, user_ids: List[UUID]) -> Dict[UUID, Dict[str, Any]]:
    """
    Queries auth.users for id, email, raw_user_meta_data for the given IDs.
    Degrades gracefully to empty dict if auth.users is inaccessible or in mock environment.
    """
    if not user_ids:
        return {}
    cleaned_ids = list({uid if isinstance(uid, UUID) else UUID(str(uid)) for uid in user_ids})
    result_map: Dict[UUID, Dict[str, Any]] = {}
    try:
        async with db.begin_nested():
            res = await db.execute(
                text("SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = ANY(:pids)"),
                {"pids": cleaned_ids}
            )
            rows = res.all() if hasattr(res, "all") else []
            for row in rows:
                row_id = getattr(row, "id", None) if hasattr(row, "id") else row[0]
                row_email = getattr(row, "email", None) if hasattr(row, "email") else row[1]
                row_meta = getattr(row, "raw_user_meta_data", None) if hasattr(row, "raw_user_meta_data") else (row[2] if len(row) > 2 else None)
                uid = UUID(str(row_id)) if not isinstance(row_id, UUID) else row_id
                parsed_meta = extract_raw_meta(row_meta)
                result_map[uid] = {
                    "id": uid,
                    "email": row_email,
                    "raw_user_meta_data": parsed_meta
                }
    except Exception:
        return {}
    return result_map


async def find_auth_user_by_email(db: AsyncSession, email: str) -> Optional[Dict[str, Any]]:
    """
    Queries auth.users for matching email with safe try/except fallback.
    """
    if not email or not isinstance(email, str) or not email.strip():
        return None
    clean_email = email.strip().lower()
    try:
        async with db.begin_nested():
            res = await db.execute(
                text("SELECT id, email, raw_user_meta_data FROM auth.users WHERE LOWER(email) = :email"),
                {"email": clean_email}
            )
            row = res.first() if hasattr(res, "first") else None
            if not row:
                return None
            row_id = getattr(row, "id", None) if hasattr(row, "id") else row[0]
            row_email = getattr(row, "email", None) if hasattr(row, "email") else row[1]
            row_meta = getattr(row, "raw_user_meta_data", None) if hasattr(row, "raw_user_meta_data") else (row[2] if len(row) > 2 else None)
            uid = UUID(str(row_id)) if not isinstance(row_id, UUID) else row_id
            parsed_meta = extract_raw_meta(row_meta)
            return {
                "id": uid,
                "email": row_email,
                "raw_user_meta_data": parsed_meta
            }
    except Exception:
        return None


async def get_or_hydrate_profile(
    db: AsyncSession,
    user_id: UUID,
    auth_data: Optional[Dict[str, Any]] = None,
    commit: bool = True
) -> models.Profile:
    """
    Gets profile from DB or creates it. If display_name or avatar_url are missing/empty,
    hydrates them from auth_data or fetch_auth_users_map, and saves/commits.
    """
    uid = user_id if isinstance(user_id, UUID) else UUID(str(user_id))
    result = await db.execute(select(models.Profile).where(models.Profile.id == uid))
    profile = result.scalar_one_or_none() if hasattr(result, "scalar_one_or_none") else result.scalars().first()

    is_new = False
    if not profile:
        profile = models.Profile(id=uid)
        db.add(profile)
        is_new = True

    needs_name = not profile.display_name or not (profile.display_name.strip() if isinstance(profile.display_name, str) else "")
    needs_avatar = not profile.avatar_url or not (profile.avatar_url.strip() if isinstance(profile.avatar_url, str) else "")

    if needs_name or needs_avatar:
        if auth_data is None:
            auth_map = await fetch_auth_users_map(db, [uid])
            auth_data = auth_map.get(uid)

        if auth_data:
            resolved_name, resolved_avatar = resolve_name_and_avatar(
                display_name=profile.display_name,
                avatar_url=profile.avatar_url,
                raw_user_meta_data=auth_data.get("raw_user_meta_data"),
                email=auth_data.get("email"),
                default_name="Usuario"
            )
            if needs_name and resolved_name:
                profile.display_name = resolved_name
            if needs_avatar and resolved_avatar:
                profile.avatar_url = resolved_avatar

    if is_new or needs_name or needs_avatar:
        if hasattr(profile, "updated_at"):
            profile.updated_at = datetime.now(timezone.utc)
        if commit:
            await db.commit()
            await db.refresh(profile)
        else:
            await db.flush()

    return profile
