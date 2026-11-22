# Capa de aplicación

Casos de uso (por ejemplo `login`, `launch-run`) y **puertos**: interfaces que describen lo que los casos
de uso necesitan del exterior (repositorios, pasarela del solver, reloj, hasher…). Aquí se definen los
DTO de entrada con Zod.

- **Puede depender de:** `domain`.
- **No puede importar:** `infrastructure`, `ui`, `app`, Prisma, Next.js ni React.
- **Se prueba con:** tests unitarios con *fakes* de los puertos, y tests de integración (`*.int.test.ts`)
  cuando intervienen adaptadores reales.

ESLint hace cumplir estas reglas (`eslint.config.mjs`, verificado en `test/eslint-rules.test.ts`).
