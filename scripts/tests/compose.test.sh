#!/usr/bin/env bash
# Tests estáticos de la infraestructura Docker (specs/03-tasks.md T1.6; specs/02-architecture-plan.md
# §1.4 y §5.7). Validan, sin arrancar contenedores:
# - docker-compose.yml, tal como lo normaliza `docker compose config` (solo necesita la CLI de Docker);
# - los Dockerfiles de apps/web y services/solver, y sus archivos de exclusión del contexto de build.
# Las comprobaciones en ejecución (salud, aislamiento de red) están en scripts/compose-smoke.sh.
# Compatible con bash 3.2. Requiere docker (CLI con Compose v2) y node. Sale con código 1 si algo falla.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

passed=0
failed=0

report() {
  if [ "$1" = "ok" ]; then
    passed=$((passed + 1)); echo "ok   - $2"
  else
    failed=$((failed + 1)); echo "FAIL - $2"; printf '%s\n' "$3" | sed 's/^/       /'
  fi
}

# Variables que interpola docker-compose.yml. Se aíslan del entorno exterior para que los casos no
# dependan del .env ni de la shell de quien ejecuta los tests.
COMPOSE_VARIABLES="APP_ENV APP_ORIGIN TRUSTED_PROXY_HOPS RATE_LIMIT_KEY_SECRET POSTGRES_USER POSTGRES_DB
POSTGRES_PASSWORD DATABASE_URL SOLVER_URL SOLVER_SERVICE_TOKEN SOLVER_MAX_CONCURRENT_JOBS SEED_ON_START
SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD SEED_TEACHER_EMAIL SEED_TEACHER_PASSWORD SEED_GUEST_EMAIL SEED_GUEST_PASSWORD"

write_env() { # write_env <archivo> [VARIABLE_A_OMITIR]
  {
    echo "APP_ENV=development"
    echo "APP_ORIGIN=http://localhost:3000"
    echo "TRUSTED_PROXY_HOPS=0"
    echo "RATE_LIMIT_KEY_SECRET=test-rate-limit-secret-0123456789abcdef"
    echo "POSTGRES_USER=fsja"
    echo "POSTGRES_DB=fsja"
    echo "POSTGRES_PASSWORD=test-postgres-password"
    echo "DATABASE_URL=postgresql://fsja:test-postgres-password@db:5432/fsja"
    echo "SOLVER_URL=http://solver:8000"
    echo "SOLVER_SERVICE_TOKEN=test-solver-token-0123456789abcdef0123"
    echo "SOLVER_MAX_CONCURRENT_JOBS=1"
    echo "SEED_ON_START=false"
  } | grep -v "^${2:-__NINGUNA__}=" > "$1"
}

compose_config() { # compose_config <env-file> [archivos compose adicionales...]: configuración normalizada en JSON.
  local env_file="$1" unset_args="" variable file files="-f $ROOT/docker-compose.yml"; shift
  for variable in $COMPOSE_VARIABLES; do unset_args="$unset_args -u $variable"; done
  for file in "$@"; do files="$files -f $file"; done
  # shellcheck disable=SC2086  # unset_args y files se dividen en argumentos a propósito.
  env $unset_args docker compose --project-directory "$ROOT" $files --env-file "$env_file" config --format json
}

# --------------------------------------------------------------------------------------------------
# 1. docker-compose.yml
# --------------------------------------------------------------------------------------------------

write_env "$WORK/valid.env"
if compose_config "$WORK/valid.env" > "$WORK/config.json" 2> "$WORK/config.err"; then
  report ok "docker compose config acepta la configuración con un entorno completo"
else
  report fail "docker compose config acepta la configuración con un entorno completo" "$(cat "$WORK/config.err")"
fi

compose() { # compose <descripción> <expresión JS sobre c (config), s (servicios), n (redes)>
  local output
  if [ ! -s "$WORK/config.json" ]; then report fail "$1" "sin configuración válida de docker compose"; return; fi
  if output="$(node -e '
      const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const s = c.services || {}, n = c.networks || {};
      const ok = (new Function("c", "s", "n", "return (" + process.argv[2] + ")"))(c, s, n);
      if (ok !== true) { console.error("la condición no se cumple"); process.exit(1); }' \
      "$WORK/config.json" "$2" 2>&1)"; then
    report ok "$1"
  else
    report fail "$1" "$output"
  fi
}

