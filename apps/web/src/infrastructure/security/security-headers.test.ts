/**
 * Cabeceras de seguridad de todas las respuestas (specs/02-architecture-plan.md §5.5; CLAUDE.md §3.4; T1.14).
 */
import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers";

const NONCE = "AAECAwQFBgcICQoLDA0ODw==";

describe("securityHeaders", () => {
  it("incluye las cabeceras fijas de 02 §5.5", () => {
    const headers = securityHeaders({ nonce: NONCE, appEnv: "development", allowEval: false });
    expect(headers).toMatchObject({
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
  });

  it("incluye la CSP con el nonce de la petición", () => {
    const headers = securityHeaders({ nonce: NONCE, appEnv: "development", allowEval: false });
    expect(headers["Content-Security-Policy"]).toContain(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`);
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("envía HSTS con APP_ENV=production", () => {
    const headers = securityHeaders({ nonce: NONCE, appEnv: "production", allowEval: false });
    expect(headers["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
  });

  it.each(["development", "test"] as const)("no envía HSTS con APP_ENV=%s", (appEnv) => {
    const headers = securityHeaders({ nonce: NONCE, appEnv, allowEval: false });
    expect(headers).not.toHaveProperty("Strict-Transport-Security");
  });

  it("no añade más cabeceras que las de 02 §5.5", () => {
    expect(Object.keys(securityHeaders({ nonce: NONCE, appEnv: "production", allowEval: false })).sort()).toEqual([
      "Content-Security-Policy",
      "Cross-Origin-Opener-Policy",
      "Permissions-Policy",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ]);
  });

  it("devuelve un objeto inmutable", () => {
    expect(Object.isFrozen(securityHeaders({ nonce: NONCE, appEnv: "test", allowEval: false }))).toBe(true);
  });
});
