# 03 — Plan de tareas

> **Estado:** Borrador · **Versión:** 0.1 · **Última actualización:** 2026-11-22

Este documento divide en **6 hitos incrementales** y **tareas atómicas** la implementación de
[`01-domain-spec.md`](01-domain-spec.md) (v0.2) siguiendo el diseño de
[`02-architecture-plan.md`](02-architecture-plan.md). Las referencias entre corchetes (`[RD-02]`,
`[02 §4.3]`) apuntan a los requisitos o secciones que implementa cada tarea.

---

## 0. Reglas de ejecución

### 0.1 Ciclo de cada tarea
1. Leer las referencias de la tarea en las specs 01 y 02. Si algo no cuadra, **se corrige primero la spec**.
2. Escribir los tests de los criterios de aceptación (rojo).
3. Implementar lo mínimo para que pasen (verde) y refactorizar.
4. Ejecutar el **comando de test** de la tarea **y** la puerta global `pnpm check`.
5. Hacer un commit por tarea: `tipo(ámbito): Tn.m <resumen>` (Conventional Commits).
6. Marcar la tarea como hecha en la lista del hito.

### 0.2 Definición de “hecho”
Se aplica la sección 4.3 de `CLAUDE.md`. Además:
- Los criterios de aceptación están cubiertos por tests que **citan el ID** del requisito en su nombre o descripción.
- No hay lógica de negocio fuera de `domain/` y `application/` (web) ni fuera de `domain/`, `prevalidation/`,
  `model/`, `search/` y `verification/` (solver).
- Las dependencias nuevas están registradas en un ADR **antes** de instalarse.

### 0.3 Comandos estándar

Los crea T1.2, T1.3 y T1.5. Cada tarea cita el suyo.

| Alias | Comando | Requisitos |
|-------|---------|------------|
| Puerta global | `pnpm check` | Lint + tipos de web (`eslint`, `tsc --noEmit`) y del solver (`ruff check`, `ruff format --check`, `mypy --strict`) |
| Web unit | `pnpm --filter web exec vitest run --project unit <ruta>` | — |
| Web integración | `pnpm --filter web exec vitest run --project integration <ruta>` | `docker compose up -d db` (BD `fsja_test`, reiniciada por la configuración global de Vitest) |
| Web E2E | `pnpm --filter web exec playwright test <spec>` | `docker compose up -d --wait` |
| Solver | `uv run --directory services/solver pytest <ruta>` | — |
| Solver cobertura | `uv run --directory services/solver pytest --cov=solver --cov-report=term-missing` | — |

### 0.4 Dependencias entre hitos

```
H1 ──▶ H3 ──▶ H4 ──▶ H5 ──▶ H6
 └───▶ H2 ─────┘
```

H2 (solver) solo depende del andamiaje de H1 (T1.2 y T1.5), así que se puede desarrollar en paralelo con
el resto de H1 y con H3.

---

## Hito 1 — Andamiaje, infraestructura, autenticación y RBAC

**Objetivo:** el monorepo arranca con `docker compose up`, un usuario inicia sesión de forma segura y el
acceso queda controlado por rol en el servidor. CI ejecuta todo.

- [x] T1.1 ADR de base
- [ ] T1.2 Raíz del monorepo
- [ ] T1.3 Andamiaje de `apps/web`
- [ ] T1.4 Variables de entorno validadas
- [ ] T1.5 Andamiaje de `services/solver`
- [ ] T1.6 Dockerfiles y Docker Compose
- [ ] T1.7 Prisma: identidad y curso
- [ ] T1.8 Política de acceso (RBAC)
- [ ] T1.9 Hash de contraseñas Argon2id
- [ ] T1.10 Almacén de sesiones
- [ ] T1.11 Rate limiter en PostgreSQL
- [ ] T1.12 Casos de uso de login y logout
- [ ] T1.13 Guardas de servidor y CSRF
- [ ] T1.14 Middleware y cabeceras de seguridad
- [ ] T1.15 Tokens de diseño, layout y login
- [ ] T1.16 Seed mínimo de usuarios
- [ ] T1.17 E2E de autenticación y RBAC
- [ ] T1.18 Integración continua

#### T1.1 — ADR de base
- **Archivos:** `docs/adr/README.md` (índice), `docs/adr/0000-plantilla.md`, `docs/adr/0001-prisma-web-duena-esquema.md`,
  `0002-sesiones-opacas-en-bd.md`, `0008-rate-limiting-postgresql.md`, `0009-csp-style-unsafe-inline.md`,
  `0010-registro-dependencias.md`, `scripts/check-adrs.sh` (verificador de estos criterios, reutilizable en CI).
- **Criterios de aceptación:**
  - Cada ADR tiene las secciones Estado, Contexto, Decisión, Alternativas consideradas y Consecuencias.
  - El estado de cada ADR redactado es `Propuesto`, `Aceptado`, `Rechazado`, `Sustituido` u `Obsoleto`.
  - ADR-0010 registra las dependencias de H1: pnpm, uv, Next.js, Tailwind, shadcn/ui, TanStack Query, Zod,
    Prisma, `@node-rs/argon2`, Vitest, Testing Library, Playwright, FastAPI, Pydantic, OR-Tools, pytest,
    pytest-cov, ruff, mypy. Los hitos posteriores **lo amplían**.
  - El índice enlaza todos los ADR y marca como “Pendiente” los de la sección 7 de la spec 02 que aún no
    estén redactados.
- **Refs:** [02 §7]
- **Test:** `./scripts/check-adrs.sh` (comprueba todos los criterios anteriores; termina con código ≠ 0
  si falla alguno).

#### T1.2 — Raíz del monorepo
- **Archivos:** `package.json`, `pnpm-workspace.yaml`, `.node-version` (22 LTS), `.editorconfig`,
  `.env.example` (esqueleto), `README.md` (esqueleto), `scripts/check.sh`.
- **Criterios de aceptación:**
  - `pnpm install` en limpio funciona y genera `pnpm-lock.yaml`.
  - Los scripts raíz `check`, `test`, `lint`, `typecheck`, `dev` y `test:e2e` delegan en `apps/web` y en
    `services/solver`.
  - `pnpm check` termina con código ≠ 0 si cualquiera de los dos lados falla.
- **Refs:** [02 §1.1]
- **Test:** `pnpm install --frozen-lockfile && pnpm check`

#### T1.3 — Andamiaje de `apps/web`
- **Archivos:**
  - `apps/web/{package.json, tsconfig.json, next.config.ts, postcss.config.mjs, components.json, eslint.config.mjs, vitest.config.ts}`.
  - `src/app/{layout.tsx, page.tsx, globals.css}`.
  - Carpetas `src/{domain,application,infrastructure,ui,lib}` con `README.md` que explica la capa.
  - `src/lib/container.ts` (composition root vacío).
  - `eslint-rules.test.ts` y fixtures de reglas en `apps/web/test/lint-fixtures/`.
- **Criterios de aceptación:**
  - `tsconfig` con `strict`, `noUncheckedIndexedAccess` y `noImplicitOverride`.
  - ESLint:
    - Hace cumplir las dependencias entre capas [02 §1.2] mediante `no-restricted-imports`.
    - Prohíbe `dangerouslySetInnerHTML`, `$queryRawUnsafe` y `any` explícito.
  - Un test ejecuta ESLint sobre los fixtures y comprueba que **fallan** los casos que deben fallar:
    `domain` importando `@prisma/client` y `ui` importando `infrastructure`.
  - Vitest con dos proyectos, `unit` (jsdom) e `integration` (node).
- **Refs:** [CLAUDE.md §1.2, §2], [02 §1.2]
- **Test:** `pnpm --filter web exec vitest run --project unit && pnpm --filter web lint && pnpm --filter web typecheck`

#### T1.4 — Variables de entorno validadas
- **Archivos:** `apps/web/src/lib/env.ts`, `apps/web/src/lib/env.test.ts`, `.env.example` (completo).
- **Criterios de aceptación:**
  - Esquema Zod con todas las variables web de [02 §5.7].
  - Si falta una variable o es inválida, se lanza un error que **nombra** la variable sin mostrar su valor.
  - `SOLVER_SERVICE_TOKEN` exige ≥ 32 caracteres.
  - `SEED_ON_START=true` con `APP_ENV=production` hace fallar la validación.
  - `.env.example` documenta propósito y formato de cada variable, sin valores reales.
- **Refs:** [CLAUDE.md §3.5], [02 §5.7], [TFM-02]
- **Test:** `pnpm --filter web exec vitest run --project unit src/lib/env.test.ts`

#### T1.5 — Andamiaje de `services/solver`
- **Archivos:**
  - `services/solver/pyproject.toml`, `uv.lock`.
  - `src/solver/__init__.py`, `src/solver/api/{app.py, routes.py, auth.py}`, `src/solver/settings.py`.
  - `tests/integration/test_health_and_auth.py`.
- **Criterios de aceptación:**
  - Python ≥ 3.12, `mypy --strict` y `ruff` (reglas `E,F,I,B,UP,S,ANN`) sin errores.
  - `GET /health` devuelve `200 {status, version}` sin token.
  - Cualquier otra ruta sin token, o con token incorrecto, devuelve `401`. La comparación usa
    `hmac.compare_digest`.
  - Un cuerpo de más de 5 MB devuelve `413`.
  - `settings.py` valida las variables con Pydantic Settings.
- **Refs:** [02 §1.3, §3.2, §5.7]
- **Test:** `uv run --directory services/solver pytest tests/integration/test_health_and_auth.py`

#### T1.6 — Dockerfiles y Docker Compose
- **Archivos:** `apps/web/Dockerfile`, `services/solver/Dockerfile`, `docker-compose.yml`,
  `.dockerignore` (en los dos servicios), `scripts/compose-smoke.sh`.
- **Criterios de aceptación:**
  - Imágenes multi-stage con usuario no root.
  - El solver tiene `read_only`, `tmpfs /tmp`, `cap_drop: [ALL]`, `no-new-privileges` y límites de CPU y memoria.
  - Las redes `backend` y `solver_net` son `internal: true`. El solver **no** está en `backend` y no
    publica puertos.
  - `db` tiene healthcheck `pg_isready`. `web` y `solver` tienen healthcheck HTTP.
  - `compose-smoke.sh` comprueba:
    1. Todos los servicios terminan en estado *healthy*.
    2. `curl localhost:8000` falla desde el host.
    3. Desde el contenedor `solver`, `db:5432` no resuelve.
    4. Desde `web`, `solver:8000/health` responde 200.
- **Refs:** [02 §1.4, §5.7]
- **Test:** `docker compose up -d --build --wait && ./scripts/compose-smoke.sh`

#### T1.7 — Prisma: identidad y curso
- **Archivos:**
  - `apps/web/prisma/schema.prisma` (`app_user`, `user_session`, `rate_limit_bucket`, `audit_log`,
    `school`, `academic_year`).
  - `prisma/migrations/0001_init/` (más el SQL de las extensiones `citext` y `btree_gist`).
  - `src/infrastructure/db/prisma-client.ts`.
  - `apps/web/test/integration/global-setup.ts` (reinicia `fsja_test`).
  - `src/infrastructure/db/schema.int.test.ts`.
