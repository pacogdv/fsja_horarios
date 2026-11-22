# Utilidades transversales y composition root

- `container.ts`: **composition root**. Es el único archivo fuera de `infrastructure` que puede
  importar adaptadores. Los instancia y se los entrega a los casos de uso.
- Utilidades sin lógica de negocio (configuración del cliente de TanStack Query, variables de entorno
  validadas con Zod en T1.4, textos de la interfaz).

- **Puede depender de:** `application` y `domain`. Solo `container.ts` puede depender también de `infrastructure`.
- **No puede importar:** Prisma (salvo a través de `infrastructure`).

ESLint hace cumplir estas reglas (`eslint.config.mjs`, verificado en `test/eslint-rules.test.ts`).
