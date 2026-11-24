import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const STRICT = { lines: 90, branches: 90, functions: 90, statements: 90 };

/**
 * Cobertura (solo con --coverage; specs/03-tasks.md §0.3):
 * - `pnpm test:coverage` (lo ejecuta `pnpm test` en la raíz): proyecto unit, umbral en src/domain y
 *   src/application (casos de uso como el login), que se cubren con tests unitarios y fakes de los puertos.
 * - `pnpm test:coverage:full` (`--mode full`, requiere la BD; CI): unit + integración, con umbral también en
 *   src/infrastructure, que solo cubren los tests de integración (BD, red).
 */
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/infrastructure/db/generated/**"],
      reporter: ["text-summary", "text"],
      thresholds: {
        "src/domain/**": STRICT,
        "src/application/**": STRICT,
        ...(mode === "full" ? { "src/infrastructure/**": STRICT } : {}),
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["test/setup-dom.ts"],
          include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
          exclude: ["**/*.int.test.{ts,tsx}", "test/lint-fixtures/**", "e2e/**", "node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          // Recrea fsja_test y le aplica las migraciones (T1.7).
          globalSetup: ["test/integration/global-setup.ts"],
          // Los tests comparten la BD: se ejecutan en serie para no interferir entre sí.
          fileParallelism: false,
          include: ["src/**/*.int.test.ts", "test/**/*.int.test.ts", "prisma/**/*.int.test.ts"],
        },
      },
    ],
  },
}));
