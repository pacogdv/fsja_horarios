// @vitest-environment node
/**
 * T1.4 — El servidor valida el entorno al arrancar y no arranca si es inválido (02 §5.4).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvForTests } from "@/lib/env";
import { register } from "./instrumentation";

const VALID = {
  APP_ENV: "development",
  APP_ORIGIN: "http://localhost:3000",
  RATE_LIMIT_KEY_SECRET: "a".repeat(32),
  DATABASE_URL: "postgresql://fsja:clave@db:5432/fsja",
  SOLVER_URL: "http://solver:8000",
  SOLVER_SERVICE_TOKEN: "a".repeat(32),
};

function stubEnv(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

describe("T1.4 instrumentation.register", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetEnvForTests();
  });

  it("en el runtime de Node, un entorno inválido termina el proceso (Next.js captura los errores de register)", async () => {
    const leaked = "token-secreto-corto";
    stubEnv({ ...VALID, NEXT_RUNTIME: "nodejs", SOLVER_SERVICE_TOKEN: leaked });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(register()).rejects.toThrow("process.exit");

    expect(exit).toHaveBeenCalledWith(1);
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("SOLVER_SERVICE_TOKEN");
    expect(logged).not.toContain(leaked);
  });

  it("los errores que no son de entorno se propagan sin terminar el proceso", async () => {
    stubEnv({ ...VALID, NEXT_RUNTIME: "nodejs" });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const env = await import("@/lib/env");
    vi.spyOn(env, "getEnv").mockImplementation(() => {
      throw new TypeError("fallo inesperado");
    });
    await expect(register()).rejects.toThrow(TypeError);
    expect(exit).not.toHaveBeenCalled();
  });

  it("en el runtime de Node, un entorno válido arranca", async () => {
    stubEnv({ ...VALID, NEXT_RUNTIME: "nodejs" });
    await expect(register()).resolves.toBeUndefined();
  });

  it("en el runtime edge no valida (no tiene acceso a los secretos del servidor)", async () => {
    stubEnv({ NEXT_RUNTIME: "edge" });
    await expect(register()).resolves.toBeUndefined();
  });

  it("instrumentation.ts no usa APIs exclusivas de Node: se compila también para edge (aviso de next build)", () => {
    // El código de Node vive en instrumentation-node.ts y se importa solo dentro de la rama `nodejs`.
    const source = readFileSync(fileURLToPath(new URL("./instrumentation.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/process\.exit/);
    expect(source).toMatch(/process\.env\.NEXT_RUNTIME === "nodejs"/);
    expect(source).toMatch(/await import\("\.\/instrumentation-node"\)/);
  });
});
