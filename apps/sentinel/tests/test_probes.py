from datetime import datetime, timedelta, timezone

import httpx
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from sentinel.probes import probe_http, read_certificate


def client_with(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_probe_up_mide_latencia():
    async with client_with(lambda req: httpx.Response(200)) as client:
        result = await probe_http(client, "http://api/health/ready")
    assert result.up is True
    assert result.latency_ms is not None and result.latency_ms >= 0


async def test_probe_5xx_no_esta_up_pero_conserva_latencia():
    async with client_with(lambda req: httpx.Response(503)) as client:
        result = await probe_http(client, "http://api/health/ready")
    assert result.up is False
    assert result.latency_ms is not None


async def test_probe_error_de_red_no_lanza_excepcion():
    def boom(req):
        raise httpx.ConnectError("sin ruta")

    async with client_with(boom) as client:
        result = await probe_http(client, "http://api/health/ready")
    assert result.up is False
    assert result.latency_ms is None


def write_cert(path, days: int, cn: str = "faro.localhost") -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now + timedelta(days=min(days, 0) - 1))
        .not_valid_after(now + timedelta(days=days))
        .sign(key, hashes.SHA256())
    )
    path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))


def test_read_certificate_calcula_dias_restantes(tmp_path):
    pem = tmp_path / "fullchain.pem"
    write_cert(pem, days=30)
    info = read_certificate(pem)
    assert info is not None
    assert info.subject == "faro.localhost"
    assert 29.9 < info.days_remaining <= 30.0


def test_read_certificate_vencido_da_dias_negativos(tmp_path):
    pem = tmp_path / "fullchain.pem"
    write_cert(pem, days=-5)
    assert read_certificate(pem).days_remaining < 0  # type: ignore[union-attr]


@pytest.mark.parametrize("content", [None, b"esto no es un PEM"])
def test_read_certificate_tolera_ausente_o_corrupto(tmp_path, content):
    pem = tmp_path / "fullchain.pem"
    if content is not None:
        pem.write_bytes(content)
    assert read_certificate(pem) is None
    assert read_certificate(None) is None
