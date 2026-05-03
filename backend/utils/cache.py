from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from rich.console import Console

console = Console()


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _sentences(text: str) -> list[str]:
    chunks = re.split(r"(?<=[.!?])\s+", (text or "").strip())
    return [c.strip() for c in chunks if c.strip()]


def diff_ratio(old_text: str, new_text: str) -> float:
    old = set(_sentences(old_text))
    new = set(_sentences(new_text))
    if not old and not new:
        return 0.0
    if not old:
        return 1.0
    changed = len(new - old)
    return min(1.0, changed / max(1, len(new)))


def merge_structured_features(old_features: dict[str, Any] | None, new_features: dict[str, Any] | None) -> dict[str, Any]:
    base = dict(old_features or {})
    incoming = dict(new_features or {})
    for k, v in incoming.items():
        base[k] = v
    return base


def dumps_compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

