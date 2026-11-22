#!/usr/bin/env bash
# Tests de la raíz del monorepo (specs/03-tasks.md, T1.2).
# - Configuración: package.json, pnpm-workspace.yaml, .node-version, .editorconfig, .env.example.
# - scripts/check.sh: delegación y códigos de salida, con `pnpm` y `uv` sustituidos por stubs en PATH.
# Compatible con bash 3.2. Requiere node (para leer JSON). Sale con código 1 si algo falla.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHECK="$ROOT/scripts/check.sh"
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

assert() { # assert <descripción> <comando...>
  local description="$1"; shift
  local output
  if output="$("$@" 2>&1)"; then report ok "$description"; else report fail "$description" "$output"; fi
}

json() { # json <archivo> <expresión JS sobre j>
  node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
           const r=(new Function("j","return ("+process.argv[2]+")"))(j);
           if (r===undefined||r===null||r===false) process.exit(1); console.log(r);' "$1" "$2"
}

# --------------------------------------------------------------------------------------------------
# 1. Configuración de la raíz
# --------------------------------------------------------------------------------------------------

assert "package.json existe y es JSON válido" json "$ROOT/package.json" 'true'
assert "package.json es privado (no publicable por error)" json "$ROOT/package.json" 'j.private === true'
assert "packageManager fija una versión exacta de pnpm" \
  json "$ROOT/package.json" '/^pnpm@\d+\.\d+\.\d+$/.test(j.packageManager)'
assert "engines.node exige >= 22" json "$ROOT/package.json" 'j.engines && j.engines.node === ">=22"'
for task in check test lint typecheck dev test:e2e; do
  assert "script raíz '$task' delega en scripts/check.sh $task" \
    json "$ROOT/package.json" "j.scripts && j.scripts['$task'] === './scripts/check.sh $task'"
done
assert "pnpm-workspace.yaml incluye apps/*" grep -Eq "^[[:space:]]*-[[:space:]]*['\"]?apps/\*['\"]?[[:space:]]*$" "$ROOT/pnpm-workspace.yaml"
assert "pnpm-workspace.yaml activa engineStrict (rechaza Node < 22)" grep -Eqx "engineStrict:[[:space:]]*true" "$ROOT/pnpm-workspace.yaml"
assert ".node-version fija Node 22" grep -Eqx "22(\.[0-9]+){0,2}" "$ROOT/.node-version"
assert ".editorconfig es raíz y usa LF + UTF-8" \
  sh -c "grep -qx 'root = true' '$ROOT/.editorconfig' && grep -qx 'end_of_line = lf' '$ROOT/.editorconfig' && grep -qx 'charset = utf-8' '$ROOT/.editorconfig'"
assert "README.md enlaza CLAUDE.md y specs" sh -c "grep -q 'CLAUDE.md' '$ROOT/README.md' && grep -q 'specs/' '$ROOT/README.md'"

secret_with_value="$(grep -E '^[A-Z0-9_]*(PASSWORD|TOKEN|SECRET)[A-Z0-9_]*=.+' "$ROOT/.env.example" || true)"
if [ -f "$ROOT/.env.example" ] && [ -z "$secret_with_value" ]; then
  report ok ".env.example no contiene valores en variables secretas"
else
  report fail ".env.example no contiene valores en variables secretas" "${secret_with_value:-falta .env.example}"
fi
url_with_credentials="$(grep -E '^[A-Z0-9_]+=.*://[^/@[:space:]]*:[^/@[:space:]]+@' "$ROOT/.env.example" || true)"
if [ -z "$url_with_credentials" ]; then
  report ok ".env.example no contiene credenciales incrustadas en URLs"
else
  report fail ".env.example no contiene credenciales incrustadas en URLs" "$url_with_credentials"
fi
undocumented="$(awk '/^[A-Z][A-Z0-9_]*=/ { if (previous !~ /^#/) print $0 } { previous = $0 }' "$ROOT/.env.example" | cut -d= -f1)"
if [ -z "$undocumented" ]; then
  report ok ".env.example documenta cada variable con un comentario encima"
else
  report fail ".env.example documenta cada variable con un comentario encima" "$undocumented"
fi
if (cd "$ROOT" && git check-ignore -q .env.example); then
  report fail ".env.example no está ignorado por git" "git check-ignore lo ignora"
