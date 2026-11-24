/**
 * Cabeceras de seguridad de todas las respuestas (specs/02-architecture-plan.md §5.5; CLAUDE.md §3.4).
 */
import type { Env } from "@/lib/env";
import { buildContentSecurityPolicy } from "./csp";

const STATIC_HEADERS = Object.freeze({
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
});

/** Dos años. Solo en production: en desarrollo fijaría HTTPS en `localhost` para todo el navegador. */
const HSTS = "max-age=63072000; includeSubDomains";

export interface SecurityHeadersOptions {
  readonly nonce: string;
  readonly appEnv: Env["APP_ENV"];
  readonly allowEval: boolean;
}

export type SecurityHeaders = Readonly<Record<string, string> & { "Content-Security-Policy": string }>;

export function securityHeaders({ nonce, appEnv, allowEval }: SecurityHeadersOptions): SecurityHeaders {
  return Object.freeze({
    "Content-Security-Policy": buildContentSecurityPolicy({ nonce, allowEval }),
    ...STATIC_HEADERS,
    ...(appEnv === "production" ? { "Strict-Transport-Security": HSTS } : {}),
  });
}
