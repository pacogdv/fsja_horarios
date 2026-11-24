#!/usr/bin/env bash
# Smoke test del stack Docker en ejecución (specs/03-tasks.md T1.6; specs/02-architecture-plan.md
# §1.4 y §5.7). Se ejecuta después de levantarlo:
#
#   docker compose up -d --build --wait && ./scripts/compose-smoke.sh
#
# Comprueba:
#   1. Todos los servicios (db, solver, web) están en estado healthy.
#   2. El solver no es accesible desde el host (curl localhost:8000 falla).
#   3. Desde el contenedor solver, el nombre db no resuelve (no comparte red con la BD).
#   4. Desde el contenedor web, http://solver:8000/health responde 200.
# Compatible con bash 3.2. Requiere docker y curl. Sale con código 1 si algo falla.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICES="db solver web"

passed=0
failed=0

report() {
  if [ "$1" = "ok" ]; then
    passed=$((passed + 1)); echo "ok   - $2"
  else
    failed=$((failed + 1)); echo "FAIL - $2"; printf '%s\n' "$3" | sed 's/^/       /'
  fi
}

compose() { docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.yml" "$@"; }

# 1. Salud de los servicios.
for service in $SERVICES; do
  container="$(compose ps -q "$service" 2>/dev/null)"
  health="$( [ -n "$container" ] && docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}sin healthcheck{{end}}' "$container" 2>&1)"
  if [ "$health" = "healthy" ]; then
    report ok "$service está healthy"
  else
    report fail "$service está healthy" "estado: ${health:-no está en ejecución}"
  fi
done

# 2. El solver no publica puertos: desde el host no hay nada escuchando en el 8000.
if output="$(curl --silent --show-error --max-time 5 http://localhost:8000/health 2>&1)"; then
  report fail "curl localhost:8000 falla desde el host" "respondió: $output"
else
  report ok "curl localhost:8000 falla desde el host"
fi

# 3. El solver no puede resolver db. El código 3 distingue «no resuelve» de cualquier otro error.
resolve_db='
import socket, sys
try:
    socket.getaddrinfo("db", 5432)
except socket.gaierror:
    sys.exit(3)
sys.exit(0)
'
compose exec -T solver python -c "$resolve_db" > /dev/null 2>&1
code=$?
case "$code" in
  3) report ok "desde solver, db:5432 no resuelve" ;;
  0) report fail "desde solver, db:5432 no resuelve" "db resuelve: el solver comparte red con la BD" ;;
  *) report fail "desde solver, db:5432 no resuelve" "no se pudo ejecutar la comprobación (código $code)" ;;
esac

# 4. La web llega al solver por la red interna solver_net.
fetch_health='
fetch("http://solver:8000/health", { signal: AbortSignal.timeout(5000) })
  .then((response) => { console.log(response.status); process.exit(response.status === 200 ? 0 : 1); })
  .catch((error) => { console.log(error.cause?.code ?? error.name); process.exit(2); });
'
if output="$(compose exec -T web node -e "$fetch_health" 2>&1)"; then
  report ok "desde web, solver:8000/health responde 200"
else
  report fail "desde web, solver:8000/health responde 200" "resultado: $output"
fi

echo "compose-smoke: $passed ok, $failed fallo(s)."
[ "$failed" -eq 0 ]
