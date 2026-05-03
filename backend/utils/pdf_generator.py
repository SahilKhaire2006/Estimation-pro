from __future__ import annotations

from io import BytesIO
from typing import Any

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas


def build_report_pdf(session: dict[str, Any]) -> bytes:
    """
    Generates a readable PDF report (executive summary + key results).
    Returns raw PDF bytes.
    """
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    width, height = letter

    y = height - 0.75 * inch
    c.setFont("Helvetica-Bold", 16)
    c.drawString(0.75 * inch, y, "EstimationPro — Estimation Report")

    y -= 0.4 * inch
    c.setFont("Helvetica", 11)
    c.drawString(0.75 * inch, y, f"Session: {session.get('session_name') or session.get('id')}")

    y -= 0.25 * inch
    proj = session.get("project") or {}
    c.drawString(0.75 * inch, y, f"Project: {proj.get('project_name', '')}")

    y -= 0.35 * inch
    c.setFont("Helvetica-Bold", 12)
    c.drawString(0.75 * inch, y, "Summary")

    y -= 0.2 * inch
    c.setFont("Helvetica", 10)
    req = (session.get("requirements_text") or "").strip()
    if req:
        preview = req[:900] + ("..." if len(req) > 900 else "")
        for line in _wrap(preview, 95):
            c.drawString(0.75 * inch, y, line)
            y -= 0.16 * inch
            if y < 1.2 * inch:
                c.showPage()
                y = height - 0.75 * inch
                c.setFont("Helvetica", 10)

    y -= 0.2 * inch
    c.setFont("Helvetica-Bold", 12)
    c.drawString(0.75 * inch, y, "Estimation Results")

    y -= 0.25 * inch
    c.setFont("Helvetica", 11)
    results = session.get("results") or {}
    for k in ["fpa", "cocomo", "ucp", "self_learning"]:
        if k in results:
            c.drawString(0.85 * inch, y, f"- {k}: {results[k]}")
            y -= 0.2 * inch

    c.showPage()
    c.save()
    return buf.getvalue()


def _wrap(text: str, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line: list[str] = []
    n = 0
    for w in words:
        if n + len(w) + (1 if line else 0) > width:
            lines.append(" ".join(line))
            line = [w]
            n = len(w)
        else:
            line.append(w)
            n += len(w) + (1 if line else 0)
    if line:
        lines.append(" ".join(line))
    return lines

