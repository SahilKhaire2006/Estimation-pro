from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from rich.console import Console

from database import AuthUser, ensure_profile, get_current_user, rest_delete, rest_insert, rest_select

console = Console()
router = APIRouter(tags=["projects"])


class ProjectCreate(BaseModel):
    project_name: str
    description: str | None = None
    industry: str | None = None
    project_type: str = "Organic"
    language: str = "Java"


@router.get("/projects")
async def list_projects(user: AuthUser = Depends(get_current_user)):
    profile = await ensure_profile(user)
    rows = await rest_select("projects", user, filters={"user_id": f"eq.{profile['id']}"}, order="created_at.desc")
    return {"projects": rows}


@router.post("/projects")
async def create_project(payload: ProjectCreate, user: AuthUser = Depends(get_current_user)):
    profile = await ensure_profile(user)
    row = {
        "user_id": profile["id"],
        "project_name": payload.project_name,
        "description": payload.description,
        "industry": payload.industry,
        "project_type": payload.project_type,
        "language": payload.language,
        "updated_at": datetime.utcnow().isoformat(),
    }
    created = await rest_insert("projects", user, row)
    console.log("[bold cyan][DB][/] Created project")
    return {"project": created}


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: AuthUser = Depends(get_current_user)):
    profile = await ensure_profile(user)
    existing = await rest_select("projects", user, filters={"id": f"eq.{project_id}", "user_id": f"eq.{profile['id']}"}, limit=1)
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    await rest_delete("projects", user, filters={"id": f"eq.{project_id}"})
    return {"deleted": True, "project_id": project_id}


# Example:
# POST /api/projects
# { "project_name": "ShopEasy", "industry": "E-commerce" }
# Response: { "project": {...} }
