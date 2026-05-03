from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import Header, HTTPException
from rich.console import Console
from supabase import Client, create_client

from config import get_settings

console = Console()


@dataclass
class AuthUser:
    id: str
    email: str | None = None
    access_token: str | None = None


def get_supabase_admin() -> Client:
    s = get_settings()
    key = s.supabase_service_key or s.supabase_key
    return create_client(s.supabase_url, key)


def get_supabase_anon() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_key)


async def verify_supabase_jwt(authorization: str | None) -> AuthUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    token = authorization.split(" ", 1)[1].strip()
    s = get_settings()

    url = f"{s.supabase_url}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": s.supabase_key,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        data = resp.json()
        return AuthUser(id=data["id"], email=data.get("email"), access_token=token)
    except HTTPException:
        raise
    except Exception as e:
        console.log(f"[bold red][AUTH][/] JWT verify failed: {e}")
        raise HTTPException(status_code=500, detail="Auth verification failed")


async def get_current_user(authorization: str | None = Header(default=None)) -> AuthUser:
    return await verify_supabase_jwt(authorization)


async def _rest(table: str, user: AuthUser, method: str, params: dict[str, Any] | None = None, json_body: Any | None = None):
    """
    Use Supabase PostgREST with the *user's JWT* so RLS policies (auth.uid()) apply correctly.
    """
    if not user.access_token:
        raise HTTPException(status_code=401, detail="Missing access token")

    s = get_settings()
    url = f"{s.supabase_url}/rest/v1/{table}"
    headers = {
        "apikey": s.supabase_key,
        "Authorization": f"Bearer {user.access_token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.request(method, url, headers=headers, params=params, json=json_body)
    if resp.status_code >= 400:
        raise HTTPException(status_code=500, detail=resp.text)
    if resp.text.strip():
        return resp.json()
    return None


async def ensure_profile(user: AuthUser) -> dict[str, Any]:
    # Try select first
    rows = await _rest("profiles", user, "GET", params={"id": f"eq.{user.id}", "select": "*"})
    if rows:
        return rows[0]

    if not user.email:
        raise HTTPException(status_code=400, detail="Supabase user missing email")

    payload = {
        "id": user.id,
        "email": user.email,
        "full_name": None,
        "company": None,
        "role": None,
    }
    inserted = await _rest("profiles", user, "POST", json_body=payload)
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to create profile")
    return inserted[0]


async def rest_select(table: str, user: AuthUser, filters: dict[str, str], order: str | None = None, limit: int | None = None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"select": "*"}
    params.update(filters)
    if order:
        params["order"] = order
    if limit is not None:
        params["limit"] = str(limit)
    rows = await _rest(table, user, "GET", params=params)
    return rows or []


async def rest_insert(table: str, user: AuthUser, row: dict[str, Any]) -> dict[str, Any]:
    rows = await _rest(table, user, "POST", json_body=row)
    if not rows:
        raise HTTPException(status_code=500, detail=f"Insert failed for {table}")
    return rows[0]


async def rest_update(table: str, user: AuthUser, filters: dict[str, str], updates: dict[str, Any]) -> dict[str, Any] | None:
    rows = await _rest(table, user, "PATCH", params=filters, json_body=updates)
    if not rows:
        return None
    return rows[0]


async def rest_delete(table: str, user: AuthUser, filters: dict[str, str]) -> None:
    # For delete, still use Prefer for representation but ignore body
    await _rest(table, user, "DELETE", params=filters, json_body=None)

