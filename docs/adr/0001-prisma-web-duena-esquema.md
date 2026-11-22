# ADR-0001 — Prisma como ORM y `apps/web` como única dueña del esquema de BD

- **Fecha:** 2026-11-22
- **Hito / tarea:** T1.1
- **Specs relacionadas:** `CLAUDE.md` §1.2 y §1.4; `specs/02-architecture-plan.md` §2 y §3.1

## Estado

**Aceptado**

## Contexto

El sistema tiene dos procesos con lógica propia: la web (Next.js, TypeScript) y el solver (FastAPI,
Python). Si ambos accedieran a PostgreSQL, el esquema tendría dos dueños, dos juegos de migraciones y dos
modelos que mantener sincronizados. Además, el solver hace un trabajo puro (entrada → solución) que no
necesita persistencia, y darle acceso a la BD ampliaría la superficie de ataque (RG-05, `CLAUDE.md` §3).

En la web hace falta un acceso a datos tipado, con consultas parametrizadas por defecto y migraciones
versionadas y reproducibles.

## Decisión

1. `apps/web` es la **única** dueña del esquema de PostgreSQL y de sus migraciones.
2. Se usa **Prisma** como ORM y herramienta de migraciones (`prisma migrate`).
3. Las restricciones que Prisma no expresa (`EXCLUDE USING gist`, índices únicos parciales,
   `CHECK (num_nonnulls(...))`, triggers) se añaden como SQL manual **dentro** de la migración
   correspondiente, y se comprueban con tests de integración.
4. El solver **no** tiene credenciales ni red hacia la BD. Recibe todo lo que necesita en un `SolverInput`
   JSON tipado y devuelve un `SolverOutput` (contrato en `specs/02-architecture-plan.md` §3).
5. Solo los repositorios de `src/infrastructure/db` usan Prisma. `$queryRawUnsafe` está prohibido por
   lint, y `$queryRaw` solo se permite como plantilla etiquetada (parametrizada).

## Alternativas consideradas

| Alternativa | A favor | En contra | Motivo del descarte |
|-------------|---------|-----------|---------------------|
| Drizzle ORM | Más cercano a SQL, ligero, buen tipado | Migraciones menos maduras y generador de esquema menos establecido; menos documentación para un TFM | Prisma ofrece un flujo de migraciones más probado y legible para la defensa |
| SQL directo (`pg` + consultas a mano) | Control total | Más código repetitivo; más riesgo de consultas no parametrizadas; sin tipado generado | Más superficie de error y de inyección |
| El solver también accede a la BD (SQLAlchemy) | Evita serializar el problema | Dos dueños del esquema; el solver necesitaría credenciales; acoplamiento entre servicios | Contrario al aislamiento del solver y a la minimización de datos (RG-05) |

## Consecuencias

- **Positivas:**
  - Una sola fuente de verdad del esquema.
  - Consultas parametrizadas por defecto (protección frente a SQL Injection).
  - Solver sin estado, fácil de testear y aislable en red.
  - Las ejecuciones son reproducibles a partir de `input_snapshot`.
- **Negativas / riesgos aceptados:**
  - Parte del esquema vive en SQL manual, fuera del DSL de Prisma, y puede divergir. Se mitiga con
    `prisma migrate diff` en CI y con tests de integración de cada restricción (T1.7, T3.1).
  - Hay que construir y validar un JSON grande por ejecución (T4.3).
- **Seguimiento:** si el tamaño de `SolverInput` superase el límite de 5 MB en centros reales, se revisaría
  la compresión o el envío por partes.