- **Criterios de aceptación:**
  - `prisma migrate deploy` se aplica sobre una BD vacía.
  - `prisma migrate diff --from-migrations --to-schema-datamodel` no muestra deriva.
  - El índice único parcial impide dos `academic_year.is_current` en el mismo centro (test de integración).
  - `email` no distingue mayúsculas (`citext`): `Ana@x.es` y `ana@x.es` chocan.
- **Refs:** [02 §2.1–2.3]
- **Test:** `pnpm --filter web exec vitest run --project integration src/infrastructure/db/schema.int.test.ts`

#### T1.8 — Política de acceso (RBAC)
- **Archivos:** `src/domain/access/{role.ts, permission.ts, access-policy.ts, access-policy.test.ts}`.
- **Criterios de aceptación:**
  - Un test por tabla recorre la matriz **completa** [02 §5.3] para los 3 roles y todos los permisos.
  - Un permiso o rol no listado devuelve `false` (denegación por defecto).
  - Los permisos `:own` exigen que el recurso sea del usuario. Para P-04 se aceptan los grupos a los que
    da clase.
- **Refs:** [01 §9], [02 §5.3], [CLAUDE.md §3.2]
- **Test:** `pnpm --filter web exec vitest run --project unit src/domain/access`

#### T1.9 — Hash de contraseñas Argon2id
- **Archivos:** `src/application/ports/password-hasher.ts`,
  `src/infrastructure/auth/{argon2-hasher.ts, argon2-hasher.test.ts}`.
- **Criterios de aceptación:**
  - Parámetros `m = 19456 KiB`, `t = 2`, `p = 1`.
  - `verify` devuelve `true` o `false` y nunca lanza con hashes mal formados.
  - `needsRehash` es `true` con un hash generado con parámetros inferiores.
- **Refs:** [02 §5.2]
- **Test:** `pnpm --filter web exec vitest run --project unit src/infrastructure/auth/argon2-hasher.test.ts`

#### T1.10 — Almacén de sesiones
- **Archivos:** `src/application/ports/session-store.ts`,
  `src/infrastructure/auth/{pg-session-store.ts, cookies.ts, pg-session-store.int.test.ts}`.
- **Criterios de aceptación:**
  - El token tiene 32 bytes aleatorios y en BD **solo** se guarda su SHA-256 (el test busca el token en
    claro en la tabla y no lo encuentra).
  - Caducidad absoluta de 8 h y por inactividad de 30 min. La renovación deslizante se hace como máximo
    cada 5 min.
  - `revokeAllForUser` invalida todas las sesiones del usuario.
  - `purgeExpired` borra las sesiones caducadas (absoluta o por inactividad). Se invoca de forma
    oportunista en cada login correcto (ADR-0002).
  - Cookie `__Host-fsja_session` con `HttpOnly`, `Secure`, `SameSite=Lax` y `Path=/`, sin `Domain`.
- **Refs:** [02 §5.2]
- **Test:** `pnpm --filter web exec vitest run --project integration src/infrastructure/auth/pg-session-store.int.test.ts`

#### T1.11 — Rate limiter en PostgreSQL
- **Archivos:** `src/application/ports/rate-limiter.ts`,
  `src/infrastructure/security/{pg-rate-limiter.ts, pg-rate-limiter.int.test.ts}`.
- **Criterios de aceptación:**
  - Con un límite de 5 por ventana, la 6.ª petición se rechaza e informa de `retryAfterSeconds`.
  - En la ventana siguiente se vuelve a permitir.
  - 20 incrementos concurrentes dejan el contador en exactamente 20 (atomicidad).
- **Refs:** [02 §5.6]
- **Test:** `pnpm --filter web exec vitest run --project integration src/infrastructure/security/pg-rate-limiter.int.test.ts`

#### T1.12 — Casos de uso de login y logout
- **Archivos:** `src/application/auth/{login.ts, logout.ts, login.test.ts, logout.test.ts}`,
  `src/application/ports/{user-repository.ts, audit-log.ts, clock.ts}`,
  `src/infrastructure/db/repositories/user-repository.ts`.
- **Criterios de aceptación:**
  - Siguen los pasos 2 a 10 de [02 §5.2], probados con *fakes* de los puertos.
  - Con un usuario inexistente se llama igualmente a `verify` (con hash ficticio), y la respuesta es
    idéntica a la de una contraseña incorrecta.
  - Tras 10 fallos se bloquea el usuario 15 min, con el mismo mensaje genérico.
  - Un hash obsoleto se rehashea tras un login correcto.
  - Los logins correctos y fallidos se registran en `audit_log`, nunca con la contraseña.
- **Refs:** [02 §5.2], [CLAUDE.md §3.1]
- **Test:** `pnpm --filter web exec vitest run --project unit src/application/auth`

#### T1.13 — Guardas de servidor y CSRF
- **Archivos:** `src/infrastructure/auth/guards.ts` (`requireSession`, `withPermission`),
  `src/infrastructure/security/origin-check.ts`, `guards.test.ts`, `origin-check.test.ts`,
  `apps/web/test/permission-coverage.test.ts`.
- **Criterios de aceptación:**
  - `withPermission` devuelve `401` sin sesión y `403` sin permiso, y si no ejecuta el handler.
  - `origin-check` rechaza las mutaciones con `Origin` ausente o distinto de `APP_ORIGIN`.
  - `permission-coverage.test.ts` analiza todos los `actions.ts` y `route.ts` y falla si alguna
    exportación no está envuelta en `withPermission`. Hay una lista blanca explícita solo para login.
- **Refs:** [02 §5.3, §5.6]
- **Test:** `pnpm --filter web exec vitest run --project unit src/infrastructure test/permission-coverage.test.ts`

#### T1.14 — Middleware y cabeceras de seguridad
- **Archivos:** `src/middleware.ts`, `src/infrastructure/security/{csp.ts, security-headers.ts, security-headers.test.ts}`.
- **Criterios de aceptación:**
  - Cada respuesta lleva una CSP con un **nonce distinto por petición** y las cabeceras de [02 §5.5].
  - HSTS solo se envía con `APP_ENV=production`.
  - Las rutas de `(app)` sin cookie redirigen a `/login?next=…`. `next` solo acepta rutas relativas, para
    evitar redirecciones abiertas.
- **Refs:** [02 §5.3, §5.5]
- **Test:** `pnpm --filter web exec vitest run --project unit src/infrastructure/security`

#### T1.15 — Tokens de diseño, layout y login
- **Archivos:**
  - `src/app/globals.css` (tokens de [02 §6.2], claro y oscuro).
  - `src/ui/layout/{app-sidebar.tsx, topbar.tsx, theme-toggle.tsx, demo-banner.tsx}` con sus tests.
  - `src/app/(public)/login/{page.tsx, actions.ts}`, `src/app/(app)/layout.tsx`,
    `src/app/api/auth/logout/route.ts`, fuente Inter autoalojada.
- **Criterios de aceptación:**
  - El sidebar se filtra por permisos: `DOCENTE` ve solo Inicio, Mi horario, Mis preferencias y Exportar.
  - El tema respeta `prefers-color-scheme`, se puede forzar y se guarda en cookie, sin parpadeo en SSR.
  - El banner de demo aparece solo con `INVITADO_DEMO`.
  - El formulario de login muestra errores de validación accesibles (`aria-describedby`).
  - Los tokens de texto sobre fondo cumplen contraste ≥ 4.5:1. El test calcula el contraste de los pares
    de tokens.
- **Refs:** [02 §6.2, §6.3], [TFM-03]
- **Test:** `pnpm --filter web exec vitest run --project unit src/ui/layout src/app`

#### T1.16 — Seed mínimo de usuarios
- **Archivos:** `apps/web/prisma/seed/{index.ts, production-guard.ts, users.ts}`, `seed.int.test.ts`.
- **Criterios de aceptación:**
  - Con `APP_ENV=production`, el seed termina con un código distinto de 0 sin tocar la BD.
  - Crea los 3 usuarios con las credenciales de las variables `SEED_*`.
  - Es idempotente: ejecutarlo dos veces no duplica nada.
- **Refs:** [TFM-01], [TFM-02]
- **Test:** `pnpm --filter web exec vitest run --project integration prisma/seed`

#### T1.17 — E2E de autenticación y RBAC
- **Archivos:** `apps/web/playwright.config.ts`, `apps/web/e2e/{auth.spec.ts, rbac.spec.ts, fixtures/users.ts}`.
- **Criterios de aceptación:**
  - Login correcto redirige a `/`. Un login incorrecto muestra el mensaje genérico.
  - El 6.º intento en 15 min devuelve 429.
  - Tras el logout, volver a `/` redirige a `/login`.
  - `DOCENTE` en `/administracion/usuarios` recibe 403 o la página de acceso denegado.
  - `INVITADO_DEMO` no puede ejecutar una Server Action de escritura (403).
  - Las respuestas incluyen la CSP y `X-Frame-Options: DENY`.
- **Refs:** [02 §5], [TFM-03]
- **Test:** `pnpm --filter web exec playwright test e2e/auth.spec.ts e2e/rbac.spec.ts`

#### T1.18 — Integración continua
- **Archivos:** `.github/workflows/ci.yml`.
- **Criterios de aceptación:**
  - Trabajos: `check` (incluye `./scripts/check-adrs.sh`), `web-unit`, `web-integration` (servicio postgres:16), `solver-tests` (con
    cobertura), `docker-build`, `e2e` (compose completo y artefacto del informe de Playwright).
  - Usa caché de pnpm y uv.
  - Un fallo en cualquier trabajo bloquea el merge.
- **Refs:** [CLAUDE.md §4]
- **Test:** el workflow termina en verde en un PR de prueba (`gh run watch`).

---

## Hito 2 — Motor de optimización (`services/solver`)

**Objetivo:** el solver resuelve con CP-SAT cualquier `SolverInput` v1 válido, implementa las Fases A, B y C,
diagnostica la infactibilidad y verifica sus soluciones con un comprobador independiente. Cobertura
≥ 90 % en `prevalidation/`, `model/`, `search/diagnostics.py` y `verification/`.

- [ ] T2.1 ADR del motor
- [ ] T2.2 Contrato Pydantic v1 y JSON Schema
- [ ] T2.3 Constructores de fixtures de test
- [ ] T2.4 Normalización y arranques candidatos
- [ ] T2.5 Puntos de control y conflictos de grupos
- [ ] T2.6 Pre-validación PV-01 a PV-04
- [ ] T2.7 Pre-validación PV-05 a PV-12 y runner
- [ ] T2.8 Endpoint `/v1/validate`
- [ ] T2.9 Comprobador independiente
- [ ] T2.10 Constructor del modelo: colocación, tramos, prohibidos, prefijadas y aulas
- [ ] T2.11 No solapamiento de profesor y aula entre marcos
- [ ] T2.12 Grupos, subgrupos, bloques y optativas
- [ ] T2.13 Guardias, reuniones, reducciones y cargas
- [ ] T2.14 Distribución obligatoria y profesores equivalentes
- [ ] T2.15 Ponderables RB-01 y RB-02 (huecos)
- [ ] T2.16 Ponderables RB-03 a RB-06 y objetivo
- [ ] T2.17 Métricas y puntuación normalizada
- [ ] T2.18 Búsqueda multi-solución
- [ ] T2.19 Diagnóstico de infactibilidad
- [ ] T2.20 Trabajos asíncronos y `/v1/check`
- [ ] T2.21 Puerta de cobertura y regresión aleatoria

