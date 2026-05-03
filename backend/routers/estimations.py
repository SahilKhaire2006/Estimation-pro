from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from rich.console import Console

from database import AuthUser, ensure_profile, get_current_user, rest_insert, rest_select, rest_update

console = Console()
router = APIRouter(tags=["estimations"])


class EstimateFPARequest(BaseModel):
    session_id: str
    project_id: str
    requirements_id: str
    manual_overrides: dict[str, Any] | None = None


class EstimateCOCOMORequest(BaseModel):
    session_id: str
    loc_estimated: int
    project_type: str = "Organic"
    team_experience: int = 3
    complexity_multiplier: float = 1.17
    schedule_constraint: float = 1.0


class EstimateUCPRequest(BaseModel):
    session_id: str
    actors: dict[str, int]
    use_cases: dict[str, int]
    technical_factors: dict[str, int] | None = None
    env_factors: dict[str, int] | None = None
    productivity_factor_hours: int = 20


async def _load_structured_features(requirements_id: str, user: AuthUser) -> dict[str, Any]:
    rows = await rest_select("requirements", user, filters={"id": f"eq.{requirements_id}"}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="Requirements not found")
    return rows[0].get("structured_features") or {}


@router.post("/estimate/fpa")
async def estimate_fpa(payload: EstimateFPARequest, user: AuthUser = Depends(get_current_user)):
    profile = await ensure_profile(user)
    structured = await _load_structured_features(payload.requirements_id, user)

    modules = structured.get("modules") or []
    module_count = int(structured.get("module_count") or len(modules) or 8)

    ei = max(4, module_count + 4)
    eo = max(3, int(module_count * 0.7) + 2)
    eq = max(2, int(module_count * 0.5) + 1)
    ilf = max(2, int(module_count * 0.4) + 1)
    eif = max(1, int(module_count * 0.25))

    if payload.manual_overrides:
        ei = int(payload.manual_overrides.get("fp_external_inputs", ei))
        eo = int(payload.manual_overrides.get("fp_external_outputs", eo))
        eq = int(payload.manual_overrides.get("fp_external_inquiries", eq))
        ilf = int(payload.manual_overrides.get("fp_ilf", ilf))
        eif = int(payload.manual_overrides.get("fp_eif", eif))

    weights = {"EI": 4, "EO": 5, "EQ": 4, "ILF": 10, "EIF": 7}
    ufp = ei * weights["EI"] + eo * weights["EO"] + eq * weights["EQ"] + ilf * weights["ILF"] + eif * weights["EIF"]

    vaf_scores = {f"gsc_{i+1}": 3 for i in range(14)}
    vaf_value = round(0.65 + 0.01 * sum(vaf_scores.values()), 3)
    adjusted_fp = int(round(ufp * vaf_value))
    effort_estimate_pm = round(adjusted_fp / 20.0, 2)

    console.log(f"[bold blue][FPA][/] UFP={ufp}, VAF={vaf_value}, AFP={adjusted_fp}")

    steps = [
        {"step": 1, "name": "Count External Inputs", "value": ei, "weight": weights["EI"], "subtotal": ei * weights["EI"]},
        {"step": 2, "name": "Count External Outputs", "value": eo, "weight": weights["EO"], "subtotal": eo * weights["EO"]},
        {"step": 3, "name": "Count External Inquiries", "value": eq, "weight": weights["EQ"], "subtotal": eq * weights["EQ"]},
        {"step": 4, "name": "Count Internal Logical Files", "value": ilf, "weight": weights["ILF"], "subtotal": ilf * weights["ILF"]},
        {"step": 5, "name": "Count External Interface Files", "value": eif, "weight": weights["EIF"], "subtotal": eif * weights["EIF"]},
        {"step": 6, "name": "Apply VAF", "formula": "AFP = UFP × VAF", "value": adjusted_fp},
    ]

    estimation = await rest_insert(
        "estimations",
        user,
        {
            "user_id": profile["id"],
            "project_id": payload.project_id,
            "requirements_id": payload.requirements_id,
            "fp_external_inputs": ei,
            "fp_external_outputs": eo,
            "fp_external_inquiries": eq,
            "fp_ilf": ilf,
            "fp_eif": eif,
            "fp_raw_score": ufp,
            "vaf_scores": vaf_scores,
            "vaf_value": vaf_value,
            "adjusted_fp": adjusted_fp,
            "fp_distribution": {"EI": ei, "EO": eo, "EQ": eq, "ILF": ilf, "EIF": eif},
            "cocomo_effort_pm": None,
            "ucp_points": None,
            "status": "completed",
            "updated_at": datetime.utcnow().isoformat(),
            "method_comparison": {"fpa_effort_pm": effort_estimate_pm},
        },
    )

    await rest_update(
        "sessions", user,
        filters={"id": f"eq.{payload.session_id}"},
        updates={"estimation_id": estimation["id"]},
    )

    return {
        "steps": steps,
        "result": {"ufp": ufp, "vaf": vaf_value, "adjusted_fp": adjusted_fp, "effort_estimate_pm": effort_estimate_pm},
        "estimation": estimation,
    }


