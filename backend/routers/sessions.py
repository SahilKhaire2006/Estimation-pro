from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from rich.console import Console

from database import AuthUser, ensure_profile, get_current_user, rest_insert, rest_select, rest_delete, rest_update
from redis_client import RedisClient
from utils.cache import diff_ratio, dumps_compact, merge_structured_features, sha256_hex
from utils.groq_client import GroqClient
from ml.archive import archive_session_to_data_json

console = Console()
router = APIRouter(tags=["sessions"])


class BootstrapRequest(BaseModel):
    project_name: str
    requirements_text: str
    industry: str | None = None


class SessionUpdate(BaseModel):
    session_name: str | None = None
    description: str | None = None
    is_saved: bool | None = None


def _feature_prompt(req: str) -> tuple[str, str]:
    system = (
        "You are a software requirements analyst. Extract structured features as strict JSON.\n"
        "Return JSON only with keys:\n"
        "{modules: string[], actors: {simple:int,average:int,complex:int}, "
        "use_cases: {simple:int,average:int,complex:int}, "
        "integrations: string[], non_functional: string[], "
        "loc_estimated:int, complexity: 'Low'|'Medium'|'High'|'Very High', "
        "schedule_pressure: 'Relaxed'|'Normal'|'Tight'|'Extreme', "
        "tool_support: 'None'|'Basic'|'Good'|'Excellent'}"
    )
    user = f"REQUIREMENTS:\n{req}"
    return system, user


@router.post("/sessions/bootstrap")
async def bootstrap_session(payload: BootstrapRequest, user: AuthUser = Depends(get_current_user)):
    """
    Creates a project + requirements + session.
    Applies Redis caching on requirements feature extraction.
    """
    profile = await ensure_profile(user)
    redis = RedisClient()
    groq = GroqClient()

    req_hash = sha256_hex(payload.requirements_text)
    redis_key = f"req_features:{req_hash}"

    cached = await redis.get_json(redis_key)
    if cached:
        console.log(f"[bold green][CACHE][/] HIT — returning cached feature extraction (hash: {req_hash[:8]})")
        try:
            structured = json.loads(cached) if isinstance(cached, str) else cached
        except Exception:
            structured = cached
    else:
        console.log("[bold yellow][CACHE][/] MISS — extracting features via Groq...")
        system, user_prompt = _feature_prompt(payload.requirements_text)
        structured = await groq.chat_json(system=system, user=user_prompt)
        await redis.set_json(redis_key, dumps_compact(structured), ttl_seconds=60 * 60 * 24)

    project = await rest_insert(
        "projects",
        user,
        {
            "user_id": profile["id"],
            "project_name": payload.project_name,
            "industry": payload.industry,
            "updated_at": datetime.utcnow().isoformat(),
        },
    )

    req_row = await rest_insert(
        "requirements",
        user,
        {
            "project_id": project["id"],
            "user_id": profile["id"],
            "requirements_text": payload.requirements_text,
            "requirements_hash": req_hash,
            "structured_features": structured,
            "feature_count": len(structured.get("modules", [])) if isinstance(structured, dict) else None,
        },
    )

    session_state = {
        "code_structure": None,
        "similarity_meta": None,
        "chat_history": [],
        "whatif_results": {},
    }
    session = await rest_insert(
        "sessions",
        user,
        {
            "user_id": profile["id"],
            "project_id": project["id"],
            "session_name": f"{payload.project_name} — Session",
            "description": None,
            "session_state": session_state,
            "updated_at": datetime.utcnow().isoformat(),
        },
    )

    return {"project": project, "requirements": req_row, "session": session}


