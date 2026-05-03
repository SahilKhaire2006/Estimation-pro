from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from rich.console import Console

from database import AuthUser, ensure_profile, get_current_user, rest_select, rest_update
from ml.similarity import HIGH_SIMILARITY_THRESHOLD, SIMILARITY_THRESHOLD, _merge_code_structures
from utils.groq_client import GroqClient

console = Console()
router = APIRouter(tags=["code_structure"])


class GenerateCodeStructureRequest(BaseModel):
    session_id: str
    requirements_text: str


def _full_prompt(req: str) -> tuple[str, str]:
    system = (
        "You are a senior software architect. Generate a detailed project code structure as Markdown.\n"
        "Include backend, frontend, database, caching, and integrations.\n"
        "Be concrete: folders, files, responsibilities, and API endpoints."
    )
    return system, f"REQUIREMENTS:\n{req}\n\nReturn Markdown only."


def _multi_adapt_prompt(merged_base: str, req: str, project_names: list[str]) -> tuple[str, str]:
    names_str = ", ".join(project_names)
    system = (
        f"You are a senior software architect. You have code structures from {len(project_names)} similar projects "
        f"({names_str}) merged as a reference base.\n"
        "Adapt and extend this merged structure for the new requirements.\n"
        "Keep what still applies, add missing modules, remove irrelevant parts.\n"
        "Return clean Markdown only."
    )
    return system, f"MERGED BASE STRUCTURE:\n{merged_base}\n\nNEW REQUIREMENTS:\n{req}"