compose "define exactamente los servicios db, solver y web" \
  'Object.keys(s).sort().join() === "db,solver,web"'
compose "db usa postgres:16-alpine" 's.db.image === "postgres:16-alpine"'
compose "solver y web se construyen desde su Dockerfile" \
  's.solver.build.dockerfile.endsWith("Dockerfile") && /apps[\\/]web[\\/]Dockerfile$/.test(s.web.build.dockerfile)'

# Redes [02 §1.4, §5.7]
compose "backend es internal: true (sin salida a Internet)" 'n.backend && n.backend.internal === true'
compose "solver_net es internal: true (sin salida a Internet)" 'n.solver_net && n.solver_net.internal === true'
compose "public no es interna (la web es accesible desde fuera)" 'n.public && n.public.internal !== true'
compose "db solo está en backend" 'Object.keys(s.db.networks).join() === "backend"'
compose "solver solo está en solver_net (no comparte red con db)" 'Object.keys(s.solver.networks).join() === "solver_net"'
compose "web está en backend, solver_net y public" 'Object.keys(s.web.networks).sort().join() === "backend,public,solver_net"'

# Puertos [02 §5.1]: solo web es accesible desde fuera.
compose "solver no publica puertos" '!s.solver.ports || s.solver.ports.length === 0'
compose "db no publica puertos" '!s.db.ports || s.db.ports.length === 0'
compose "web publica el 3000" \
  'Array.isArray(s.web.ports) && s.web.ports.some(p => String(p.published) === "3000" && p.target === 3000)'
# En local la web va por HTTP: no se expone a la red local [02 §1.4].
compose "web solo publica en 127.0.0.1" \
  's.web.ports.length > 0 && s.web.ports.every(p => p.host_ip === "127.0.0.1")'

# Endurecimiento del solver [02 §5.7]
compose "solver: sistema de archivos de solo lectura" 's.solver.read_only === true'
compose "solver: /tmp en tmpfs" 'Array.isArray(s.solver.tmpfs) && s.solver.tmpfs.some(t => t.split(":")[0] === "/tmp")'
compose "solver: cap_drop ALL" 'JSON.stringify(s.solver.cap_drop) === "[\"ALL\"]"'
compose "solver: no-new-privileges" '(s.solver.security_opt || []).includes("no-new-privileges:true")'
compose "solver: límite de CPU" 'Number(s.solver.cpus) > 0'
compose "solver: límite de memoria" 'Number(s.solver.mem_limit) > 0'
compose "solver: no recibe credenciales de BD" \
  'Object.keys(s.solver.environment || {}).every(k => k !== "DATABASE_URL" && !k.startsWith("POSTGRES_"))'
compose "solver: recibe SOLVER_SERVICE_TOKEN" '(s.solver.environment || {}).SOLVER_SERVICE_TOKEN === "test-solver-token-0123456789abcdef0123"'

# Endurecimiento de la web (no necesita privilegios del kernel).
compose "web: cap_drop ALL y no-new-privileges" \
  'JSON.stringify(s.web.cap_drop) === "[\"ALL\"]" && (s.web.security_opt || []).includes("no-new-privileges:true")'

# Healthchecks
compose "db: healthcheck con pg_isready" 's.db.healthcheck && s.db.healthcheck.test.join(" ").includes("pg_isready")'
compose "solver: healthcheck HTTP a /health" \
  's.solver.healthcheck && /http:\/\/127\.0\.0\.1:8000\/health/.test(s.solver.healthcheck.test.join(" "))'
compose "web: healthcheck HTTP al puerto 3000" \
  's.web.healthcheck && /http:\/\/127\.0\.0\.1:3000\//.test(s.web.healthcheck.test.join(" "))'
compose "web espera a que db y solver estén sanos" \
  's.web.depends_on && s.web.depends_on.db.condition === "service_healthy" && s.web.depends_on.solver.condition === "service_healthy"'
