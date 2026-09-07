import os
import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from uuid import UUID

security = HTTPBearer()

# Cache for JWKS to avoid slow network requests on every API call
_jwks_cache = None

async def get_jwks():
    global _jwks_cache
    if _jwks_cache is None:
        supabase_url = os.environ.get("SUPABASE_URL")
        if not supabase_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="SUPABASE_URL is not set in environment",
            )
        
        jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        print(f"Fetching JWKS from {jwks_url}...")
        try:
            # Using httpx asynchronously to avoid blocking the server
            async with httpx.AsyncClient() as client:
                response = await client.get(jwks_url, timeout=15.0)
                response.raise_for_status()
                _jwks_cache = response.json()
                print("JWKS fetched and cached successfully.")
        except Exception as e:
            print("Error fetching JWKS:", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not fetch JWKS",
            )
    return _jwks_cache

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UUID:
    token = credentials.credentials
    jwks = await get_jwks()
    
    try:
        # Validar el token localmente usando el JWKS de Supabase
        payload = jwt.decode(
            token, 
            jwks, 
            algorithms=["ES256", "RS256", "HS256"],
            options={"verify_aud": False}
        )
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
