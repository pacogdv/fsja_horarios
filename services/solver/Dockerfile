# Imagen del solver (specs/02-architecture-plan.md §1.3 y §5.7; specs/03-tasks.md T1.6).
# Contexto de build: services/solver.
#
# Etapa 1: resuelve las dependencias de producción con uv (versión fijada, ADR-0010) en un entorno
# virtual. Etapa 2: copia solo ese entorno a una imagen limpia, sin uv, sin compilador y sin el código
# fuente suelto, y se ejecuta con un usuario sin privilegios.

FROM ghcr.io/astral-sh/uv:0.13.7 AS uv

FROM python:3.12-slim AS build
COPY --from=uv /uv /usr/local/bin/uv
# Bytecode precompilado (el FS de ejecución es de solo lectura), copia en lugar de enlaces, y el Python
# de la imagen (uv no descarga otro).
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /src
# Primero solo las dependencias: esta capa se reutiliza mientras no cambie uv.lock.
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev --no-editable

FROM python:3.12-slim AS runtime
RUN groupadd --system --gid 10001 solver \
 && useradd --system --uid 10001 --gid solver --no-create-home --shell /usr/sbin/nologin solver
# El entorno pertenece a root: el proceso no puede modificar su propio código.
COPY --from=build /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
USER solver
EXPOSE 8000
# 0.0.0.0 dentro del contenedor: solo es alcanzable por la red interna solver_net (sin puertos publicados).
CMD ["uvicorn", "solver.api.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
