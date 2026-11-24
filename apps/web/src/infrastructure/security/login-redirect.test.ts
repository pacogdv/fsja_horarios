/**
 * Redirección gruesa a /login y parámetro `next` sin redirecciones abiertas
 * (specs/02-architecture-plan.md §5.3; T1.14).
 */
import { describe, expect, it } from "vitest";
import { LOGIN_PATH, loginRedirectUrl, requiresSession, safeNextPath } from "./login-redirect";

describe("requiresSession", () => {
  it.each(["/", "/mi-horario", "/configuracion/curso", "/horarios/123/editor", "/loginx", "/login-otro"])(
    "%s es una ruta de (app)",
    (pathname) => {
      expect(requiresSession(pathname)).toBe(true);
    },
  );

  it.each(["/login", "/login/", "/api/auth/logout", "/api/runs/1", "/_next/static/chunk.js", "/favicon.ico"])(
    "%s no redirige (pública, API con su propio 401 o recurso de Next)",
    (pathname) => {
      expect(requiresSession(pathname)).toBe(false);
    },
  );
});

describe("safeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/mi-horario", "/mi-horario"],
    ["/horarios/1/editor?vista=grupo#lunes", "/horarios/1/editor?vista=grupo#lunes"],
    ["/datos/profesores?q=%2F%2Fevil", "/datos/profesores?q=%2F%2Fevil"],
  ])("acepta la ruta relativa %s", (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });

  it.each([
    ["ausente", null],
    ["vacía", ""],
    ["absoluta", "https://evil.example/"],
    ["sin esquema (protocol-relative)", "//evil.example/"],
    ["con barra invertida (los navegadores la tratan como /)", "/\\evil.example/"],
    ["con barra invertida inicial", "\\\\evil.example"],
    ["javascript:", "javascript:alert(1)"],
    ["relativa sin barra", "mi-horario"],
    ["con tabulador (el navegador lo elimina: /\\t/evil → //evil)", "/\t/evil.example"],
    ["con salto de línea", "/\n/evil.example"],
    ["con carácter de control", "/\u0000x"],
    ["que vuelve a /login (bucle)", "/login?next=/"],
    ["demasiado larga", `/${"a".repeat(2048)}`],
  ])("rechaza una ruta %s y usa /", (_case, value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it("el resultado siempre se resuelve en el propio origen", () => {
    const candidates = ["/a", "//b", "/\\c", "https://d", "/%2F%2Fe", "/.//f", "/..//g"];
    for (const candidate of candidates) {
      const resolved = new URL(safeNextPath(candidate), "https://horarios.example");
      expect(resolved.origin).toBe("https://horarios.example");
    }
  });
});

describe("loginRedirectUrl", () => {
  const request = (path: string) => new URL(path, "https://horarios.example");

  it("redirige a /login con la ruta pedida en next", () => {
    const url = loginRedirectUrl(request("/mi-horario?semana=2"));
    expect(url.origin).toBe("https://horarios.example");
    expect(url.pathname).toBe(LOGIN_PATH);
    expect(url.searchParams.get("next")).toBe("/mi-horario?semana=2");
    expect([...url.searchParams.keys()]).toEqual(["next"]);
  });

  it("no añade next para la raíz", () => {
    const url = loginRedirectUrl(request("/"));
    expect(url.pathname).toBe(LOGIN_PATH);
    expect(url.search).toBe("");
  });

  it("omite next si la ruta pedida empieza por // (llegaría a la página de login como origen externo)", () => {
    const url = request("/");
    url.pathname = "//evil.example/x";
    expect(loginRedirectUrl(url).searchParams.has("next")).toBe(false);
  });

  it("next siempre pasa el filtro de safeNextPath", () => {
    const url = loginRedirectUrl(request("/datos//evil.example"));
    const next = url.searchParams.get("next");
    expect(next).not.toBeNull();
    expect(safeNextPath(next)).toBe(next);
  });
});
