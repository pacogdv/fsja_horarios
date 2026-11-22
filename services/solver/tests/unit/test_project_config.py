"""T1.5 — Configuración del proyecto: Python, ruff, mypy y política de dependencias (ADR-0010)."""

import tomllib
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

PYPROJECT: dict[str, Any] = tomllib.loads((Path(__file__).parents[2] / "pyproject.toml").read_text("utf-8"))


def test_exige_python_3_12_o_superior() -> None:
    assert PYPROJECT["project"]["requires-python"] == ">=3.12"


def test_ruff_activa_las_reglas_obligatorias() -> None:
    selected = set(PYPROJECT["tool"]["ruff"]["lint"]["select"])
    assert {"E", "F", "I", "B", "UP", "S", "ANN"} <= selected


def test_mypy_es_estricto() -> None:
    assert PYPROJECT["tool"]["mypy"]["strict"] is True


def test_uv_solo_instala_versiones_con_al_menos_dos_semanas() -> None:
    cutoff = datetime.fromisoformat(PYPROJECT["tool"]["uv"]["exclude-newer"])
    assert cutoff.tzinfo is not None
    assert cutoff.date() <= date.today() - timedelta(days=14)
    assert cutoff <= datetime.now(UTC)