else
  report ok ".env.example no está ignorado por git"
fi
assert ".env sí está ignorado por git" sh -c "cd '$ROOT' && git check-ignore -q .env"

# --------------------------------------------------------------------------------------------------
# 2. scripts/check.sh con stubs
# --------------------------------------------------------------------------------------------------

mkdir -p "$WORK/bin"
for tool in pnpm uv; do
  cat > "$WORK/bin/$tool" <<'STUB'
#!/usr/bin/env bash
# Stub: registra la invocación y falla si coincide con $STUB_FAIL.
invocation="$(basename "$0") $*"
echo "$invocation" >> "$STUB_LOG"
if [ -n "${STUB_SLEEP:-}" ] && [[ "$invocation" =~ $STUB_SLEEP ]]; then
  echo "$" >> "$STUB_PIDS"
  exec sleep 30
fi
if [ -n "${STUB_FAIL:-}" ] && [[ "$invocation" == *"$STUB_FAIL"* ]]; then exit 1; fi
exit 0
STUB
  chmod +x "$WORK/bin/$tool"
done

# make_root <con web: yes|no> <con solver: yes|no> <adr test: pass|fail>
make_root() {
  rm -rf "$WORK/root" && mkdir -p "$WORK/root/scripts/tests"
  if [ "$1" = yes ]; then mkdir -p "$WORK/root/apps/web" && echo '{}' > "$WORK/root/apps/web/package.json"; fi
  if [ "$2" = yes ]; then mkdir -p "$WORK/root/services/solver" && : > "$WORK/root/services/solver/pyproject.toml"; fi
  printf '#!/usr/bin/env bash\necho "adr-test" >> "$STUB_LOG"\nexit %s\n' "$([ "$3" = pass ] && echo 0 || echo 1)" \
    > "$WORK/root/scripts/tests/check-adrs.test.sh"
  chmod +x "$WORK/root/scripts/tests/check-adrs.test.sh"
  printf '#!/usr/bin/env bash\necho "workspace-test" >> "$STUB_LOG"\n' > "$WORK/root/scripts/tests/workspace.test.sh"
  chmod +x "$WORK/root/scripts/tests/workspace.test.sh"
  : > "$WORK/log"
}

# run_check <tarea> [VAR=valor ...]: ejecuta check.sh y deja la salida en $OUT y el código en $CODE.
run_check() {
  local task="$1"; shift
  OUT="$(env PATH="$WORK/bin:$PATH" STUB_LOG="$WORK/log" CHECK_ROOT="$WORK/root" "$@" "$CHECK" "$task" 2>&1)"
  CODE=$?
}

logged() { grep -qxF "$1" "$WORK/log"; }

expect() { # expect <descripción> <condición bash>
  if eval "$2"; then report ok "$1"; else report fail "$1" "exit=$CODE
$OUT
--- invocaciones:
$(cat "$WORK/log")"; fi
}

make_root yes yes pass; run_check check
expect "check: todo en verde termina con código 0" '[ "$CODE" -eq 0 ]'
expect "check: delega lint y typecheck en la web" \
  'logged "pnpm --filter web run lint" && logged "pnpm --filter web run typecheck"'
expect "check: delega ruff y mypy en el solver" \
  'logged "uv run --directory services/solver ruff check ." && logged "uv run --directory services/solver ruff format --check ." && logged "uv run --directory services/solver mypy --strict src"'
expect "check: ejecuta los tests del verificador de ADR" 'logged "adr-test"'
expect "check: ejecuta los tests de la raíz del monorepo" 'logged "workspace-test"'

make_root yes yes pass; run_check check STUB_FAIL="pnpm --filter web run lint"
expect "check: si falla la web, el código es != 0" '[ "$CODE" -ne 0 ]'
expect "check: si falla la web, se ejecutan igualmente los pasos del solver" \
  'logged "uv run --directory services/solver mypy --strict src"'
expect "check: el resumen nombra el paso fallido" 'echo "$OUT" | grep -q "FALLO.*web: lint"'

make_root yes yes pass; run_check check STUB_FAIL="mypy"
expect "check: si falla el solver, el código es != 0" '[ "$CODE" -ne 0 ]'

