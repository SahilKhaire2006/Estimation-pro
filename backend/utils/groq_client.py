from __future__ import annotations

import json
import re
from typing import Any

import httpx
from rich.console import Console

from config import get_settings

console = Console()


class GroqClient:
    def __init__(self) -> None:
        s = get_settings()
        self.api_key = s.groq_api_key
        self.model = s.groq_model

    async def chat(self, system: str, user: str, temperature: float = 0.2) -> str:
        console.log("[bold magenta][GROQ][/] Calling LLM...")
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {
            "model": self.model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            # If Groq is misconfigured (common in student setups), don't break the app.
            # Fall back to deterministic local generation so the system remains usable.
            detail = ""
            if isinstance(e, httpx.HTTPStatusError):
                try:
                    detail = e.response.text
                except Exception:
                    detail = ""
            console.log("[bold yellow][GROQ][/] Groq call failed — using local fallback.")
            if detail:
                console.log(f"[bold yellow][GROQ][/] Response: {detail[:500]}")
            return self._fallback_text(system=system, user=user)

    async def chat_json(self, system: str, user: str, temperature: float = 0.1) -> dict[str, Any]:
        text = await self.chat(system=system, user=user, temperature=temperature)
        try:
            return json.loads(text)
        except Exception:
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                return json.loads(text[start : end + 1])
            # Last resort: deterministic feature extraction
            return self._fallback_features(user)

    def _fallback_text(self, system: str, user: str) -> str:
        s = (system or "").lower()
        if "code structure" in s or "software architect" in s:
            return self._fallback_code_structure(user)
        if "extract" in s and "json" in s:
            return json.dumps(self._fallback_features(user), ensure_ascii=False)
        return (
            "Groq is currently unavailable (invalid key/model or network issue). "
            "I can still proceed using locally generated estimates and structure."
        )

    def _fallback_code_structure(self, user: str) -> str:
        req = (user or "").strip()
        modules = self._extract_modules(req)
        modules_md = "\n".join([f"- {m}" for m in modules]) if modules else "- (modules inferred from requirements)"
        return (
            "# Project Structure (Local Fallback)\n\n"
            "## Backend (FastAPI)\n"
            "- `backend/main.py` — app startup, routers, ML engines\n"
            "- `backend/routers/` — auth, projects, sessions, estimations, code_structure, chat, whatif, reports\n"
            "- `backend/ml/` — TF-IDF similarity + LinearRegression\n"
            "- `backend/utils/` — Groq client, PDF generator, cache helpers\n\n"
            "## Frontend (React + TypeScript)\n"
            "- `frontend/src/pages/Auth.tsx` — login/signup\n"
            "- `frontend/src/pages/Dashboard.tsx` — projects\n"
            "- `frontend/src/pages/New.tsx` — requirements input\n"
            "- `frontend/src/pages/Session.tsx` — studio/code/chat/what-if/stats\n\n"
            "## Modules\n"
            f"{modules_md}\n\n"
            "## API\n"
            "- `POST /api/sessions/bootstrap`\n"
            "- `POST /api/estimate/run-all`\n"
            "- `POST /api/code-structure/generate`\n"
            "- `POST /api/chat/{session_id}`\n"
        )

    def _fallback_features(self, user: str) -> dict[str, Any]:
        req = self._extract_requirements_text(user)
        modules = self._extract_modules(req)
        wc = len(re.findall(r"\S+", req))
        loc_est = int(max(2000, min(60000, wc * 80)))
        complexity = "Low" if wc < 60 else "Medium" if wc < 140 else "High" if wc < 260 else "Very High"
        integrations = []
        low = req.lower()
        for k in ["stripe", "paypal", "razorpay", "redis", "postgres", "supabase", "email", "sms"]:
            if k in low:
                integrations.append(k)
        return {
            "modules": modules[:20],
            "actors": {"simple": 3, "average": 4, "complex": 2},
            "use_cases": {
                "simple": max(3, len(modules) // 2),
                "average": max(5, len(modules)),
                "complex": max(2, len(modules) // 3),
            },
            "integrations": integrations,
            "non_functional": self._extract_nfr(req),
            "loc_estimated": loc_est,
            "complexity": complexity,
            "schedule_pressure": "Normal",
            "tool_support": "Good",
        }

    def _extract_requirements_text(self, user: str) -> str:
        # callers pass "REQUIREMENTS:\n..." sometimes
        return re.sub(r"^requirements:\s*", "", user.strip(), flags=re.I)

    def _extract_modules(self, text: str) -> list[str]:
        lines = [l.strip(" -•\t") for l in (text or "").splitlines() if l.strip()]
        bullets = [l for l in lines if len(l) >= 4][:40]
        cleaned: list[str] = []
        for b in bullets:
            b = re.sub(r"\s+", " ", b)
            b = re.sub(r"\([^)]*\)", "", b).strip()
            if 4 <= len(b) <= 80:
                cleaned.append(b)
        # dedupe preserving order
        seen = set()
        out = []
        for m in cleaned:
            key = m.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(m)
        return out

    def _extract_nfr(self, text: str) -> list[str]:
        nfr = []
        for kw, label in [
            ("pci", "PCI compliance"),
            ("uptime", "High availability"),
            ("99.9", "High availability"),
            ("performance", "Performance requirements"),
            ("concurrent", "Concurrency / scaling"),
            ("security", "Security requirements"),
        ]:
            if kw in (text or "").lower():
                nfr.append(label)
        # dedupe
        return list(dict.fromkeys(nfr))[:10]

