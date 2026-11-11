from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from sentinel.config import Settings
from sentinel.main import create_app
from sentinel.probes import ProbeResult


@pytest.fixture
def app():
    return create_app(Settings(history_size=3), run_loop=False)


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


def result(up=True, ms=5.0):
    return ProbeResult(up=up, latency_ms=ms, at=datetime.now(timezone.utc))


def test_snapshot_vacio_antes_de_la_primera_sonda(client):
    body = client.get("/snapshot").json()
    assert body["history"] == []
    assert body["api"] == {"up": False, "latency_ms": None}
    assert body["certificate"] is None


def test_historial_descarta_muestras_antiguas(app, client):
    for ms in (1.0, 2.0, 3.0, 4.0):
        app.state.monitor.record(result(ms=ms), None)
    history = client.get("/snapshot").json()["history"]
    assert [h["latency_ms"] for h in history] == [2.0, 3.0, 4.0]


def test_metricas_reflejan_la_ultima_sonda(app, client):
    app.state.monitor.record(result(up=False, ms=None), None)
    text = client.get("/metrics").text
    assert 'faro_probe_up{target="api"} 0.0' in text
    assert 'faro_probe_failures_total{target="api"} 1.0' in text


def test_healthz_y_sin_docs(client):
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/docs").status_code == 404


def test_settings_rechaza_valores_invalidos():
    with pytest.raises(ValueError):
        Settings.from_env({"PROBE_INTERVAL_SECONDS": "0"})
