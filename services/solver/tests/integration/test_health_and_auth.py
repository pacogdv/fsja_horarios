"""T1.5 — Salud, autenticación por token de servicio y límite de tamaño del cuerpo.

Refs: specs/02-architecture-plan.md §3.2 y §5.7; specs/03-tasks.md T1.5.
"""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import solver
from tests.conftest import VALID_TOKEN

FIVE_MB = 5 * 1024 * 1024


class TestHealth:
    def test_devuelve_200_con_estado_y_version_sin_token(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "version": solver.__version__}

    def test_es_publico_aunque_el_token_sea_incorrecto(self, client: TestClient) -> None:
        response = client.get("/health", headers={"Authorization": "Bearer incorrecto"})
        assert response.status_code == 200


class TestAutenticacion:
    @pytest.mark.parametrize(
        "headers",
        [
            {},
            {"Authorization": "Bearer " + "x" * 32},
            {"Authorization": VALID_TOKEN},
            {"Authorization": f"Basic {VALID_TOKEN}"},
            {"Authorization": f"Bearer  {VALID_TOKEN}"},
            {"Authorization": f"Bearer {VALID_TOKEN} extra"},
            {"Authorization": "Bearer "},
            {"Authorization": f"Bearer {VALID_TOKEN[:-1]}"},
        ],
        ids=[
            "sin cabecera",
            "token incorrecto",
            "sin esquema",
            "esquema Basic",
            "doble espacio",
            "texto extra",
            "token vacío",
            "prefijo del token",
        ],
    )
    def test_rutas_protegidas_devuelven_401(self, client: TestClient, headers: dict[str, str]) -> None:
        response = client.post("/v1/validate", headers=headers, json={})
        assert response.status_code == 401

    def test_una_ruta_inexistente_devuelve_401_sin_token_para_no_revelar_rutas(self, client: TestClient) -> None:
        assert client.get("/no-existe").status_code == 401

    def test_con_token_valido_se_pasa_la_autenticacion(self, client: TestClient, auth_headers: dict[str, str]) -> None:
        assert client.get("/no-existe", headers=auth_headers).status_code == 404

    def test_el_esquema_bearer_no_distingue_mayusculas(self, client: TestClient) -> None:
        response = client.get("/no-existe", headers={"Authorization": f"bearer {VALID_TOKEN}"})
        assert response.status_code == 404

    def test_el_401_pide_bearer_y_no_repite_el_token_recibido(self, client: TestClient) -> None:
        sent = "Bearer " + "secreto-enviado-" * 3
        response = client.get("/no-existe", headers={"Authorization": sent})
        assert response.headers["www-authenticate"] == "Bearer"
        assert "secreto-enviado" not in response.text

    def test_compara_el_token_con_hmac_compare_digest(
        self, client: TestClient, auth_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        calls: list[tuple[bytes, bytes]] = []

        def spy(received: bytes, expected: bytes) -> bool:
            calls.append((received, expected))
            return received == expected

        monkeypatch.setattr("solver.api.auth.hmac.compare_digest", spy)
        client.get("/no-existe", headers=auth_headers)
        assert calls == [(VALID_TOKEN.encode(), VALID_TOKEN.encode())]


class TestWebSocket:
    @pytest.mark.parametrize("path", ["/health", "/v1/solve"])
    def test_se_rechaza_aunque_lleve_token_valido(
        self, client: TestClient, auth_headers: dict[str, str], path: str
    ) -> None:
        with pytest.raises(WebSocketDisconnect) as error, client.websocket_connect(path, headers=auth_headers):
            pass
        assert error.value.code == 1008


class TestDocumentacionDesactivada:
    @pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
    def test_no_se_expone(self, client: TestClient, auth_headers: dict[str, str], path: str) -> None:
        assert client.get(path, headers=auth_headers).status_code == 404


class TestLimiteDeTamano:
    def test_un_cuerpo_de_mas_de_5_mb_devuelve_413(self, client: TestClient, auth_headers: dict[str, str]) -> None:
        response = client.post("/v1/validate", headers=auth_headers, content=b"x" * (FIVE_MB + 1))
        assert response.status_code == 413

    def test_un_cuerpo_de_5_mb_exactos_se_admite(self, client: TestClient, auth_headers: dict[str, str]) -> None:
        response = client.post("/v1/validate", headers=auth_headers, content=b"x" * FIVE_MB)
        assert response.status_code != 413

    def test_sin_token_se_responde_401_sin_leer_el_cuerpo(self, client: TestClient) -> None:
        response = client.post("/v1/validate", content=b"x" * (FIVE_MB + 1))
        assert response.status_code == 401
