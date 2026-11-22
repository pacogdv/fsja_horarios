#!/usr/bin/env bash
# Verifica los criterios de aceptación de los ADR (specs/03-tasks.md, T1.1).
# Compatible con bash 3.2 (macOS). Sale con código 1 si falla algún criterio.
set -euo pipefail

ADR_DIR="${ADR_DIR:-docs/adr}"
INDEX="$ADR_DIR/README.md"

# Catálogo completo de ADR previstos (specs/02-architecture-plan.md §7 y specs/03-tasks.md T5.1).
CATALOG="0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011"

# ADR que deben estar redactados en el estado actual del plan. Cada tarea de ADR amplía esta lista.
REQUIRED_WRITTEN="0001 0002 0008 0009 0010"

REQUIRED_SECTIONS="Estado|Contexto|Decisión|Alternativas consideradas|Consecuencias"
VALID_STATES="Propuesto|Aceptado|Rechazado|Sustituido|Obsoleto"

# Dependencias de H1 que debe registrar ADR-0010 (specs/03-tasks.md T1.1).
H1_DEPENDENCIES="pnpm|uv|Next.js|Tailwind CSS|shadcn/ui|TanStack Query|Zod|Prisma|@node-rs/argon2|Vitest|Testing Library|Playwright|FastAPI|Pydantic|OR-Tools|pytest|pytest-cov|ruff|mypy"

failures=0

fail() {
  echo "FALLO: $1" >&2
  failures=$((failures + 1))
}

adr_file() {
  # Imprime la ruta del ADR con número $1, o nada si no existe.
  if [ -d "$ADR_DIR" ]; then
    find "$ADR_DIR" -maxdepth 1 -name "$1-*.md" | sort | head -n 1
  fi
}

check_sections() {
  local file="$1" section
  local IFS='|'
  for section in $REQUIRED_SECTIONS; do
    if ! grep -qx "## $section" "$file"; then
      fail "$file no tiene la sección '## $section'"
    fi
  done
}

check_state() {
  local file="$1" state
  # El estado es la primera línea no vacía tras '## Estado'.
  state="$(awk '/^## Estado$/ {found=1; next} found && NF {print; exit}' "$file")"
  if ! echo "$state" | grep -Eq "^\*\*($VALID_STATES)\*\*"; then
    fail "$file tiene un estado no válido: '$state' (se espera **$VALID_STATES**)"
  fi
}

check_dependencies() {
  local file="$1" dependency
  local IFS='|'
  for dependency in $H1_DEPENDENCIES; do
    if ! grep -qF "| $dependency |" "$file"; then
      fail "$file no registra la dependencia '$dependency' en su tabla"
    fi
  done
}

check_index_entry() {
  local number="$1" file="$2" row
  row="$(grep -E "^\| *$number *\|" "$INDEX" || true)"
  if [ -z "$row" ]; then
    fail "el índice no tiene fila para ADR-$number"
    return
  fi
  if [ -n "$file" ]; then
    if ! echo "$row" | grep -qF "]($(basename "$file"))"; then
      fail "el índice no enlaza ADR-$number a $(basename "$file")"
    fi
    if echo "$row" | grep -q "Pendiente"; then
      fail "el índice marca ADR-$number como Pendiente, pero ya está redactado"
    fi
  elif ! echo "$row" | grep -q "Pendiente"; then
    fail "el índice no marca como Pendiente el ADR-$number, que aún no existe"
  fi
}

main() {
  local number file

  if [ ! -f "$INDEX" ]; then
    fail "no existe el índice $INDEX"
  fi

  local template
  template="$(adr_file 0000)"
  if [ -z "$template" ]; then
    fail "no existe la plantilla $ADR_DIR/0000-*.md"
  else
    check_sections "$template"
  fi

  for number in $REQUIRED_WRITTEN; do
    if [ -z "$(adr_file "$number")" ]; then
      fail "falta el ADR-$number, que debe estar redactado"
    fi
  done

  for number in $CATALOG; do
    file="$(adr_file "$number")"
    if [ -n "$file" ]; then
      check_sections "$file"
      check_state "$file"
    fi
    if [ -f "$INDEX" ]; then
      check_index_entry "$number" "$file"
    fi
  done

  file="$(adr_file 0010)"
  if [ -n "$file" ]; then
    check_dependencies "$file"
  fi

  if [ "$failures" -gt 0 ]; then
    echo "check-adrs: $failures fallo(s)." >&2
    exit 1
  fi
  echo "check-adrs: OK"
}

main "$@"