@router.get("/sessions")
async def list_sessions(user: AuthUser = Depends(get_current_user)):
    profile = await ensure_profile(user)
    rows = await rest_select(
        "sessions", user,
        filters={"user_id": f"eq.{profile['id']}"},
        order="updated_at.desc",
    )
    return {"sessions": rows}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: AuthUser = Depends(get_current_user)):
    profile = await ensure_profile(user)
    rows = await rest_select("sessions", user, filters={"id": f"eq.{session_id}", "user_id": f"eq.{profile['id']}"}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found")
    session = rows[0]

    # best-effort view_count update omitted in RLS-safe minimal path

    proj = await rest_select("projects", user, filters={"id": f"eq.{session['project_id']}"}, limit=1)
    req = await rest_select("requirements", user, filters={"project_id": f"eq.{session['project_id']}"}, order="created_at.desc", limit=1)
    return {"session": session, "project": (proj[0] if proj else None), "requirements": (req[0] if req else None)}


@router.patch("/sessions/{session_id}")
async def update_session(session_id: str, payload: SessionUpdate, user: AuthUser = Depends(get_current_user)):
    profile = await ensure_profile(user)
    existing = await rest_select("sessions", user, filters={"id": f"eq.{session_id}", "user_id": f"eq.{profile['id']}"}, limit=1)
    if not existing:
        raise HTTPException(status_code=404, detail="Session not found")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.utcnow().isoformat()
    row = await rest_update("sessions", user, filters={"id": f"eq.{session_id}"}, updates=updates)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to update session")
    return {"session": row}


@router.post("/sessions/{session_id}/archive")
async def archive_session(session_id: str, request: Request, user: AuthUser = Depends(get_current_user)):
    """
    Save completed session data to data.json for self-learning.
    Only saves if estimation has been run (estimation_id exists).
    Called when user clicks Dashboard button or Save to ML button.
    """
    profile = await ensure_profile(user)
    sess_rows = await rest_select("sessions", user, filters={"id": f"eq.{session_id}", "user_id": f"eq.{profile['id']}"}, limit=1)
    if not sess_rows:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = sess_rows[0]
    state = sess.get("session_state") or {}

    # ── GUARD: only archive if estimation has been run ────────────────────────
    if not sess.get("estimation_id"):
        console.log(f"[bold yellow][ARCHIVE][/] Skipping — no estimation run yet for session {session_id[:8]}")
        return {"archived": False, "reason": "No estimation run yet — run all methods first"}

    proj_rows = await rest_select("projects", user, filters={"id": f"eq.{sess['project_id']}"}, limit=1)
    req_rows = await rest_select("requirements", user, filters={"project_id": f"eq.{sess['project_id']}"}, order="created_at.desc", limit=1)

    if not proj_rows or not req_rows:
        return {"archived": False, "reason": "Missing project or requirements data"}

    proj = proj_rows[0]
    req_row = req_rows[0]
    structured = req_row.get("structured_features") or {}
    modules: list[str] = structured.get("modules") or []

    # Get estimation data
    est_rows = await rest_select("estimations", user, filters={"id": f"eq.{sess['estimation_id']}"}, limit=1)
    est = est_rows[0] if est_rows else None

    if not est:
        return {"archived": False, "reason": "Estimation data not found"}

    # ── GUARD: require self_learning result (means run-all was completed) ─────
    if not est.get("self_learning_effort_pm"):
        console.log(f"[bold yellow][ARCHIVE][/] Skipping — run-all not completed for session {session_id[:8]}")
        return {"archived": False, "reason": "Run all estimation methods first"}

    # Get tech stack from similarity meta
    sim_meta = state.get("similarity_meta") or {}
    tech_stack_rec = sim_meta.get("tech_stack_recommendation") or {}
    tech_stack: list[str] = tech_stack_rec.get("recommended") or []

    # Build complexity vector from structured features
    complexity_map = {"Low": 1.5, "Medium": 2.0, "High": 2.8, "Very High": 3.5}
    complexity_score = complexity_map.get(structured.get("complexity", "Medium"), 2.0)
    loc_est = int(structured.get("loc_estimated") or 10000)
    complexity_vector = [complexity_score, loc_est, 4, 0.25, 0.5]

    # Determine outcome from warning
    outcome = "on_time"
    mc = est.get("method_comparison") or {}
    warning = mc.get("warning") or ""
    if "delayed" in warning.lower() or "buffer" in warning.lower():
        outcome = "delayed"

    record = archive_session_to_data_json(
        project_name=proj.get("project_name", "Unknown"),
        domain=proj.get("industry"),
        requirements_text=req_row.get("requirements_text", ""),
        modules=modules,
        tech_stack=tech_stack,
        fpa_effort_pm=est.get("adjusted_fp") / 20.0 if est.get("adjusted_fp") else None,
        cocomo_effort_pm=est.get("cocomo_effort_pm"),
        ucp_effort_pm=est.get("ucp_points") / 160.0 if est.get("ucp_points") else None,
        self_learning_effort_pm=est.get("self_learning_effort_pm"),
        actual_effort_pm=est.get("self_learning_effort_pm"),
        code_structure=state.get("code_structure"),
        outcome=outcome,
        complexity_vector=complexity_vector,
    )

    if record:
        # Retrain in-memory ML model with the new project
        try:
            app_state = request.app.state
            if hasattr(app_state, "similarity"):
                modules_text = ", ".join(modules)
                domain = proj.get("industry") or ""
                req_text = f"{req_row.get('requirements_text', '')} Modules: {modules_text}. Domain: {domain}."
                new_ml_row = {
                    "project_name": proj.get("project_name"),
                    "domain": domain,
                    "requirements_text": req_text,
                    "tech_stack": tech_stack,
                    "code_structure": state.get("code_structure"),
                    "estimated_effort_pm": est.get("self_learning_effort_pm"),
                    "actual_effort_pm": est.get("self_learning_effort_pm"),
                    "structured_features": {"modules": modules, "module_count": len(modules)},
                }
                app_state.similarity.retrain(new_ml_row)
                app_state.past_projects.append(new_ml_row)
                console.log(f"[bold green][ML][/] In-memory model retrained with '{proj.get('project_name')}'")
        except Exception as e:
            console.log(f"[bold yellow][ARCHIVE][/] Could not retrain in-memory model: {e}")

    return {"archived": bool(record), "project_name": proj.get("project_name")}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: AuthUser = Depends(get_current_user)):
    """
    Correct cascade order:
    1. Delete whatif_scenarios (FK → sessions)
    2. Null out sessions.estimation_id (breaks FK → estimations)
    3. Delete estimations
    4. Delete requirements (FK → projects, cascade)
    5. Delete session
    6. Delete project if no other sessions remain
    """
    profile = await ensure_profile(user)
    sess_rows = await rest_select("sessions", user, filters={"id": f"eq.{session_id}", "user_id": f"eq.{profile['id']}"}, limit=1)
    if not sess_rows:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = sess_rows[0]

    # Step 1 — delete child records that reference the session
    await rest_delete("whatif_scenarios", user, filters={"session_id": f"eq.{session_id}"})

    # Step 2 — null out estimation_id FK so we can safely delete the estimation
    if sess.get("estimation_id"):
        await rest_update(
            "sessions", user,
            filters={"id": f"eq.{session_id}"},
            updates={"estimation_id": None},
        )
        # Step 3 — null out requirements_id FK on estimation, then delete it
        await rest_update(
            "estimations", user,
            filters={"id": f"eq.{sess['estimation_id']}"},
            updates={"requirements_id": None},
        )
        await rest_delete("estimations", user, filters={"id": f"eq.{sess['estimation_id']}"})

    # Step 4 — now safe to delete requirements (nothing references them)
    await rest_delete("requirements", user, filters={"project_id": f"eq.{sess['project_id']}"})

    # Step 5 — delete the session itself
    await rest_delete("sessions", user, filters={"id": f"eq.{session_id}"})

    # Step 6 — delete project if no other sessions remain
    remaining = await rest_select("sessions", user, filters={"project_id": f"eq.{sess['project_id']}"}, limit=1)
    if not remaining:
        await rest_delete("projects", user, filters={"id": f"eq.{sess['project_id']}"})

    return {"deleted": True, "session_id": session_id}


# Example:
# POST /api/sessions/bootstrap
# { "project_name": "ShopEasy", "requirements_text": "Build ecommerce..." }
# Response: { project, requirements, session }
