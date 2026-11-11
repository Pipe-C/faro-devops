#!/usr/bin/env python3
"""Automatización operativa de Faro. Solo usa la biblioteca estándar de Python.

Subcomandos:
  init          genera secretos aleatorios y el archivo .env
  certs         crea una CA local y un certificado TLS para el dominio
  doctor        revisa requisitos antes de levantar el entorno
  smoke         prueba de humo de extremo a extremo (HTTPS, API, cabeceras…)
  backup        volcado comprimido de MySQL con retención
  restore       restaura un volcado
  vpn           consulta la configuración de los clientes WireGuard
  letsencrypt   emite o renueva un certificado público
"""
from __future__ import annotations

import argparse
import gzip
import http.client
import json
import os
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Sequence

ROOT = Path(__file__).resolve().parent.parent
SECRET_NAMES = ("db_password", "db_root_password", "grafana_admin_password")

OK, WARN, FAIL = "✓", "!", "✗"


# --------------------------------------------------------------------- utilidades
def compose(root: Path = ROOT) -> list[str]:
    """Prefijo del comando `docker compose` anclado a la raíz del proyecto."""
    return ["docker", "compose", "--project-directory", str(root)]


def run(cmd: Sequence[str], **kwargs) -> subprocess.CompletedProcess:
    # Siempre lista de argumentos y nunca shell=True: evita inyección de comandos.
    return subprocess.run(list(cmd), check=True, text=True, **kwargs)


def read_env(root: Path = ROOT) -> dict[str, str]:
    """Lee .env (o .env.example) sin dependencias externas."""
    path = root / ".env"
    if not path.exists():
        path = root / ".env.example"
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip()
    return values


def generate_secret(nbytes: int = 24) -> str:
    """Contraseña aleatoria criptográficamente segura, apta para URLs y shells."""
    return secrets.token_urlsafe(nbytes)


def write_private(path: Path, content: str) -> None:
    """Escribe con permisos 0644 desde la creación (sin ventana con permisos laxos).

    ¿Por qué 0644 y no 0600? Docker monta el archivo tal cual: los contenedores
    corren como usuarios sin privilegios (uid 1000, 101, 472…) y no podrían leer
    un archivo 0600 del anfitrión. La protección real es el DIRECTORIO (0700):
    ningún otro usuario del anfitrión puede entrar a leer el archivo.
    """
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(content)
    path.chmod(0o644)


# ------------------------------------------------------------------------- init
def init_secrets(secrets_dir: Path, force: bool = False) -> list[str]:
    """Crea los secretos que falten y devuelve los nombres creados."""
    secrets_dir.mkdir(parents=True, exist_ok=True)
    secrets_dir.chmod(0o700)
    created = []
    for name in SECRET_NAMES:
        path = secrets_dir / f"{name}.txt"
        if path.exists() and not force:
            continue
        write_private(path, generate_secret() + "\n")
        created.append(name)
    return created


def cmd_init(args: argparse.Namespace) -> int:
    created = init_secrets(ROOT / "deploy" / "secrets", args.force)
    print(f"{OK} Secretos nuevos: {', '.join(created)}" if created else f"{OK} Los secretos ya existen (usa --force para regenerarlos)")
    if args.force and created:
        print(f"{WARN} Regeneraste las contraseñas: borra el volumen de MySQL (`make clean`) o la base rechazará al usuario.")

    env, example = ROOT / ".env", ROOT / ".env.example"
    if not env.exists():
        shutil.copyfile(example, env)
        print(f"{OK} Creado .env a partir de .env.example")
    print(f"  Usuario de Grafana: admin · contraseña en deploy/secrets/grafana_admin_password.txt")
    return 0


