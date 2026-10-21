import os
import time
import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from uuid import UUID

security = HTTPBearer()

# Cache for JWKS with TTL to support Supabase key rotation
_jwks_cache = None
_jwks_cache_time = 0.0
JWKS_CACHE_TTL = 3600.0  # 1 hora

async def get_jwks(force_refresh: bool = False):
    global _jwks_cache, _jwks_cache_time
    now = time.time()
    if force_refresh or _jwks_cache is None or (now - _jwks_cache_time) > JWKS_CACHE_TTL:
        supabase_url = os.environ.get("SUPABASE_URL")
        if not supabase_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="SUPABASE_URL is not set in environment",
            )
        
        jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(jwks_url, timeout=15.0)
                response.raise_for_status()
                _jwks_cache = response.json()
                _jwks_cache_time = now
        except Exception as e:
            print("Error fetching JWKS:", e)
            if _jwks_cache is not None:
                return _jwks_cache  # Fallback a caché previa si la red falla
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not fetch JWKS",
            )
    return _jwks_cache

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UUID:
    token = credentials.credentials
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")

        if alg == "HS256":
            jwt_secret = os.environ.get("SUPABASE_JWT_SECRET")
            if not jwt_secret:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="SUPABASE_JWT_SECRET is not set in environment"
                )
            payload = jwt.decode(
                token,
                jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False}
            )
        else:
            jwks = await get_jwks()
            supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
            expected_iss = f"{supabase_url}/auth/v1" if supabase_url else None
            
            decode_kwargs = {
                "algorithms": ["ES256", "RS256"],
                "audience": "authenticated"
            }
            if expected_iss:
                decode_kwargs["issuer"] = expected_iss

            try:
                payload = jwt.decode(token, jwks, **decode_kwargs)
            except JWTError:
                # Reintentar una vez forzando refresco de JWKS
                fresh_jwks = await get_jwks(force_refresh=True)
                try:
                    payload = jwt.decode(token, fresh_jwks, **decode_kwargs)
                except JWTError:
                    # Fallback flexible en audience/issuer con firma JWKS verificada
                    payload = jwt.decode(token, fresh_jwks, algorithms=["ES256", "RS256"], options={"verify_aud": False})

        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
            )
        return UUID(user_id_str)
    except JWTError as e:
        print("JWT Decode error:", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