#### T2.1 — ADR del motor
- **Archivos:** `docs/adr/0003-fase-a-en-solver.md`, `0005-modelo-sin-indice-de-sesion-y-puntos-de-control.md`,
  `0006-multisolucion-secuencial-con-diversidad.md`. Se amplía `0010` con `hypothesis` (dev).
- **Criterios de aceptación:** misma estructura que T1.1. ADR-0005 incluye el argumento de corrección de
  los puntos de control (propiedad de Helly).
- **Refs:** [02 §4.2, §4.3, §4.7, §7]
- **Test:** `./scripts/check-adrs.sh` (con los nuevos ADR ya no marcados como “Pendiente” en el índice)

#### T2.2 — Contrato Pydantic v1 y JSON Schema
- **Archivos:** `src/solver/contract/{input.py, output.py, validators.py, export_schema.py}`,
  `services/solver/schemas/{solver-input.v1.json, solver-output.v1.json}`,
  `tests/contract/{test_input_validation.py, test_schema_in_sync.py}`.
- **Criterios de aceptación:**
  - Los modelos usan `extra="forbid"`, `strict=True` y `frozen=True`.
  - Un campo desconocido provoca un error.
  - Cada una de las 6 validaciones de [02 §3.3] tiene un caso inválido que falla con `path` y `code`, y un
    caso válido que pasa.
  - Las violaciones de INV-01, INV-02, INV-04 e INV-05 se rechazan.
  - `test_schema_in_sync.py` regenera el esquema en memoria y lo compara con `schemas/*.json`.
- **Refs:** [02 §3.1, §3.3, §3.4], [RG-05]
- **Test:** `uv run --directory services/solver pytest tests/contract`

#### T2.3 — Constructores de fixtures de test
- **Archivos:** `tests/fixtures/builders.py`, `tests/fixtures/shared/README.md`, `tests/unit/test_builders.py`.
- **Criterios de aceptación:**
  - API fluida para construir un `SolverInput` válido en pocas líneas, por ejemplo
    `frame("ESO", unit=60).day(1, "08:00", ["1","1","R30","1","1/2","1/2"])` o `activity(...)`.
  - Todo lo que construyen pasa la validación del contrato.
  - Incluye un preajuste `two_overlapping_frames()` (Infantil/Primaria 09:00–14:00 y ESO/Bach 08:00–14:30)
    que se reutiliza en H2.
- **Refs:** [02 §1.3]
- **Test:** `uv run --directory services/solver pytest tests/unit/test_builders.py`

#### T2.4 — Normalización y arranques candidatos
- **Archivos:** `src/solver/domain/{problem.py, spans.py}`, `tests/unit/domain/{test_problem.py, test_spans.py}`.
- **Criterios de aceptación:**
  - `problem.py` traduce los identificadores a índices enteros, de forma determinista.
  - `Start(a)` y `Span(a,t)` cumplen MH-04:
    - [MH-04-CA-01]: los tramos `1 + 1/2 + 1/2` admiten una sesión de 2; una de 1,5 ocupa `1 + 1/2` y no
      cabe en un único tramo de 1.
    - [MH-04-CA-02]: una sesión de 2 no empieza justo antes del recreo.
  - Se cubren las duraciones `1/2`, `3/4`, `1`, `1.5`, `2` y `3`.
  - La poda de [02 §4.1] elimina arranques con `FORBIDDEN` de entidades fijas.
- **Refs:** [MH-03], [MH-04], [MH-06], [RD-05], [RD-06]
- **Test:** `uv run --directory services/solver pytest tests/unit/domain/test_spans.py tests/unit/domain/test_problem.py`

#### T2.5 — Puntos de control y conflictos de grupos
- **Archivos:** `src/solver/domain/{overlap.py, conflict_groups.py}`,
  `tests/unit/domain/{test_overlap.py, test_conflict_groups.py}`.
- **Criterios de aceptación:**
  - [MH-02-CA-01]: 09:00–10:00 y 09:30–10:30 se solapan. [MH-02-CA-02]: 09:00–10:00 y 10:00–11:00 no.
  - Test de propiedad (`hypothesis`): para intervalos aleatorios, “se solapan” equivale a “comparten
    algún punto de control”.
  - Los conflictos de grupos cumplen [ENT-05-CA-01], [ENT-05-CA-02] y [ENT-05-CA-03], y el caso de
    subgrupos de particiones distintas **sin** referencia común, que no chocan.
- **Refs:** [MH-02], [ENT-05], [02 §4.3]
- **Test:** `uv run --directory services/solver pytest tests/unit/domain/test_overlap.py tests/unit/domain/test_conflict_groups.py`

#### T2.6 — Pre-validación PV-01 a PV-04
- **Archivos:** `src/solver/prevalidation/{pv01_group_hours.py, pv02_teacher_hours.py, pv03_room_hours.py, pv04_fixed_positions.py}`,
  `tests/unit/prevalidation/test_pv01..04.py`.
- **Criterios de aceptación:**
  - [PV-CA-01]: un grupo con 30 celdas y 32 h genera PV-01 `ERROR` con `required = 32` y `available = 30`.
  - PV-01 tiene en cuenta las particiones (carga común más el máximo de cada partición).
  - PV-03 evalúa aulas `FIJA` y pools.
  - PV-04 detecta los 5 subcasos (prohibido, no lectivo, cruza recreo, duración no encaja y solapamiento
    entre prefijadas), **incluido entre marcos**.
- **Refs:** [PV-01..PV-04]
- **Test:** `uv run --directory services/solver pytest tests/unit/prevalidation -k "pv01 or pv02 or pv03 or pv04"`

#### T2.7 — Pre-validación PV-05 a PV-12 y runner
- **Archivos:** `src/solver/prevalidation/{pv05_duty_quotas.py … pv12_broken_refs.py, runner.py}`,
  `tests/unit/prevalidation/test_pv05..12.py`, `test_runner.py`.
- **Criterios de aceptación:**
  - Cada regla tiene un caso positivo y uno negativo.
  - PV-05 cubre los tres subcasos (suma > máximo, suma < mínimo y cupo > celdas libres).
  - PV-09 y PV-11 son `WARNING`. Las demás son `ERROR`.
  - [PV-CA-02]: unos datos sin errores dan cero `ERROR`.
  - El runner devuelve los hallazgos ordenados por severidad y código, de forma determinista.
- **Refs:** [PV-05..PV-12]
- **Test:** `uv run --directory services/solver pytest tests/unit/prevalidation`

#### T2.8 — Endpoint `/v1/validate`
- **Archivos:** `src/solver/api/routes.py`, `tests/integration/test_validate_endpoint.py`.
- **Criterios de aceptación:**
  - Una entrada válida devuelve `200 PrevalidationReport`.
  - Una entrada inválida devuelve `422 { errors: [{path, code, message}] }`.
  - Sin token devuelve `401`.
  - La respuesta no contiene nada que no estuviera en la entrada (RG-05).
- **Refs:** [02 §3.2], [RG-05]
- **Test:** `uv run --directory services/solver pytest tests/integration/test_validate_endpoint.py`

#### T2.9 — Comprobador independiente
- **Archivos:** `src/solver/verification/checker.py`, `tests/unit/verification/test_checker_rd01..rd14.py`.
- **Criterios de aceptación:**
  - Para cada RD-01 a RD-14: unas colocaciones válidas no producen violaciones, y una violación construida
    a mano se detecta con `code`, `entities` y `slotIds` correctos.
  - Los solapamientos entre marcos se detectan con los puntos de control.
  - No importa nada de `ortools`; un test lo comprueba revisando los imports del módulo.
- **Refs:** [RB-CA-02], [EDI-06], [02 §4.10]
- **Test:** `uv run --directory services/solver pytest tests/unit/verification`

#### T2.10 — Constructor del modelo: colocación, tramos, prohibidos, prefijadas y aulas
- **Archivos:** `src/solver/model/{builder.py, variables.py}`,
  `src/solver/model/hard/{rd01_all_placed.py, rd05_forbidden.py, rd06_non_teaching.py, rd07_fixed.py, rd11_room_choice.py}`,
  `tests/unit/hard/test_rd01_rd05_rd06_rd07_rd11.py`.
- **Criterios de aceptación:**
  - Para cada restricción: (a) una instancia factible se resuelve y la solución **pasa el comprobador**;
    (b) una instancia diseñada para incumplirla resulta `INFEASIBLE`.
  - [MH-06-CA-01] y [MH-06-CA-02].
  - [ENT-02-CA-01]: un pool elige un aula libre.
  - Una sesión de 1,5 tramos sobre tramos fraccionados se coloca correctamente.
- **Refs:** [RD-01], [RD-05], [RD-06], [RD-07], [RD-11], [02 §4.2, §4.4]
- **Test:** `uv run --directory services/solver pytest tests/unit/hard/test_rd01_rd05_rd06_rd07_rd11.py`

#### T2.11 — No solapamiento de profesor y aula entre marcos
- **Archivos:** `src/solver/model/hard/{rd02_teacher.py, rd04_room.py}`, `tests/unit/hard/test_rd02_rd04.py`.
- **Criterios de aceptación:**
  - Con `two_overlapping_frames()` y un profesor y un aula compartidos, ninguna solución tiene ocupaciones
    simultáneas en tiempo real.
  - Si se fuerzan (prefijadas en tramos solapados de marcos distintos), el resultado es `INFEASIBLE`.
  - Tramos contiguos de marcos distintos (`[09:00,10:00)` y `[10:00,11:00)`) **sí** se pueden encadenar.
- **Refs:** [RD-02], [RD-04], [MH-02]
- **Test:** `uv run --directory services/solver pytest tests/unit/hard/test_rd02_rd04.py`

#### T2.12 — Grupos, subgrupos, bloques y optativas
- **Archivos:** `src/solver/model/hard/{rd03_groups.py, rd08_simultaneity.py}`, `tests/unit/hard/test_rd03_rd08.py`.
- **Criterios de aceptación:**
  - [ENT-04-CA-01]: las tres optativas coinciden y los grupos participantes no tienen otra sesión.
  - Los bloques incompatibles nunca coinciden.
  - Un bloque cuenta una sola vez para cada grupo participante (no hay infactibilidad espuria).
  - [ENT-05-CA-01..03] se resuelven y se verifican.
- **Refs:** [RD-03], [RD-08], [ENT-04], [ENT-05]
- **Test:** `uv run --directory services/solver pytest tests/unit/hard/test_rd03_rd08.py`

#### T2.13 — Guardias, reuniones, reducciones y cargas
- **Archivos:** `src/solver/model/hard/{rd09_duties.py, rd10_meetings.py, reductions.py, rd12_loads.py}`,
  `tests/unit/hard/test_rd09_rd10_rd12.py`.
