#!/usr/bin/env bash
# Genera el .env de los trabajos docker-build y e2e de CI (specs/03-tasks.md T1.18) a partir de .env.example:
#   - secretos aleatorios nuevos en cada ejecución (nunca están en el repositorio);
#   - entorno de desarrollo con el seed activado, para los usuarios de los E2E (T1.16 y T1.17).
# En GitHub Actions, enmascara los valores generados para que no aparezcan en los logs. No imprime ningún secreto.
#
#   scripts/ci-env.sh <archivo de salida>     (normalmente .env en la raíz)
#
# Compatible con bash 3.2. Lo prueba scripts/tests/ci.test.sh.
set -euo pipefail

OUT="${1:?Uso: scripts/ci-env.sh <archivo .env de salida>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

random_hex() { od -An -tx1 -N32 /dev/urandom | tr -d ' \n'; } # 32 bytes → 64 caracteres hexadecimales

# new_secret <variable>: guarda un valor aleatorio en la variable de shell y, en GitHub Actions, lo enmascara.
# No se usa $(...): la orden ::add-mask:: va a stdout y acabaría dentro del valor (fallo de la primera ejecución
# de CI, cubierto por ci.test.sh).
new_secret() {
  printf -v "$1" '%s' "$(random_hex)"
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::add-mask::${!1}"; fi
}

new_secret rate_limit_key_secret
new_secret postgres_password
new_secret solver_service_token
new_secret seed_admin_password
new_secret seed_teacher_password
new_secret seed_guest_password
# El valor de DATABASE_URL incluye la contraseña de PostgreSQL: se enmascara también la URL completa.
database_url="postgresql://fsja:$postgres_password@db:5432/fsja"
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::add-mask::$database_url"; fi

overrides="APP_ENV=development
APP_ORIGIN=http://localhost:3000
TRUSTED_PROXY_HOPS=0
RATE_LIMIT_KEY_SECRET=$rate_limit_key_secret
POSTGRES_USER=fsja
POSTGRES_DB=fsja
POSTGRES_PASSWORD=$postgres_password
DATABASE_URL=$database_url
SOLVER_SERVICE_TOKEN=$solver_service_token
SEED_ON_START=true
SEED_ADMIN_PASSWORD=$seed_admin_password
SEED_TEACHER_PASSWORD=$seed_teacher_password
SEED_GUEST_PASSWORD=$seed_guest_password"

# Copia .env.example sustituyendo los valores de las variables de $overrides; el resto queda como en el ejemplo.
umask 077
printf '%s\n' "$overrides" | awk -F= '
  NR == FNR { value[$1] = substr($0, length($1) + 2); next }
  /^[A-Z_][A-Z0-9_]*=/ { key = $1; if (key in value) { print key "=" value[key]; next } }
  { print }' - "$ROOT/.env.example" > "$OUT"

echo "ci-env: $OUT generado (APP_ENV=development, SEED_ON_START=true, secretos aleatorios)."