compose "db persiste los datos en el volumen pgdata" \
  's.db.volumes.some(v => v.type === "volume" && v.source === "pgdata" && v.target === "/var/lib/postgresql/data")'

# Secretos [CLAUDE.md §3.5]: llegan solo del entorno y su ausencia impide arrancar.
for secret in POSTGRES_PASSWORD DATABASE_URL SOLVER_SERVICE_TOKEN RATE_LIMIT_KEY_SECRET; do
  write_env "$WORK/missing.env" "$secret"
  if compose_config "$WORK/missing.env" > /dev/null 2> "$WORK/missing.err"; then
    report fail "sin $secret, docker compose config falla" "la configuración se aceptó"
  elif grep -q "$secret" "$WORK/missing.err"; then
    report ok "sin $secret, docker compose config falla y nombra la variable"
  else
    report fail "sin $secret, docker compose config falla y nombra la variable" "$(cat "$WORK/missing.err")"
  fi
done

# Claves YAML con nombre de secreto cuyo valor no empieza por una interpolación `${…}`.
hardcoded="$(grep -nE '^[[:space:]]*[A-Z_]*(PASSWORD|TOKEN|SECRET|DATABASE_URL)[A-Z_]*:[[:space:]]*[^$[:space:]]' \
  "$ROOT/docker-compose.yml" 2>&1)"
if [ ! -f "$ROOT/docker-compose.yml" ]; then
  report fail "docker-compose.yml no contiene secretos escritos a mano" "falta docker-compose.yml"
elif [ -z "$hardcoded" ]; then
  report ok "docker-compose.yml no contiene secretos escritos a mano"
else
  report fail "docker-compose.yml no contiene secretos escritos a mano" "$hardcoded"
fi

# --------------------------------------------------------------------------------------------------
# 1b. docker-compose.override.yml (solo desarrollo, T1.7)
# Docker no publica puertos de contenedores que solo están en redes internas: para que los tests de
# integración y Prisma lleguen a PostgreSQL desde el host, el override añade a db una red no interna y
# publica el 5432 solo en 127.0.0.1 [02 §1.4]. El resto de servicios no cambia.
# --------------------------------------------------------------------------------------------------

if [ ! -f "$ROOT/docker-compose.override.yml" ]; then
  report fail "existe docker-compose.override.yml (desarrollo)" "falta $ROOT/docker-compose.override.yml"
elif compose_config "$WORK/valid.env" "$ROOT/docker-compose.override.yml" > "$WORK/dev.json" 2> "$WORK/dev.err"; then
  report ok "existe docker-compose.override.yml (desarrollo) y es válido"
else
  report fail "existe docker-compose.override.yml (desarrollo) y es válido" "$(cat "$WORK/dev.err")"
fi

dev() { # dev <descripción> <expresión JS sobre b/d (servicios base/desarrollo) y dn (redes de desarrollo)>
  local output
  if [ ! -s "$WORK/dev.json" ]; then report fail "$1" "sin configuración de desarrollo válida"; return; fi
  if output="$(node -e '
      const read = (f) => JSON.parse(require("fs").readFileSync(f, "utf8"));
      const base = read(process.argv[1]), devConfig = read(process.argv[2]);
      const b = base.services, d = devConfig.services, dn = devConfig.networks || {};
      const ok = (new Function("b", "d", "dn", "return (" + process.argv[3] + ")"))(b, d, dn);
      if (ok !== true) { console.error("la condición no se cumple"); process.exit(1); }' \
      "$WORK/config.json" "$WORK/dev.json" "$2" 2>&1)"; then
    report ok "$1"
  else
    report fail "$1" "$output"
  fi
}

dev "desarrollo: db publica el 5432 solo en 127.0.0.1" \
  'd.db.ports.length === 1 && d.db.ports[0].host_ip === "127.0.0.1" && String(d.db.ports[0].published) === "5432" && d.db.ports[0].target === 5432'
dev "desarrollo: db sigue en backend" 'Object.keys(d.db.networks).includes("backend")'
dev "desarrollo: la red extra de db no es compartida por solver ni web" \
  'Object.keys(d.db.networks).filter(k => k !== "backend").every(k => !(k in d.solver.networks) && !(k in d.web.networks))'