- **Criterios de aceptación:**
  - [NL-01-CA-01]: 6 guardias repartidas con un máximo de 2 por recreo; los cupos son exactos y se respeta el mínimo.
  - Las guardias de recreo se colocan en tramos `BREAK`.
  - [NL-02-CA-01]: reunión doble en dos tramos consecutivos de la ventana, con todos los participantes libres.
    Como máximo una ocurrencia al día.
  - Las reducciones `TEACHING` cuentan para la carga lectiva.
  - Superar `maxTeachingMinutesWeek` o `maxTeachingMinutesDay` da `INFEASIBLE`.
- **Refs:** [NL-01..NL-03], [RD-09], [RD-10], [RD-12]
- **Test:** `uv run --directory services/solver pytest tests/unit/hard/test_rd09_rd10_rd12.py`

#### T2.14 — Distribución obligatoria y profesores equivalentes
- **Archivos:** `src/solver/model/hard/{rd13_distribution.py, rd14_equivalent_teachers.py}`,
  `tests/unit/hard/test_rd13_rd14.py`.
- **Criterios de aceptación:**
  - Los tres modos de distribución con `mandatory = true` se cumplen en la solución.
  - [ENT-06-CA-01]: con P1 sin disponibilidad, se elige P2.
  - Con `sameTeacherAllSessions = true` todas las sesiones tienen el mismo profesor. Con `false`, se
    admiten profesores distintos.
- **Refs:** [RD-13], [RD-14], [ENT-06]
- **Test:** `uv run --directory services/solver pytest tests/unit/hard/test_rd13_rd14.py`

#### T2.15 — Ponderables RB-01 y RB-02 (huecos)
- **Archivos:** `src/solver/model/soft/{rb01_teacher_gaps.py, rb02_group_free_edges.py}`,
  `tests/unit/soft/test_rb01_rb02.py`.
- **Criterios de aceptación:**
  - [RB-CA-01]: en el mismo escenario, los huecos con peso 100 son ≤ que con peso 0.
  - En una instancia con óptimo conocido (0 huecos) el solver lo alcanza.
  - RB-01 se mide en minutos con segmentos elementales entre marcos: un hueco de 30 min en el marco
    Infantil/Primaria cuenta 30.
  - Con peso 0 no se crean variables auxiliares (el test lo comprueba con las estadísticas del modelo).
- **Refs:** [RB-01], [RB-02], [02 §4.5]
- **Test:** `uv run --directory services/solver pytest tests/unit/soft/test_rb01_rb02.py`

#### T2.16 — Ponderables RB-03 a RB-06 y objetivo
- **Archivos:** `src/solver/model/soft/{rb03_preferences.py, rb04_distribution.py, rb05_teacher_days.py, rb06_preferred_room.py, objective.py}`,
  `tests/unit/soft/test_rb03_rb06.py`, `tests/unit/soft/test_objective.py`.
- **Criterios de aceptación:**
  - Cada término reduce su penalización al aumentar su peso (el mismo patrón que RB-CA-01).
  - RB-04 coincide con la fórmula de 01 v0.2 en los tres modos (casos calculados a mano).
  - `softOptOut` excluye a la entidad de ese término.
  - El objetivo es `Σ W_i · Pen_i` con coeficientes enteros.
- **Refs:** [RB-03..RB-06], [RG-02], [02 §4.5]
- **Test:** `uv run --directory services/solver pytest tests/unit/soft`

#### T2.17 — Métricas y puntuación normalizada
- **Archivos:** `src/solver/search/metrics.py`, `tests/unit/search/test_metrics.py`.
- **Criterios de aceptación:**
  - Las métricas de [MR-03] se calculan **desde las colocaciones**.
  - Una instancia pequeña con valores calculados a mano coincide exactamente: huecos, % de preferencias,
    % de distribución y `normalizedScore` según [02 §4.6].
  - Sin penalizaciones, o con todos los pesos a 0, la puntuación es 100.
- **Refs:** [MR-03], [02 §4.6]
- **Test:** `uv run --directory services/solver pytest tests/unit/search/test_metrics.py`

#### T2.18 — Búsqueda multi-solución
- **Archivos:** `src/solver/search/{multi_solution.py, progress_callback.py}`, `tests/unit/search/test_multi_solution.py`.
- **Criterios de aceptación:**
  - [MR-CA-01]: con N = 3 se obtienen 3 resultados válidos, que difieren entre sí al menos un 10 %.
  - El reparto de tiempo sigue [02 §4.7] y el total no supera `timeLimitSeconds` + 2 s.
  - Si no se consiguen N resultados, se devuelven los obtenidos con `solutionsFound < solutionsRequested`.
  - Los resultados se ordenan por objetivo y se nombran `Resultado k`.
  - Con `deterministic = true`, dos ejecuciones con la misma semilla dan resultados idénticos.
- **Refs:** [MR-01], [MR-02], [CU-01], [02 §4.7, §4.8]
- **Test:** `uv run --directory services/solver pytest tests/unit/search/test_multi_solution.py`

#### T2.19 — Diagnóstico de infactibilidad
- **Archivos:** `src/solver/search/diagnostics.py`, `tests/unit/search/test_diagnostics.py`.
- **Criterios de aceptación:**
  - Una celda `FORBIDDEN` del profesor P junto a una prefijada de P en esa celda da un núcleo con RD-05(P)
    y RD-07(prefijada).
  - Una carga imposible da un núcleo con RD-12(P).
  - `isMinimal` es `true` cuando la reducción termina a tiempo.
  - El resultado `UNKNOWN` (por tiempo agotado) se distingue de `INFEASIBLE`.
- **Refs:** [01 §6.2.3], [02 §4.9]
- **Test:** `uv run --directory services/solver pytest tests/unit/search/test_diagnostics.py`

#### T2.20 — Trabajos asíncronos y `/v1/check`
- **Archivos:** `src/solver/api/{jobs.py, routes.py}`, `tests/integration/{test_jobs.py, test_check.py}`.
- **Criterios de aceptación:**
  - `POST /v1/jobs` devuelve `202 {jobId}`.
  - `GET /v1/jobs/{id}` pasa por `QUEUED → RUNNING → DONE` e informa de `phase` y `progress`.
  - `DELETE /v1/jobs/{id}` cancela y devuelve las soluciones ya completas, con `CANCELLED`.
  - Superar `SOLVER_MAX_CONCURRENT_JOBS` devuelve `409`.
  - Los trabajos se purgan 1 h después de terminar, y entonces `GET` devuelve `404`.
  - Con errores de la Fase A el estado es `PREVALIDATION_FAILED` y no se construye el modelo.
  - `POST /v1/check` devuelve las violaciones del comprobador y las métricas.
- **Refs:** [CU-01], [EDI-06], [02 §3.2, §3.5, §4.7]
- **Test:** `uv run --directory services/solver pytest tests/integration`

#### T2.21 — Puerta de cobertura y regresión aleatoria
- **Archivos:** `pyproject.toml` (umbral de cobertura), `tests/unit/test_random_instances.py`.
- **Criterios de aceptación:**
  - Con `--cov-fail-under=90` aplicado a `prevalidation`, `model`, `search/diagnostics.py` y
    `verification`, el umbral se cumple.
  - Un test de `hypothesis` genera instancias pequeñas válidas (varios marcos, tramos fraccionados,
    bloques y guardias). Toda solución que devuelve el solver pasa el comprobador, y si es `INFEASIBLE` el
    diagnóstico no está vacío.
  - Escenarios RG-01-CA-02: el contrato no contiene la etapa, así que un test comprueba que
    `SolverInput` no tiene ningún campo de etapa.
- **Refs:** [CLAUDE.md §4.1], [RB-CA-02], [RG-01]
- **Test:** `uv run --directory services/solver pytest --cov=solver --cov-report=term-missing`

---

## Hito 3 — Configuración del centro (API + UI)

**Objetivo:** `ADMIN_DIRECCION` configura completo un curso académico (todo lo que necesita el motor) y
`DOCENTE` gestiona sus preferencias. Toda la lógica vive en `domain/` y `application/`, con tests de
integración contra PostgreSQL.

> Además de lo pedido para este hito (marcos, etapas, departamentos, materias, profesores, grupos, aulas,
> plantillas y asistente de tutoría), incluye actividades lectivas, subgrupos, bloques y optativas,
> actividad no lectiva, ámbitos RG-02, pesos y usuarios, porque el motor (H4) los necesita.

- [ ] T3.1 Esquema académico completo en Prisma
- [ ] T3.2 Dominio temporal en TypeScript
- [ ] T3.3 Marcos horarios: dominio y casos de uso
- [ ] T3.4 Marcos horarios: UI
- [ ] T3.5 Curso académico, etapas y niveles
- [ ] T3.6 Ámbitos de características (RG-02)
- [ ] T3.7 Departamentos y materias
- [ ] T3.8 Profesores
- [ ] T3.9 Usuarios
- [ ] T3.10 Aulas y tipos de aula
- [ ] T3.11 Grupos, particiones y subgrupos
- [ ] T3.12 Plantillas de disponibilidad (administración)
- [ ] T3.13 Preferencias del docente y solicitudes
- [ ] T3.14 Actividades lectivas
- [ ] T3.15 Asistente de tutoría
- [ ] T3.16 Bloques simultáneos y conjuntos de optativas
- [ ] T3.17 Actividad no lectiva
- [ ] T3.18 Pesos de restricciones ponderables
- [ ] T3.19 Duplicar curso académico
- [ ] T3.20 Suite de integración de configuración

#### T3.1 — Esquema académico completo en Prisma
- **Archivos:** `prisma/schema.prisma` (tablas de [02 §2.3–2.7]),
  `prisma/migrations/0002_academic/` (con SQL manual: `EXCLUDE` de `time_slot`, índices únicos parciales,
  `CHECK` de `num_nonnulls` y el trigger INV-01), `src/infrastructure/db/academic-schema.int.test.ts`.
- **Criterios de aceptación:**
  - La BD rechaza:
    - dos tramos solapados del mismo marco y día (INV-02);
    - un tramo cuya duración no coincide con `unit_minutes` (INV-01);
    - dos claves externas iguales en el mismo curso (pero admite varias nulas);
    - dos horarios `CURRENT` en el mismo curso;
    - dos ejecuciones activas en el mismo curso;
    - una plantilla con dos propietarios.
  - No hay deriva entre el esquema y las migraciones.
- **Refs:** [02 §2], [INV-01..INV-03], [IO-01]
- **Test:** `pnpm --filter web exec vitest run --project integration src/infrastructure/db/academic-schema.int.test.ts`

#### T3.2 — Dominio temporal en TypeScript
- **Archivos:** `src/domain/time/{minute-of-day.ts, quarters.ts, interval.ts, overlap.ts}` y tests,
  `src/domain/time-frame/contiguous-spans.ts` y test.
