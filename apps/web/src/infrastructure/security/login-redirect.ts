/**
 * Redirección gruesa de las rutas de `(app)` a `/login` (specs/02-architecture-plan.md §5.3).
 *
 * No autoriza (eso lo hacen las guardas de servidor): solo evita pintar pantallas a usuarios anónimos. El
 * parámetro `next` solo admite rutas relativas del propio origen, para que no sirva de redirección abierta.
 */
export const LOGIN_PATH = "/login";

/** Rutas que no pasan por la redirección: login, API (sus guardas responden 401) y recursos de Next.js. */
const EXEMPT_PREFIXES = [LOGIN_PATH, "/api", "/_next"] as const;
const EXEMPT_PATHS: ReadonlySet<string> = new Set(["/favicon.ico"]);

const NEXT_MAX_LENGTH = 2048;
/** Caracteres de control y barra invertida: los navegadores los eliminan o convierten en `/`. */
const UNSAFE_CHARACTERS = /[\u0000-\u001F\u007F\\]/;
/** Origen ficticio para normalizar rutas relativas con el parser de URL del navegador. */
const PLACEHOLDER_ORIGIN = "https://placeholder.invalid";

const isUnderPrefix = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function requiresSession(pathname: string): boolean {
  if (EXEMPT_PATHS.has(pathname)) return false;
  return !EXEMPT_PREFIXES.some((prefix) => isUnderPrefix(pathname, prefix));
}

/** Ruta relativa segura a la que volver tras el login, o `/` si `value` no lo es. */
export function safeNextPath(value: string | null): string {
  if (!value || value.length > NEXT_MAX_LENGTH || !value.startsWith("/") || UNSAFE_CHARACTERS.test(value)) return "/";

  const url = new URL(value, PLACEHOLDER_ORIGIN);
  // Tras normalizar (`/.//x` → `//x`), una ruta que empieza por `//` sería un origen externo.
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (url.origin !== PLACEHOLDER_ORIGIN || path.startsWith("//") || isUnderPrefix(url.pathname, LOGIN_PATH)) return "/";
  return path;
}

/** `/login?next=<ruta pedida>` en el origen de la petición. Sin `next` si la ruta es `/` o no es segura. */
export function loginRedirectUrl(requestUrl: URL): URL {
  const url = new URL(LOGIN_PATH, requestUrl.origin);
  const next = safeNextPath(`${requestUrl.pathname}${requestUrl.search}`);
  if (next !== "/") url.searchParams.set("next", next);
  return url;
}