# ------------------------------------------------------------------------ certs
def generate_certs(certs_dir: Path, domain: str, days: int = 365) -> None:
    """CA local + certificado de servidor firmado por ella, con curvas elípticas P-256."""
    if shutil.which("openssl") is None:
        raise RuntimeError("openssl no está instalado")
    ec = ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes"]

    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        run(["openssl", "req", "-x509", *ec, "-keyout", t / "ca.key", "-out", t / "ca.crt",
             "-days", "3650", "-subj", "/CN=Faro Local CA"], capture_output=True)
        run(["openssl", "req", "-new", *ec, "-keyout", t / "leaf.key", "-out", t / "leaf.csr",
             "-subj", f"/CN={domain}"], capture_output=True)
        # SAN obligatorio: los navegadores modernos ignoran el CN.
        (t / "ext.cnf").write_text(
            f"subjectAltName=DNS:{domain},DNS:localhost,IP:127.0.0.1\n"
            "basicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth\n"
        )
        run(["openssl", "x509", "-req", "-in", t / "leaf.csr", "-CA", t / "ca.crt", "-CAkey", t / "ca.key",
             "-CAcreateserial", "-out", t / "leaf.crt", "-days", str(days), "-extfile", t / "ext.cnf"],
            capture_output=True)

        certs_dir.mkdir(parents=True, exist_ok=True)
        certs_dir.chmod(0o700)  # ver write_private: el directorio protege, el archivo se deja legible
        write_private(certs_dir / "ca.crt", (t / "ca.crt").read_text())
        # fullchain: la hoja primero (la lee el sentinel), después la CA.
        write_private(certs_dir / "fullchain.pem", (t / "leaf.crt").read_text() + (t / "ca.crt").read_text())
        write_private(certs_dir / "privkey.pem", (t / "leaf.key").read_text())


def cmd_certs(args: argparse.Namespace) -> int:
    certs_dir = ROOT / "deploy" / "certs"
    if (certs_dir / "fullchain.pem").exists() and not args.force:
        print(f"{OK} Ya hay certificados en deploy/certs (usa --force para regenerarlos)")
        return 0
    domain = args.domain or read_env().get("DOMAIN", "faro.localhost")
    try:
        generate_certs(certs_dir, domain, args.days)
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"{FAIL} No se pudieron generar los certificados: {exc}", file=sys.stderr)
        return 1
    print(f"{OK} Certificado para {domain} (válido {args.days} días) en deploy/certs/")
    print("  Para confiar en él: importa deploy/certs/ca.crt en tu navegador o usa curl --cacert deploy/certs/ca.crt")
    return 0


# ----------------------------------------------------------------------- doctor
def port_is_free(port: int, kind: int = socket.SOCK_STREAM) -> bool:
    with socket.socket(socket.AF_INET, kind) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("0.0.0.0", port))
        except OSError:
            return False
    return True


def cmd_doctor(_: argparse.Namespace) -> int:
    checks: list[tuple[str, str, str]] = []  # (símbolo, nombre, pista)

    def add(ok: bool, name: str, hint: str = "", soft: bool = False) -> None:
        checks.append((OK if ok else (WARN if soft else FAIL), name, "" if ok else hint))

    add(shutil.which("docker") is not None, "Docker instalado", "Instala Docker Engine")
    if shutil.which("docker"):
        ok = subprocess.run(["docker", "compose", "version"], capture_output=True).returncode == 0
        add(ok, "Docker Compose v2 disponible", "Instala el plugin docker-compose-plugin")
    add(shutil.which("openssl") is not None, "OpenSSL instalado", "sudo apt install openssl")
    add((ROOT / ".env").exists(), "Archivo .env presente", "Ejecuta `make init`")
    add(all((ROOT / "deploy/secrets" / f"{n}.txt").exists() for n in SECRET_NAMES), "Secretos generados", "Ejecuta `make init`")

    cert = ROOT / "deploy/certs/fullchain.pem"
    add(cert.exists(), "Certificado TLS presente", "Ejecuta `make certs`")
    if cert.exists() and shutil.which("openssl"):
        # `-checkend N` sale con 0 si el certificado sigue vigente dentro de N segundos.
        valid = subprocess.run(["openssl", "x509", "-in", str(cert), "-noout", "-checkend", str(14 * 86400)],
                               capture_output=True).returncode == 0
        add(valid, "Certificado vigente más de 14 días", "Renuévalo con `make certs ARGS=--force`", soft=True)

    env = read_env()
    for label, key, default, kind in (("HTTP", "HTTP_PORT", "80", socket.SOCK_STREAM),
                                       ("HTTPS", "HTTPS_PORT", "443", socket.SOCK_STREAM),
                                       ("WireGuard (UDP)", "WG_PORT", "51820", socket.SOCK_DGRAM)):
        port = int(env.get(key, default))
        add(port_is_free(port, kind), f"Puerto {port} libre para {label}",
            f"Ocupado: ¿ya está levantado Faro? Si no, cambia {key} en .env", soft=True)

    width = max(len(name) for _, name, _ in checks)
    for symbol, name, hint in checks:
        print(f" {symbol} {name:<{width}}  {hint}".rstrip())
    return 1 if any(symbol == FAIL for symbol, _, _ in checks) else 0


