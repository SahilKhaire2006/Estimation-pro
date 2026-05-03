from __future__ import annotations

from fastapi import APIRouter, Depends
from rich.console import Console

from database import AuthUser, ensure_profile, get_current_user

console = Console()
router = APIRouter(tags=["auth"])


@router.get("/auth/me")
async def me(user: AuthUser = Depends(get_current_user)):
    console.log("[bold cyan][AUTH][/] Fetching current user profile")
    profile = await ensure_profile(user)
    return {"user": {"id": user.id, "email": user.email}, "profile": profile}


# Example:
# GET /api/auth/me
# Authorization: Bearer <supabase_access_token>
# Response:
# { "user": {...}, "profile": {...} }

