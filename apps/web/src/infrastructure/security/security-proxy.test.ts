/**
 * Proxy de Next.js (antes middleware): cabeceras, nonce y redirección gruesa
 * (specs/02-architecture-plan.md §5.3 y §5.5; T1.14).
 */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "@/infrastructure/auth/cookies";
import { createSecurityProxy } from "./security-proxy";

const ORIGIN = "https://horarios.example";

function request(path: string, init: { cookie?: string; headers?: Record<string, string>; method?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie !== undefined) headers.set("cookie", init.cookie);
  return new NextRequest(new URL(path, ORIGIN), { headers, method: init.method ?? "GET" });
}

const withSession = { cookie: `${SESSION_COOKIE_NAME}=token-opaco` };
const developmentProxy = createSecurityProxy({ appEnv: "development", allowEval: false });

/** Nonce de la CSP de una respuesta. */
function nonceOf(response: Response): string {
  const match = /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "");
  if (!match?.[1]) throw new Error("la respuesta no tiene nonce");
  return match[1];
}

/** Cabecera que Next.js entrega al render (NextResponse.next({ request: { headers } })). */
const forwardedRequestHeader = (response: Response, name: string) =>
  response.headers.get(`x-middleware-request-${name}`);

describe("createSecurityProxy: cabeceras (02 §5.5)", () => {
  it.each(["/", "/login", "/api/runs/1", "/mi-horario"])("añade las cabeceras de seguridad en %s", (path) => {
    const response = developmentProxy(request(path, withSession));
    expect(response.headers.get("content-security-policy")).toContain("'strict-dynamic'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=(), payment=()");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
  });

  it("usa un nonce distinto en cada petición", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => nonceOf(developmentProxy(request("/login")))));
    expect(nonces.size).toBe(50);
  });

  it("entrega al render la CSP y el nonce de la petición, para que Next.js firme sus scripts", () => {
    const response = developmentProxy(request("/login"));
    const nonce = nonceOf(response);
    expect(forwardedRequestHeader(response, "x-nonce")).toBe(nonce);
    expect(forwardedRequestHeader(response, "content-security-policy")).toBe(
      response.headers.get("content-security-policy"),
    );
  });

  it("ignora un x-nonce o una CSP enviados por el cliente", () => {
    const response = developmentProxy(
      request("/login", { headers: { "x-nonce": "elegido-por-el-atacante", "content-security-policy": "script-src *" } }),
    );
    expect(forwardedRequestHeader(response, "x-nonce")).toBe(nonceOf(response));
    expect(forwardedRequestHeader(response, "content-security-policy")).not.toContain("script-src *");
  });

  it("envía HSTS solo con APP_ENV=production", () => {
    const production = createSecurityProxy({ appEnv: "production", allowEval: false });
    expect(production(request("/login")).headers.get("strict-transport-security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(developmentProxy(request("/login")).headers.has("strict-transport-security")).toBe(false);
  });

  it("solo permite 'unsafe-eval' si se configura (next dev)", () => {
    const dev = createSecurityProxy({ appEnv: "development", allowEval: true });
    expect(dev(request("/login")).headers.get("content-security-policy")).toContain("'unsafe-eval'");
    expect(developmentProxy(request("/login")).headers.get("content-security-policy")).not.toContain("'unsafe-eval'");
  });
});

describe("createSecurityProxy: redirección gruesa (02 §5.3)", () => {
  it("redirige una ruta de (app) sin cookie a /login?next=…, con las cabeceras de seguridad", () => {
    const response = developmentProxy(request("/mi-horario?semana=2"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/mi-horario?semana=2");
    expect(response.headers.get("content-security-policy")).toContain("'nonce-");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("redirige si la cookie de sesión está vacía (la que deja el logout)", () => {
    expect(developmentProxy(request("/", { cookie: `${SESSION_COOKIE_NAME}=` })).status).toBe(307);
  });

  it("redirige si solo hay otras cookies", () => {
    expect(developmentProxy(request("/", { cookie: "fsja_theme=dark" })).status).toBe(307);
  });

  it("deja pasar una ruta de (app) con cookie: no autoriza, eso lo hacen las guardas", () => {
    const response = developmentProxy(request("/administracion/usuarios", withSession));
    expect(response.status).toBe(200);
    expect(response.headers.has("location")).toBe(false);
  });

  it.each(["/login", "/api/runs/1", "/api/auth/logout"])("no redirige %s sin cookie", (path) => {
    const response = developmentProxy(request(path, { method: path.startsWith("/api") ? "POST" : "GET" }));
    expect(response.status).toBe(200);
    expect(response.headers.has("location")).toBe(false);
  });
});
