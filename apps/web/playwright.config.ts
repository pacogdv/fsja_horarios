/**
 * Playwright (specs/03-tasks.md T1.17). Los E2E se ejecutan contra el stack de Docker ya arrancado, en
 * desarrollo y con el seed (README, «Tests E2E»). Así prueban la imagen real: proxy, CSP, migraciones y seed.
 *
 * - Un solo worker y sin reintentos: los tests comparten la BD (cuentas, sesiones, límites) y un reintento podría
 *   esconder un fallo de seguridad intermitente.
 * - El proyecto `setup` inicia sesión una vez por rol (e2e/auth.setup.ts).
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "es-ES",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
  ],
});
