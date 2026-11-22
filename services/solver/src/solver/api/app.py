"""Fábrica de la aplicación FastAPI del solver.

Uso: `uvicorn solver.api.app:create_app --factory` (scripts/check.sh dev y la imagen Docker).
"""

from fastapi import FastAPI

from solver import __version__
from solver.api.auth import ServiceTokenMiddleware
from solver.api.body_limit import MAX_BODY_BYTES, BodySizeLimitMiddleware
from solver.api.routes import HEALTH_PATH, router
from solver.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    """Crea la aplicación. Sin `settings`, valida el entorno del proceso y falla si es inválido."""
    settings = settings if settings is not None else Settings.from_env()

    # Servicio interno: sin documentación interactiva ni esquema OpenAPI (el contrato está en la spec 02 §3).
    app = FastAPI(title="solver", version=__version__, docs_url=None, redoc_url=None, openapi_url=None)
    app.include_router(router)

    # El último middleware añadido es el más externo: primero se autentica y después se limita el cuerpo,
    # de modo que el cuerpo de un cliente no autenticado nunca se lee.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=MAX_BODY_BYTES)
    app.add_middleware(ServiceTokenMiddleware, token=settings.service_token, public_paths={HEALTH_PATH})
    return app
