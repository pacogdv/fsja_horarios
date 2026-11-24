# ADR-0010 — Registro de dependencias

- **Fecha:** 2026-11-22
- **Hito / tarea:** T1.1 (lo amplían T2.1, T4.1 y T5.1)
- **Specs relacionadas:** `CLAUDE.md` §1 y §5 (regla 6); `specs/02-architecture-plan.md` §7

## Estado

**Aceptado**

## Contexto

`CLAUDE.md` §5 (regla 6) prohíbe introducir dependencias sin un ADR. En lugar de un ADR por librería, este
documento es el **registro único** de dependencias aprobadas. Cada hito lo amplía con una nueva sección
antes de instalar nada. Las decisiones con alternativas relevantes (por ejemplo la librería de PDF,
ADR-0011) tienen además su propio ADR.

Criterios de admisión de una dependencia:
1. Licencia permisiva (MIT, Apache-2.0 o BSD), compatible con un TFM publicable.
2. Mantenimiento activo y comunidad amplia.
3. Necesidad real: no se añade lo que se resuelve con la plataforma o con poco código propio.
4. Sin dependencias nativas problemáticas en las imágenes Docker. Si las tiene, se justifica.

## Decisión

### Política de versiones

- Las versiones exactas las fija el lockfile (`pnpm-lock.yaml` y `uv.lock`). En los manifiestos se usan
  rangos compatibles con la versión estable vigente al instalar. Se instalan versiones publicadas hace al
  menos dos semanas.
- Las actualizaciones mayores requieren una entrada nueva en este registro.
- CI audita las dependencias en el hito 6 (`pnpm audit` y `pip-audit`, T6.2).

### Hito 1 — Dependencias aprobadas

**Herramientas del monorepo**

| Dependencia | Ámbito | Licencia | Uso | Alternativa descartada |
|-------------|--------|----------|-----|------------------------|
| pnpm | Raíz (gestor JS) | MIT | Workspaces y lockfile estricto | npm/yarn: peor aislamiento de dependencias fantasma |
| uv | `services/solver` | MIT / Apache-2.0 | Entorno, dependencias y lockfile de Python | Poetry: más lento; pip-tools: sin gestión de entorno |

**`apps/web`, producción**

| Dependencia | Ámbito | Licencia | Uso | Alternativa descartada |
|-------------|--------|----------|-----|------------------------|
| Next.js | web | MIT | Framework (App Router), BFF, Server Actions | Impuesto por `CLAUDE.md` §1.2 |
| React | web | MIT | UI (dependencia de Next.js) | — |
| React DOM | web | MIT | Renderizado de React en el navegador (dependencia de Next.js) | — |
| TypeScript | web (dev) | Apache-2.0 | Tipado estricto | Impuesto por `CLAUDE.md` §1.2 |
| Tailwind CSS | web | MIT | Estilos con tokens de diseño | Impuesto por `CLAUDE.md` §1.2 |
| shadcn/ui | web | MIT | Componentes accesibles copiados al repo (Radix UI) | Impuesto por `CLAUDE.md` §1.2 |
| Radix UI | web | MIT | Primitivas accesibles (dependencia de shadcn/ui) | — |
| TanStack Query | web | MIT | Caché y estado de servidor en el cliente | Impuesto por `CLAUDE.md` §1.2 |
| Zod | web | MIT | Validación de entradas, entorno y contrato | Impuesto por `CLAUDE.md` §1.2 |
| Prisma | web | Apache-2.0 | ORM y migraciones (ADR-0001) | Drizzle (ver ADR-0001) |
| @node-rs/argon2 | web | MIT | Hash Argon2id (ADR-0002) | `argon2` (node-gyp): requiere toolchain de compilación en la imagen; bcrypt: menos resistente a GPU |

**`apps/web`, desarrollo y tests**

| Dependencia | Ámbito | Licencia | Uso | Alternativa descartada |
|-------------|--------|----------|-----|------------------------|
| ESLint | web (dev) | MIT | Lint y reglas de capas | — |
| eslint-config-next | web (dev) | MIT | Reglas de Next.js, React, hooks, accesibilidad (jsx-a11y) y TypeScript (incluye typescript-eslint, que aporta `no-explicit-any`) | Configurar cada plugin a mano: más mantenimiento y riesgo de omitir reglas de accesibilidad |
| @tailwindcss/postcss | web (dev) | MIT | Plugin PostCSS de Tailwind CSS v4 (parte de Tailwind) | — |
| @types/node, @types/react, @types/react-dom | web (dev) | MIT | Tipos para TypeScript estricto | — |
| Vitest | web (dev) | MIT | Tests unitarios y de integración | Jest: configuración ESM/TS más costosa |
| Testing Library | web (dev) | MIT | Tests de componentes (`@testing-library/react`, `user-event`, `jest-dom`) | Enzyme: abandonado |
| jsdom | web (dev) | MIT | Entorno DOM para Vitest | happy-dom: menos fiel |
| Playwright | web (dev) | Apache-2.0 | Tests E2E | Cypress: peor soporte multi-navegador y paralelismo |

**`services/solver`, producción**

