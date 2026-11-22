"""Configuración del solver, validada con Pydantic Settings (specs/02-architecture-plan.md §5.7).

Los errores nombran la variable y el motivo, nunca su valor: el token de servicio es un secreto.
"""

import os
from collections.abc import Mapping
from typing import Self

from pydantic import Field, SecretStr, ValidationError
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict

SECRET_MIN_LENGTH = 32

# Mensajes propios por tipo de error de Pydantic: no incluyen el valor recibido.
_ERROR_MESSAGES = {
    "missing": "es obligatoria",
    # `SecretStr` informa `too_short`; `str`, `string_too_short`.
    "too_short": f"debe tener al menos {SECRET_MIN_LENGTH} caracteres",
    "string_too_short": f"debe tener al menos {SECRET_MIN_LENGTH} caracteres",
    "greater_than_equal": "debe ser un entero mayor o igual que 1",
    "int_parsing": "debe ser un entero mayor o igual que 1",
    "int_from_float": "debe ser un entero mayor o igual que 1",
}


class SettingsError(Exception):
    """Configuración inválida. Expone los nombres de las variables afectadas, nunca sus valores."""

    def __init__(self, problems: Mapping[str, str]) -> None:
        self.variables = tuple(sorted(problems))
        details = "\n".join(f"  - {name}: {problems[name]}" for name in self.variables)
        super().__init__(f"Variables de entorno inválidas:\n{details}\nRevisa .env.example.")


class Settings(BaseSettings):
    """Variables de entorno del solver. Inmutable una vez validada."""

    model_config = SettingsConfigDict(frozen=True, extra="ignore", hide_input_in_errors=True)

    service_token: SecretStr = Field(alias="SOLVER_SERVICE_TOKEN", min_length=SECRET_MIN_LENGTH)
    max_concurrent_jobs: int = Field(default=1, ge=1, alias="SOLVER_MAX_CONCURRENT_JOBS", strict=False)

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Solo los valores que pasa `from_env`: sin lecturas implícitas del entorno ni de archivos .env.
        return (init_settings,)

    @classmethod
    def from_env(cls, source: Mapping[str, str] | None = None) -> Self:
        """Valida `source` (por defecto, el entorno del proceso). Una variable vacía cuenta como ausente."""
        environment = os.environ if source is None else source
        aliases = {field.alias for field in cls.model_fields.values() if field.alias}
        values = {key: value for key, value in environment.items() if key in aliases and value != ""}
        try:
            return cls.model_validate(values)
        except ValidationError as error:
            problems: dict[str, str] = {}
            for issue in error.errors(include_url=False, include_input=False, include_context=False):
                name = str(issue["loc"][0])
                problems.setdefault(name, _ERROR_MESSAGES.get(issue["type"], "valor inválido"))
            raise SettingsError(problems) from None