dev "desarrollo: solver y web no cambian respecto a la configuración base" \
  'JSON.stringify(d.solver) === JSON.stringify(b.solver) && JSON.stringify(d.web) === JSON.stringify(b.web)'
dev "desarrollo: backend y solver_net siguen siendo internas" 'dn.backend.internal === true && dn.solver_net.internal === true'

# --------------------------------------------------------------------------------------------------
# 2. Dockerfiles y contexto de build
# --------------------------------------------------------------------------------------------------

# final_stage <Dockerfile>: instrucciones de la última etapa (desde el último FROM).
final_stage() { awk 'toupper($1) == "FROM" { stage = "" } { stage = stage $0 "\n" } END { printf "%s", stage }' "$1"; }

check_dockerfile() { # check_dockerfile <nombre> <Dockerfile> <regex de la imagen base>
  local name="$1" file="$2" base="$3" stages user
  if [ ! -f "$file" ]; then report fail "$name: existe el Dockerfile" "falta $file"; return; fi
  stages="$(grep -ciE '^[[:space:]]*FROM[[:space:]]' "$file")"
  if [ "$stages" -ge 2 ]; then report ok "$name: imagen multi-stage ($stages etapas)"; else
    report fail "$name: imagen multi-stage" "solo $stages etapa(s)"; fi
  if grep -qE "^[[:space:]]*FROM[[:space:]]+$base" "$file"; then report ok "$name: imagen base $base"; else
    report fail "$name: imagen base $base" "$(grep -iE '^[[:space:]]*FROM' "$file")"; fi
  user="$(final_stage "$file" | awk 'toupper($1) == "USER" { print $2 }' | tail -n 1)"
  case "$user" in
    "" ) report fail "$name: la etapa final se ejecuta con un usuario no root" "la etapa final no declara USER" ;;
    root|root:*|0|0:* ) report fail "$name: la etapa final se ejecuta con un usuario no root" "USER $user" ;;
    * ) report ok "$name: la etapa final se ejecuta con un usuario no root (USER $user)" ;;
  esac
}

check_ignore() { # check_ignore <nombre> <archivo de exclusión> <patrones obligatorios...>
  local name="$1" file="$2" pattern missing=""; shift 2
  if [ ! -f "$file" ]; then report fail "$name: existe $(basename "$file")" "falta $file"; return; fi
  for pattern in "$@"; do grep -qxF "$pattern" "$file" || missing="$missing $pattern"; done
  if [ -z "$missing" ]; then report ok "$name: el contexto de build excluye secretos y artefactos locales"; else
    report fail "$name: el contexto de build excluye secretos y artefactos locales" "faltan:$missing"; fi
}

check_dockerfile "solver" "$ROOT/services/solver/Dockerfile" "python:3\.12-slim"
check_dockerfile "web" "$ROOT/apps/web/Dockerfile" "node:22-"
# El solver se construye con su carpeta como contexto. La web necesita la raíz (lockfile y workspace de
# pnpm), así que usa el archivo de exclusión específico de su Dockerfile (<Dockerfile>.dockerignore).
check_ignore "solver" "$ROOT/services/solver/.dockerignore" ".env" ".env.*" ".venv" "**/__pycache__"
check_ignore "web" "$ROOT/apps/web/Dockerfile.dockerignore" "**/.env" "**/.env.*" "**/node_modules" "**/.next" \
  "services" ".git"

if grep -qE 'uvicorn.*solver\.api\.app:create_app.*--factory' "$ROOT/services/solver/Dockerfile" 2>/dev/null; then
  report ok "solver: arranca con la fábrica create_app (T1.5)"
else
  report fail "solver: arranca con la fábrica create_app (T1.5)" "CMD no usa uvicorn solver.api.app:create_app --factory"
fi

# --------------------------------------------------------------------------------------------------
# 3. Arranque de la web: migraciones y seed (T1.16; 02 §1.4)
# --------------------------------------------------------------------------------------------------

ENTRYPOINT_FILE="$ROOT/apps/web/docker-entrypoint.sh"
web_final="$(final_stage "$ROOT/apps/web/Dockerfile")"
if printf '%s' "$web_final" | grep -qE '^ENTRYPOINT[[:space:]]+\["/app/docker-entrypoint\.sh"\]'; then
  report ok "web: la etapa final arranca con docker-entrypoint.sh"
