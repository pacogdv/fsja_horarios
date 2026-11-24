/**
 * Composition root (specs/02-architecture-plan.md §1.2).
 *
 * Es el único módulo de app/ui/lib autorizado a importar `src/infrastructure`: instancia los adaptadores, se los
 * entrega a los casos de uso a través de sus puertos y conecta las APIs de Next.js (`cookies`, `headers`). Las
 * rutas y acciones de `src/app` solo llaman a `getContainer()`.
 */
import { cookies, headers } from "next/headers";
import { makeListUsers, makeUnlockUser, type UnlockUserResult, type UserListItem } from "@/application/admin/users";
import { makeLogin } from "@/application/auth/login";
import { makeLogout } from "@/application/auth/logout";
import { systemClock } from "@/application/ports/clock";
import type { Role } from "@/domain/access/role";
import { Argon2PasswordHasher } from "@/infrastructure/auth/argon2-hasher";
import { clearedSessionCookie, SESSION_COOKIE_NAME, type SessionCookie } from "@/infrastructure/auth/cookies";
import {
  type AccessDenied,
  type AuthenticatedSession,
  deferWithPermission,
  type Guards,
  isAccessDenied,
  makeGuards,
  Unauthenticated,
  type WithPermission,
} from "@/infrastructure/auth/guards";
import { type LoginActionOutcome, makeLoginAction } from "@/infrastructure/auth/login-action";
import { makeLogoutRoute } from "@/infrastructure/auth/logout-route";
import { PgSessionStore } from "@/infrastructure/auth/pg-session-store";
import { getPrismaClient } from "@/infrastructure/db/prisma-client";
import { PrismaAuditLog } from "@/infrastructure/db/repositories/audit-log-repository";
import { PrismaUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { clientIpFromForwardedFor } from "@/infrastructure/security/client-ip";
import { PgRateLimiter } from "@/infrastructure/security/pg-rate-limiter";
import { createRateLimitKeys } from "@/infrastructure/security/rate-limit-keys";
import { getEnv } from "@/lib/env";

/** Usuario de la sesión actual, para el layout de `(app)`. */
export interface CurrentUser {
  readonly userId: string;
  readonly role: Role;
  readonly displayName: string;
}

export type { AccessDenied, AuthenticatedSession, LoginActionOutcome };

export interface Container {
  /** Usuario de la sesión vigente, o `null` si no hay sesión válida (cookie ausente, caducada o usuario inactivo). */
  readonly currentUser: () => Promise<CurrentUser | null>;
  readonly loginAction: (formData: FormData) => Promise<LoginActionOutcome>;
  readonly logoutRoute: (request: Request) => Promise<Response>;
  readonly guards: Guards;
  readonly listUsers: () => Promise<UserListItem[]>;
  readonly unlockUser: (actorUserId: string, input: unknown) => Promise<UnlockUserResult>;
}

async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value || null;
}

async function writeCookie({ name, value, options }: SessionCookie): Promise<void> {
  (await cookies()).set(name, value, { ...options });
}

export function createContainer(): Container {
  const env = getEnv();
  const db = getPrismaClient();
  const clock = systemClock;
  const users = new PrismaUserRepository(db);
  const sessions = new PgSessionStore(db, clock);
  const auditLog = new PrismaAuditLog(db, clock);

  const login = makeLogin({
    users,
    hasher: new Argon2PasswordHasher(),
    sessions,
    rateLimiter: new PgRateLimiter(db, clock),
    rateLimitKeys: createRateLimitKeys(env.RATE_LIMIT_KEY_SECRET),
    auditLog,
    clock,
  });
  const logout = makeLogout({ sessions, auditLog });
  const guards = makeGuards({ readSessionToken, sessions, users, appOrigin: env.APP_ORIGIN });

  return Object.freeze({
    guards,
    listUsers: makeListUsers({ users, clock }),
    unlockUser: makeUnlockUser({ users, auditLog }),
    async currentUser() {
      try {
        const { userId, role, displayName } = await guards.requireSession();
        return { userId, role, displayName };
      } catch (error) {
        if (error instanceof Unauthenticated) return null;
        throw error;
      }
    },
    loginAction: makeLoginAction({
      login,
      async requestContext() {
        const requestHeaders = await headers();
        return {
          ip: clientIpFromForwardedFor(requestHeaders.get("x-forwarded-for"), env.TRUSTED_PROXY_HOPS),
          userAgent: requestHeaders.get("user-agent"),
          sessionToken: await readSessionToken(),
        };
      },
      setSessionCookie: writeCookie,
    }),
    logoutRoute: makeLogoutRoute({
      logout: (sessionToken) => logout({ sessionToken }),
      readSessionToken,
      clearSessionCookie: () => writeCookie(clearedSessionCookie()),
      appOrigin: env.APP_ORIGIN,
    }),
  });
}

let container: Container | undefined;

/** Contenedor del proceso, creado la primera vez que se pide (el entorno ya está validado al arrancar). */
export function getContainer(): Container {
  container ??= createContainer();
  return container;
}

/**
 * `withPermission` de las guardas (02 §5.3) para Server Actions y loaders de página de src/app. Es perezoso: el
 * contenedor (entorno, BD) se crea en la primera llamada, no al importar el módulo, porque `next build` importa
 * las acciones sin entorno. El nombre debe ser `withPermission`: lo busca test/permission-coverage.test.ts.
 */
export const withPermission: WithPermission = deferWithPermission(() => getContainer().guards);

/** ¿Es el resultado de `withPermission` una denegación (401/403)? */
export { isAccessDenied };
