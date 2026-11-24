/**
 * T1.15 — Adaptador de la Server Action de login (specs/02-architecture-plan.md §5.2, pasos 1, 8 y 9).
 * Lee el formulario y la petición, llama al caso de uso, pone la cookie y decide adónde volver.
 */
import { describe, expect, it, vi } from "vitest";
import type { LoginRequest, LoginResult } from "@/application/auth/login";
import { INVALID_CREDENTIALS_MESSAGE } from "@/application/auth/login";
import { SESSION_COOKIE_NAME, type SessionCookie } from "./cookies";
import { makeLoginAction, type LoginRequestContext } from "./login-action";

const EXPIRES = new Date("2026-11-24T16:00:00.000Z");
const SUCCESS: LoginResult = { ok: true, sessionToken: "tok", sessionExpiresAt: EXPIRES, userId: "u1", role: "DOCENTE" };
const CONTEXT: LoginRequestContext = { ip: "203.0.113.7", userAgent: "Firefox", sessionToken: "previo" };

function setup(result: LoginResult) {
  const login = vi.fn<(request: LoginRequest) => Promise<LoginResult>>(async () => result);
  const setSessionCookie = vi.fn<(cookie: SessionCookie) => Promise<void>>(async () => undefined);
  const action = makeLoginAction({ login, requestContext: async () => CONTEXT, setSessionCookie });
  return { login, setSessionCookie, action };
}

function form(fields: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("makeLoginAction", () => {
  it("pasa al caso de uso el formulario, la IP, el user agent y la sesión previa (fijación de sesión)", async () => {
    const { action, login } = setup(SUCCESS);
    await action(form({ email: "ana@centro.example", password: "secreta" }));
    expect(login).toHaveBeenCalledWith({
      email: "ana@centro.example",
      password: "secreta",
      ip: "203.0.113.7",
      userAgent: "Firefox",
      previousSessionToken: "previo",
    });
  });

  it("con login correcto pone la cookie de sesión y vuelve a next", async () => {
    const { action, setSessionCookie } = setup(SUCCESS);
    const outcome = await action(form({ email: "a@b.es", password: "x", next: "/mi-horario?semana=2" }));
    expect(outcome).toEqual({ ok: true, redirectTo: "/mi-horario?semana=2" });
    expect(setSessionCookie).toHaveBeenCalledWith(
      expect.objectContaining({ name: SESSION_COOKIE_NAME, value: "tok", options: expect.objectContaining({ expires: EXPIRES, httpOnly: true }) }),
    );
  });

  it.each([
    ["ausente", undefined],
    ["externa", "https://evil.example/"],
    ["sin esquema", "//evil.example"],
    ["de vuelta al login", "/login"],
  ])("con next %s vuelve a / (sin redirección abierta)", async (_case, next) => {
    const { action } = setup(SUCCESS);
    const outcome = await action(form({ email: "a@b.es", password: "x", ...(next === undefined ? {} : { next }) }));
    expect(outcome).toEqual({ ok: true, redirectTo: "/" });
  });

  it("con login fallido no pone cookie y devuelve el estado del formulario, sin la contraseña", async () => {
    const { action, setSessionCookie } = setup({ ok: false, error: "INVALID_CREDENTIALS", message: INVALID_CREDENTIALS_MESSAGE });
    const outcome = await action(form({ email: "ana@centro.example", password: "secreta" }));
    expect(setSessionCookie).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      ok: false,
      state: { status: "error", email: "ana@centro.example", formError: INVALID_CREDENTIALS_MESSAGE },
    });
    expect(JSON.stringify(outcome)).not.toContain("secreta");
  });

  it("un archivo en lugar de texto llega al caso de uso como valor no válido (lo rechaza Zod)", async () => {
    const { action, login } = setup({ ok: false, error: "INVALID_INPUT", fieldErrors: { email: ["x"] } });
    await action(form({ email: new Blob(["x"]), password: "x" }));
    expect(typeof login.mock.calls[0]?.[0].email).not.toBe("string");
  });
});