# ------------------------------------------------------------------------ smoke
class _SniConnection(http.client.HTTPSConnection):
    """Conecta a una IP pero negocia TLS con el nombre del dominio (SNI + verificación)."""

    def __init__(self, ip: str, port: int, domain: str, ctx: ssl.SSLContext) -> None:
        super().__init__(ip, port, timeout=10)
        self._domain, self._ctx = domain, ctx

    def connect(self) -> None:
        sock = socket.create_connection((self.host, self.port), self.timeout)
        self.sock = self._ctx.wrap_socket(sock, server_hostname=self._domain)


def _request(conn: http.client.HTTPConnection, domain: str, method: str, path: str, body: dict | None = None):
    payload = json.dumps(body).encode() if body is not None else None
    headers = {"Host": domain}
    if payload:
        headers["Content-Type"] = "application/json"
    conn.request(method, path, body=payload, headers=headers)
    res = conn.getresponse()
    data = res.read()
    return res.status, {k.lower(): v for k, v in res.getheaders()}, data


def cmd_smoke(args: argparse.Namespace) -> int:
    env = read_env()
    domain = args.domain or env.get("DOMAIN", "faro.localhost")
    http_port = int(args.http_port or env.get("HTTP_PORT", 80))
    https_port = int(args.https_port or env.get("HTTPS_PORT", 443))
    ca = ROOT / "deploy/certs/ca.crt"
    ctx = ssl.create_default_context(cafile=str(ca) if ca.exists() else None)

    results: list[tuple[bool, str]] = []

    def check(name: str, fn) -> None:
        try:
            ok = bool(fn())
        except Exception as exc:  # cualquier fallo de red cuenta como prueba fallida
            ok, name = False, f"{name} ({type(exc).__name__}: {exc})"
        results.append((ok, name))

    def https(method: str, path: str, body: dict | None = None):
        conn = _SniConnection(args.host, https_port, domain, ctx)
        try:
            return _request(conn, domain, method, path, body)
        finally:
            conn.close()

    def redirect():
        conn = http.client.HTTPConnection(args.host, http_port, timeout=10)
        status, headers, _ = _request(conn, domain, "GET", "/")
        return status == 301 and headers.get("location", "").startswith("https://")

    marker = f"humo {datetime.now():%H:%M:%S}"
    check("HTTP redirige a HTTPS (301)", redirect)
    check("HTTPS responde con certificado verificado", lambda: https("GET", "/")[0] == 200)
    check("Cabeceras de seguridad presentes (HSTS, CSP, nosniff)", lambda: all(
        h in https("GET", "/")[1] for h in ("strict-transport-security", "content-security-policy", "x-content-type-options")))
    check("/api/status responde y la base de datos está operativa",
          lambda: json.loads(https("GET", "/api/status")[2])["database"]["status"] == "ok")
    check("POST /api/signals guarda una señal (201)", lambda: https("POST", "/api/signals", {"message": marker})[0] == 201)
    check("La señal aparece en GET /api/signals",
          lambda: any(s["message"] == marker for s in json.loads(https("GET", "/api/signals")[2])["signals"]))
    check("Mensaje inválido se rechaza (400)", lambda: https("POST", "/api/signals", {"message": " "})[0] == 400)
    check("/metrics NO está expuesto al exterior (404)", lambda: https("GET", "/metrics")[0] == 404)

    for ok, name in results:
        print(f" {OK if ok else FAIL} {name}")
    failed = sum(1 for ok, _ in results if not ok)
    print(f"\n{len(results) - failed}/{len(results)} comprobaciones correctas")
    return 1 if failed else 0


