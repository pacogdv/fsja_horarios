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
| `pnpm check` | Lint y tipos de web y solver, más los tests del verificador de ADR |
| `pnpm lint` / `pnpm typecheck` | Solo lint o solo tipos |
| `pnpm test` | Tests unitarios de web y solver |
| `pnpm test:e2e` | Tests E2E (Playwright) |
| `pnpm dev` | Arranca la web y el solver (en `127.0.0.1:8000`) en modo desarrollo |

Todos delegan en [`scripts/check.sh`](scripts/check.sh).
