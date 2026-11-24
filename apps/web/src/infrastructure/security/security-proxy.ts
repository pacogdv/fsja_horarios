/**
 * Lógica del proxy de Next.js, antes `middleware` (specs/02-architecture-plan.md §5.3 y §5.5).
 *
 * Por petición: genera el nonce de la CSP, se lo entrega al render (Next.js lo extrae de la cabecera
 * `Content-Security-Policy` de la petición y lo pone en sus scripts) y añade las cabeceras de seguridad a la
 * respuesta. Las rutas de `(app)` sin cookie de sesión se redirigen a `/login?next=…`. No accede a la BD.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/infrastructure/auth/cookies";
import { generateNonce } from "./csp";
import { loginRedirectUrl, requiresSession } from "./login-redirect";
import { securityHeaders, type SecurityHeaders, type SecurityHeadersOptions } from "./security-headers";

export type SecurityProxyOptions = Omit<SecurityHeadersOptions, "nonce">;

export function createSecurityProxy(options: SecurityProxyOptions): (request: NextRequest) => NextResponse {
  return function securityProxy(request: NextRequest): NextResponse {
    const nonce = generateNonce();
    const headers = securityHeaders({ ...options, nonce });

    const response =
      requiresSession(request.nextUrl.pathname) && !request.cookies.get(SESSION_COOKIE_NAME)?.value
        ? NextResponse.redirect(loginRedirectUrl(request.nextUrl))
        : NextResponse.next({ request: { headers: renderRequestHeaders(request, nonce, headers) } });

    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  };
}

/** Cabeceras de la petición que recibe el render: sustituyen a cualquier `x-nonce` o CSP del cliente. */
function renderRequestHeaders(request: NextRequest, nonce: string, headers: SecurityHeaders): Headers {
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("content-security-policy", headers["Content-Security-Policy"]);
  return forwarded;
}
