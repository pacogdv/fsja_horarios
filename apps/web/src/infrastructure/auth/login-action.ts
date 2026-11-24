/**
 * Adaptador de la Server Action de login (specs/02-architecture-plan.md §5.2, pasos 1, 8 y 9).
 *
 * Traduce el formulario y la petición al caso de uso, pone la cookie de sesión si el login es correcto y decide
 * adónde volver (`next`, filtrado por `safeNextPath`: sin redirecciones abiertas). La redirección la hace la
 * propia acción con `redirect()` de Next.js. Las dependencias de Next.js (`headers`, `cookies`) se inyectan
 * desde el composition root.
 */
import type { LoginRequest, LoginResult } from "@/application/auth/login";
import { type LoginFormState, toLoginFormState } from "@/application/auth/login-form";
import { safeNextPath } from "@/infrastructure/security/login-redirect";
import { type SessionCookie, sessionCookie } from "./cookies";

export interface LoginRequestContext {
  /** IP del cliente según `client-ip.ts`. */
  readonly ip: string;
  readonly userAgent: string | null;
  /** Cookie de sesión que ya traía el navegador (se revoca: fijación de sesión). */
  readonly sessionToken: string | null;
}

export interface LoginActionDependencies {
  readonly login: (request: LoginRequest) => Promise<LoginResult>;
  readonly requestContext: () => Promise<LoginRequestContext>;
  readonly setSessionCookie: (cookie: SessionCookie) => Promise<void>;
}

export type LoginActionOutcome =
  | { readonly ok: true; readonly redirectTo: string }
  | { readonly ok: false; readonly state: LoginFormState };

/** Un campo de texto del formulario, o `undefined` si falta o es un archivo (el caso de uso lo rechaza). */
function textField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export function makeLoginAction(deps: LoginActionDependencies): (formData: FormData) => Promise<LoginActionOutcome> {
  return async function loginAction(formData: FormData): Promise<LoginActionOutcome> {
    const context = await deps.requestContext();
    const email = textField(formData, "email");
    const result = await deps.login({
      email,
      password: textField(formData, "password"),
      ip: context.ip,
      userAgent: context.userAgent,
      previousSessionToken: context.sessionToken,
    });
    if (!result.ok) return { ok: false, state: toLoginFormState(result, email) };

    await deps.setSessionCookie(sessionCookie(result.sessionToken, result.sessionExpiresAt));
    return { ok: true, redirectTo: safeNextPath(textField(formData, "next") ?? null) };
  };
}
