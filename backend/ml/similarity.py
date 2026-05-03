from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from rich.console import Console
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

console = Console()

# ── Domain → default tech stack (local, zero LLM) ────────────────────────────
_DOMAIN_STACKS: dict[str, list[str]] = {
    "e-commerce":      ["FastAPI", "React", "PostgreSQL", "Redis", "Stripe", "Celery"],
    "healthcare":      ["Django", "React", "PostgreSQL", "Twilio", "WebRTC", "HL7/FHIR"],
    "fintech":         ["Spring Boot", "React", "PostgreSQL", "Kafka", "Redis", "JWT"],
    "logistics":       ["FastAPI", "React Native", "PostGIS", "Redis", "Celery"],
    "social":          ["Go", "React", "Cassandra", "Redis", "WebSocket"],
    "iot":             ["FastAPI", "React", "MQTT", "InfluxDB", "Docker"],
    "education":       ["Django", "React", "PostgreSQL", "AWS S3", "Celery"],
    "crm":             ["Django", "React", "PostgreSQL", "SendGrid", "Celery"],
    "analytics":       ["FastAPI", "React", "ClickHouse", "Kafka", "Redis"],
    "security":        ["Django", "React", "Elasticsearch", "Kafka", "scikit-learn"],
    "developer tools": ["Go", "React", "Docker", "WebSocket", "PostgreSQL"],
    "marketplace":     ["Node.js", "React", "MongoDB", "Redis", "Stripe"],
    "travel":          ["Spring Boot", "Angular", "PostgreSQL", "Redis", "Stripe"],
    "food":            ["Node.js", "React", "PostgreSQL", "Redis", "Socket.io"],
    "hr":              ["Django", "React", "PostgreSQL", "Elasticsearch", "Celery"],
    "real estate":     ["Django", "React", "PostgreSQL", "Stripe Connect"],
    "fitness":         ["Node.js", "React Native", "MongoDB", "Firebase"],
    "legal":           ["Rails", "React", "PostgreSQL", "Docx generator"],
    "supply chain":    ["FastAPI", "React", "PostgreSQL", "Kafka", "Docker"],
    "default":         ["FastAPI", "React", "PostgreSQL", "Redis", "Docker"],
}

_KEYWORD_STACK_HINTS: dict[str, list[str]] = {
    "payment":      ["Stripe", "PayPal", "Razorpay"],
    "chat":         ["WebSocket", "Socket.io", "Firebase"],
    "realtime":     ["WebSocket", "Redis Pub/Sub", "Kafka"],
    "mobile":       ["React Native", "Flutter"],
    "ml":           ["scikit-learn", "PyTorch", "FastAPI"],
    "search":       ["Elasticsearch", "Typesense"],
    "email":        ["SendGrid", "Mailgun", "Celery"],
    "video":        ["WebRTC", "AWS Kinesis", "Twilio Video"],
    "blockchain":   ["Ethereum", "Solidity", "Web3.js"],
    "map":          ["PostGIS", "Mapbox", "Google Maps API"],
    "file":         ["AWS S3", "MinIO", "Cloudinary"],
    "auth":         ["JWT", "OAuth2", "Supabase Auth"],
    "notification": ["Firebase FCM", "Twilio", "SendGrid"],
    "queue":        ["Celery", "RabbitMQ", "Kafka"],
    "cache":        ["Redis", "Memcached"],
    "pdf":          ["ReportLab", "WeasyPrint", "Puppeteer"],
}

# Threshold above which a project is considered "similar enough"
SIMILARITY_THRESHOLD = 0.40   # lowered so partial matches are captured
HIGH_SIMILARITY_THRESHOLD = 0.72  # full local reuse


def _recommend_stack(
    requirements_text: str,
    domain: str | None,
    matched_stacks: list[list[str]],
) -> dict[str, Any]:
    """Build tech-stack recommendation from local data only — no LLM."""
    req_lower = requirements_text.lower()
    domain_lower = (domain or "").lower()

    # Merge all matched stacks (deduped, order-preserving)
    recommended: list[str] = []
    from_similar: list[str] = []
    seen: set[str] = set()
    for stack in matched_stacks:
        for item in stack:
            if item not in seen:
                seen.add(item)
                recommended.append(item)
                from_similar.append(item)

    # Add domain defaults
    for key, stack in _DOMAIN_STACKS.items():
        if key in domain_lower or key in req_lower:
            for item in stack:
                if item not in seen:
                    seen.add(item)
                    recommended.append(item)
            break
    else:
        for item in _DOMAIN_STACKS["default"]:
            if item not in seen:
                seen.add(item)
                recommended.append(item)

    # Keyword hints
    hints_added: list[str] = []
    for keyword, tools in _KEYWORD_STACK_HINTS.items():
        if keyword in req_lower:
            for tool in tools[:1]:
                if tool not in seen:
                    seen.add(tool)
                    recommended.append(tool)
                    hints_added.append(tool)

    return {
        "recommended": recommended[:14],
        "from_similar_project": from_similar,
        "keyword_hints": hints_added,
        "confidence": "high" if from_similar else "medium",
    }


