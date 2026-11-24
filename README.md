# FSJA Horarios

Aplicación web para generar y gestionar horarios escolares en centros de Infantil, Primaria, ESO y
Bachillerato, con un motor de optimización basado en Google OR-Tools (CP-SAT).

> **Estado:** en desarrollo (Hito 1). Este README es un esqueleto y se completa en la tarea T6.7.

## Metodología

El proyecto sigue **Spec-Driven Development**. Las especificaciones de [`specs/`](specs/) son la única
fuente de verdad:

- [`specs/01-domain-spec.md`](specs/01-domain-spec.md): especificación funcional del dominio.
- [`specs/02-architecture-plan.md`](specs/02-architecture-plan.md): plan de arquitectura.
- [`specs/03-tasks.md`](specs/03-tasks.md): plan de tareas por hitos.

Las reglas permanentes del proyecto están en [`CLAUDE.md`](CLAUDE.md) y las decisiones de arquitectura en
[`docs/adr/`](docs/adr/).

## Requisitos

- Node.js 22 (ver [`.node-version`](.node-version)) y pnpm (versión fijada en `package.json`, vía Corepack).
- uv (Python 3.12+), para `services/solver`.
- Docker con Docker Compose.

## Comandos

| Comando | Qué hace |
|---------|----------|
| `pnpm check` | Lint y tipos de web y solver, más los tests de [`scripts/tests/`](scripts/tests/) (ADR, raíz del monorepo y Docker Compose) |
| `pnpm lint` / `pnpm typecheck` | Solo lint o solo tipos |
| `pnpm test` | Tests unitarios de web (con cobertura: `src/domain` y `src/application` ≥ 90 %) y solver |
| `pnpm --filter web run db:seed` | Seed de usuarios de demo (requiere `APP_ENV` development o test, `DATABASE_URL` y las variables `SEED_*` en el entorno; ver abajo) |
| `pnpm --filter web run test:integration` | Tests de integración de la web contra PostgreSQL. Requieren `docker compose up -d db` y `TEST_DATABASE_URL` en `.env` (la BD `fsja_test` se borra y recrea en cada ejecución) |
| `pnpm --filter web run test:coverage:full` | Tests unitarios y de integración de la web con cobertura (≥ 90 % en `src/domain`, `src/application`, `src/infrastructure` y `prisma/seed`). Mismos requisitos que el anterior |
| `pnpm test:e2e` | Tests E2E (Playwright) |
| `pnpm dev` | Arranca la web y el solver (en `127.0.0.1:8000`) en modo desarrollo |

Todos delegan en [`scripts/check.sh`](scripts/check.sh).

**Windows:** los scripts son de bash. pnpm los lanza con `cmd.exe`, que no sabe ejecutarlos, así que hay
que indicarle la shell de Git Bash (una sola vez, en la configuración de usuario de pnpm):

```sh
pnpm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"
```

O ejecuta directamente `./scripts/check.sh <tarea>` desde Git Bash.

## Arranque con Docker

```sh
cp .env.example .env    # rellena los secretos vacíos (ver los comentarios del archivo)
docker compose up -d --build --wait
./scripts/compose-smoke.sh   # opcional: comprueba salud y aislamiento de red
```

La web queda en <http://localhost:3000>, publicada solo en `127.0.0.1`. El solver y la base de datos no
publican puertos: solo son accesibles desde la red interna de Docker.

Al arrancar, `web` aplica las migraciones (`prisma migrate deploy`). Si fallan, no arranca.

### Usuarios de demostración

Con `SEED_ON_START=true` en `.env` (y `APP_ENV=development`), `web` crea al arrancar un usuario por rol. Las
credenciales son las de las variables `SEED_*`: los correos tienen valores de ejemplo en `.env.example`, y las
contraseñas las eliges tú (al menos 12 caracteres).

| Rol | Correo (por defecto) | Contraseña |
|-----|----------------------|------------|
| `ADMIN_DIRECCION` | `admin@demo.local` | `SEED_ADMIN_PASSWORD` |
| `DOCENTE` | `docente@demo.local` | `SEED_TEACHER_PASSWORD` |
| `INVITADO_DEMO` | `invitado@demo.local` | `SEED_GUEST_PASSWORD` |

El seed nunca se ejecuta con `APP_ENV=production` (TFM-02). Es idempotente: arrancar de nuevo no duplica
usuarios y restaura los de demo si se han modificado.
