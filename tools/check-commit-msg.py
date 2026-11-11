#!/usr/bin/env python3
"""Valida que el asunto del commit siga Conventional Commits en español.

Reglas del proyecto:
  * formato  tipo(ámbito opcional): descripción
  * máximo 50 caracteres en la primera línea
  * descripción en minúscula inicial, sin punto final

Uso:
  check-commit-msg.py <archivo-con-mensaje>      (lo usa el hook commit-msg)
  check-commit-msg.py --log                       (revisa todo el historial)
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

TYPES = ("feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert")
MAX_LEN = 50
PATTERN = re.compile(rf"^({'|'.join(TYPES)})(\([a-z0-9-]+\))?!?: \S.*$")


def validate(subject: str) -> list[str]:
    """Devuelve la lista de problemas encontrados (vacía si el asunto es válido)."""
    problems: list[str] = []
    if len(subject) > MAX_LEN:
        problems.append(f"tiene {len(subject)} caracteres (máximo {MAX_LEN})")
    if not PATTERN.match(subject):
        problems.append(f"no cumple el formato «tipo(ámbito): descripción» con tipo en {TYPES}")
    else:
        description = subject.split(": ", 1)[1]
        if description[0].isupper():
            problems.append("la descripción debe empezar en minúscula")
        if description.endswith("."):
            problems.append("la descripción no debe terminar en punto")
    return problems


def main(argv: list[str]) -> int:
    if argv and argv[0] == "--log":
        subjects = subprocess.run(
            ["git", "log", "--format=%s"], capture_output=True, text=True, check=True
        ).stdout.splitlines()
    elif argv:
        first = Path(argv[0]).read_text(encoding="utf-8").splitlines()
        subjects = [first[0]] if first else [""]
    else:
        print(__doc__)
        return 2

    failed = False
    for subject in subjects:
        # Los commits de fusión y los `fixup!` automáticos no se validan.
        if subject.startswith(("Merge ", "fixup! ", "squash! ")):
            continue
        for problem in validate(subject):
            failed = True
            print(f"✗ «{subject}»: {problem}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
