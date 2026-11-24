#!/usr/bin/env bash
# Orquestador de tareas del monorepo (specs/03-tasks.md, T1.2).
#
#   scripts/check.sh <check|lint|typecheck|test|test:e2e|dev>
#
# Delega en apps/web (scripts de su package.json, vía pnpm) y en services/solver (vía uv run).
# Ejecuta todos los pasos aunque alguno falle y termina con un resumen; el código de salida es 1 si
# falla cualquier paso y 2 si la tarea no existe. Los componentes que aún no existen se marcan como
# OMITIDO, salvo con CHECK_REQUIRE_ALL=1 (CI), donde son un fallo.
# Compatible con bash 3.2 (macOS).
set -uo pipefail

ROOT="${CHECK_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# Comando de Docker que se busca para los tests de Docker Compose (los tests lo sustituyen).
DOCKER_COMMAND="${CHECK_DOCKER:-docker}"
WEB_DIR="apps/web"
SOLVER_DIR="services/solver"
SOLVER_DEV_ADDRESS="--host 127.0.0.1 --port 8000"

failures=0
summary=""

usage() {
  echo "Uso: scripts/check.sh <check|lint|typecheck|test|test:e2e|dev>" >&2
}

record() { # record <estado> <paso>
  summary="${summary}$(printf '  %-8s %s' "$1" "$2")"$'\n'
  if [ "$1" = "FALLO" ]; then failures=$((failures + 1)); fi
}

run_step() { # run_step <paso> <comando...>
  local step="$1"; shift
  echo "==> $step"
  if "$@"; then record "OK" "$step"; else record "FALLO" "$step"; fi
}

missing_component() { # missing_component <paso> <directorio>
  if [ "${CHECK_REQUIRE_ALL:-0}" = "1" ]; then
    record "FALLO" "$1 (falta $2)"
  else
    record "OMITIDO" "$1 (aún no existe $2)"
  fi
}

has_web() { [ -f "$WEB_DIR/package.json" ]; }
has_solver() { [ -f "$SOLVER_DIR/pyproject.toml" ]; }

web() { # web <script de package.json>
  if has_web; then
    run_step "web: $1" pnpm --filter web run "$1"
  else
    missing_component "web: $1" "$WEB_DIR"
  fi
}

solver() { # solver <paso> <comando de uv run...>
  local step="$1"; shift
  if has_solver; then
    run_step "solver: $step" uv run --directory "$SOLVER_DIR" "$@"
  else
    missing_component "solver: $step" "$SOLVER_DIR"
  fi
}

task_lint() {
  web lint
  solver "ruff check" ruff check .
  solver "ruff format" ruff format --check .
}

task_typecheck() {
  web typecheck
  solver "mypy" mypy --strict src
}

task_check() {
  task_lint
  task_typecheck
  run_step "adr: tests del verificador" ./scripts/tests/check-adrs.test.sh
  run_step "raíz: tests del monorepo" ./scripts/tests/workspace.test.sh
  run_step "ci: tests del workflow" ./scripts/tests/ci.test.sh
  compose_tests
}

# Validación estática de docker-compose.yml y los Dockerfiles (T1.6). Solo necesita la CLI de Docker.
compose_tests() {
  local step="infra: tests de Docker Compose"
  if command -v "$DOCKER_COMMAND" > /dev/null 2>&1; then
    run_step "$step" ./scripts/tests/compose.test.sh
  elif [ "${CHECK_REQUIRE_ALL:-0}" = "1" ]; then
    record "FALLO" "$step (falta la CLI de docker)"
  else
    record "OMITIDO" "$step (no está instalada la CLI de docker)"
  fi
}

task_test() {
  # Tests unitarios con cobertura y umbral (src/domain ≥ 90 %; specs/03-tasks.md §0.3).
  web test:coverage
  solver "pytest" pytest
}

task_test_e2e() {
  web test:e2e
}

DEV_PIDS=""
DEV_INTERRUPTED=0

stop_dev() {
  DEV_INTERRUPTED=1
  # shellcheck disable=SC2086  # DEV_PIDS es una lista de PID separada por espacios.
  kill $DEV_PIDS 2>/dev/null
}

task_dev() {
  local pid
  if has_web; then
    pnpm --filter web run dev &
    DEV_PIDS="$DEV_PIDS $!"
  else
    missing_component "web: dev" "$WEB_DIR"
  fi
  if has_solver; then
    # shellcheck disable=SC2086  # SOLVER_DEV_ADDRESS se divide en argumentos a propósito.
    uv run --directory "$SOLVER_DIR" uvicorn solver.api.app:create_app --factory --reload $SOLVER_DEV_ADDRESS &
    DEV_PIDS="$DEV_PIDS $!"
  else
    missing_component "solver: dev" "$SOLVER_DIR"
  fi
  # Ctrl-C (SIGINT) o SIGTERM detienen ambos procesos.
  trap stop_dev INT TERM
  for pid in $DEV_PIDS; do
    # `wait` puede volver antes de tiempo al llegar la señal; se repite hasta que el proceso termina.
    while ! wait "$pid"; do
      if [ "$DEV_INTERRUPTED" = "1" ] || ! kill -0 "$pid" 2>/dev/null; then break; fi
    done
    if [ "$DEV_INTERRUPTED" = "0" ] && ! wait "$pid" 2>/dev/null; then
      record "FALLO" "dev (PID $pid terminó con error)"
    fi
  done
  if [ "$DEV_INTERRUPTED" = "1" ]; then
    echo "dev: detenido."
    exit 130
  fi
}

main() {
  if [ "$#" -ne 1 ]; then usage; exit 2; fi
  cd "$ROOT" || exit 1

  case "$1" in
    check) task_check ;;
    lint) task_lint ;;
    typecheck) task_typecheck ;;
    test) task_test ;;
    test:e2e) task_test_e2e ;;
    dev) task_dev ;;
    *) usage; exit 2 ;;
  esac

  echo
  echo "Resumen de '$1':"
  printf '%s' "$summary"
  if [ "$failures" -gt 0 ]; then
    echo "$failures paso(s) fallido(s)."
    exit 1
  fi
}

main "$@"
