#!/usr/bin/env bash
# Tests estáticos del workflow de CI (specs/03-tasks.md T1.18; CLAUDE.md §4). Comprueban, sin ejecutarlo, que
# .github/workflows/ci.yml tiene los trabajos, servicios, cachés y artefactos que pide la tarea, y que cumple las
# reglas de seguridad: actions fijadas por SHA y permisos mínimos.
# Que el workflow termine en verde se comprueba en GitHub (gh run watch).
# Compatible con bash 3.2. Requiere node. Sale con código 1 si algo falla.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKFLOW="$ROOT/.github/workflows/ci.yml"

passed=0
failed=0

report() {
  if [ "$1" = "ok" ]; then
    passed=$((passed + 1)); echo "ok   - $2"
  else
    failed=$((failed + 1)); echo "FAIL - $2"; printf '%s\n' "$3" | sed 's/^/       /'
  fi
}

if [ ! -f "$WORKFLOW" ]; then
  report fail "existe .github/workflows/ci.yml" "falta $WORKFLOW"
  echo "ci.test: $passed ok, $failed fallo(s)."
  exit 1
fi
report ok "existe .github/workflows/ci.yml"

# job_block <trabajo>: líneas del trabajo, desde «  <trabajo>:» hasta el siguiente trabajo (indentación 2).
job_block() {
  awk -v job="  $1:" '
    $0 == job { inside = 1; print; next }
    inside && /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { exit }
    inside && /^[^[:space:]#]/ { exit }
    inside { print }' "$WORKFLOW"
}

has() { # has <descripción> <regex extendida> [trabajo]
  local text
  if [ -n "${3:-}" ]; then text="$(job_block "$3")"; else text="$(cat "$WORKFLOW")"; fi
  if printf '%s\n' "$text" | grep -qE -- "$2"; then report ok "$1"; else report fail "$1" "no aparece: $2"; fi
}

# 1. Disparadores y seguridad del workflow.
has "se ejecuta en cada push a main y en cada pull request" '^  push:'
has "se ejecuta en los pull requests" '^  pull_request:'
has "permisos mínimos por defecto (contents: read)" '^  contents: read'
has "cancela ejecuciones obsoletas de la misma rama" '^concurrency:'

unpinned="$(grep -nE '^[[:space:]]*(-[[:space:]]+)?uses:' "$WORKFLOW" | grep -vE 'uses:[[:space:]]+[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+@[0-9a-f]{40}([[:space:]]+#.*)?$')"
if [ -z "$unpinned" ]; then
  report ok "todas las actions están fijadas por SHA de commit (ADR-0010)"
else
  report fail "todas las actions están fijadas por SHA de commit (ADR-0010)" "$unpinned"
fi

checkouts="$(grep -cE 'uses:[[:space:]]+actions/checkout@' "$WORKFLOW")"
no_credentials="$(grep -A2 -E 'uses:[[:space:]]+actions/checkout@' "$WORKFLOW" | grep -cE 'persist-credentials:[[:space:]]+false')"
if [ "$checkouts" -gt 0 ] && [ "$checkouts" = "$no_credentials" ]; then
  report ok "checkout no deja el token de GitHub en .git/config (persist-credentials: false)"
else
  report fail "checkout no deja el token de GitHub en .git/config (persist-credentials: false)" \
    "$no_credentials de $checkouts checkouts lo desactivan"
fi
has "solo se cancelan ejecuciones obsoletas de PR: cada commit de main tiene resultado" \
  "cancel-in-progress: \\$\\{\\{ github.event_name == 'pull_request' \\}\\}"

# 2. Trabajos (T1.18).
for job in check web-unit web-integration solver-tests docker-build e2e; do
  if [ -n "$(job_block "$job")" ]; then report ok "trabajo $job"; else report fail "trabajo $job" "no existe"; fi
done

has "check: pnpm check con CHECK_REQUIRE_ALL=1 (un componente ausente es un fallo)" 'CHECK_REQUIRE_ALL: "1"' check
has "check: ejecuta pnpm check (incluye los tests de scripts/tests/)" 'run: pnpm check' check
has "web-unit: tests unitarios con cobertura y umbral" 'pnpm --filter web run test:coverage$' web-unit
has "web-integration: servicio postgres:16" 'image: postgres:16' web-integration
has "web-integration: test:coverage:full (umbral también en infrastructure y prisma/seed)" 'pnpm --filter web run test:coverage:full' web-integration
has "web-integration: BD de tests *_test" 'TEST_DATABASE_URL: postgresql://[^ ]+/fsja_test' web-integration
has "solver-tests: pytest con cobertura" 'pytest.*--cov' solver-tests
has "docker-build: construye las imágenes de Compose" 'docker compose build' docker-build
has "e2e: levanta el stack completo con Docker Compose" 'docker compose up .*--wait' e2e
has "e2e: activa el seed (usuarios de los E2E)" 'SEED_ON_START=true' e2e
has "e2e: ejecuta Playwright" 'playwright test' e2e
has "e2e: sube el informe de Playwright como artefacto" 'path: apps/web/playwright-report' e2e
has "e2e: el informe se sube también si los tests fallan" "if: \\$\\{\\{ \\!cancelled\\(\\) \\}\\}" e2e

# 3. Cachés.
has "caché del store de pnpm (setup-node)" 'cache: pnpm'
has "caché de uv (setup-uv)" 'enable-cache: true'

# 4. Ningún secreto en claro: los del E2E se generan en cada ejecución.
if grep -nE '(PASSWORD|SECRET|TOKEN)[A-Z_]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9+/_-]{12,}' "$WORKFLOW" | grep -vE 'postgres|\$\{\{|\$\(' > /dev/null; then
  report fail "no hay secretos escritos en el workflow" "$(grep -nE '(PASSWORD|SECRET|TOKEN)' "$WORKFLOW")"
else
  report ok "no hay secretos escritos en el workflow"
fi

# 5. scripts/ci-env.sh: el .env de los trabajos docker-build y e2e, con secretos nuevos en cada ejecución.
CI_ENV="$ROOT/scripts/ci-env.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

env_value() { sed -n "s/^$2=//p" "$1" | tail -n 1; } # env_value <archivo> <VARIABLE>

if [ ! -x "$CI_ENV" ]; then
  report fail "ci-env.sh: existe y es ejecutable" "falta $CI_ENV"
elif ! env -u GITHUB_ACTIONS "$CI_ENV" "$WORK/a.env" > "$WORK/out.log" 2>&1 || ! env -u GITHUB_ACTIONS "$CI_ENV" "$WORK/b.env" > /dev/null 2>&1; then
  report fail "ci-env.sh: genera el archivo" "$(cat "$WORK/out.log")"
else
  report ok "ci-env.sh: genera el archivo"

  missing=""
  for variable in $(sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' "$ROOT/.env.example"); do
    grep -q "^$variable=" "$WORK/a.env" || missing="$missing $variable"
  done
  if [ -z "$missing" ]; then report ok "ci-env.sh: incluye todas las variables de .env.example"; else
    report fail "ci-env.sh: incluye todas las variables de .env.example" "faltan:$missing"; fi

  weak=""
  for variable in RATE_LIMIT_KEY_SECRET SOLVER_SERVICE_TOKEN POSTGRES_PASSWORD; do
    value="$(env_value "$WORK/a.env" "$variable")"
    if [ "${#value}" -lt 32 ] || [ "$value" = "$(env_value "$WORK/b.env" "$variable")" ]; then weak="$weak $variable"; fi
  done
  for variable in SEED_ADMIN_PASSWORD SEED_TEACHER_PASSWORD SEED_GUEST_PASSWORD; do
    value="$(env_value "$WORK/a.env" "$variable")"
    if [ "${#value}" -lt 12 ] || [ "$value" = "$(env_value "$WORK/b.env" "$variable")" ]; then weak="$weak $variable"; fi
  done
  if [ -z "$weak" ]; then report ok "ci-env.sh: secretos y contraseñas aleatorios y nuevos en cada ejecución"; else
    report fail "ci-env.sh: secretos y contraseñas aleatorios y nuevos en cada ejecución" "débiles o repetidos:$weak"; fi

  expected_url="postgresql://$(env_value "$WORK/a.env" POSTGRES_USER):$(env_value "$WORK/a.env" POSTGRES_PASSWORD)@db:5432/$(env_value "$WORK/a.env" POSTGRES_DB)"
  if [ "$(env_value "$WORK/a.env" DATABASE_URL)" = "$expected_url" ]; then
    report ok "ci-env.sh: DATABASE_URL apunta a db con las credenciales de POSTGRES_*"
  else
    report fail "ci-env.sh: DATABASE_URL apunta a db con las credenciales de POSTGRES_*" "DATABASE_URL no coincide"
  fi

  if [ "$(env_value "$WORK/a.env" APP_ENV)" = "development" ] && [ "$(env_value "$WORK/a.env" SEED_ON_START)" = "true" ] \
    && [ "$(env_value "$WORK/a.env" APP_ORIGIN)" = "http://localhost:3000" ]; then
    report ok "ci-env.sh: entorno de desarrollo con el seed activado (usuarios de los E2E)"
  else
    report fail "ci-env.sh: entorno de desarrollo con el seed activado (usuarios de los E2E)" "APP_ENV, SEED_ON_START o APP_ORIGIN inesperados"
  fi

  if grep -qE "$(env_value "$WORK/a.env" RATE_LIMIT_KEY_SECRET)|$(env_value "$WORK/a.env" SEED_ADMIN_PASSWORD)" "$WORK/out.log"; then
    report fail "ci-env.sh: no imprime los secretos" "aparecen en la salida"
  else
    report ok "ci-env.sh: no imprime los secretos"
  fi

  if command -v docker > /dev/null 2>&1; then
    if docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.yml" --env-file "$WORK/a.env" config -q > "$WORK/config.err" 2>&1; then
      report ok "ci-env.sh: docker compose acepta el .env generado"
    else
      report fail "ci-env.sh: docker compose acepta el .env generado" "$(cat "$WORK/config.err")"
    fi
  fi
fi

echo "ci.test: $passed ok, $failed fallo(s)."
[ "$failed" -eq 0 ]
