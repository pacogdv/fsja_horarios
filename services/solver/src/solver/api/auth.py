"""Autenticación por token de servicio (specs/02-architecture-plan.md §3.2 y §5.7).

Es un middleware ASGI y no una dependencia de FastAPI, por dos motivos:
- protege también las rutas inexistentes (401 en lugar de 404: no revela qué rutas existen);
- rechaza antes de leer el cuerpo, así que los clientes no autenticados no consumen recursos.
"""

import hmac
from collections.abc import Collection

from pydantic import SecretStr
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send
from starlette.websockets import WebSocketClose

# Cierre por violación de política (RFC 6455 §7.4.1).
_WS_POLICY_VIOLATION = 1008


def is_authorized(authorization: str | None, expected_token: bytes) -> bool:
    """Comprueba `Authorization: Bearer <token>` en tiempo constante.

    El esquema no distingue mayúsculas (RFC 9110 §11.1). Un token con espacios extra no coincide con el
    esperado, así que se rechaza en la comparación.
    """
    if authorization is None:
        return False
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token:
        return False
    return hmac.compare_digest(token.encode(), expected_token)


class ServiceTokenMiddleware:
    """Exige el token de servicio en todas las rutas HTTP salvo las públicas (`/health`).

    Denegación por defecto: solo el ciclo de vida (`lifespan`) pasa sin comprobación y los WebSocket se
    rechazan siempre, porque el solver no ofrece ninguno.
    """

    def __init__(self, app: ASGIApp, token: SecretStr, public_paths: Collection[str]) -> None:
        self.app = app
        self.expected_token = token.get_secret_value().encode()
        self.public_paths = frozenset(public_paths)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "lifespan" or (scope["type"] == "http" and scope["path"] in self.public_paths):
            await self.app(scope, receive, send)
            return
        if scope["type"] != "http":
            await WebSocketClose(code=_WS_POLICY_VIOLATION)(scope, receive, send)
            return
        authorization = _header(scope, b"authorization")
        if not is_authorized(authorization, self.expected_token):
            response = JSONResponse(
                {"detail": "No autorizado."}, status_code=401, headers={"WWW-Authenticate": "Bearer"}
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope["headers"]:
        if key == name:
            return str(value.decode("latin-1"))
    return None
