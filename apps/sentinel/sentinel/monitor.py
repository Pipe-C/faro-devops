"""Estado del sentinel: bucle de sondeo e historial acotado en memoria."""
from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

import httpx

from .config import Settings
from .metrics import Metrics
from .probes import CertInfo, ProbeResult, probe_http, read_certificate

log = logging.getLogger("sentinel.monitor")


class Monitor:
    def __init__(self, settings: Settings, metrics: Metrics | None = None) -> None:
        self.settings = settings
        self.metrics = metrics or Metrics()
        # deque con maxlen descarta solas las muestras antiguas: memoria constante.
        self._history: deque[ProbeResult] = deque(maxlen=settings.history_size)
        self._cert: CertInfo | None = None
        self._updated_at: datetime | None = None

    def record(self, result: ProbeResult, cert: CertInfo | None) -> None:
        self._history.append(result)
        self._cert = cert
        self._updated_at = result.at
        self.metrics.observe_probe("api", result)
        self.metrics.observe_certificate(cert)

    async def tick(self, client: httpx.AsyncClient) -> None:
        result = await probe_http(client, self.settings.api_url)
        # La lectura del certificado es E/S de disco bloqueante: se delega a un hilo.
        cert = await asyncio.to_thread(read_certificate, self.settings.cert_path)
        self.record(result, cert)

    async def run(self, client: httpx.AsyncClient) -> None:
        """Sondea cada `interval_seconds` descontando lo que tardó la propia sonda."""
        while True:
            started = time.monotonic()
            try:
                await self.tick(client)
            except Exception:  # un fallo inesperado no debe matar el bucle
                log.exception("error inesperado en el ciclo de sondeo")
            await asyncio.sleep(max(0.0, self.settings.interval_seconds - (time.monotonic() - started)))

    def snapshot(self) -> dict[str, Any]:
        latest = self._history[-1] if self._history else None
        return {
            "updated_at": (self._updated_at or datetime.now(timezone.utc)).isoformat(),
            "interval_seconds": self.settings.interval_seconds,
            "api": {"up": latest.up if latest else False, "latency_ms": latest.latency_ms if latest else None},
            "history": [
                {"at": r.at.isoformat(), "up": r.up, "latency_ms": r.latency_ms} for r in self._history
            ],
            "certificate": None
            if self._cert is None
            else {
                "days_remaining": self._cert.days_remaining,
                "not_after": self._cert.not_after.isoformat(),
                "subject": self._cert.subject,
            },
        }