@router.post("/code-structure/generate")
async def generate_code_structure(
    payload: GenerateCodeStructureRequest,
    request: Request,
    user: AuthUser = Depends(get_current_user),
):
    profile = await ensure_profile(user)

    sess_rows = await rest_select(
        "sessions", user,
        filters={"id": f"eq.{payload.session_id}", "user_id": f"eq.{profile['id']}"},
        limit=1,
    )
    if not sess_rows:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = sess_rows[0]

    state = sess.get("session_state") or {}
    if state.get("code_structure"):
        console.log("[bold green][CACHE][/] Code structure already generated — returning stored version")
        return {"code_structure": state["code_structure"], "similarity_meta": state.get("similarity_meta")}

    groq = GroqClient()
    sim = request.app.state.similarity

    # ── Get top-N similar projects ────────────────────────────────────────────
    top_matches = sim.find_top_matches(payload.requirements_text, top_n=3)
    tech_stack_rec = top_matches[0].tech_stack_recommendation if top_matches else {}

    # Separate matches that have code_structure vs those that don't
    matches_with_cs = [m for m in top_matches if m.project.get("code_structure")]
    best_score = top_matches[0].score if top_matches else 0.0

    similarity_meta: dict[str, Any]

    if matches_with_cs and best_score >= HIGH_SIMILARITY_THRESHOLD:
        # ── CASE 1: High similarity — merge local structures, Groq only adapts ──
        merged_base, local_pct, llm_pct = _merge_code_structures(matches_with_cs, payload.requirements_text)
        project_names = [m.project.get("project_name", "") for m in matches_with_cs]
        referenced_names = ", ".join(project_names)

        console.log(f"[bold green][ML][/] High similarity ({best_score:.2f}) — merging {len(matches_with_cs)} local structures ({local_pct}% local)")
        console.log(f"[bold magenta][GROQ][/] Groq adapting remaining {llm_pct}%...")

        system, user_prompt = _multi_adapt_prompt(merged_base, payload.requirements_text, project_names)
        supplement = await groq.chat(system=system, user=user_prompt)

        # If very high match (≥90%), use local structure as primary
        if local_pct >= 90:
            final = merged_base.strip() + "\n\n---\n\n" + supplement.strip()
        else:
            final = supplement.strip()  # Groq output is primary, local was context

        similarity_meta = {
            "score": best_score,
            "referenced_project_names": project_names,
            "referenced_project_name": project_names[0] if project_names else None,
            "local_pct": local_pct,
            "llm_pct": llm_pct,
            "multi_reference": len(matches_with_cs) > 1,
            "reference_count": len(matches_with_cs),
            "tech_stack_recommendation": tech_stack_rec,
            "generation_mode": "local_primary" if local_pct >= 90 else "hybrid",
        }

    elif matches_with_cs and best_score >= SIMILARITY_THRESHOLD:
        # ── CASE 2: Partial similarity — local context passed to Groq ──────────
        merged_base, local_pct, llm_pct = _merge_code_structures(matches_with_cs, payload.requirements_text)
        project_names = [m.project.get("project_name", "") for m in matches_with_cs]

        console.log(f"[bold yellow][ML][/] Partial similarity ({best_score:.2f}) — using {len(matches_with_cs)} projects as context ({local_pct}% local)")
        console.log(f"[bold magenta][GROQ][/] Groq generating with local context ({llm_pct}% dynamic)...")

        system, user_prompt = _multi_adapt_prompt(merged_base, payload.requirements_text, project_names)
        final = await groq.chat(system=system, user=user_prompt)

        similarity_meta = {
            "score": best_score,
            "referenced_project_names": project_names,
            "referenced_project_name": project_names[0] if project_names else None,
            "local_pct": local_pct,
            "llm_pct": llm_pct,
            "multi_reference": len(matches_with_cs) > 1,
            "reference_count": len(matches_with_cs),
            "tech_stack_recommendation": tech_stack_rec,
            "generation_mode": "partial_hybrid",
        }

    elif top_matches and best_score >= SIMILARITY_THRESHOLD:
        # ── CASE 3: Similar projects found but no code_structure stored ─────────
        # Pass requirements context from similar projects to Groq
        context_parts = []
        for m in top_matches[:2]:
            p = m.project
            modules = (p.get("structured_features") or {}).get("modules") or []
            if modules:
                context_parts.append(f"Similar project '{p.get('project_name')}' modules: {', '.join(modules)}")

        context_str = "\n".join(context_parts)
        system = (
            "You are a senior software architect. Generate a detailed project code structure as Markdown.\n"
            f"Context from similar projects:\n{context_str}\n"
            "Use this as inspiration but adapt fully to the new requirements."
        )
        user_prompt = f"REQUIREMENTS:\n{payload.requirements_text}\n\nReturn Markdown only."
        final = await groq.chat(system=system, user=user_prompt)

        project_names = [m.project.get("project_name", "") for m in top_matches]
        local_pct = min(30, int(best_score * 40))  # partial credit for context

        similarity_meta = {
            "score": best_score,
            "referenced_project_names": project_names,
            "referenced_project_name": project_names[0] if project_names else None,
            "local_pct": local_pct,
            "llm_pct": 100 - local_pct,
            "multi_reference": len(top_matches) > 1,
            "reference_count": len(top_matches),
            "tech_stack_recommendation": tech_stack_rec,
            "generation_mode": "context_assisted",
        }

    else:
        # ── CASE 4: No similar projects — full Groq generation ──────────────────
        console.log("[bold magenta][GROQ][/] No similar projects found — full Groq generation...")
        system, user_prompt = _full_prompt(payload.requirements_text)
        final = await groq.chat(system=system, user=user_prompt)

        similarity_meta = {
            "score": best_score,
            "referenced_project_names": [],
            "referenced_project_name": None,
            "local_pct": 0,
            "llm_pct": 100,
            "multi_reference": False,
            "reference_count": 0,
            "tech_stack_recommendation": tech_stack_rec,
            "generation_mode": "full_llm",
        }

    state["code_structure"] = final
    state["similarity_meta"] = similarity_meta
    await rest_update(
        "sessions", user,
        filters={"id": f"eq.{payload.session_id}"},
        updates={"session_state": state, "updated_at": datetime.utcnow().isoformat()},
    )

    return {"code_structure": final, "similarity_meta": similarity_meta}


@router.get("/code-structure/{session_id}")
async def get_code_structure(session_id: str, user: AuthUser = Depends(get_current_user)):
    profile = await ensure_profile(user)
    rows = await rest_select(
        "sessions", user,
        filters={"id": f"eq.{session_id}", "user_id": f"eq.{profile['id']}"},
        limit=1,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found")
    state = rows[0].get("session_state") or {}
    return {"code_structure": state.get("code_structure"), "similarity_meta": state.get("similarity_meta")}
