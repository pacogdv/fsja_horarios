/**
 * Route Handler de logout (specs/02-architecture-plan.md §5.2, paso 10).
 *
 * Está en la lista blanca de `permission-coverage.test.ts` (02 §5.3): ningún permiso es común a los tres roles,
 * sin sesión no hace nada y solo actúa sobre la cookie de quien lo llama. Aun así rechaza las peticiones de otro
 * origen (CSRF): una web ajena no puede cerrar la sesión del usuario.
 */
import { isTrustedOrigin } from "@/infrastructure/security/origin-check";
import { LOGIN_PATH } from "@/infrastructure/security/login-redirect";
import { ACCESS_DENIED_MESSAGES } from "./guards";

export interface LogoutRouteDependencies {
  readonly logout: (sessionToken: string) => Promise<void>;
  readonly readSessionToken: () => Promise<string | null>;
  readonly clearSessionCookie: () => Promise<void>;
  readonly appOrigin: string;
}

const NO_STORE = { "cache-control": "no-store" };

export function makeLogoutRoute(deps: LogoutRouteDependencies): (request: Request) => Promise<Response> {
  return async function logoutRoute(request: Request): Promise<Response> {
    if (!isTrustedOrigin(request, deps.appOrigin)) {
      return Response.json({ error: ACCESS_DENIED_MESSAGES.crossOrigin }, { status: 403, headers: NO_STORE });
    }
    const token = await deps.readSessionToken();
    if (token) await deps.logout(token);
    await deps.clearSessionCookie();
    // 303: el navegador sigue la redirección con GET, aunque el formulario fuera POST.
    return new Response(null, { status: 303, headers: { location: LOGIN_PATH, ...NO_STORE } });
  };
}