make_root yes yes fail; run_check check
expect "check: si fallan los tests de ADR, el código es != 0" '[ "$CODE" -ne 0 ]'

make_root no no pass; run_check check
expect "check: componentes ausentes se omiten y el código es 0" '[ "$CODE" -eq 0 ] && echo "$OUT" | grep -q "OMITIDO"'
expect "check: no invoca herramientas de componentes ausentes" '! grep -qE "^(pnpm|uv) " "$WORK/log"'

make_root no yes pass; run_check check CHECK_REQUIRE_ALL=1
expect "check: con CHECK_REQUIRE_ALL=1, un componente ausente es un fallo" \
  '[ "$CODE" -ne 0 ] && echo "$OUT" | grep -q "apps/web"'

make_root yes yes pass; run_check lint
expect "lint: delega en ambos lados y no ejecuta typecheck" \
  '[ "$CODE" -eq 0 ] && logged "pnpm --filter web run lint" && logged "uv run --directory services/solver ruff check ." && ! logged "pnpm --filter web run typecheck"'

make_root yes yes pass; run_check typecheck
expect "typecheck: delega en ambos lados" \
  '[ "$CODE" -eq 0 ] && logged "pnpm --filter web run typecheck" && logged "uv run --directory services/solver mypy --strict src"'

make_root yes yes pass; run_check test
expect "test: delega en ambos lados" \
  '[ "$CODE" -eq 0 ] && logged "pnpm --filter web run test" && logged "uv run --directory services/solver pytest"'

make_root yes yes pass; run_check test:e2e
expect "test:e2e: solo delega en la web" \
  '[ "$CODE" -eq 0 ] && logged "pnpm --filter web run test:e2e" && ! grep -q "^uv " "$WORK/log"'

make_root yes yes pass; run_check dev
expect "dev: arranca la web y el solver en 127.0.0.1:8000" \
  '[ "$CODE" -eq 0 ] && logged "pnpm --filter web run dev" && logged "uv run --directory services/solver uvicorn solver.api.app:create_app --factory --reload --host 127.0.0.1 --port 8000"'

make_root yes yes pass; run_check dev STUB_FAIL="uvicorn"
expect "dev: si un proceso termina con error, el código es != 0" '[ "$CODE" -ne 0 ]'

# dev se detiene junto con sus dos procesos al recibir SIGTERM (equivalente no interactivo de Ctrl-C:
# bash ignora SIGINT en procesos en segundo plano de shells no interactivas).
make_root yes yes pass
: > "$WORK/pids"
env PATH="$WORK/bin:$PATH" STUB_LOG="$WORK/log" STUB_PIDS="$WORK/pids" STUB_SLEEP="run dev|uvicorn" \
  CHECK_ROOT="$WORK/root" "$CHECK" dev > "$WORK/dev.out" 2>&1 &
dev_pid=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do [ "$(wc -l < "$WORK/pids")" -ge 2 ] && break; sleep 0.3; done
kill -TERM "$dev_pid"
waited=0
while kill -0 "$dev_pid" 2>/dev/null && [ "$waited" -lt 20 ]; do sleep 0.25; waited=$((waited + 1)); done
if kill -0 "$dev_pid" 2>/dev/null; then kill -KILL "$dev_pid"; CODE=999; else wait "$dev_pid"; CODE=$?; fi
OUT="$(cat "$WORK/dev.out")"
survivors=""
while read -r pid; do if kill -0 "$pid" 2>/dev/null; then survivors="$survivors $pid"; kill -KILL "$pid"; fi; done < "$WORK/pids"
expect "dev: al interrumpirse detiene la web y el solver y termina con 130" \
  '[ "$CODE" -eq 130 ] && [ "$(wc -l < "$WORK/pids")" -eq 2 ] && [ -z "$survivors" ]'
expect "dev: una interrupción no se informa como fallo" '! echo "$OUT" | grep -q "FALLO"'

make_root yes yes pass; run_check desconocida
expect "una tarea desconocida termina con código 2 y muestra el uso" \
  '[ "$CODE" -eq 2 ] && echo "$OUT" | grep -q "Uso:"'

echo "workspace.test: $passed ok, $failed fallo(s)."
[ "$failed" -eq 0 ]
