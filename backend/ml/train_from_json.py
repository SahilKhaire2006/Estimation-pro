from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from rich.console import Console

from database import get_supabase_admin

console = Console()


def map_project(p: dict) -> dict:
    # Build requirements_text by combining requirements + modules list
    modules_text = ", ".join(p.get("modules", []))
    requirements_text = f"{p['requirements']} Modules: {modules_text}"

    # Parse tech_stack string into list
    tech_stack = [t.strip() for t in p.get("tech_stack", "").split(",") if t.strip()]

    # complexity_vector: [complexity, loc, team, schedule, tools]
    vec = p.get("complexity_vector", [1.0, 100, 2, 0.5, 0.5])

    # Average of 3 method estimates as the "estimated" value
    avg_estimated = round(
        (p.get("fpa_effort_pm", 0) + p.get("cocomo_effort_pm", 0) + p.get("ucp_effort_pm", 0)) / 3,
        2,
    )

    # outcome → risk flag
    outcome = p.get("outcome", "on_time")
    risk_multiplier = 1.15 if outcome == "delayed" else 1.0

    return {
        "project_name": p["project_name"],
        "domain": p["domain"],
        "requirements_text": requirements_text,
        "structured_features": {
            "modules": p.get("modules", []),
            "module_count": len(p.get("modules", [])),
            "outcome": outcome,
            "risk_multiplier": risk_multiplier,
        },
        "tech_stack": tech_stack,
        "complexity_score": vec[0] if len(vec) > 0 else 1.0,
        "features_count": len(p.get("modules", [])),
        "estimated_effort_pm": avg_estimated,
        "actual_effort_pm": p.get("actual_effort_pm"),
        "fpa_fp": None,
        "cocomo_effort_pm": p.get("cocomo_effort_pm"),
        "ucp_points": p.get("ucp_effort_pm"),
        "code_structure": p.get("code_structure"),  # from data.json if present
    }


def _read_dataset() -> list[dict[str, Any]]:
    root = Path(__file__).resolve().parents[2]
    data_path = root / "data.json"
    raw = json.loads(data_path.read_text(encoding="utf-8-sig"))  # handles BOM if present
    if not isinstance(raw, list):
        raise ValueError("data.json must be a list of project objects")
    return raw


def seed_past_projects_if_needed() -> dict[str, Any]:
    sb = get_supabase_admin()
    dataset = _read_dataset()
    mapped_dataset = [map_project(p) for p in dataset if p.get("project_name")]

    try:
        existing = sb.table("past_projects").select("project_name").execute().data or []
        existing_names = {r["project_name"] for r in existing if r.get("project_name")}
    except Exception as e:
        console.log(f"[bold yellow][ML][/] Could not read past_projects (will use local data.json only): {e}")
        return {"seeded": 0, "rows": mapped_dataset}

    inserts: list[dict[str, Any]] = []
    for p in dataset:
        name = p.get("project_name")
        if not name or name in existing_names:
            continue
        inserts.append(map_project(p))

    if inserts:
        try:
            sb.table("past_projects").insert(inserts).execute()
            console.log(f"[bold green][ML][/] Seeded {len(inserts)} projects from data.json")
        except Exception as e:
            # Common cause: RLS when using anon key (service key not configured)
            console.log(
                "[bold yellow][ML][/] Could not seed past_projects due to RLS or permissions. "
                "Continuing with local data.json for ML training."
            )
            console.log(f"[bold yellow][ML][/] Seed error: {e}")
    else:
        console.log("[bold yellow][ML][/] past_projects already seeded — no inserts needed")

    try:
        all_rows = sb.table("past_projects").select("*").execute().data or []
        if all_rows:
            return {"seeded": len(inserts), "rows": all_rows}
    except Exception:
        pass

    # Fallback: local dataset (still satisfies similarity + regression training)
    return {"seeded": 0, "rows": mapped_dataset}