else
  report fail "web: la etapa final arranca con docker-entrypoint.sh" "falta ENTRYPOINT [\"/app/docker-entrypoint.sh\"]"
fi
if printf '%s' "$web_final" | grep -qE '^CMD[[:space:]]+\["node",[[:space:]]*"apps/web/server\.js"\]'; then
  report ok "web: el servidor es el CMD que ejecuta el entrypoint"
else
  report fail "web: el servidor es el CMD que ejecuta el entrypoint" "falta CMD [\"node\", \"apps/web/server.js\"]"
fi

# El entrypoint se ejecuta con un `node` simulado que registra cada llamada y falla si se le pide.
# run_entrypoint <SEED_ON_START> <comando de node que falla, o "-">: deja las llamadas en $WORK/calls.
run_entrypoint() {
  local stub="$WORK/stub-bin"
  mkdir -p "$stub" "$WORK/tools"
  cat > "$stub/node" <<'STUB'
#!/bin/sh
echo "node $*" >> "$CALLS"
case "$*" in *"$FAIL_ON"*) exit 1 ;; esac
exit 0
STUB
  chmod +x "$stub/node"
  : > "$WORK/calls"
  PATH="$stub:$PATH" CALLS="$WORK/calls" FAIL_ON="$2" SEED_ON_START="$1" WEB_TOOLS_DIR="$WORK/tools" \
    sh "$ENTRYPOINT_FILE" node apps/web/server.js > /dev/null 2>&1
}

calls() { sed -e 's#node node_modules/prisma/build/index.js migrate deploy#migrate#' \
  -e 's#node prisma/seed/run.mjs#seed#' -e 's#node apps/web/server.js#server#' "$WORK/calls" | tr '\n' ' ' | sed 's/ $//'; }

check_entrypoint() { # check_entrypoint <descripción> <SEED_ON_START> <falla en> <código esperado: 0 | error> <llamadas esperadas>
  local code
  if [ ! -f "$ENTRYPOINT_FILE" ]; then report fail "$1" "falta $ENTRYPOINT_FILE"; return; fi
  run_entrypoint "$2" "$3"; code=$?
  if { [ "$4" = 0 ] && [ "$code" -ne 0 ]; } || { [ "$4" = error ] && [ "$code" -eq 0 ]; }; then
    report fail "$1" "código de salida $code"
  elif [ "$(calls)" != "$5" ]; then
    report fail "$1" "llamadas: '$(calls)' (se esperaba '$5')"
  else
    report ok "$1"
  fi
}

check_entrypoint "entrypoint: sin seed, migra y arranca el servidor" false - 0 "migrate server"
check_entrypoint "entrypoint: con SEED_ON_START=true, migra, siembra y arranca" true - 0 "migrate seed server"
check_entrypoint "entrypoint: SEED_ON_START con otro valor no siembra" TRUE - 0 "migrate server"
check_entrypoint "entrypoint: si la migración falla, no siembra ni arranca" true "migrate deploy" error "migrate"
check_entrypoint "entrypoint: si el seed falla, no arranca" true "seed/run.mjs" error "migrate seed"

# La etapa tools de la imagen elimina Next.js: el seed y lo que importa no pueden depender de él.
seed_next_imports="$(grep -rlE "from ['\"](next|next/[^'\"]*)['\"]" "$ROOT/apps/web/prisma/seed" \
  "$ROOT/apps/web/src/infrastructure/db" "$ROOT/apps/web/src/infrastructure/auth/argon2-hasher.ts" \
  "$ROOT/apps/web/src/lib/env.ts" 2>/dev/null)"
if [ -z "$seed_next_imports" ]; then
  report ok "seed: ni el seed ni sus dependencias de src importan Next.js (no está en la etapa tools)"
else
  report fail "seed: ni el seed ni sus dependencias de src importan Next.js (no está en la etapa tools)" "$seed_next_imports"
fi

echo "compose.test: $passed ok, $failed fallo(s)."
[ "$failed" -eq 0 ]
