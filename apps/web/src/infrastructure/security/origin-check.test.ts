// @vitest-environment node
/**
 * T1.13 — Comprobación de `Origin` en mutaciones de Route Handlers (CSRF).
 * Refs: specs/02-architecture-plan.md §5.6; CLAUDE.md §3.4.
 */
import { describe, expect, it } from "vitest";
import { isTrustedOrigin } from "./origin-check";

const APP_ORIGIN = "https://horarios.example";
const requestWith = (method: string, origin?: string) =>
  new Request("https://horarios.example/api/x", { method, headers: origin === undefined ? {} : { origin } });

describe("T1.13 origin-check [02 §5.6]", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE", "post"])("acepta %s con Origin igual a APP_ORIGIN", (method) => {
    expect(isTrustedOrigin(requestWith(method, APP_ORIGIN), APP_ORIGIN)).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("rechaza %s sin cabecera Origin", (method) => {
    expect(isTrustedOrigin(requestWith(method), APP_ORIGIN)).toBe(false);
  });

  it.each([
    ["otro dominio", "https://atacante.example"],
    ["un subdominio", "https://evil.horarios.example"],
    ["otro esquema", "http://horarios.example"],
    ["otro puerto", "https://horarios.example:8443"],
    ["un dominio que lo contiene como prefijo", "https://horarios.example.atacante.example"],
    ["Origin opaco (null)", "null"],
    ["un valor que no es un origen", "no es un origen"],
    ["vacío", ""],
  ])("rechaza una mutación desde %s", (_case, origin) => {
    expect(isTrustedOrigin(requestWith("POST", origin), APP_ORIGIN)).toBe(false);
  });

  it("normaliza el origen (mayúsculas y puerto por defecto) antes de comparar", () => {
    expect(isTrustedOrigin(requestWith("POST", "HTTPS://HORARIOS.EXAMPLE:443"), APP_ORIGIN)).toBe(true);
  });

  it.each(["GET", "HEAD", "OPTIONS"])("no exige Origin en %s (ningún GET tiene efectos secundarios)", (method) => {
    expect(isTrustedOrigin(requestWith(method), APP_ORIGIN)).toBe(true);
  });
});
