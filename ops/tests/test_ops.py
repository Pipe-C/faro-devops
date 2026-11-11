import importlib.util
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


ops = load("faro_ops", ROOT / "ops" / "faro_ops.py")
commit = load("check_commit_msg", ROOT / "tools" / "check-commit-msg.py")


class SecretsTest(unittest.TestCase):
    def test_genera_secretos_unicos_con_permisos_correctos(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp) / "secrets"
            self.assertEqual(ops.init_secrets(d), list(ops.SECRET_NAMES))
            values = {(d / f"{n}.txt").read_text() for n in ops.SECRET_NAMES}
            self.assertEqual(len(values), 3, "cada secreto debe ser distinto")
            self.assertEqual(stat.S_IMODE(d.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE((d / "db_password.txt").stat().st_mode), 0o644)

    def test_no_sobrescribe_sin_force(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            ops.init_secrets(d)
            before = (d / "db_password.txt").read_text()
            self.assertEqual(ops.init_secrets(d), [])
            self.assertEqual((d / "db_password.txt").read_text(), before)
            self.assertEqual(len(ops.init_secrets(d, force=True)), 3)
            self.assertNotEqual((d / "db_password.txt").read_text(), before)

    def test_longitud_minima(self):
        self.assertGreaterEqual(len(ops.generate_secret()), 32)


@unittest.skipIf(shutil.which("openssl") is None, "openssl no disponible")
class CertsTest(unittest.TestCase):
    def test_certificado_valido_con_san_y_firmado_por_la_ca(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            ops.generate_certs(d, "faro.test", days=30)
            san = subprocess.run(["openssl", "x509", "-in", d / "fullchain.pem", "-noout", "-ext", "subjectAltName"],
                                 capture_output=True, text=True, check=True).stdout
            self.assertIn("DNS:faro.test", san)
            self.assertIn("IP Address:127.0.0.1", san)
            verify = subprocess.run(["openssl", "verify", "-CAfile", d / "ca.crt", d / "fullchain.pem"],
                                    capture_output=True, text=True)
            self.assertEqual(verify.returncode, 0, verify.stderr)
            self.assertEqual(stat.S_IMODE(d.stat().st_mode), 0o700)


class BackupTest(unittest.TestCase):
    def test_conserva_solo_las_mas_recientes(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            names = [f"faro-2026110{i}-100000.sql.gz" for i in range(1, 6)]
            for n in names:
                (d / n).touch()
            removed = ops.prune_backups(d, keep=2)
            self.assertEqual([p.name for p in removed], names[:3])
            self.assertEqual(sorted(p.name for p in d.iterdir()), names[3:])


class MiscTest(unittest.TestCase):
    def test_compose_apunta_a_la_raiz(self):
        self.assertEqual(ops.compose(Path("/x"))[:4], ["docker", "compose", "--project-directory", "/x"])

    def test_read_env_ignora_comentarios(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / ".env").write_text("# nota\nDOMAIN=ejemplo.com\n\nHTTP_PORT = 8080\n")
            self.assertEqual(ops.read_env(Path(tmp)), {"DOMAIN": "ejemplo.com", "HTTP_PORT": "8080"})

    def test_parser_rechaza_comando_desconocido(self):
        with self.assertRaises(SystemExit):
            ops.build_parser().parse_args(["no-existe"])


class CommitMessageTest(unittest.TestCase):
    def test_validos(self):
        for s in ("feat(api): agrega ruta de señales", "fix: corrige el redireccionamiento", "docs: actualiza README", "ci: añade pipeline"):
            self.assertEqual(commit.validate(s), [], s)

    def test_invalidos(self):
        casos = {
            "feat(api): " + "x" * 50: "caracteres",
            "Agrega cosas": "formato",
            "feat: Mayúscula inicial": "minúscula",
            "fix: termina en punto.": "punto",
            "feature: tipo inventado": "formato",
        }
        for subject, expected in casos.items():
            problems = " ".join(commit.validate(subject))
            self.assertIn(expected, problems, subject)


if __name__ == "__main__":
    unittest.main()