- **Criterios de aceptación:**
  - `HH:MM` ↔ minutos, rechazando valores fuera de rango.
  - `1/2`, `3/4`, `1`, `1.5`, `2` y `3` ↔ cuartos.
  - Los intervalos son semiabiertos.
  - Los arranques contiguos son **idénticos** a los de `spans.py`: un test de paridad lee
    `services/solver/tests/fixtures/shared/spans/*.json` y compara.
- **Refs:** [01 §0.3], [MH-03], [MH-04], [02 §1.3]
- **Test:** `pnpm --filter web exec vitest run --project unit src/domain/time src/domain/time-frame`

#### T3.3 — Marcos horarios: dominio y casos de uso
- **Archivos:**
  - `src/domain/time-frame/{time-frame.ts, time-slot.ts}` con tests.
  - `src/application/configuration/{create-time-frame.ts, update-time-slots.ts, copy-day.ts, recompute-overlaps.ts}` con tests.
  - `src/infrastructure/db/repositories/time-frame-repository.ts`.
- **Criterios de aceptación:**
  - INV-01 e INV-02 se validan en el dominio con errores tipados.
  - La matriz `time_slot_overlap` se recalcula al guardar [MH-02].
  - [MH-02-CA-03]: modificar las horas marca como desactualizados los horarios afectados.
  - Varios marcos coexisten en un curso [MH-01].
- **Refs:** [MH-01..MH-05]
- **Test:** `pnpm --filter web exec vitest run --project unit src/domain/time-frame src/application/configuration && pnpm --filter web exec vitest run --project integration src/application/configuration`

#### T3.4 — Marcos horarios: UI
- **Archivos:** `src/app/(app)/configuracion/marcos/{page.tsx, [frameId]/page.tsx, actions.ts}`,
  `src/ui/configuration/{slot-editor.tsx, frame-preview.tsx, frame-overlap-badge.tsx}` con tests.
- **Criterios de aceptación:**
  - Se pueden crear y editar tramos por día (HH:MM, tipo y duración), copiar un día a otros y reordenar.
  - Vista previa con altura proporcional a la duración real.
  - Se indican los tramos que solapan con otros marcos.
  - Los errores de dominio se muestran junto al campo.
  - `INVITADO_DEMO` ve la página en modo lectura.
- **Refs:** [MH-01..MH-05], [02 §6]
- **Test:** `pnpm --filter web exec vitest run --project unit src/ui/configuration`

#### T3.5 — Curso académico, etapas y niveles
- **Archivos:** `src/application/configuration/{academic-year.ts, levels.ts}` con tests,
  `src/app/(app)/configuracion/curso/`, selector de curso en `topbar.tsx`.
- **Criterios de aceptación:**
  - CRUD de cursos académicos, con uno solo marcado como actual.
  - Los niveles se crean por etapa (las 4 etapas disponibles).
  - Cambiar de curso en la barra superior cambia el contexto de todas las páginas.
- **Refs:** [RG-03], [01 §2]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/configuration/academic-year`

#### T3.6 — Ámbitos de características (RG-02)
- **Archivos:** `src/domain/scope-settings/{features.ts, feature-resolution.ts}` con tests,
  `src/application/configuration/feature-settings.ts`, `src/app/(app)/configuracion/caracteristicas/`.
- **Criterios de aceptación:**
  - [RG-02-CA-01]: una característica desactivada en un grupo impide la operación correspondiente,
    indicando el ámbito que la desactiva.
  - [RG-02-CA-02]: se hereda del ámbito superior más cercano, y la UI muestra el origen.
  - Los casos de uso afectados (subgrupos, optativas, asistente, etc.) consultan `feature-resolution`.
- **Refs:** [RG-02]
- **Test:** `pnpm --filter web exec vitest run --project unit src/domain/scope-settings`

#### T3.7 — Departamentos y materias
- **Archivos:** `src/domain/academic/{department.ts, subject.ts}`,
  `src/application/academic/{departments.ts, subjects.ts}` con tests, repositorios,
  `src/app/(app)/datos/{departamentos,materias}/`, `src/ui/academic/subject-color-picker.tsx`.
- **Criterios de aceptación:**
  - CRUD completo con abreviatura y clave externa únicas [INV-03].
  - El color se asigna automáticamente con el tono menos usado del departamento, de la paleta de 16
    [02 §6.2].
  - Borrar con dependencias muestra la lista de afectados y pide confirmación, o lo impide [ENT-01].
- **Refs:** [ENT-01], [INV-03], [IO-01]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/academic/departments src/application/academic/subjects`

#### T3.8 — Profesores
- **Archivos:** `src/domain/academic/teacher.ts`, `src/application/academic/teachers.ts` con tests,
  `src/app/(app)/datos/profesores/`.
- **Criterios de aceptación:**
  - CRUD con varios departamentos.
  - Las cargas se introducen en horas y minutos y se guardan en minutos.
  - Se puede vincular un usuario `DOCENTE` (único por curso).
  - Al borrar se muestran las dependencias.
- **Refs:** [ENT-01], [01 §4.1]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/academic/teachers`

#### T3.9 — Usuarios
- **Archivos:** `src/application/admin/users.ts` con tests, `src/app/(app)/administracion/usuarios/`.
- **Criterios de aceptación:**
  - CRUD de usuarios y asignación de rol.
  - Al desactivar un usuario o cambiar su rol se **revocan sus sesiones** al instante.
  - Al restablecer la contraseña se genera una temporal que se muestra una sola vez.
  - Solo accede `users:manage`.
- **Refs:** [02 §5.2, §5.3]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/admin`

#### T3.10 — Aulas y tipos de aula
- **Archivos:** `src/domain/academic/room.ts`, `src/application/academic/rooms.ts` con tests,
  `src/app/(app)/datos/aulas/`.
- **Criterios de aceptación:** CRUD de tipos de aula y de aulas, con capacidad ≥ 0, abreviatura y clave
  externa únicas.
- **Refs:** [ENT-01], [ENT-02]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/academic/rooms`

#### T3.11 — Grupos, particiones y subgrupos
- **Archivos:** `src/domain/academic/{class-group.ts, subgroup.ts}`,
  `src/application/academic/{groups.ts, subgroups.ts}` con tests,
  `src/app/(app)/datos/grupos/` y `grupos/[groupId]/subgrupos/`.
- **Criterios de aceptación:**
  - Un grupo pertenece a un marco y a un nivel, y tiene horas objetivo, aula de referencia y tutor.
  - Las particiones agrupan subgrupos.
  - Un subgrupo puede tener varios grupos de referencia del **mismo marco** [INV-04].
  - Se respeta la característica “desdobles” por ámbito [RG-02].
- **Refs:** [ENT-05], [INV-04], [RG-02]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/academic/groups src/application/academic/subgroups`

#### T3.12 — Plantillas de disponibilidad (administración)
- **Archivos:** `src/domain/availability/{cell-state.ts, template.ts, combine.ts}` con tests,
  `src/application/availability/edit-template.ts`, `src/app/(app)/datos/plantillas/[ownerType]/[ownerId]/`,
  `src/ui/availability/availability-grid.tsx` con test.
- **Criterios de aceptación:**
  - Hay plantillas para Centro, Grupo, Profesor, Aula y Materia, por marco.
  - Modo pincel con los 4 estados y selección por arrastre o por fila y columna.
  - El almacenamiento es disperso (`DISPONIBLE` no se guarda).
  - La combinación de varias plantillas cumple [MH-06-CA-01] y [MH-06-CA-02].
  - Los estados se distinguen por trama o icono, no solo por color.
- **Refs:** [MH-06], [02 §6.4]
- **Test:** `pnpm --filter web exec vitest run --project unit src/domain/availability src/ui/availability`

#### T3.13 — Preferencias del docente y solicitudes
- **Archivos:** `src/application/availability/{edit-own-preferences.ts, request-forbidden.ts, decide-request.ts}`
  con tests, `src/app/(app)/mis-preferencias/`, bandeja de solicitudes en el panel de inicio.
- **Criterios de aceptación:**
  - [MH-07]: un `DOCENTE` solo puede marcar `PREFERENTE` y `NO_PREFERENTE` en **su** plantilla. Intentar
    `PROHIBIDO` o editar otra plantilla devuelve 403.
  - Las solicitudes de `PROHIBIDO` (P-03) las aprueba o rechaza `ADMIN_DIRECCION`. Al aprobarse se
    aplican a la plantilla.
- **Refs:** [MH-07], [P-03], [01 §9]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/availability`

#### T3.14 — Actividades lectivas
- **Archivos:** `src/domain/academic/teaching-activity.ts`, `src/application/academic/activities.ts` con tests,
  `src/app/(app)/datos/actividades/`, `src/ui/academic/activity-form.tsx`.
- **Criterios de aceptación:**
  - Duraciones permitidas: `1/2`, `3/4`, `1`, `1.5`, `2` y `3` [MH-04].
  - Profesores en modo `FIXED` o `EQUIVALENT_POOL` [ENT-06].
  - Los 4 modos de aula [ENT-02], con el aula de referencia por defecto.
  - Modo de distribución y si es obligatorio.
  - Posiciones prefijadas validadas contra los arranques contiguos.
  - INV-04 e INV-05.
  - Todo disponible con grupos de cualquier etapa [RG-01-CA-01].
- **Refs:** [ENT-02], [ENT-06], [MH-04], [INV-04], [INV-05], [RG-01]
- **Test:** `pnpm --filter web exec vitest run --project unit src/domain/academic && pnpm --filter web exec vitest run --project integration src/application/academic/activities`

#### T3.15 — Asistente de tutoría
- **Archivos:** `src/domain/tutor-wizard/{remaining-hours.ts, proposal.ts}` con tests,
  `src/application/academic/tutor-wizard.ts` con test, `src/ui/academic/tutor-wizard-dialog.tsx` con test.
- **Criterios de aceptación:**
  - [ENT-03-CA-01]: 25 h − 8 h = 17 h del tutor.
  - [ENT-03-CA-02]: si se supera la carga del tutor, aparece una advertencia y se pide confirmación.
  - [ENT-03-CA-03]: con 0 h restantes no se propone nada.
  - Se muestra la propuesta antes de crear nada.
  - Las actividades creadas tienen `origin = TUTOR_WIZARD` y se pueden deshacer en bloque.
  - Funciona en grupos de las 4 etapas [RG-01].
- **Refs:** [ENT-03], [RG-01]
- **Test:** `pnpm --filter web exec vitest run --project unit src/domain/tutor-wizard src/ui/academic && pnpm --filter web exec vitest run --project integration src/application/academic/tutor-wizard`

#### T3.16 — Bloques simultáneos y conjuntos de optativas
- **Archivos:** `src/domain/academic/simultaneous-block.ts`, `src/application/academic/blocks.ts` con tests,
  `src/app/(app)/datos/bloques/`.
- **Criterios de aceptación:**
  - Bloques `EXPLICIT` y `ELECTIVE_SET` con grupos participantes.
  - Se pueden marcar incompatibilidades entre bloques.
  - INV-06: misma duración, número de sesiones y marco.
  - No se puede repetir profesor ni aula dentro de un bloque (como PV-08, pero al guardar).
- **Refs:** [ENT-04], [INV-06], [PV-08]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/academic/blocks`

