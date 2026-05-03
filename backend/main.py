from __future__ import annotations

import asyncio
import traceback

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from rich.console import Console
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from config import get_settings
from ml.regression import SelfLearningEngine
from ml.similarity import SimilarityEngine
from ml.train_from_json import seed_past_projects_if_needed
from routers import (
    auth,
    chat,
    code_structure,
    estimations,
    projects,
    reports,
    sessions,
    whatif,
)

console = Console()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="EstimationPro API", version="1.0.0")

    class RequestLogMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            console.log(f"[bold cyan][API][/] {request.method} {request.url.path}")
            try:
                response = await call_next(request)
                console.log(f"[bold cyan][API][/] → {response.status_code}")
                return response
            except Exception as e:
                console.log("[bold red][API][/] Unhandled exception")
                console.log(traceback.format_exc())
                return JSONResponse(status_code=500, content={"detail": str(e) or "Internal Server Error"})

    app.add_middleware(RequestLogMiddleware)

    app.add_middleware(
        CORSMiddleware,
        # Using Bearer tokens (not cookies), so credentials are not required.
        # This avoids the invalid/blocked combination of "*" + credentials in browsers.
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router, prefix=s.api_base_path)
    app.include_router(projects.router, prefix=s.api_base_path)
    app.include_router(sessions.router, prefix=s.api_base_path)
    app.include_router(estimations.router, prefix=s.api_base_path)
    app.include_router(code_structure.router, prefix=s.api_base_path)
    app.include_router(chat.router, prefix=s.api_base_path)
    app.include_router(whatif.router, prefix=s.api_base_path)
    app.include_router(reports.router, prefix=s.api_base_path)

    @app.on_event("startup")
    async def _startup() -> None:
        console.log("[bold cyan][DB][/] Seeding and training local ML...")
        seeded = await asyncio.to_thread(seed_past_projects_if_needed)
        past = seeded["rows"]

        sim = SimilarityEngine()
        await asyncio.to_thread(sim.load_and_fit, past)

        sl = SelfLearningEngine()
        await asyncio.to_thread(sl.train, past)

        app.state.similarity = sim
        app.state.self_learning = sl
        app.state.past_projects = past

    return app


app = create_app()

