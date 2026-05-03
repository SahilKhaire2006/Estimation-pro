from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from rich.console import Console

from database import AuthUser, ensure_profile, get_current_user, rest_select, rest_update
from utils.groq_client import GroqClient

console = Console()
router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    message: str


@router.post("/chat/{session_id}/clear")
async def clear_chat(session_id: str, user: AuthUser = Depends(get_current_user)):
    """Clear chat history for a session."""
    profile = await ensure_profile(user)
    sess_rows = await rest_select(
        "sessions", user,
        filters={"id": f"eq.{session_id}", "user_id": f"eq.{profile['id']}"},
        limit=1,
    )
    if not sess_rows:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = sess_rows[0]
    state = sess.get("session_state") or {}
    state["chat_history"] = []
    await rest_update(
        "sessions", user,
        filters={"id": f"eq.{session_id}"},
        updates={"session_state": state},
    )
    return {"cleared": True}


@router.post("/chat/{session_id}")
async def chat(session_id: str, payload: ChatRequest, user: AuthUser = Depends(get_current_user)):
    profile = await ensure_profile(user)

    sess_rows = await rest_select(
        "sessions", user,
        filters={"id": f"eq.{session_id}", "user_id": f"eq.{profile['id']}"},
        limit=1,
    )
    if not sess_rows:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = sess_rows[0]
    state = sess.get("session_state") or {}

    proj_rows = await rest_select("projects", user, filters={"id": f"eq.{sess['project_id']}"}, limit=1)
    req_rows = await rest_select(
        "requirements", user,
        filters={"project_id": f"eq.{sess['project_id']}"},
        order="created_at.desc",
        limit=1,
    )
    req_text = (req_rows[0]["requirements_text"] if req_rows else "") or ""

    est = None
    if sess.get("estimation_id"):
        est_rows = await rest_select("estimations", user, filters={"id": f"eq.{sess['estimation_id']}"}, limit=1)
        est = est_rows[0] if est_rows else None

    code_structure = (state.get("code_structure") or "")[:500]
    similarity_meta = state.get("similarity_meta") or {}

    groq = GroqClient()
    system = (
        "You are an expert software estimation assistant.\n"
        "You have full context about the current project session.\n\n"
        f"PROJECT REQUIREMENTS: {req_text}\n\n"
        "ESTIMATION RESULTS:\n"
        f"- FPA: {est.get('adjusted_fp') if est else None} function points\n"
        f"- COCOMO II: {est.get('cocomo_effort_pm') if est else None} PM\n"
        f"- UCP: {est.get('ucp_points') if est else None} points\n"
        f"- Self-Learning Engine: {est.get('self_learning_effort_pm') if est else None} PM "
        f"(confidence: {est.get('self_learning_confidence') if est else None}%)\n\n"
        f"CODE STRUCTURE (preview): {code_structure}...\n\n"
        f"REFERENCED PROJECT: {similarity_meta.get('referenced_project_name')} "
        f"(similarity: {similarity_meta.get('score')})\n\n"
        "Answer ONLY based on this session data. Do not make up numbers."
    )

    reply = await groq.chat(system=system, user=payload.message, temperature=0.2)

    history = state.get("chat_history") or []
    history.append({"role": "user", "content": payload.message, "timestamp": datetime.utcnow().isoformat()})
    history.append({"role": "assistant", "content": reply, "timestamp": datetime.utcnow().isoformat()})
    state["chat_history"] = history

    await rest_update(
        "sessions", user,
        filters={"id": f"eq.{session_id}"},
        updates={"session_state": state},
    )
    return {"reply": reply, "chat_history": history[-20:]}
