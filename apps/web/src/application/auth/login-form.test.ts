/**
 * T1.15 — Estado del formulario de login a partir del resultado del caso de uso (specs/02-architecture-plan.md
 * §5.2). Nunca devuelve la contraseña ni detalles que distingan un fallo de otro.
 */
import { describe, expect, it } from "vitest";
import { INVALID_CREDENTIALS_MESSAGE } from "./login";
import { INITIAL_LOGIN_FORM_STATE, toLoginFormState } from "./login-form";

describe("toLoginFormState", () => {
  it("el estado inicial no tiene errores", () => {
    expect(INITIAL_LOGIN_FORM_STATE).toEqual({ status: "idle" });
  });

  it("credenciales no válidas: mensaje genérico y el correo para no tener que reescribirlo", () => {
    expect(
      toLoginFormState({ ok: false, error: "INVALID_CREDENTIALS", message: INVALID_CREDENTIALS_MESSAGE }, "ana@centro.example"),
    ).toEqual({ status: "error", email: "ana@centro.example", formError: INVALID_CREDENTIALS_MESSAGE });
  });

  it("entrada no válida: errores por campo", () => {
    const fieldErrors = { email: ["Introduce un correo electrónico válido."] };
    expect(toLoginFormState({ ok: false, error: "INVALID_INPUT", fieldErrors }, "ana@")).toEqual({
      status: "error",
      email: "ana@",
      fieldErrors,
    });
  });

  it.each([
    [60, "Demasiados intentos. Espera 1 minuto y vuelve a intentarlo."],
    [61, "Demasiados intentos. Espera 2 minutos y vuelve a intentarlo."],
    [900, "Demasiados intentos. Espera 15 minutos y vuelve a intentarlo."],
  ])("límite de intentos (%i s): dice cuánto esperar, redondeando hacia arriba", (retryAfterSeconds, message) => {
    expect(toLoginFormState({ ok: false, error: "RATE_LIMITED", retryAfterSeconds }, "ana@centro.example")).toEqual({
      status: "error",
      email: "ana@centro.example",
      formError: message,
    });
  });

  it.each([
    ["un valor que no es texto", 42, ""],
    ["un correo más largo que el máximo", `${"a".repeat(300)}@x.es`, `${"a".repeat(254)}`],
  ])("con %s, devuelve un correo acotado", (_case, email, expected) => {
    const state = toLoginFormState({ ok: false, error: "INVALID_CREDENTIALS", message: INVALID_CREDENTIALS_MESSAGE }, email);
    expect(state.status === "error" && state.email).toBe(expected);
  });
});
