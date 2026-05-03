"""
archive.py — Appends a completed session to data.json and retrains the in-memory ML model.
Called when a user deletes a session (session lifecycle complete).
"""
from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from rich.console import Console

console = Console()
_lock = threading.Lock()  # prevent concurrent writes to data.json


def _data_json_path() -> Path:
    return Path(__file__).resolve().parents[2] / "data.json"


def _read_data_json() -> list[dict]:
    path = _data_json_path()
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return []


def _write_data_json(data: list[dict]) -> None:
    path = _data_json_path()
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=4),
        encoding="utf-8",
    )


def archive_session_to_data_json(
    project_name: str,
    domain: str | None,
    requirements_text: str,
    modules: list[str],
    tech_stack: list[str],
    fpa_effort_pm: float | None,
    cocomo_effort_pm: float | None,
    ucp_effort_pm: float | None,
    self_learning_effort_pm: float | None,
    actual_effort_pm: float | None,
    code_structure: str | None,
    outcome: str = "on_time",
    complexity_vector: list[float] | None = None,
) -> dict[str, Any]:
    """
    Append a completed project to data.json and return the new record.
    Thread-safe. Skips if project_name already exists.
    """
    with _lock:
        existing = _read_data_json()
        existing_names = {p.get("project_name", "").lower() for p in existing}

        if project_name.lower() in existing_names:
            console.log(f"[bold yellow][ARCHIVE][/] '{project_name}' already in data.json — skipping")
            return {}

        new_id = max((p.get("id", 0) for p in existing), default=0) + 1

        # Build requirements string (same format as original data.json)
        modules_text = ", ".join(modules)
        requirements_combined = requirements_text.strip()

        # Complexity vector: [complexity_score, loc_est, team_size, schedule, tools]
        vec = complexity_vector or [2.0, 10000, 4, 0.25, 0.5]

        # Average estimated effort
        estimates = [e for e in [fpa_effort_pm, cocomo_effort_pm, ucp_effort_pm] if e is not None]
        avg_estimated = round(sum(estimates) / len(estimates), 2) if estimates else None

        record: dict[str, Any] = {
            "id": new_id,
            "project_name": project_name,
            "domain": domain or "General",
            "requirements": requirements_combined,
            "modules": modules,
            "complexity_vector": vec,
            "fpa_effort_pm": fpa_effort_pm,
            "cocomo_effort_pm": cocomo_effort_pm,
            "ucp_effort_pm": ucp_effort_pm,
            "actual_effort_pm": actual_effort_pm or avg_estimated,
            "tech_stack": ", ".join(tech_stack) if tech_stack else "",
            "outcome": outcome,
            "code_structure": code_structure,
            "archived_at": datetime.utcnow().isoformat(),
        }

        existing.append(record)
        _write_data_json(existing)
        console.log(f"[bold green][ARCHIVE][/] Saved '{project_name}' to data.json (id={new_id}, {len(existing)} total)")
        return record
