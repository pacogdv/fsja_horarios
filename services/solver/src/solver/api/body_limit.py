"""Límite de tamaño del cuerpo de las peticiones (specs/02-architecture-plan.md §3.2: 5 MB).

Rechaza por `Content-Length` antes de leer nada y, si no hay `Content-Length` (transferencia por partes),
corta la lectura en cuanto se supera el límite.
"""

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_BODY_BYTES = 5 * 1024 * 1024
_TOO_LARGE = "El cuerpo de la petición supera el tamaño máximo permitido."


class _BodyTooLargeError(Exception):
    """Se lanza desde `receive` cuando el cuerpo recibido supera el límite."""


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        try:
            declared = _content_length(scope)
        except ValueError:
            await JSONResponse({"detail": "Content-Length inválido."}, status_code=400)(scope, receive, send)
            return
        if declared is not None and declared > self.max_bytes:
            await JSONResponse({"detail": _TOO_LARGE}, status_code=413)(scope, receive, send)
            return

        received = 0
        response_started = False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _BodyTooLargeError
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _BodyTooLargeError:
            if response_started:
                raise
            await JSONResponse({"detail": _TOO_LARGE}, status_code=413)(scope, receive, send)


def _content_length(scope: Scope) -> int | None:
    """Devuelve el `Content-Length` declarado o `None` si no hay. Lanza `ValueError` si no es un entero ≥ 0."""
    for key, value in scope["headers"]:
        if key == b"content-length":
            text = value.decode("latin-1")
            if not text.isascii() or not text.isdigit():
                raise ValueError("Content-Length inválido")
            return int(text)
    return None