# ----------------------------------------------------------------- backup / restore
DUMP_CMD = 'MYSQL_PWD="$(cat /run/secrets/db_root_password)" exec mysqldump -uroot --single-transaction --routines --no-tablespaces faro'
LOAD_CMD = 'MYSQL_PWD="$(cat /run/secrets/db_root_password)" exec mysql -uroot faro'


def prune_backups(directory: Path, keep: int) -> list[Path]:
    """Borra los volcados más antiguos y devuelve los eliminados. El nombre lleva la fecha, así que ordenar = cronológico."""
    files = sorted(directory.glob("faro-*.sql.gz"))
    old = files[:-keep] if keep > 0 else files
    for f in old:
        f.unlink()
    return old


def cmd_backup(args: argparse.Namespace) -> int:
    directory = ROOT / "backups"
    directory.mkdir(exist_ok=True)
    target = directory / f"faro-{datetime.now():%Y%m%d-%H%M%S}.sql.gz"
    # La contraseña se lee DENTRO del contenedor desde el secreto: nunca pasa por el anfitrión.
    cmd = [*compose(), "exec", "-T", "db", "sh", "-c", DUMP_CMD]
    with subprocess.Popen(cmd, stdout=subprocess.PIPE) as proc, gzip.open(target, "wb") as gz:
        assert proc.stdout is not None
        shutil.copyfileobj(proc.stdout, gz)  # streaming: no carga el volcado en memoria
    if proc.returncode != 0:
        target.unlink(missing_ok=True)
        print(f"{FAIL} mysqldump falló (¿está levantado el contenedor db?)", file=sys.stderr)
        return 1
    removed = prune_backups(directory, args.keep)
    print(f"{OK} Copia guardada en {target.relative_to(ROOT)} ({target.stat().st_size // 1024} KiB); eliminadas {len(removed)} antiguas")
    return 0


