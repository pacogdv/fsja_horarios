/**
 * Proxy de Next.js 16 (antes `middleware.ts`): cabeceras de seguridad, nonce de la CSP y redirección gruesa
 * a `/login` (specs/02-architecture-plan.md §5.3 y §5.5). La lógica está en
 * `src/infrastructure/security/security-proxy.ts`.
 */
import type { NextRequest, NextResponse } from "next/server";
import { createSecurityProxy } from "@/infrastructure/security/security-proxy";
import { getEnv } from "@/lib/env";

export function proxy(request: NextRequest): NextResponse {
  // `next dev` necesita 'unsafe-eval' (ADR-0009); `next start` y la imagen Docker corren con NODE_ENV=production.
  const securityProxy = createSecurityProxy({
    appEnv: getEnv().APP_ENV,
    allowEval: process.env.NODE_ENV === "development",
  });
  return securityProxy(request);
}

export const config = {
  // Todo salvo los recursos estáticos de Next.js, que no son documentos (la CSP no se les aplica).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
