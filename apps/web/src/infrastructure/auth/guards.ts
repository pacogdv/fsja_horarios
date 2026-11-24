/**
 * Guardas de servidor: la capa que **realmente** autoriza (specs/02-architecture-plan.md §5.3; CLAUDE.md §3.2).
 *
 * - `requireSession()` carga la sesión de la cookie. Sin cookie, con un token sin sesión vigente o con el
 *   usuario inexistente o desactivado, lanza `Unauthenticated` (401).
 * - `withPermission(permiso, handler)` envuelve Server Actions y loaders: devuelve un `AccessDenied` (401 o
 *   403) sin ejecutar el handler, o el resultado del handler.
 * - `withPermission.route(permiso, handler)` envuelve Route Handlers: además rechaza con 403 las mutaciones
 *   de otro origen (CSRF, `origin-check.ts`) antes de leer la sesión, y responde con `Response`.
 * Todo punto de entrada debe pasar por `withPermission` (lo comprueba test/permission-coverage.test.ts).
 *
 * Las dependencias se inyectan: el composition root (`src/lib/container.ts`) aporta la lectura de la cookie
 * con `next/headers` y los adaptadores reales.
 */
import type { SessionStore } from "@/application/ports/session-store";
import type { UserRepository } from "@/application/ports/user-repository";
import { type AccessResource, type Actor, isAllowed } from "@/domain/access/access-policy";
import type { Permission } from "@/domain/access/permission";
import type { Role } from "@/domain/access/role";
import { isTrustedOrigin } from "@/infrastructure/security/origin-check";

export const ACCESS_DENIED_MESSAGES = Object.freeze({
  unauthenticated: "Inicia sesión para continuar.",
  forbidden: "No tienes permiso para realizar esta acción.",
  demoReadOnly: "La cuenta de demostración es de solo lectura: no puede modificar datos ni lanzar el motor.",
  crossOrigin: "Petición rechazada: el origen no está permitido.",
});

export class Unauthenticated extends Error {
  readonly status = 401;
  constructor() {
    super(ACCESS_DENIED_MESSAGES.unauthenticated);
    this.name = "Unauthenticated";
  }
}

export interface AuthenticatedSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly role: Role;
  readonly displayName: string;
  readonly actor: Actor;
}

export interface AccessDenied {
  readonly ok: false;
  readonly status: 401 | 403;
  readonly error: "UNAUTHENTICATED" | "FORBIDDEN";
  readonly message: string;
}

export interface GuardDependencies {
  /** Token de la cookie `__Host-fsja_session`, o `null` si no la hay. */
  readonly readSessionToken: () => Promise<string | null>;
  readonly sessions: SessionStore;
  readonly users: Pick<UserRepository, "findPrincipal">;
  readonly appOrigin: string;
}

/** Cómo obtener, a partir de los argumentos, el recurso sobre el que se comprueba la propiedad. */
export interface PermissionOptions<Args extends unknown[]> {
  readonly resource?: (...args: Args) => AccessResource | Promise<AccessResource>;
}

const UNAUTHENTICATED: AccessDenied = Object.freeze({
  ok: false,
  status: 401,
  error: "UNAUTHENTICATED",
  message: ACCESS_DENIED_MESSAGES.unauthenticated,
});

function forbiddenFor(role: Role): AccessDenied {
  return Object.freeze({
    ok: false,
    status: 403,
    error: "FORBIDDEN",
    message: role === "INVITADO_DEMO" ? ACCESS_DENIED_MESSAGES.demoReadOnly : ACCESS_DENIED_MESSAGES.forbidden,
  });
}

function jsonError(status: 401 | 403, message: string): Response {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

export function makeGuards(deps: GuardDependencies) {
  async function requireSession(): Promise<AuthenticatedSession> {
    const token = await deps.readSessionToken();
    if (!token) throw new Unauthenticated();
    const session = await deps.sessions.findValid(token);
    if (session === null) throw new Unauthenticated();
    const principal = await deps.users.findPrincipal(session.userId);
    if (principal === null || !principal.isActive) throw new Unauthenticated();
    return {
      sessionId: session.id,
      userId: session.userId,
      role: principal.role,
      displayName: principal.displayName,
      actor: {
        role: principal.role,
        teacherId: principal.teacherId,
        taughtClassGroupIds: principal.taughtClassGroupIds,
      },
    };
  }

  /** Sesión autorizada para `permission`, o el motivo de la denegación. */
  async function authorize<Args extends unknown[]>(
    permission: Permission,
    options: PermissionOptions<Args> | undefined,
    args: Args,
  ): Promise<AuthenticatedSession | AccessDenied> {
    let session: AuthenticatedSession;
    try {
      session = await requireSession();
    } catch (error) {
      if (error instanceof Unauthenticated) return UNAUTHENTICATED;
      throw error;
    }
    const resource = options?.resource ? await options.resource(...args) : undefined;
    return isAllowed(session.actor, permission, resource) ? session : forbiddenFor(session.role);
  }

  function withPermission<Args extends unknown[], Result>(
    permission: Permission,
    handler: (session: AuthenticatedSession, ...args: Args) => Promise<Result>,
    options?: PermissionOptions<Args>,
  ): (...args: Args) => Promise<Result | AccessDenied> {
    return async (...args: Args) => {
      const authorization = await authorize(permission, options, args);
      return isAccessDenied(authorization) ? authorization : handler(authorization, ...args);
    };
  }

  // `context` (parámetros de ruta) es opcional: Next.js no lo pasa en las rutas sin segmentos dinámicos.
  function route<Context = undefined>(
    permission: Permission,
    handler: (session: AuthenticatedSession, request: Request, context: Context | undefined) => Promise<Response>,
    options?: PermissionOptions<[Request, Context | undefined]>,
  ): (request: Request, context?: Context) => Promise<Response> {
    return async (request: Request, context?: Context) => {
      if (!isTrustedOrigin(request, deps.appOrigin)) return jsonError(403, ACCESS_DENIED_MESSAGES.crossOrigin);
      const authorization = await authorize(permission, options, [request, context]);
      if (isAccessDenied(authorization)) return jsonError(authorization.status, authorization.message);
      return handler(authorization, request, context);
    };
  }

  return { requireSession, withPermission: Object.assign(withPermission, { route }) };
}

export type Guards = ReturnType<typeof makeGuards>;

/** Firma de `withPermission` para Server Actions y loaders de página. */
export type WithPermission = <Args extends unknown[], Result>(
  permission: Permission,
  handler: (session: AuthenticatedSession, ...args: Args) => Promise<Result>,
  options?: PermissionOptions<Args>,
) => (...args: Args) => Promise<Result | AccessDenied>;

/**
 * `withPermission` que obtiene las guardas al ejecutarse, no al envolver. Lo usa el composition root: `next build`
 * importa las Server Actions sin entorno, así que las guardas (y la BD) no pueden crearse al importar el módulo.
 */
export function deferWithPermission(getGuards: () => Pick<Guards, "withPermission">): WithPermission {
  return (permission, handler, options) =>
    async (...args) =>
      getGuards().withPermission(permission, handler, options)(...args);
}

/**
 * ¿Es `value` una denegación de `withPermission` (401 o 403)? Las páginas lo usan para elegir entre los datos y
 * «Acceso denegado». Un resultado de negocio fallido (sin estado 401/403) no es una denegación.
 */
export function isAccessDenied(value: unknown): value is AccessDenied {
  if (typeof value !== "object" || value === null) return false;
  const { ok, status } = value as { ok?: unknown; status?: unknown };
  return ok === false && (status === 401 || status === 403);
}
