"""Métricas Prometheus del sentinel, en un registro propio para facilitar las pruebas."""
from __future__ import annotations

from prometheus_client import CollectorRegistry, Counter, Gauge

from .probes import CertInfo, ProbeResult


class Metrics:
    def __init__(self) -> None:
        self.registry = CollectorRegistry()
        self._up = Gauge("faro_probe_up", "1 si la sonda respondió con éxito", ["target"], registry=self.registry)
        self._latency = Gauge(
            "faro_probe_latency_seconds", "Latencia de la última sonda", ["target"], registry=self.registry
        )
        self._failures = Counter(
            "faro_probe_failures_total", "Sondas fallidas", ["target"], registry=self.registry
        )
        self._cert_days = Gauge(
            "faro_certificate_days_remaining", "Días hasta el vencimiento del certificado TLS", registry=self.registry
        )

    def observe_probe(self, target: str, result: ProbeResult) -> None:
        self._up.labels(target).set(1 if result.up else 0)
        if result.latency_ms is not None:
            self._latency.labels(target).set(result.latency_ms / 1000)
        if not result.up:
            self._failures.labels(target).inc()

    def observe_certificate(self, cert: CertInfo | None) -> None:
        # Sin certificado la serie se omite en lugar de reportar un 0 engañoso.
        if cert is not None:
            self._cert_days.set(cert.days_remaining)