def cmd_restore(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if not path.exists():
        print(f"{FAIL} No existe {path}", file=sys.stderr)
        return 1
    cmd = [*compose(), "exec", "-T", "db", "sh", "-c", LOAD_CMD]
    with gzip.open(path, "rb") as gz, subprocess.Popen(cmd, stdin=subprocess.PIPE) as proc:
        assert proc.stdin is not None
        shutil.copyfileobj(gz, proc.stdin)
        proc.stdin.close()
    if proc.returncode != 0:
        print(f"{FAIL} La restauración falló", file=sys.stderr)
        return 1
    print(f"{OK} Base de datos restaurada desde {path.name}")
    return 0


# --------------------------------------------------------------------------- vpn
def cmd_vpn(args: argparse.Namespace) -> int:
    wg = [*compose(), "exec", "-T", "wireguard"]
    if args.action == "status":
        return subprocess.run([*wg, "wg", "show"]).returncode
    if not args.peer:
        print(f"{FAIL} Indica el cliente: p. ej. `make vpn PEER=laptop`", file=sys.stderr)
        return 2
    if args.action == "qr":
        # show-peer imprime el código QR en la terminal (útil para el móvil).
        return subprocess.run([*compose(), "exec", "wireguard", "/app/show-peer", args.peer]).returncode
    # La imagen guarda los clientes con nombre como peer_<nombre>/peer_<nombre>.conf
    for folder in (f"peer_{args.peer}", f"peer{args.peer}"):
        res = subprocess.run([*wg, "cat", f"/config/{folder}/{folder}.conf"], capture_output=True, text=True)
        if res.returncode == 0:
            print(res.stdout)
            return 0
    print(f"{FAIL} No se encontró el cliente «{args.peer}». ¿Está en WG_PEERS y el contenedor levantado?", file=sys.stderr)
    return 1


# ------------------------------------------------------------------ letsencrypt
HOOK = ('cp -L "$RENEWED_LINEAGE/fullchain.pem" /certs/fullchain.pem && '
        'cp -L "$RENEWED_LINEAGE/privkey.pem" /certs/privkey.pem && chmod 644 /certs/*.pem')


def cmd_letsencrypt(args: argparse.Namespace) -> int:
    env = read_env()
    certbot = [*compose(), "--profile", "tools", "run", "--rm", "certbot"]
    if args.action == "issue":
        domain = env.get("DOMAIN", "")
        email = args.email or env.get("LETSENCRYPT_EMAIL", "")
        if not email or domain.endswith(".localhost"):
            print(f"{FAIL} Define un DOMAIN público y LETSENCRYPT_EMAIL en .env", file=sys.stderr)
            return 2
        cmd = [*certbot, "certonly", "--webroot", "-w", "/var/www/certbot", "-d", domain, "--email", email,
               "--agree-tos", "--no-eff-email", "--non-interactive", "--deploy-hook", HOOK]
        if args.staging:
            cmd.append("--staging")  # certificados de prueba: sin límites de emisión
    else:
        cmd = [*certbot, "renew", "--webroot", "-w", "/var/www/certbot", "--deploy-hook", HOOK]
    if subprocess.run(cmd).returncode != 0:
        return 1
    # Nginx solo lee el certificado al arrancar o al recibir `reload`.
    return subprocess.run([*compose(), "exec", "proxy", "nginx", "-s", "reload"]).returncode


# --------------------------------------------------------------------------- CLI
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="faro_ops", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init", help="genera secretos y .env")
    p.add_argument("--force", action="store_true", help="regenera los secretos existentes")
    p.set_defaults(func=cmd_init)

    p = sub.add_parser("certs", help="certificado TLS local firmado por una CA propia")
    p.add_argument("--domain", help="por defecto, DOMAIN de .env")
    p.add_argument("--days", type=int, default=365)
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=cmd_certs)

    sub.add_parser("doctor", help="revisa requisitos").set_defaults(func=cmd_doctor)

    p = sub.add_parser("smoke", help="prueba de humo de extremo a extremo")
    p.add_argument("--host", default="127.0.0.1", help="IP del servidor (por defecto, local)")
    p.add_argument("--domain")
    p.add_argument("--http-port")
    p.add_argument("--https-port")
    p.set_defaults(func=cmd_smoke)

    p = sub.add_parser("backup", help="copia de seguridad de MySQL")
    p.add_argument("--keep", type=int, default=7, help="copias a conservar (por defecto 7)")
    p.set_defaults(func=cmd_backup)

    p = sub.add_parser("restore", help="restaura una copia")
    p.add_argument("file")
    p.set_defaults(func=cmd_restore)

    p = sub.add_parser("vpn", help="clientes WireGuard")
    p.add_argument("action", choices=["show", "qr", "status"])
    p.add_argument("peer", nargs="?")
    p.set_defaults(func=cmd_vpn)

    p = sub.add_parser("letsencrypt", help="certificado público de Let's Encrypt")
    p.add_argument("action", choices=["issue", "renew"])
    p.add_argument("--email")
    p.add_argument("--staging", action="store_true")
    p.set_defaults(func=cmd_letsencrypt)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    start = time.perf_counter()
    code = args.func(args)
    if os.environ.get("FARO_OPS_TIMING"):
        print(f"({time.perf_counter() - start:.1f} s)")
    return code


if __name__ == "__main__":
    sys.exit(main())