@router.post("/estimate/cocomo")
async def estimate_cocomo(payload: EstimateCOCOMORequest, user: AuthUser = Depends(get_current_user)):
    await ensure_profile(user)
    A = 2.94
    size_ksloc = max(0.1, payload.loc_estimated / 1000.0)

    sf_sum = 16.46
    E = 0.91 + 0.01 * sf_sum

    em = float(payload.complexity_multiplier) * float(payload.schedule_constraint)
    effort = A * (size_ksloc**E) * em
    duration = 3.67 * (effort**0.28)
    team = max(1, int(round(effort / max(duration, 0.1))))

    console.log(f"[bold blue][COCOMO][/] Effort={effort:.1f} PM, Duration={duration:.1f} months, Team={team}")

    return {
        "inputs": payload.model_dump(),
        "trace": {
            "A": A,
            "KSLOC": round(size_ksloc, 2),
            "SF_sum": sf_sum,
            "E": round(E, 3),
            "EM": round(em, 3),
            "PM": round(effort, 2),
            "duration_months": round(duration, 2),
            "team_size": team,
        },
    }


@router.post("/estimate/ucp")
async def estimate_ucp(payload: EstimateUCPRequest, user: AuthUser = Depends(get_current_user)):
    await ensure_profile(user)

    a = payload.actors
    u = payload.use_cases

    uaw = int(a.get("simple", 0)) * 1 + int(a.get("average", 0)) * 2 + int(a.get("complex", 0)) * 3
    uucw = int(u.get("simple", 0)) * 5 + int(u.get("average", 0)) * 10 + int(u.get("complex", 0)) * 15

    tf = payload.technical_factors or {}
    ef = payload.env_factors or {}

    t_factor = sum(int(v) for v in tf.values()) if tf else 28.5
    e_factor = sum(int(v) for v in ef.values()) if ef else 22.0

    tcf = 0.6 + (0.01 * float(t_factor))
    ecf = 1.4 - (0.03 * float(e_factor))

    ucp = (uaw + uucw) * tcf * ecf
    effort_hours = ucp * payload.productivity_factor_hours
    effort_pm = effort_hours / 160.0

    console.log(f"[bold blue][UCP][/] UAW={uaw}, UUCW={uucw}, TCF={tcf:.2f}, ECF={ecf:.2f}, UCP={ucp:.1f}")

    return {
        "trace": {
            "UAW": uaw,
            "UUCW": uucw,
            "TCF": round(tcf, 3),
            "ECF": round(ecf, 3),
            "UCP": round(ucp, 2),
            "effort_hours": round(effort_hours, 1),
            "effort_pm": round(effort_pm, 2),
        }
    }


@router.post("/estimate/run-all")
async def run_all(request: Request, body: dict[str, Any], user: AuthUser = Depends(get_current_user)):
    """
    Runs FPA + COCOMO + UCP + self-learning and persists method_comparison.
    """
    profile = await ensure_profile(user)

    session_id = body["session_id"]
    project_id = body["project_id"]
    requirements_id = body["requirements_id"]

    fpa = await estimate_fpa(
        EstimateFPARequest(session_id=session_id, project_id=project_id, requirements_id=requirements_id),
        user,
    )
    structured = await _load_structured_features(requirements_id, user)
    loc_est = int(structured.get("loc_estimated") or 10000)
    cocomo = await estimate_cocomo(EstimateCOCOMORequest(session_id=session_id, loc_estimated=loc_est), user)

    actors = structured.get("actors") or {"simple": 3, "average": 4, "complex": 2}
    use_cases = structured.get("use_cases") or {"simple": 5, "average": 8, "complex": 3}
    ucp = await estimate_ucp(EstimateUCPRequest(session_id=session_id, actors=actors, use_cases=use_cases), user)

    raw_est = float(fpa["result"]["effort_estimate_pm"] + cocomo["trace"]["PM"] + ucp["trace"]["effort_pm"]) / 3.0
    sim = request.app.state.similarity
    sl = request.app.state.self_learning

    req_rows = await rest_select("requirements", user, filters={"id": f"eq.{requirements_id}"}, limit=1)
    if not req_rows:
        raise HTTPException(status_code=404, detail="Requirements not found")
    req_row = req_rows[0]

    match = sim.find_match(req_row["requirements_text"])
    referenced = match.project if match else None
    sl_pred = sl.predict(raw_estimate=raw_est, referenced_project=referenced)

    warning = None
    if referenced and (referenced.get("structured_features") or {}).get("outcome") == "delayed":
        warning = (
            f"Warning: Referenced project '{referenced.get('project_name')}' was delayed. "
            "Consider adding a 15% buffer to your estimate."
        )

    method_comparison = {
        "fpa": fpa["result"],
        "cocomo": cocomo["trace"],
        "ucp": ucp["trace"],
        "self_learning": sl_pred,
        "prior_reference": referenced,
        "warning": warning,
    }

    console.log("[bold cyan][DB][/] Saving estimation results...")
    est = await rest_update(
        "estimations", user,
        filters={"id": f"eq.{fpa['estimation']['id']}"},
        updates={
            "loc_estimated": loc_est,
            "cocomo_effort_pm": cocomo["trace"]["PM"],
            "cocomo_duration_months": cocomo["trace"]["duration_months"],
            "ucp_actors": actors,
            "ucp_use_cases": use_cases,
            "ucp_points": ucp["trace"]["UCP"],
            "self_learning_effort_pm": sl_pred["effort_pm"],
            "self_learning_confidence": sl_pred["confidence"],
            "self_learning_correction_factor": sl_pred.get("correction_factor"),
            "self_learning_reasoning": sl_pred.get("reasoning"),
            "method_comparison": method_comparison,
            "recommended_method": "self_learning",
            "updated_at": datetime.utcnow().isoformat(),
        },
    )

    return {"combined": method_comparison, "estimation": est}
