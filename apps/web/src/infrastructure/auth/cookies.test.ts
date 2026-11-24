// @vitest-environment node
/**
 * T1.10 — Cookie de sesión `__Host-fsja_session`.
 * Refs: specs/02-architecture-plan.md §5.2 (paso 8); ADR-0002; CLAUDE.md §3.1.
 */
import { describe, expect, it } from "vitest";
import { clearedSessionCookie, SESSION_COOKIE_NAME, sessionCookie } from "./cookies";

const TOKEN = "A".repeat(43);
const EXPIRES_AT = new Date("2026-11-24T16:00:00.000Z");

describe("T1.10 cookie de sesión", () => {
  it("se llama __Host-fsja_session (el prefijo __Host- obliga a Secure, Path=/ y sin Domain)", () => {
    expect(SESSION_COOKIE_NAME).toBe("__Host-fsja_session");
    expect(sessionCookie(TOKEN, EXPIRES_AT).name).toBe(SESSION_COOKIE_NAME);
  });

  it("lleva el token y los atributos HttpOnly, Secure, SameSite=Lax y Path=/, sin Domain", () => {
    const cookie = sessionCookie(TOKEN, EXPIRES_AT);
    expect(cookie.value).toBe(TOKEN);
    expect(cookie.options).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: EXPIRES_AT });
    expect(cookie.options).not.toHaveProperty("domain");
  });

  it("caduca en el navegador junto con la sesión (caducidad absoluta)", () => {
    expect(sessionCookie(TOKEN, EXPIRES_AT).options.expires).toEqual(EXPIRES_AT);
  });

  it("al cerrar sesión se sustituye por una cookie vacía y caducada con los mismos atributos", () => {
    const cookie = clearedSessionCookie();
    expect(cookie.name).toBe(SESSION_COOKIE_NAME);
    expect(cookie.value).toBe("");
    expect(cookie.options).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(0) });
  });

  it("los atributos no se pueden modificar desde fuera", () => {
    const cookie = sessionCookie(TOKEN, EXPIRES_AT);
    expect(Object.isFrozen(cookie)).toBe(true);
    expect(Object.isFrozen(cookie.options)).toBe(true);
  });
});
