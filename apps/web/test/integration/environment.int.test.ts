/**
 * T1.3 — El proyecto Vitest `integration` se ejecuta en node (BD, repositorios, casos de uso).
 */
import { describe, expect, it } from "vitest";

describe("T1.3 proyecto integration", () => {
  it("se ejecuta en un entorno node sin DOM", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof process.versions.node).toBe("string");
  });
});
