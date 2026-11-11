"""Configuración del sentinel, leída una sola vez desde variables de entorno."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True, slots=True)
class Settings:
    api_url: str = "http://api:3000/health/ready"
    cert_path: Path | None = None
    interval_seconds: float = 10.0
    timeout_seconds: float = 2.0
    history_size: int = 60  # 60 muestras × 10 s = 10 minutos de historial

    @classmethod
    def from_env(cls, env: Mapping[str, str] = os.environ) -> "Settings":
        # Con `slots=True` los valores por defecto viven en una instancia, no en la clase.
        d = cls()
        cert = env.get("CERT_PATH")
        settings = cls(
            api_url=env.get("API_URL", d.api_url),
            cert_path=Path(cert) if cert else None,
            interval_seconds=float(env.get("PROBE_INTERVAL_SECONDS", d.interval_seconds)),
            timeout_seconds=float(env.get("PROBE_TIMEOUT_SECONDS", d.timeout_seconds)),
            history_size=int(env.get("HISTORY_SIZE", d.history_size)),
        )
        if settings.interval_seconds <= 0 or settings.timeout_seconds <= 0 or settings.history_size < 1:
            raise ValueError("Intervalo, timeout e historial deben ser positivos")
        return settings
