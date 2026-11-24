/**
 * Estado del formulario de login (DTO de salida hacia la UI) a partir del resultado del caso de uso
 * (specs/02-architecture-plan.md §5.2). Nunca incluye la contraseña, y los mensajes no distinguen entre usuario
 * inexistente, contraseña incorrecta, cuenta bloqueada o desactivada.
 */
import type { LoginResult } from "./login";

type FieldErrors = Partial<Record<"email" | "password", string[]>>;

export type LoginFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly email: string; readonly formError?: string; readonly fieldErrors?: FieldErrors };

export const INITIAL_LOGIN_FORM_STATE: LoginFormState = Object.freeze({ status: "idle" });

/** Igual que el máximo del esquema del caso de uso: no se devuelve más de lo que se habría aceptado. */
const EMAIL_ECHO_MAX_LENGTH = 254;

function rateLimitedMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Demasiados intentos. Espera ${minutes} ${minutes === 1 ? "minuto" : "minutos"} y vuelve a intentarlo.`;
}

/** `email` es el valor recibido del formulario, para volver a mostrarlo (sin validar: React lo escapa). */
export function toLoginFormState(result: Exclude<LoginResult, { ok: true }>, email: unknown): LoginFormState {
  const echoedEmail = typeof email === "string" ? email.slice(0, EMAIL_ECHO_MAX_LENGTH) : "";
  switch (result.error) {
    case "INVALID_INPUT":
      return { status: "error", email: echoedEmail, fieldErrors: result.fieldErrors };
    case "RATE_LIMITED":
      return { status: "error", email: echoedEmail, formError: rateLimitedMessage(result.retryAfterSeconds) };
    case "INVALID_CREDENTIALS":
      return { status: "error", email: echoedEmail, formError: result.message };
  }
}
