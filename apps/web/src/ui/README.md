# Capa de interfaz

Componentes de React reutilizables: la rejilla horaria, formularios, el layout y los componentes de
shadcn/ui (`components/ui`). Solo presentación: **sin lógica de negocio** (CLAUDE.md §2).

- **Puede depender de:** `application` (tipos y DTO) y `domain` (tipos y funciones puras).
- **No puede importar:** `infrastructure` ni Prisma.
- **Se prueba con:** Vitest + React Testing Library (`*.test.tsx`).

ESLint hace cumplir estas reglas (`eslint.config.mjs`, verificado en `test/eslint-rules.test.ts`).
