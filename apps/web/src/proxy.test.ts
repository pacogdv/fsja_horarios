/**
 * Punto de entrada del proxy de Next.js (specs/02-architecture-plan.md §5.3 y §5.5; T1.14).
 * Entorno node: el proxy corre en el servidor y `getEnv()` rechaza ejecutarse donde existe `window`.
 *
 * @vitest-environment node
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvForTests } from "@/lib/env";
import { config, proxy } from "./proxy";

const VALID_ENV = {
  APP_ENV: "production",
  APP_ORIGIN: "https://horarios.example",
  TRUSTED_PROXY_HOPS: "1",
  RATE_LIMIT_KEY_SECRET: "r".repeat(32),
  DATABASE_URL: "postgresql://user:pass@db:5432/fsja",
  SOLVER_URL: "http://solver:8000",
  SOLVER_SERVICE_TOKEN: "s".repeat(32),
};

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

/** El matcher es un único grupo regex de path-to-regexp, así que también es una expresión regular válida. */
function matches(pathname: string): boolean {
  expect(config.matcher).toHaveLength(1);
  return new RegExp(`^${config.matcher[0]}$`).test(pathname);
}

describe("config.matcher", () => {
  it.each(["/", "/login", "/mi-horario", "/api/runs/1", "/horarios/1/editor"])("aplica el proxy en %s", (path) => {
    expect(matches(path)).toBe(true);
  });

  it.each(["/_next/static/chunks/main.js", "/_next/image", "/favicon.ico"])(
    "excluye el recurso estático %s (no es un documento: la CSP no aplica)",
    (path) => {
      expect(matches(path)).toBe(false);
    },
  );
});

describe("proxy", () => {
  it("usa APP_ENV del entorno validado (HSTS en production)", () => {
    for (const [key, value] of Object.entries(VALID_ENV)) vi.stubEnv(key, value);
    vi.stubEnv("NODE_ENV", "production");
    const response = proxy(new NextRequest("https://horarios.example/login"));
    expect(response.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains");
    expect(response.headers.get("content-security-policy")).not.toContain("'unsafe-eval'");
  });

  it("solo permite 'unsafe-eval' con NODE_ENV=development (next dev)", () => {
    for (const [key, value] of Object.entries({ ...VALID_ENV, APP_ENV: "development", TRUSTED_PROXY_HOPS: "0" })) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv("NODE_ENV", "development");
    const response = proxy(new NextRequest("https://horarios.example/login"));
    expect(response.headers.get("content-security-policy")).toContain("'unsafe-eval'");
    expect(response.headers.has("strict-transport-security")).toBe(false);
  });
});