| Dependencia | Ámbito | Licencia | Uso | Alternativa descartada |
|-------------|--------|----------|-----|------------------------|
| FastAPI | solver | MIT | API HTTP | Impuesto por `CLAUDE.md` §1.3 |
| Pydantic | solver | MIT | Contrato v2 y validación | Impuesto por `CLAUDE.md` §1.3 |
| pydantic-settings | solver | MIT | Variables de entorno tipadas | `os.environ` a mano: sin validación |
| Uvicorn | solver | BSD-3-Clause | Servidor ASGI | Hypercorn: menos extendido |
| OR-Tools | solver | Apache-2.0 | CP-SAT | Impuesto por `CLAUDE.md` §1.3 |

**`services/solver`, desarrollo y tests**

| Dependencia | Ámbito | Licencia | Uso | Alternativa descartada |
|-------------|--------|----------|-----|------------------------|
| httpx2 | solver (dev) | BSD-3-Clause | Cliente HTTP del `TestClient` de FastAPI/Starlette | HTTPX: Starlette ≥ 1.10 lo declara obsoleto para `TestClient` |
| pytest | solver (dev) | MIT | Tests | unittest: más verboso |
| pytest-cov | solver (dev) | MIT | Cobertura ≥ 90 % (`CLAUDE.md` §4.1) | — |
| ruff | solver (dev) | MIT | Lint y formato | flake8 + black + isort: tres herramientas |
| mypy | solver (dev) | MIT | `--strict` (`CLAUDE.md` §1.3) | pyright: menos habitual en el ecosistema Python |

**Imágenes base Docker (T1.6)**

| Dependencia | Ámbito | Licencia | Uso | Alternativa descartada |
|-------------|--------|----------|-----|------------------------|
| `postgres:16-alpine` | `db` | PostgreSQL License | Base de datos (spec 02 §1.4) | Imagen Debian: mayor tamaño y superficie |
| `python:3.12-slim` | `services/solver` | PSF-2.0 | Runtime del solver (spec 02 §1.3) | Alpine: OR-Tools no publica *wheels* para musl |
| `ghcr.io/astral-sh/uv:0.13.7` | `services/solver` (solo build) | MIT / Apache-2.0 | Copia el binario de uv para instalar desde `uv.lock` | `pip install uv`: una capa y una descarga más |
| `node:22-alpine` | `apps/web` | MIT | Build y runtime de Next.js (salida standalone) | `node:22-slim`: mayor tamaño |

Las etiquetas fijan la versión mayor (y la menor de uv). La política de antigüedad mínima se aplica a la
versión de uv; las imágenes oficiales se reconstruyen con parches de seguridad bajo la misma etiqueta.

### Hitos posteriores (pendientes de aprobar en su tarea)

| Tarea | Dependencias previstas |
|-------|------------------------|
| T2.1 | `hypothesis` (dev, solver) |
| T4.1 | `@dnd-kit/core`, `ajv` (dev, web) |
| T5.1 | `exceljs`, librería de PDF (ADR-0011), `@axe-core/playwright` (dev, web) |

## Alternativas consideradas

| Alternativa | A favor | En contra | Motivo del descarte |
|-------------|---------|-----------|---------------------|
| Un ADR por dependencia | Máximo detalle | Decenas de documentos casi vacíos; difícil de revisar en conjunto | Se reserva el ADR propio para decisiones con alternativas reales |
| Sin registro (solo los lockfiles) | Cero esfuerzo | No justifica nada; incumple `CLAUDE.md` §5 | No permitido |

## Consecuencias

- **Positivas:** una sola vista de qué se usa, por qué y con qué licencia. Sirve de anexo para la defensa.
- **Negativas / riesgos aceptados:** hay que mantener el registro al día. Se mitiga con la regla de revisar
  `package.json` y `pyproject.toml` contra este documento en cada revisión de hito.
- **Seguimiento:** el script de verificación de ADR (`scripts/check-adrs.sh`) comprueba que las
  dependencias de H1 están registradas.

## Historial

- **2026-11-22 (T1.3):** se añaden React DOM, eslint-config-next, @tailwindcss/postcss y los paquetes `@types/*`, que el andamiaje de `apps/web` necesita y no estaban registrados.
- **2026-11-22 (T1.3):** versiones mayores fijadas por compatibilidad. Se usa **ESLint 9**, porque los
  plugins de `eslint-config-next` (`import`, `jsx-a11y`, `react`) aún no admiten ESLint 10. Se usa
  **TypeScript 6.0**, porque typescript-eslint exige `< 6.1` y TypeScript 7 (compilador nativo) no está
  soportado. `@types/node` se alinea con el runtime (Node 22). Se revisará al subir de versión mayor,
  cuando el ecosistema lo admita (`pnpm peers check` sin avisos).
- **2026-11-22 (T1.5):** se sustituye HTTPX por **httpx2** (sucesor mantenido por la organización de Pydantic, mismo autor y licencia), porque Starlette 1.10 declara obsoleto `httpx` en `TestClient`.
- **2026-11-24 (T1.6):** se registran las imágenes base Docker. uv se fija en 0.13.7, la última 0.13.x con
  al menos dos semanas de antigüedad (compatible con `uv_build>=0.13,<0.14`).
