/**
 * Content-Security-Policy con nonce por petición (specs/02-architecture-plan.md §5.5; ADR-0009).
 *
 * Los scripts solo se ejecutan con el nonce de la petición (`'strict-dynamic'` extiende la confianza a los
 * que esos scripts carguen). `style-src 'unsafe-inline'` es el riesgo aceptado de ADR-0009 (Radix/shadcn).
 */
const NONCE_BYTES = 16;
/** base64 estándar: impide que un nonce manipulado cierre la directiva o inyecte cabeceras. */
const NONCE_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/** 128 bits de `crypto.getRandomValues`, en base64. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return btoa(String.fromCharCode(...bytes));
}

export interface CspOptions {
  readonly nonce: string;
  /** `'unsafe-eval'` en scripts: solo para `next dev`, donde React lo usa para reconstruir trazas (ADR-0009). */
  readonly allowEval: boolean;
}

export function buildContentSecurityPolicy({ nonce, allowEval }: CspOptions): string {
  if (!NONCE_PATTERN.test(nonce)) throw new Error("El nonce de la CSP debe ser base64.");
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(allowEval ? ["'unsafe-eval'"] : [])];
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}
