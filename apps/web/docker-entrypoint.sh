#!/bin/sh
# Arranque del contenedor web (specs/02-architecture-plan.md §1.4; specs/03-tasks.md T1.16).
#
#   1. prisma migrate deploy. Si falla, el contenedor termina y el servidor no arranca.
#   2. Con SEED_ON_START=true (exactamente), el seed de usuarios. Si falla, tampoco arranca. El propio seed se
#      niega a ejecutarse fuera de development/test (TFM-02), y env.ts rechaza SEED_ON_START=true en production.
#   3. exec del comando de la imagen (el servidor), que pasa a ser el PID 1 y recibe las señales.
#
# WEB_TOOLS_DIR es la instalación de producción con el CLI de Prisma, las migraciones y el seed (la cambian los
# tests de scripts/tests/compose.test.sh).
set -eu

TOOLS_DIR="${WEB_TOOLS_DIR:-/app/tools/apps/web}"
APP_DIR="$(pwd)"

cd "$TOOLS_DIR"
echo "Aplicando migraciones (prisma migrate deploy)…"
node node_modules/prisma/build/index.js migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "SEED_ON_START=true: ejecutando el seed de usuarios…"
  node prisma/seed/run.mjs
fi

cd "$APP_DIR"
exec "$@"
