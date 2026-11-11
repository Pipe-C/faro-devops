"""Sondas puras: reciben sus dependencias y devuelven datos, sin efectos laterales."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import httpx
from cryptography import x509
from cryptography.x509.oid import NameOID

log = logging.getLogger("sentinel.probes")


@dataclass(frozen=True, slots=True)
class ProbeResult:
    up: bool
    latency_ms: float | None  # None cuando la sonda falló sin respuesta
    at: datetime


@dataclass(frozen=True, slots=True)
class CertInfo:
    days_remaining: float
    not_after: datetime
    subject: str


async def probe_http(client: httpx.AsyncClient, url: str) -> ProbeResult:
    """Hace un GET y mide la latencia con un reloj monotónico (inmune a cambios de hora)."""
    start = time.perf_counter()
    at = datetime.now(timezone.utc)
    try:
        response = await client.get(url)
    except httpx.HTTPError as exc:
        log.warning("sonda fallida url=%s error=%s", url, type(exc).__name__)
        return ProbeResult(up=False, latency_ms=None, at=at)
    latency_ms = (time.perf_counter() - start) * 1000
    # Se informa latencia incluso con 5xx: el servicio respondió, pero no está "up".
    return ProbeResult(up=response.is_success, latency_ms=round(latency_ms, 2), at=at)


def read_certificate(path: Path | None, now: datetime | None = None) -> CertInfo | None:
    """Lee el primer certificado de un PEM (la hoja en un fullchain) y calcula su vigencia.

    Se lee del disco en lugar de abrir una conexión TLS: no necesita red y
    detecta el vencimiento aunque el proxy aún no haya recargado el certificado.
    """
    if path is None:
        return None
    try:
        cert = x509.load_pem_x509_certificate(path.read_bytes())
    except (OSError, ValueError) as exc:
        log.warning("no se pudo leer el certificado path=%s error=%s", path, type(exc).__name__)
        return None

    now = now or datetime.now(timezone.utc)
    common_names = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)
    subject = str(common_names[0].value) if common_names else cert.subject.rfc4514_string()
    days = (cert.not_valid_after_utc - now).total_seconds() / 86400
    return CertInfo(days_remaining=round(days, 2), not_after=cert.not_valid_after_utc, subject=subject)
