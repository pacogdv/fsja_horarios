/**
 * Cookie de sesión (specs/02-architecture-plan.md §5.2, paso 8; ADR-0002; CLAUDE.md §3.1).
 *
 * El prefijo `__Host-` hace que el navegador solo la acepte con `Secure`, `Path=/` y sin `Domain`: no se
 * comparte con subdominios ni se puede sobrescribir desde ellos. Las opciones son compatibles con
 * `cookies().set(name, value, options)` de Next.js.
 */
export const SESSION_COOKIE_NAME = "__Host-fsja_session";

export interface SessionCookie {
  readonly name: typeof SESSION_COOKIE_NAME;
  readonly value: string;
  readonly options: {
    readonly httpOnly: true;
    readonly secure: true;
    readonly sameSite: "lax";
    readonly path: "/";
    readonly expires: Date;
  };
}

function buildCookie(value: string, expires: Date): SessionCookie {
  return Object.freeze({
    name: SESSION_COOKIE_NAME,
    value,
    options: Object.freeze({ httpOnly: true, secure: true, sameSite: "lax", path: "/", expires } as const),
  });
}

/** Cookie con el token de sesión; caduca en el navegador con la caducidad absoluta de la sesión. */
export function sessionCookie(token: string, expiresAt: Date): SessionCookie {
  return buildCookie(token, expiresAt);
}

/** Cookie vacía y caducada que sustituye a la de sesión al cerrarla. */
export function clearedSessionCookie(): SessionCookie {
  return buildCookie("", new Date(0));
}
