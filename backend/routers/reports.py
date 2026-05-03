from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from rich.console import Console

from database import AuthUser, ensure_profile, get_current_user, rest_insert, rest_select, rest_update
from utils.pdf_generator import build_report_pdf

console = Console()
router = APIRouter(tags=["reports"])


@router.post("/reports/{session_id}/export-pdf")
async def export_pdf(session_id: str, user: AuthUser = Depends(get_current_user)):
    profile = await ensure_profile(user)

    sess_rows = await rest_select(
        "sessions", user,
        filters={"id": f"eq.{session_id}", "user_id": f"eq.{profile['id']}"},
        limit=1,
    )
    if not sess_rows:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = sess_rows[0]

    proj_rows = await rest_select("projects", user, filters={"id": f"eq.{sess['project_id']}"}, limit=1)
    req_rows = await rest_select(
        "requirements", user,
        filters={"project_id": f"eq.{sess['project_id']}"},
        order="created_at.desc",
        limit=1,
    )
    est = None
    if sess.get("estimation_id"):
        est_rows = await rest_select("estimations", user, filters={"id": f"eq.{sess['estimation_id']}"}, limit=1)
        est = est_rows[0] if est_rows else None

    session_bundle = {
        "id": sess["id"],
        "session_name": sess.get("session_name"),
        "project": (proj_rows[0] if proj_rows else None),
        "requirements_text": (req_rows[0]["requirements_text"] if req_rows else ""),
        "results": {
            "fpa": est.get("adjusted_fp") if est else None,
            "cocomo": est.get("cocomo_effort_pm") if est else None,
            "ucp": est.get("ucp_points") if est else None,
            "self_learning": est.get("self_learning_effort_pm") if est else None,
        },
    }

    import asyncio
    pdf_bytes = await asyncio.to_thread(build_report_pdf, session_bundle)
    out_dir = Path(__file__).resolve().parents[1] / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"report_{session_id}.pdf"
    out_path.write_bytes(pdf_bytes)

    await rest_update("sessions", user, filters={"id": f"eq.{session_id}"}, updates={"pdf_url": str(out_path)})
    console.log("[bold cyan][REPORTS][/] PDF generated")
    return FileResponse(str(out_path), filename=f"EstimationPro_{session_id}.pdf", media_type="application/pdf")


@router.post("/reports/{session_id}/share")
async def share(session_id: str, user: AuthUser = Depends(get_current_user)):
    profile = await ensure_profile(user)

    sess_rows = await rest_select(
        "sessions", user,
        filters={"id": f"eq.{session_id}", "user_id": f"eq.{profile['id']}"},
        limit=1,
    )
    if not sess_rows:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = sess_rows[0]
    if not sess.get("estimation_id"):
        raise HTTPException(status_code=400, detail="Session has no estimation yet")

    row = await rest_insert(
        "shared_reports",
        user,
        {
            "owner_id": profile["id"],
            "estimation_id": sess["estimation_id"],
            "access_level": "view",
            "expiry_date": datetime.utcnow().isoformat(),
        },
    )
    token = row["share_token"]
    return {"share_token": token, "url": f"/share/{token}"}


@router.get("/share/{token}")
async def public_share(token: str):
    """Public endpoint — no auth required."""
    from database import get_supabase_admin
    sb = get_supabase_admin()
    shared = sb.table("shared_reports").select("*").eq("share_token", token).execute().data
    if not shared:
        raise HTTPException(status_code=404, detail="Invalid token")
    shared = shared[0]
    est = sb.table("estimations").select("*").eq("id", shared["estimation_id"]).execute().data
    est = est[0] if est else None
    return {"estimation": est, "access_level": shared.get("access_level"), "expiry_date": shared.get("expiry_date")}
