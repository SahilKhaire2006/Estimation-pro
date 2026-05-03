from __future__ import annotations

from typing import Any

import numpy as np
from rich.console import Console
from sklearn.linear_model import LinearRegression

console = Console()


class SelfLearningEngine:
    def __init__(self) -> None:
        self.model: LinearRegression | None = None
        self.r2: float = 0.0
        self.n: int = 0

    def train(self, past_projects: list[dict[str, Any]]) -> LinearRegression | None:
        rows = [
            (p["estimated_effort_pm"], p["actual_effort_pm"])
            for p in past_projects
            if p.get("estimated_effort_pm") and p.get("actual_effort_pm")
        ]
        self.n = len(rows)
        if self.n < 5:
            self.model = None
            console.log("[bold yellow][ML][/] Not enough rows for self-learning regression (need ≥ 5)")
            return None

        X = np.array([[r[0]] for r in rows], dtype=float)
        y = np.array([r[1] for r in rows], dtype=float)
        self.model = LinearRegression().fit(X, y)
        self.r2 = float(self.model.score(X, y))
        console.log(f"[bold green][ML][/] Self-learning model trained on {len(rows)} projects — R²: {self.r2:.3f}")
        return self.model

    def predict(self, raw_estimate: float, referenced_project: dict[str, Any] | None = None) -> dict[str, Any]:
        if not self.model:
            return {"effort_pm": raw_estimate, "confidence": 60, "reasoning": "Insufficient training data"}

        adjusted = float(self.model.predict([[float(raw_estimate)]])[0])
        confidence = min(95, int(self.r2 * 100) + 10)

        reasoning = (
            f"Based on {self.n} training projects, raw estimate of {raw_estimate:.1f} PM "
            f"adjusted to {adjusted:.1f} PM (correction factor: {float(self.model.coef_[0]):.2f}). "
        )
        if referenced_project:
            reasoning += (
                f"Similar project '{referenced_project['project_name']}' had actual effort of "
                f"{referenced_project.get('actual_effort_pm')} PM vs estimated {referenced_project.get('estimated_effort_pm')} PM."
            )

        console.log(
            f"[bold green][ML][/] Self-learning prediction: {raw_estimate:.1f} PM → {adjusted:.1f} PM (confidence: {confidence}%)"
        )
        return {
            "effort_pm": round(adjusted, 2),
            "confidence": confidence,
            "correction_factor": float(self.model.coef_[0]),
            "r2_score": round(self.r2, 3),
            "reasoning": reasoning,
        }

