"""T1.5 — Middleware de límite de tamaño del cuerpo, también sin Content-Length (por partes)."""

import asyncio
from collections.abc import Iterator

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.types import Message, Receive, Scope, Send

from solver.api.body_limit import BodySizeLimitMiddleware, _BodyTooLargeError

LIMIT = 1024


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    @app.post("/echo-length")
    async def echo_length(request: Request) -> dict[str, int]:
        return {"length": len(await request.body())}

    app.add_middleware(BodySizeLimitMiddleware, max_bytes=LIMIT)
    return TestClient(app)


def chunks(total: int, size: int = 100) -> Iterator[bytes]:
    """Genera `total` bytes en trozos: httpx los envía por partes, sin Content-Length."""
    sent = 0
    while sent < total:
        piece = min(size, total - sent)
        sent += piece
        yield b"x" * piece


class TestConContentLength:
    def test_por_encima_del_limite_devuelve_413_sin_llegar_a_la_ruta(self, client: TestClient) -> None:
        response = client.post("/echo-length", content=b"x" * (LIMIT + 1))
        assert response.status_code == 413
        assert response.json() == {"detail": "El cuerpo de la petición supera el tamaño máximo permitido."}

    def test_en_el_limite_se_admite(self, client: TestClient) -> None:
        response = client.post("/echo-length", content=b"x" * LIMIT)
        assert response.json() == {"length": LIMIT}

    def test_content_length_no_numerico_devuelve_400(self, client: TestClient) -> None:
        response = client.post("/echo-length", content=b"x", headers={"Content-Length": "abc"})
        assert response.status_code == 400


class TestPorPartes:
    def test_por_encima_del_limite_devuelve_413(self, client: TestClient) -> None:
        response = client.post("/echo-length", content=chunks(LIMIT + 1))
        assert response.status_code == 413

    def test_en_el_limite_se_admite(self, client: TestClient) -> None:
        response = client.post("/echo-length", content=chunks(LIMIT))
        assert response.json() == {"length": LIMIT}


def test_las_peticiones_sin_cuerpo_no_se_ven_afectadas(client: TestClient) -> None:
    assert client.get("/echo-length").status_code == 405


def test_si_la_respuesta_ya_empezo_no_envia_un_segundo_413_y_propaga_el_error() -> None:
    sent: list[Message] = []
    pending = [{"type": "http.request", "body": b"x" * 600, "more_body": True}] * 2

    async def app_that_responds_before_reading(scope: Scope, receive: Receive, send: Send) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": []})
        while (await receive()).get("more_body"):
            pass

    async def receive() -> Message:
        return pending.pop(0) if pending else {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: Message) -> None:
        sent.append(message)

    middleware = BodySizeLimitMiddleware(app_that_responds_before_reading, max_bytes=LIMIT)
    scope: Scope = {"type": "http", "headers": [], "method": "POST", "path": "/"}
    with pytest.raises(_BodyTooLargeError):
        asyncio.run(middleware(scope, receive, send))
    assert [message["type"] for message in sent] == ["http.response.start"]
