/**
 * T1.4 — El entorno es solo de servidor: getEnv() se niega a ejecutarse en el navegador.
 * Este archivo se ejecuta en el proyecto `unit` (jsdom), donde existe `window`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvForTests } from "./env";

describe("T1.4 getEnv en el navegador", () => {
  afterEach(() => resetEnvForTests());

  it("lanza un error explícito en lugar de leer process.env", () => {
    expect(typeof window).toBe("object");
    expect(() => getEnv()).toThrow(/solo de servidor/);
  });
});
