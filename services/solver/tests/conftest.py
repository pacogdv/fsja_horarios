"""Fixtures comunes de los tests del solver."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from solver.api.app import create_app
from solver.settings import Settings

VALID_TOKEN = "t" * 32


@pytest.fixture
def settings() -> Settings:
    return Settings.from_env({"SOLVER_SERVICE_TOKEN": VALID_TOKEN})


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {VALID_TOKEN}"}
