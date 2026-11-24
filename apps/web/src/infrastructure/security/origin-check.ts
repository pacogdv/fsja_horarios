/**
 * Protección CSRF de los Route Handlers que mutan (specs/02-architecture-plan.md §5.6; CLAUDE.md §3.4).
 *
 * Una mutación (`POST`, `PUT`, `PATCH`, `DELETE`) solo se acepta si `Origin` coincide con `APP_ORIGIN`. Sin
 * cabecera, con `Origin: null` (contexto opaco) o con un valor que no es un origen, se rechaza. Las Server
 * Actions no pasan por aquí: Next.js ya compara su `Origin` con `Host`. Ningún `GET` tiene efectos, así que
 * los métodos seguros no se comprueban.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Origen normalizado (esquema y host en minúsculas, sin puerto por defecto), o `null` si no es válido. */
function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function isTrustedOrigin(request: Request, appOrigin: string): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  const received = normalizedOrigin(origin);
  return received !== null && received === normalizedOrigin(appOrigin);
}
