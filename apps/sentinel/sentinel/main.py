"""Aplicación ASGI del sentinel: sondas + /snapshot (JSON) + /metrics (Prometheus)."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx
from fastapi import FastAPI, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from .config import Settings
from .monitor import Monitor


def create_app(settings: Settings, *, run_loop: bool = True) -> FastAPI:
    monitor = Monitor(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        # Un único cliente reutiliza conexiones (keep-alive) entre sondas.
        async with httpx.AsyncClient(timeout=settings.timeout_seconds) as client:
            task = asyncio.create_task(monitor.run(client)) if run_loop else None
            try:
                yield
            finally:
                if task:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)

    # Sin docs/OpenAPI: el servicio es interno y no necesita superficie extra.
    app = FastAPI(title="Faro sentinel", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.monitor = monitor

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/snapshot")
    def snapshot() -> dict:
        return monitor.snapshot()

    @app.get("/metrics")
    def metrics() -> Response:
        return Response(generate_latest(monitor.metrics.registry), media_type=CONTENT_TYPE_LATEST)

    return app


def create_app_from_env() -> FastAPI:
    """Punto de entrada para `uvicorn --factory`."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    return create_app(Settings.from_env())