#### T3.17 — Actividad no lectiva
- **Archivos:** `src/domain/non-lective/{duty-service.ts, meeting.ts, reduction.ts}` con tests,
  `src/application/non-lective/*.ts` con tests, `src/app/(app)/no-lectiva/{guardias,reuniones,reducciones}/`.
- **Criterios de aceptación:**
  - Guardias con ventana (que admite tramos `BREAK`), adscritos con cupo individual y mínimo y máximo por tramo.
  - Reuniones con participantes explícitos, por departamento o por equipo docente, frecuencia, duración
    de 1 o 2 tramos y ventana.
  - Reducciones con cómputo y posición fija o libre.
  - Se validan las coherencias básicas (mínimo ≤ máximo, duración ∈ {1,2}).
- **Refs:** [NL-01..NL-03]
- **Test:** `pnpm --filter web exec vitest run --project unit src/domain/non-lective && pnpm --filter web exec vitest run --project integration src/application/non-lective`

#### T3.18 — Pesos de restricciones ponderables
- **Archivos:** `src/application/configuration/soft-weights.ts` con test, `src/app/(app)/configuracion/pesos/`,
  `src/ui/engine/weight-slider.tsx` con test.
- **Criterios de aceptación:**
  - Pesos enteros de 0 a 100 para RB-01…RB-06, con los valores por defecto de la tabla de 01 §6.2.2.
  - Cada peso se ajusta con un slider y con un campo numérico accesible.
- **Refs:** [01 §6.2.2], [P-07]
- **Test:** `pnpm --filter web exec vitest run --project unit src/ui/engine/weight-slider.test.tsx && pnpm --filter web exec vitest run --project integration src/application/configuration/soft-weights`

#### T3.19 — Duplicar curso académico
- **Archivos:** `src/application/configuration/clone-academic-year.ts` con test.
- **Criterios de aceptación:**
  - Copia toda la estructura (marcos, entidades, actividades, plantillas, no lectiva, pesos y ámbitos) con
    nuevos identificadores y referencias internas coherentes.
  - **No** copia ejecuciones ni horarios. Se registra `cloned_from_id`.
