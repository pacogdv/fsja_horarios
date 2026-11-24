/**
 * CSP con nonce por petición (specs/02-architecture-plan.md §5.5; ADR-0009; T1.14).
 */
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, generateNonce } from "./csp";

/** Directivas de la CSP como mapa `nombre → valores`. */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .map((part) => {
        const [name = "", ...values] = part.split(/\s+/);
        return [name, values];
      }),
  );
}

const NONCE = "AAECAwQFBgcICQoLDA0ODw==";

describe("generateNonce", () => {
  it("genera 128 bits aleatorios en base64", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(Buffer.from(nonce, "base64")).toHaveLength(16);
  });

  it("es distinto en cada llamada", () => {
    const nonces = new Set(Array.from({ length: 1000 }, generateNonce));
    expect(nonces.size).toBe(1000);
  });
});

describe("buildContentSecurityPolicy", () => {
  it("contiene exactamente las directivas de 02 §5.5", () => {
    const csp = directives(buildContentSecurityPolicy({ nonce: NONCE, allowEval: false }));
    expect(Object.fromEntries(csp)).toEqual({
      "default-src": ["'self'"],
      "script-src": ["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'self'"],
      "connect-src": ["'self'"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "object-src": ["'none'"],
      "upgrade-insecure-requests": [],
    });
  });

  it("es una sola línea (valor de cabecera válido)", () => {
    expect(buildContentSecurityPolicy({ nonce: NONCE, allowEval: false })).not.toMatch(/[\r\n]/);
  });

  it("nunca permite scripts inline: el nonce es la única excepción (ADR-0009)", () => {
    const scriptSrc = directives(buildContentSecurityPolicy({ nonce: NONCE, allowEval: false })).get("script-src");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("solo añade 'unsafe-eval' a script-src cuando se pide (next dev)", () => {
    const csp = directives(buildContentSecurityPolicy({ nonce: NONCE, allowEval: true }));
    expect(csp.get("script-src")).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'", "'unsafe-eval'"]);
    expect(csp.get("script-src")).not.toContain("'unsafe-inline'");
  });

  it.each([
    ["vacío", ""],
    ["con comillas (rompería la directiva)", "abc'; script-src *"],
    ["con punto y coma", "abc;def"],
    ["con salto de línea (inyección de cabeceras)", "abc\r\nSet-Cookie: x=1"],
    ["con espacios", "abc def"],
  ])("rechaza un nonce %s", (_case, nonce) => {
    expect(() => buildContentSecurityPolicy({ nonce, allowEval: false })).toThrow(/nonce/);
  });
});
