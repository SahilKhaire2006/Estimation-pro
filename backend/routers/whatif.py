from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from rich.console import Console

from database import AuthUser, ensure_profile, get_current_user, rest_select, rest_update

console = Console()
router = APIRouter(tags=["whatif"])


class WhatIfRequest(BaseModel):
    team_size: int = Field(ge=1, le=20)
    quality_level: str
    schedule_pressure: str
    tech_complexity: str
    tool_support: str


def _pct(v: float) -> str:
    sign = "+" if v > 0 else ""
    return f"{sign}{int(round(v))}%"


@router.post("/whatif/{session_id}")
async def run_whatif(session_id: str, payload: WhatIfRequest, user: AuthUser = Depends(get_current_user)):
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

    base_effort = 0.0
    if sess.get("estimation_id"):
        est_rows = await rest_select("estimations", user, filters={"id": f"eq.{sess['estimation_id']}"}, limit=1)
        if est_rows:
            base_effort = float(
                est_rows[0].get("self_learning_effort_pm") or est_rows[0].get("cocomo_effort_pm") or 0.0
            )
    if base_effort <= 0:
        base_effort = 10.0

    team_factor = max(0.6, min(1.3, 8 / float(payload.team_size)))
    quality_factor = {"Low": 0.9, "Medium": 1.0, "High": 1.1, "Critical": 1.25}.get(payload.quality_level, 1.0)
    schedule_factor = {"Relaxed": 0.9, "Normal": 1.0, "Tight": 1.15, "Extreme": 1.3}.get(payload.schedule_pressure, 1.0)
    tech_factor = {"Simple": 0.9, "Moderate": 1.0, "Complex": 1.2}.get(payload.tech_complexity, 1.0)
    tool_factor = {"None": 1.15, "Basic": 1.05, "Good": 1.0, "Excellent": 0.92}.get(payload.tool_support, 1.0)

    adjusted_effort = base_effort * quality_factor * schedule_factor * tech_factor * tool_factor
    adjusted_duration = max(1.0, (adjusted_effort / 2.5) * team_factor)
    risk = 20 + (schedule_factor - 1.0) * 60 + (tech_factor - 1.0) * 40 - (1.0 - tool_factor) * 30
    risk = max(5, min(95, risk))
    cost_change = (adjusted_effort - base_effort) / max(base_effort, 0.1) * 100.0

    result = {
        "base_effort_pm": round(base_effort, 2),
        "adjusted_effort_pm": round(adjusted_effort, 2),
        "duration_months": round(adjusted_duration, 2),
        "risk_change_pct": _pct((risk - 20)),
        "cost_change_pct": _pct(cost_change),
        "explanations": {
            "team_size_increase": {
                "effort": _pct((adjusted_effort - base_effort) / max(base_effort, 0.1) * 100),
                "duration": _pct((adjusted_duration - (base_effort / 2.5)) / max((base_effort / 2.5), 0.1) * 100),
                "risk": _pct((risk - 20)),
                "explanation": "Team size affects schedule via coordination overhead; higher schedule pressure and tech complexity raise risk.",
            }
        },
    }

    state["whatif_results"] = result
    await rest_update(
        "sessions", user,
        filters={"id": f"eq.{session_id}"},
        updates={"session_state": state},
    )

    return result