- **Refs:** [RG-03]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/configuration/clone-academic-year`

#### T3.20 — Suite de integración de configuración
- **Archivos:** `apps/web/test/integration/configuration-rbac.int.test.ts`, `rg01-all-stages.int.test.ts`.
- **Criterios de aceptación:**
  - Todas las mutaciones de H3 devuelven 403 para `DOCENTE` (salvo T3.13) y para `INVITADO_DEMO`.
  - [RG-01-CA-02] (parte web): los mismos escenarios de configuración (subgrupos, optativas, tramos
    fraccionados, asistente) se ejecutan con grupos de las 4 etapas y dan el mismo resultado.
- **Refs:** [RG-01], [01 §9]
- **Test:** `pnpm --filter web exec vitest run --project integration test/integration`

---

## Hito 4 — Generación multi-resultado, comparador y rejilla interactiva

**Objetivo:** desde la web se valida y se calcula, se comparan N resultados, se elige el vigente y se
consulta y edita el horario con validación en vivo.

- [ ] T4.1 ADR de integración y editor
- [ ] T4.2 Contrato Zod y paridad con JSON Schema
- [ ] T4.3 Construcción de `SolverInput`
- [ ] T4.4 Pasarela HTTP del solver
- [ ] T4.5 Pre-validación y pantalla “Validar y calcular”
- [ ] T4.6 Ciclo de vida de la ejecución
- [ ] T4.7 Pantalla de progreso y de sin solución
- [ ] T4.8 Comparador de resultados y horario vigente
- [ ] T4.9 Dominio del horario y mapa de ocupación
- [ ] T4.10 Componente de rejilla horaria
- [ ] T4.11 Perspectivas y vistas de horario
- [ ] T4.12 Diagnóstico de movimientos y paridad con el solver
- [ ] T4.13 Editor de arrastrar y soltar
- [ ] T4.14 Guardar versión, bloquear y recalcular
- [ ] T4.15 Historial de versiones
- [ ] T4.16 E2E del motor y del editor (smoke)

#### T4.1 — ADR de integración y editor
- **Archivos:** `docs/adr/0004-ejecucion-asincrona-con-polling.md`, `0007-revalidacion-en-solver-y-paridad.md`.
  Se amplía `0010` con `@dnd-kit/core` y `ajv` (dev).
- **Criterios de aceptación:** misma estructura que T1.1.
- **Refs:** [02 §7]
- **Test:** `./scripts/check-adrs.sh` (con los nuevos ADR ya no marcados como “Pendiente” en el índice)

#### T4.2 — Contrato Zod y paridad con JSON Schema
- **Archivos:** `src/infrastructure/solver/{contract.ts, contract.test.ts}`.
- **Criterios de aceptación:**
  - Los esquemas Zod `strictObject` replican `SolverInput`, `SolverOutput`, `JobStatus`, `CheckRequest`
    y `CheckReport`.
  - Ajv valida contra `services/solver/schemas/*.json` los fixtures generados con Zod.
  - Los fixtures inválidos de `tests/fixtures/shared/contract/` los rechazan ambos lados.
- **Refs:** [02 §3]
- **Test:** `pnpm --filter web exec vitest run --project unit src/infrastructure/solver/contract.test.ts`

#### T4.3 — Construcción de `SolverInput`
- **Archivos:** `src/application/engine/build-solver-input.ts` con test,
  `build-solver-input.int.test.ts` (con BD).
- **Criterios de aceptación:**
  - Resuelve los ámbitos (RG-02 → datos y `softOptOut`), los participantes de las reuniones, el aula de
    referencia por defecto, los pesos efectivos y las cargas en minutos.
  - El resultado pasa la validación Zod **y** la del JSON Schema.
  - RG-05: un test recorre el JSON y comprueba que no contiene ningún nombre, correo ni abreviatura de
    las entidades.
  - Para unos mismos datos, el resultado es estable: misma salida y mismo `input_sha256`.
- **Refs:** [RG-02], [RG-05], [02 §3.1, §3.3]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/engine/build-solver-input`

#### T4.4 — Pasarela HTTP del solver
- **Archivos:** `src/application/ports/solver-gateway.ts`,
  `src/infrastructure/solver/{http-solver-gateway.ts, http-solver-gateway.test.ts}`.
- **Criterios de aceptación:**
  - Envía `Authorization: Bearer` y aplica timeouts por operación.
  - Valida las respuestas con Zod; una respuesta inválida produce el error tipado `SolverContractError`.
  - Traduce los códigos `401`, `404`, `409`, `413` y `422` a errores de aplicación.
  - Se prueba contra un servidor HTTP falso (`node:http`).
- **Refs:** [02 §3.2, §5.4]
- **Test:** `pnpm --filter web exec vitest run --project unit src/infrastructure/solver/http-solver-gateway.test.ts`

#### T4.5 — Pre-validación y pantalla “Validar y calcular”
- **Archivos:** `src/application/engine/prevalidate.ts` con test, `src/app/(app)/motor/{page.tsx, actions.ts}`,
  `src/ui/engine/{prevalidation-report.tsx, run-params-panel.tsx}` con tests.
- **Criterios de aceptación:**
  - El informe se agrupa por severidad, con los nombres reales de las entidades y una barra de
    necesario/disponible.
  - Cada hallazgo enlaza a la entidad.
  - El botón **Calcular** está deshabilitado mientras haya algún `ERROR` [PV-CA-01].
  - El panel de parámetros incluye tiempo, N, diversidad, determinista y pesos.
  - Rate limit de 30 cada 10 min.
- **Refs:** [01 §6.1], [02 §6.6], [02 §5.6]
- **Test:** `pnpm --filter web exec vitest run --project unit src/ui/engine src/application/engine/prevalidate`

#### T4.6 — Ciclo de vida de la ejecución
- **Archivos:** `src/application/engine/{launch-run.ts, poll-run.ts, cancel-run.ts}` con tests,
  `src/app/api/runs/[runId]/route.ts`, repositorio de `solver_run` y `timetable`.
- **Criterios de aceptación:**
  - El lanzamiento guarda `input_snapshot` e `input_sha256`.
  - Solo puede haber una ejecución activa por curso (si no, `409` con un mensaje claro).
  - Rate limit de 3 cada 10 min.
  - El polling sincroniza el estado y, en `DONE`, persiste N `timetable` `CANDIDATE` con sus colocaciones
    y métricas, en una transacción.
  - Si el solver devuelve 404, la ejecución pasa a `ERROR` con `SOLVER_JOB_LOST`.
  - La cancelación se propaga al solver.
- **Refs:** [CU-01], [MR-01], [02 §2.7, §5.6, §5.7]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/engine`

#### T4.7 — Pantalla de progreso y de sin solución
- **Archivos:** `src/app/(app)/motor/ejecuciones/[runId]/page.tsx`,
  `src/ui/engine/{run-progress.tsx, no-solution-card.tsx}` con tests.
- **Criterios de aceptación:**
  - Pasos Fase A → B → C, con soluciones encontradas, mejor puntuación y tiempo transcurrido; se consulta
    cada 2 s con TanStack Query.
  - Botón Cancelar.
  - Si no hay solución, el núcleo se muestra traducido a lenguaje natural, con enlaces a las entidades
    [01 §6.2.3].
- **Refs:** [CU-01], [02 §6.6]
- **Test:** `pnpm --filter web exec vitest run --project unit src/ui/engine/run-progress.test.tsx src/ui/engine/no-solution-card.test.tsx`

#### T4.8 — Comparador de resultados y horario vigente
- **Archivos:** `src/application/engine/select-current-result.ts` con test,
  `src/app/(app)/motor/ejecuciones/[runId]/comparar/`, `src/ui/engine/results-comparison.tsx` con test.
- **Criterios de aceptación:**
  - Tabla con una columna por resultado y las métricas de [MR-03], con la mejor de cada fila resaltada
    por ✓ y fondo.
  - Botones Abrir, Abrir en editor y Marcar como vigente (con confirmación).
  - Marcar como vigente pone `CURRENT` y archiva el anterior en una transacción [MR-04].
- **Refs:** [MR-03], [MR-04]
- **Test:** `pnpm --filter web exec vitest run --project unit src/ui/engine/results-comparison.test.tsx && pnpm --filter web exec vitest run --project integration src/application/engine/select-current-result`

#### T4.9 — Dominio del horario y mapa de ocupación
- **Archivos:** `src/domain/timetable/{timetable.ts, placement.ts, occupancy-map.ts, projection.ts}` con tests.
- **Criterios de aceptación:**
  - `OccupancyMap` indexa las ocupaciones por profesor, grupo, subgrupo y aula usando puntos de control.
  - `projection` devuelve la vista Grupo, Profesor o Aula de una entidad.
  - Rendimiento: proyectar 600 sesiones tarda menos de 20 ms (benchmark con `vitest bench`).
- **Refs:** [VIS-02], [02 §4.3, §6.5]
- **Test:** `pnpm --filter web exec vitest run --project unit src/domain/timetable`

#### T4.10 — Componente de rejilla horaria
- **Archivos:** `src/ui/timetable/{timetable-grid.tsx, session-card.tsx, slot-band.tsx, legend.tsx}` con tests.
- **Criterios de aceptación:**
  - CSS Grid con una fila cada 5 min; las sesiones de 1/2, 3/4 y 1,5 tramos tienen altura proporcional.
  - Recreos y paradas se muestran como bandas.
  - Las sesiones de un bloque aparecen lado a lado.
  - Indicadores de [02 §6.4]: huecos, prohibido, capa de preferencias, 🔒 y 📌, aula alternativa.
  - Vista unificada en varios marcos para profesor y aula [VIS-03].
  - Por debajo de 768 px se muestra un día con pestañas [VIS-04].
  - Los indicadores tienen texto o patrón accesible, además del color.
- **Refs:** [VIS-01], [VIS-03], [VIS-04], [02 §6.4, §6.5]
- **Test:** `pnpm --filter web exec vitest run --project unit src/ui/timetable`

#### T4.11 — Perspectivas y vistas de horario
- **Archivos:** `src/ui/timetable/perspective-switcher.tsx` con test,
  `src/app/(app)/horarios/{page.tsx, [timetableId]/page.tsx}`, `src/app/(app)/mi-horario/page.tsx`.
- **Criterios de aceptación:**
  - Control segmentado Grupo / Profesor / Aula y combobox con búsqueda.
  - Atajos `G`, `P`, `A`, `[` y `]`.
  - Los datos se cargan una vez por versión.
  - `DOCENTE` ve su horario y el de sus grupos, y recibe 403 para otros profesores [VIS-05], [P-04].
- **Refs:** [VIS-02], [VIS-05]
- **Test:** `pnpm --filter web exec vitest run --project unit src/ui/timetable/perspective-switcher.test.tsx`

#### T4.12 — Diagnóstico de movimientos y paridad con el solver
- **Archivos:** `src/domain/timetable/{move-diagnostics.ts, diagnostic-messages.ts}` con tests,
  `services/solver/tests/fixtures/shared/moves/*.json`, `services/solver/tests/unit/verification/test_shared_moves.py`,
  `apps/web/src/domain/timetable/move-diagnostics.parity.test.ts`.
- **Criterios de aceptación:**
  - Para cada arranque candidato calcula si es válido o no y sus motivos (RD-02 a RD-07 y RD-11).
  - Los mensajes en español con nombres reales siguen los ejemplos de [EDI-03].
  - [EDI-CA-01] cumplido.
  - **Paridad:** el veredicto de cada fixture compartido coincide entre TS y `checker.py`.
- **Refs:** [EDI-02], [EDI-03], [02 §1.3]
- **Test:** `pnpm --filter web exec vitest run --project unit src/domain/timetable/move-diagnostics && uv run --directory services/solver pytest tests/unit/verification/test_shared_moves.py`

#### T4.13 — Editor de arrastrar y soltar
- **Archivos:** `src/app/(app)/horarios/[timetableId]/editor/page.tsx`,
  `src/ui/timetable/{editor-dnd.tsx, drop-feedback.tsx, editor-toolbar.tsx, use-edit-history.ts}` con tests.
- **Criterios de aceptación:**
  - Al arrastrar, las celdas se marcan como válidas o no válidas. Un popover muestra los motivos o el
    impacto blando. Soltar en una celda no válida no aplica el cambio [EDI-02].
  - Se pueden intercambiar dos sesiones.
  - Modo teclado: `Enter`, flechas y `Esc`, con anuncio `aria-live`.
  - Deshacer y rehacer con `⌘Z` y `⇧⌘Z` [EDI-05].
  - El editor está deshabilitado en móvil y para roles sin `timetable:edit`.
- **Refs:** [EDI-01], [EDI-02], [EDI-03], [EDI-05], [02 §6.5]
- **Test:** `pnpm --filter web exec vitest run --project unit src/ui/timetable/editor-dnd.test.tsx src/ui/timetable/use-edit-history.test.ts`

#### T4.14 — Guardar versión, bloquear y recalcular
- **Archivos:** `src/application/timetable/{save-version.ts, lock-session.ts, recalculate-with-locks.ts}` con tests.
- **Criterios de aceptación:**
  - Al guardar se revalida con `POST /v1/check` [EDI-06]. Si hay violaciones no se guarda y se devuelven;
    si no, se crea la versión N+1 con autor y nota.
  - Bloquear y desbloquear sesiones [EDI-04].
  - “Recalcular respetando bloqueadas” lanza una ejecución con `lockedPlacements`.
  - Un test manipula el cliente para enviar un movimiento inválido y el servidor lo rechaza.
- **Refs:** [EDI-04], [EDI-05], [EDI-06]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/timetable`

#### T4.15 — Historial de versiones
- **Archivos:** `src/app/(app)/horarios/[timetableId]/versiones/page.tsx`,
  `src/application/timetable/restore-version.ts` con test.
- **Criterios de aceptación:**
  - Lista de versiones con fecha, autor y nota. Se puede ver cualquier versión.
  - Restaurar una versión crea otra **nueva** (no se reescribe el historial).
- **Refs:** [EDI-05]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/timetable/restore-version`

#### T4.16 — E2E del motor y del editor (smoke)
- **Archivos:** `apps/web/e2e/{engine-flow.spec.ts, editor.spec.ts, perspectives.spec.ts}`,
  `e2e/fixtures/small-school.ts` (centro mínimo creado por API).
- **Criterios de aceptación:**
  - Con un centro pequeño: validar → calcular con N = 2 → comparar → marcar vigente → ver en las tres
    perspectivas.
  - En el editor, un movimiento inválido se bloquea con el motivo visible y uno válido se guarda como versión 2.
  - [VIS-02-CA-01]: el cambio de perspectiva tarda menos de 200 ms (medido con `performance.now()` en la página).
- **Refs:** [CU-01], [MR-04], [VIS-02], [EDI-*]
- **Test:** `pnpm --filter web exec playwright test e2e/engine-flow.spec.ts e2e/editor.spec.ts e2e/perspectives.spec.ts`

---

## Hito 5 — Importación/exportación, seed completo y E2E

**Objetivo:** los datos entran y salen en PDF, Excel, CSV y JSON con claves externas. El centro de
demostración completo se carga con un comando y la suite E2E cubre los flujos de todos los roles.

- [ ] T5.1 ADR de exportación
- [ ] T5.2 Exportación JSON estructurada
- [ ] T5.3 Importación JSON y CSV
- [ ] T5.4 Exportación CSV y Excel
- [ ] T5.5 Exportación PDF
- [ ] T5.6 Pantalla de importar y exportar
- [ ] T5.7 Seed: estructura del centro demo
- [ ] T5.8 Seed: actividades, no lectiva, plantillas y horario
- [ ] T5.9 Benchmark del centro demo
- [ ] T5.10 Suite E2E completa
- [ ] T5.11 Accesibilidad automatizada

#### T5.1 — ADR de exportación
- **Archivos:** `docs/adr/0011-generacion-pdf.md` (elige entre `@react-pdf/renderer` e impresión con
  Chromium en servidor, y justifica). Se amplía `0010` con `exceljs` y `@axe-core/playwright` (dev).
- **Criterios de aceptación:** misma estructura que T1.1. El ADR incluye el impacto en el tamaño de la
  imagen y en la seguridad.
- **Refs:** [IO-03], [02 §7]
- **Test:** `./scripts/check-adrs.sh` (con los nuevos ADR ya no marcados como “Pendiente” en el índice)

#### T5.2 — Exportación JSON estructurada
- **Archivos:** `src/application/io/export-json.ts`, `src/infrastructure/export/json.ts`,
  `src/infrastructure/export/schema/fsja-export.v1.json`, tests.
- **Criterios de aceptación:**
  - Incluye `schemaVersion`, la configuración completa del curso y el horario vigente.
  - Las referencias usan la clave externa cuando existe y el `id` en caso contrario.
  - La salida valida contra su JSON Schema.
- **Refs:** [IO-01], [IO-05]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/io/export-json`

#### T5.3 — Importación JSON y CSV
- **Archivos:** `src/application/io/import-data.ts`, `src/infrastructure/import/{json-reader.ts, csv-reader.ts}`,
  plantillas CSV en `docs/import/`, tests.
- **Criterios de aceptación:**
  - Modo simulación: qué se crearía, actualizaría u omitiría, emparejando por clave externa.
  - Aplicación **atómica**: si una fila es inválida no se importa nada, y el informe indica fila, campo y motivo.
  - Límite de 5 MB y rate limit de 10 por hora. Se registra en `import_job`.
  - [IO-05-CA-01]: exportar, importar en un curso vacío y volver a exportar da datos equivalentes.
- **Refs:** [IO-01], [IO-02], [IO-05]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/io/import-data`

#### T5.4 — Exportación CSV y Excel
- **Archivos:** `src/infrastructure/export/{csv.ts, xlsx.ts}` con tests, `src/app/api/export/[timetableId]/[format]/route.ts`.
- **Criterios de aceptación:**
  - Una fila por sesión colocada con las columnas de [IO-04]. El Excel tiene una hoja por perspectiva.
  - Las celdas que empiezan por `= + - @ \t \r` se neutralizan con `'` (test específico).
  - La ruta exige `io:export:any` o `io:export:own`.
- **Refs:** [IO-04], [02 §5.4]
- **Test:** `pnpm --filter web exec vitest run --project unit src/infrastructure/export`

#### T5.5 — Exportación PDF
- **Archivos:** `src/infrastructure/export/pdf/*`, `src/application/io/export-pdf.ts`, estilos de impresión, tests.
- **Criterios de aceptación:**
  - PDF por grupo, profesor o aula, y en lote.
  - A4 apaisado, legible en blanco y negro, con una cabecera que incluye centro, curso, entidad y fecha
    de la versión.
  - El test extrae el texto del PDF y comprueba la materia, el profesor y el aula de una sesión conocida.
  - Rate limit de 10 lotes por hora.
- **Refs:** [IO-03], [02 §6.5]
- **Test:** `pnpm --filter web exec vitest run --project integration src/application/io/export-pdf`

#### T5.6 — Pantalla de importar y exportar
- **Archivos:** `src/app/(app)/importar-exportar/{page.tsx, actions.ts}`, `src/ui/io/{import-wizard.tsx, export-panel.tsx}` con tests.
- **Criterios de aceptación:**
  - Asistente de importación en tres pasos: subir, revisar la simulación y confirmar.
  - Panel de exportación por formato y alcance.
  - `DOCENTE` solo puede exportar su horario.
- **Refs:** [IO-02..IO-05], [01 §9]
- **Test:** `pnpm --filter web exec vitest run --project unit src/ui/io`

#### T5.7 — Seed: estructura del centro demo
- **Archivos:** `prisma/seed/demo-school/{time-frames.ts, academic.ts}`.
- **Criterios de aceptación:**
  - Un centro **ficticio** con dos marcos solapados: Infantil/Primaria y ESO/Bachillerato.
  - Grupos: Infantil (3), Primaria (6), ESO (8) y Bachillerato (4), con sus niveles.
  - Unos 45 profesores, departamentos, materias con colores, y aulas con tipos.
  - Al menos un profesor y un aula compartidos entre marcos.
  - Tramos fraccionados en ambos marcos.
- **Refs:** [TFM-01]
- **Test:** `pnpm --filter web exec vitest run --project integration prisma/seed/demo-school`

#### T5.8 — Seed: actividades, no lectiva, plantillas y horario
- **Archivos:** `prisma/seed/demo-school/{activities.ts, non-lective.ts, availability.ts, timetable.ts}`.
- **Criterios de aceptación:**
  - Al menos un caso de cada característica, repartidos por etapas [TFM-01, RG-01]:
    - sesiones de 1,5 y de 2 tramos;
    - asistente de tutoría en Infantil y Primaria;
    - optativas en ESO y Bachillerato, desdobles, Diversificación;
    - aulas alternativas y pools, profesores equivalentes;
    - guardias de aula y de recreo, reuniones, reducciones;
    - plantillas con los 4 estados.
  - El seed calcula el horario llamando al solver con `deterministic = true` y lo marca como vigente.
  - [TFM-01-CA-01]: después de `docker compose up` con `SEED_ON_START=true`, hay un horario vigente visible.
- **Refs:** [TFM-01], [RG-01]
- **Test:** `docker compose up -d --build --wait && pnpm --filter web exec vitest run --project integration prisma/seed/demo-school/timetable`

#### T5.9 — Benchmark del centro demo
- **Archivos:** `apps/web/scripts/export-demo-solver-input.ts`, `services/solver/tests/fixtures/demo_school.json`,
  `services/solver/tests/integration/test_demo_school_performance.py`, `docs/entorno-referencia.md`.
- **Criterios de aceptación:**
  - [TFM-01-CA-02]: la Fase A no da ningún `ERROR` y la Fase B encuentra solución en menos de 120 s en el
    entorno de referencia (documentado: CPU, RAM y número de workers).
  - El test se marca `@pytest.mark.slow` y CI lo ejecuta en un trabajo aparte.
- **Refs:** [TFM-01-CA-02], [02 §4.11]
- **Test:** `uv run --directory services/solver pytest -m slow tests/integration/test_demo_school_performance.py`

#### T5.10 — Suite E2E completa
- **Archivos:** `apps/web/e2e/{engine-flow.spec.ts, editor.spec.ts, perspectives.spec.ts, configuration.spec.ts, import-export.spec.ts, teacher.spec.ts, demo-guest.spec.ts}` (ampliados sobre el seed).
- **Criterios de aceptación:**
  - Flujo completo de `ADMIN_DIRECCION` sobre el seed: login → validar → calcular (N = 3) → comparar →
    vigente → editar → guardar versión → exportar PDF.
  - `DOCENTE`: login → mi horario → marcar preferencias → solicitar `PROHIBIDO`; el administrador lo
    aprueba.
  - `INVITADO_DEMO`: navega por todo en lectura y cualquier intento de escritura muestra el mensaje [TFM-03].
  - Importar el JSON exportado en un curso nuevo [IO-05-CA-01].
- **Refs:** [CLAUDE.md §4.2], [TFM-01], [TFM-03]
- **Test:** `pnpm --filter web exec playwright test`

#### T5.11 — Accesibilidad automatizada
- **Archivos:** `apps/web/e2e/a11y.spec.ts`.
- **Criterios de aceptación:**
  - `axe` no encuentra violaciones *serious* ni *critical* en login, inicio, marcos, actividades,
    validar y calcular, comparador, rejilla y editor, en modo claro y oscuro.
  - El editor se puede usar completo solo con teclado (flujo de mover una sesión).
- **Refs:** [02 §6.7]
- **Test:** `pnpm --filter web exec playwright test e2e/a11y.spec.ts`

---

## Hito 6 — Producción y entrega del TFM

**Objetivo:** el sistema se despliega de forma reproducible y segura, y la entrega académica está
completa: documentación, trazabilidad y guion de defensa.

- [ ] T6.1 Endurecimiento de imágenes y compose de producción
- [ ] T6.2 Revisión de seguridad
- [ ] T6.3 Observabilidad y errores
- [ ] T6.4 Copias de seguridad y restauración
- [ ] T6.5 Matriz de trazabilidad
- [ ] T6.6 Diagramas de arquitectura
- [ ] T6.7 README completo
- [ ] T6.8 Guía de despliegue
- [ ] T6.9 Guion de slides y vídeo
- [ ] T6.10 Versión 1.0.0

#### T6.1 — Endurecimiento de imágenes y compose de producción
- **Archivos:** `docker-compose.prod.yml` (override), `apps/web/Dockerfile`, `services/solver/Dockerfile`, `scripts/compose-smoke.sh`.
- **Criterios de aceptación:**
  - Con el override de producción: `APP_ENV=production`, sin puerto de `db`, `SEED_ON_START` prohibido,
    HSTS activo, `restart: unless-stopped` y límites de recursos en los tres servicios.
  - Imagen web menor de 250 MB y del solver menor de 400 MB; las dos sin herramientas de compilación.
  - El smoke test pasa con el override.
- **Refs:** [02 §1.4, §5.7], [TFM-02]
- **Test:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait && ./scripts/compose-smoke.sh --prod`

#### T6.2 — Revisión de seguridad
- **Archivos:** `docs/seguridad/checklist.md`, `docs/seguridad/informe-revision.md`.
- **Criterios de aceptación:**
  - Checklist OWASP ASVS nivel 1 aplicado, con evidencias (test o archivo) por cada punto.
  - `pnpm audit --prod` y `uv run pip-audit` sin vulnerabilidades altas ni críticas, o justificadas.
  - Revisión manual de cabeceras, rate limits, permisos y secretos, con resultado documentado.
  - Hallazgos corregidos o registrados como riesgo aceptado.
- **Refs:** [CLAUDE.md §3]
- **Test:** `pnpm audit --prod --audit-level high && uv run --directory services/solver pip-audit`

#### T6.3 — Observabilidad y errores
- **Archivos:** `src/infrastructure/logging/logger.ts`, `src/app/{error.tsx, not-found.tsx}`, `src/solver/api/logging.py`, tests.
- **Criterios de aceptación:**
  - Logs JSON estructurados con un `requestId` que se propaga de la web al solver (`X-Request-Id`).
  - Un test comprueba que no se registran contraseñas, tokens ni cuerpos del contrato.
  - Páginas de error sin trazas internas en producción.
- **Refs:** [CLAUDE.md §3.4], [RG-05]
- **Test:** `pnpm --filter web exec vitest run --project unit src/infrastructure/logging && uv run --directory services/solver pytest tests/unit/test_logging.py`

#### T6.4 — Copias de seguridad y restauración
- **Archivos:** `scripts/{backup.sh, restore.sh}`, sección en `docs/despliegue.md`.
- **Criterios de aceptación:**
  - `backup.sh` genera un `pg_dump` comprimido y con fecha.
  - `restore.sh` lo restaura en una BD vacía.
  - Una prueba de ida y vuelta conserva el horario vigente.
- **Refs:** [02 §1.4]
- **Test:** `./scripts/backup.sh && ./scripts/restore.sh --verify`

#### T6.5 — Matriz de trazabilidad
- **Archivos:** `scripts/traceability.ts`, `docs/trazabilidad.md` (generado).
- **Criterios de aceptación:**
  - El script extrae los IDs de la spec 01 (`RG`, `MH`, `ENT`, `NL`, `PV`, `RD`, `RB`, `MR`, `VIS`, `EDI`,
    `IO`, `TFM` e `INV`) y los busca en los tests de web y solver.
  - Genera la tabla requisito → tests.
  - Termina con un código distinto de 0 si algún requisito no tiene test.
- **Refs:** [01 §0.1], [CLAUDE.md §5.5]
- **Test:** `pnpm tsx scripts/traceability.ts --check`

#### T6.6 — Diagramas de arquitectura
- **Archivos:** `docs/diagrams/{c4-contexto.md, c4-contenedores.md, er.md, secuencia-login.md, secuencia-calculo.md, modelo-cp-sat.md}` (Mermaid).
- **Criterios de aceptación:**
  - Los diagramas coinciden con la implementación final: los nombres de tablas y endpoints se comprueban
    a mano y quedan listados en el PR.
  - Se renderizan en GitHub.
- **Refs:** [02 §1, §2.8, §4, §5.1]
- **Test:** `npx -y @mermaid-js/mermaid-cli -i docs/diagrams/c4-contenedores.md -o /tmp/c4.svg` (repetido para cada diagrama, sin errores)

#### T6.7 — README completo
- **Archivos:** `README.md`.
- **Criterios de aceptación:** contiene, como mínimo:
  - título, resumen y objetivos del TFM;
  - stack y justificación, con enlaces a los ADR;
  - diagrama de arquitectura;
  - arranque rápido (`docker compose up`) y credenciales demo [TFM-01];
  - estructura del repositorio;
  - metodología SDD con enlaces a las specs;
  - cómo ejecutar cada tipo de test y la cobertura obtenida;
  - seguridad (resumen);
  - limitaciones y trabajo futuro;
  - licencia y autoría.
  - Todos los enlaces internos funcionan.
- **Refs:** [TFM-01], [CLAUDE.md]
- **Test:** `npx -y markdown-link-check README.md`

#### T6.8 — Guía de despliegue
- **Archivos:** `docs/despliegue.md`.
- **Criterios de aceptación:**
  - Requisitos del servidor.
  - Variables de entorno (enlazando `.env.example`) y generación segura de secretos.
  - Despliegue en un VPS con proxy inverso y TLS.
  - Migraciones, actualización de versión, copias de seguridad (T6.4) y resolución de problemas frecuentes.
  - Una persona ajena al proyecto puede seguirla en una máquina limpia (validación manual registrada).
- **Refs:** [02 §1.4, §5.7]
- **Test:** `npx -y markdown-link-check docs/despliegue.md`

#### T6.9 — Guion de slides y vídeo
- **Archivos:** `docs/defensa/{guion-slides.md, guion-video.md, demo-checklist.md}`.
- **Criterios de aceptación:**
  - Guion de slides de 15–20 min: problema, objetivos, SDD, arquitectura, modelo CP-SAT, seguridad,
    demo, resultados (métricas, cobertura, rendimiento), conclusiones y trabajo futuro.
  - Guion de vídeo con tiempos por escena, que recorre la demo sobre el seed con los tres roles.
  - Checklist previa a la demo: entorno, datos y plan B si falla la red.
- **Refs:** [TFM-01]
- **Test:** `npx -y markdown-link-check docs/defensa/*.md`

#### T6.10 — Versión 1.0.0
- **Archivos:** `CHANGELOG.md`, etiqueta `v1.0.0`.
- **Criterios de aceptación:**
  - Toda la suite pasa en CI: unit, integración, solver con cobertura, E2E y benchmark.
  - Las specs 01–03 están en estado **Implementada**.
  - El CHANGELOG resume los hitos.
- **Refs:** [CLAUDE.md §4.3]
- **Test:** `pnpm check && pnpm test && pnpm test:e2e && uv run --directory services/solver pytest --cov=solver -m "not slow or slow"`
