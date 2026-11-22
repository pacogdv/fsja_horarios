# Capa de infraestructura

**Adaptadores** que implementan los puertos de `application`: repositorios Prisma (único lugar donde se
usa Prisma, ADR-0001), cliente HTTP del solver, Argon2id, sesiones, rate limiting, exportadores…

- **Puede depender de:** `application` y `domain`.
- **No puede importar:** `ui` ni `app`.
- **Solo la instancia:** `src/lib/container.ts` (composition root).
- **Se prueba con:** tests de integración (`*.int.test.ts`) contra PostgreSQL o servidores falsos.

ESLint hace cumplir estas reglas (`eslint.config.mjs`, verificado en `test/eslint-rules.test.ts`).
