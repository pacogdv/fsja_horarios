# Capa de dominio

Entidades, value objects, invariantes y reglas del dominio escolar (specs/01-domain-spec.md), en
TypeScript puro: sin E/S, sin framework y sin base de datos.

- **Puede depender de:** nada fuera de `src/domain`.
- **No puede importar:** `application`, `infrastructure`, `ui`, `app`, `lib`, Prisma, Next.js ni React.
  Tampoco puede usar `fetch`.
- **Se prueba con:** tests unitarios de Vitest (`*.test.ts`) junto al código.

ESLint hace cumplir estas reglas (`eslint.config.mjs`, verificado en `test/eslint-rules.test.ts`).