def _merge_code_structures(matches: list["SimilarityMatch"], req: str) -> tuple[str, int, int]:
    """
    Merge code structures from multiple similar projects locally.
    Returns (merged_text, local_pct, llm_pct).
    """
    if not matches:
        return "", 0, 100

    # Weight each project's contribution by its similarity score
    total_score = sum(m.score for m in matches if m.project.get("code_structure"))
    if total_score == 0:
        return "", 0, 100

    sections: list[str] = []
    for m in matches:
        cs = m.project.get("code_structure")
        if not cs:
            continue
        weight = m.score / total_score
        pct = int(round(weight * 100))
        sections.append(f"<!-- From: {m.project.get('project_name')} ({pct}% weight) -->\n{cs.strip()}")

    merged = "\n\n---\n\n".join(sections)

    # local_pct = average score of contributing projects (capped at 95)
    avg_score = total_score / max(len([m for m in matches if m.project.get("code_structure")]), 1)
    local_pct = min(95, int(round(avg_score * 100)))
    llm_pct = 100 - local_pct

    return merged, local_pct, llm_pct


@dataclass
class SimilarityMatch:
    score: float
    project: dict[str, Any]
    tech_stack_recommendation: dict[str, Any] = field(default_factory=dict)


class SimilarityEngine:
    def __init__(self) -> None:
        self.vectorizer = TfidfVectorizer(
            stop_words="english",
            max_features=800,
            ngram_range=(1, 1),      # unigrams only — better cross-vocabulary matching
            sublinear_tf=True,       # log normalization
            min_df=1,
        )
        self.past_projects: list[dict[str, Any]] = []
        self.matrix = None

    def load_and_fit(self, projects: list[dict[str, Any]]) -> None:
        self.past_projects = [p for p in projects if p.get("requirements_text")]
        corpus = [p["requirements_text"] for p in self.past_projects]
        if len(corpus) >= 2:
            self.matrix = self.vectorizer.fit_transform(corpus)
        else:
            self.matrix = None
        console.log(f"[bold green][ML][/] TF-IDF fitted on {len(corpus)} past projects")

    def find_top_matches(
        self,
        new_requirements: str,
        domain: str | None = None,
        top_n: int = 3,
    ) -> list[SimilarityMatch]:
        """
        Return up to top_n matches above SIMILARITY_THRESHOLD.
        Used for multi-project code structure generation.
        """
        if self.matrix is None or len(self.past_projects) < 2:
            return []

        vec = self.vectorizer.transform([new_requirements])
        scores = cosine_similarity(vec, self.matrix)[0]
        sorted_indices = np.argsort(scores)[::-1]

        matches: list[SimilarityMatch] = []
        for idx in sorted_indices[:top_n * 2]:  # check more, filter below threshold
            score = float(scores[idx])
            if score < SIMILARITY_THRESHOLD:
                break
            matches.append(SimilarityMatch(score=score, project=self.past_projects[idx]))
            if len(matches) >= top_n:
                break

        if matches:
            names = ", ".join(f"'{m.project.get('project_name')}' ({m.score:.2f})" for m in matches)
            console.log(f"[bold green][ML][/] Top matches: {names}")

        # Build merged tech stack recommendation from all matches
        all_stacks: list[list[str]] = []
        for m in matches:
            stack = m.project.get("tech_stack") or []
            if isinstance(stack, str):
                stack = [t.strip() for t in stack.split(",") if t.strip()]
            all_stacks.append(stack)

        stack_rec = _recommend_stack(new_requirements, domain, all_stacks)
        for m in matches:
            m.tech_stack_recommendation = stack_rec

        return matches

    def find_match(self, new_requirements: str, domain: str | None = None) -> SimilarityMatch | None:
        """Legacy single-match interface — wraps find_top_matches."""
        matches = self.find_top_matches(new_requirements, domain, top_n=1)
        if not matches:
            # Still build stack recommendation even with no match
            stack_rec = _recommend_stack(new_requirements, domain, [])
            return SimilarityMatch(score=0.0, project={}, tech_stack_recommendation=stack_rec)

        best = matches[0]
        if best.score < HIGH_SIMILARITY_THRESHOLD:
            console.log(f"[bold yellow][ML][/] Best score {best.score:.3f} below high threshold — Groq will supplement")
        return best

    def retrain(self, new_project: dict[str, Any]) -> None:
        """Add a new project to the in-memory model without full restart."""
        if not new_project.get("requirements_text"):
            return
        self.past_projects.append(new_project)
        corpus = [p["requirements_text"] for p in self.past_projects]
        if len(corpus) >= 2:
            self.matrix = self.vectorizer.fit_transform(corpus)
        console.log(f"[bold green][ML][/] Retrained on {len(corpus)} projects (added: {new_project.get('project_name')})")
