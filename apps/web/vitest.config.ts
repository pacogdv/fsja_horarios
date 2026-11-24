import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Solo con --coverage (`pnpm test:coverage`, que ejecuta `pnpm test` en la raíz). specs/03-tasks.md §0.3.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/infrastructure/db/generated/**"],
      reporter: ["text-summary", "text"],
      // El dominio es TS puro y se cubre con tests unitarios. La infraestructura (BD, red) se cubre con los
      // tests de integración, que no cuentan aquí.
      thresholds: {
        "src/domain/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
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
});
