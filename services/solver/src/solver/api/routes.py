"""Rutas HTTP del solver (specs/02-architecture-plan.md §3.2). Las de /v1 llegan en el Hito 2."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from solver import __version__

HEALTH_PATH = "/health"

router = APIRouter()


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str


@router.get(HEALTH_PATH)
def health() -> HealthResponse:
    """Comprobación de salud para Docker. Pública: no requiere token."""
    return HealthResponse(status="ok", version=__version__)
