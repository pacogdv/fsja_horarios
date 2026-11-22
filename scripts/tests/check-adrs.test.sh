#!/usr/bin/env bash
# Tests de scripts/check-adrs.sh: un caso verde sobre docs/adr y un caso rojo por cada criterio
# (mutaciones sobre una copia temporal). Compatible con bash 3.2. Sale con código 1 si algo falla.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHECKER="$ROOT/scripts/check-adrs.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

passed=0
failed=0

report() {
  if [ "$1" = "ok" ]; then
    passed=$((passed + 1)); echo "ok   - $2"
  else
    failed=$((failed + 1)); echo "FAIL - $2"; echo "$3" | sed 's/^/       /'
  fi
}

fresh_copy() {
  rm -rf "$WORK/adr" && mkdir -p "$WORK/adr" && cp "$ROOT"/docs/adr/*.md "$WORK/adr/"
}

expect_green() {
  local output code
  output="$(cd "$ROOT" && "$CHECKER" 2>&1)"; code=$?
  if [ "$code" -eq 0 ]; then report ok "$1"; else report fail "$1" "$output"; fi
}

# expect_red <descripción> <mutación (se ejecuta dentro de la copia)> <mensaje esperado>
expect_red() {
  local output code
  fresh_copy
  (cd "$WORK/adr" && eval "$2")
  output="$(cd "$ROOT" && ADR_DIR="$WORK/adr" "$CHECKER" 2>&1)"; code=$?
  if [ "$code" -ne 0 ] && echo "$output" | grep -qF "$3"; then
    report ok "$1"
  else
    report fail "$1 (exit=$code)" "$output"
  fi
}

expect_green "los ADR del repositorio cumplen todos los criterios"

expect_red "detecta una sección obligatoria ausente" \
  "sed -i.bak '/^## Consecuencias\$/d' 0002-*.md" "no tiene la sección '## Consecuencias'"
expect_red "detecta un estado no válido" \
  "sed -i.bak 's/^\*\*Aceptado\*\*\$/**Quizá**/' 0008-*.md" "estado no válido"
expect_red "detecta una dependencia de H1 sin registrar en ADR-0010" \
  "sed -i.bak '/^| Playwright |/d' 0010-*.md" "no registra la dependencia 'Playwright'"
expect_red "detecta un ADR obligatorio ausente" \
  "rm 0009-*.md" "falta el ADR-0009"
expect_red "detecta un ADR del catálogo sin fila en el índice" \
  "sed -i.bak '/^| 0005 /d' README.md" "no tiene fila para ADR-0005"
expect_red "detecta un ADR redactado marcado como Pendiente" \
  "sed -i.bak 's/^\(| 0001 .*\)Aceptado/\1Pendiente/' README.md" "marca ADR-0001 como Pendiente"
expect_red "detecta un ADR pendiente sin marcar como Pendiente" \
  "sed -i.bak 's/^\(| 0011 .*\)Pendiente/\1Aceptado/' README.md" "no marca como Pendiente el ADR-0011"
expect_red "detecta un ADR redactado sin enlace en el índice" \
  "sed -i.bak 's/(0002-sesiones-opacas-en-bd.md)//' README.md" "no enlaza ADR-0002"
expect_red "detecta la plantilla ausente" \
  "rm 0000-*.md" "no existe la plantilla"
expect_red "detecta el índice ausente" \
  "rm README.md" "no existe el índice"
expect_red "informa de todos los fallos a la vez, no solo del primero" \
  "rm 0001-*.md 0002-*.md" "check-adrs: 4 fallo(s)."   # 2 ADR ausentes + 2 filas del índice incoherentes

echo "check-adrs.test: $passed ok, $failed fallo(s)."
[ "$failed" -eq 0 ]
