/**
 * T1.3 — El proyecto Vitest `unit` se ejecuta en jsdom (componentes de React y lógica de dominio).
 */
import { describe, expect, it } from "vitest";

describe("T1.3 proyecto unit", () => {
  it("se ejecuta en un entorno jsdom con DOM disponible", () => {
    expect(typeof window).toBe("object");
    expect(document.createElement("div").tagName).toBe("DIV");
  });
});
