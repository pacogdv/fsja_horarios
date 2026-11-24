/**
 * Caso de uso de logout (specs/02-architecture-plan.md §5.2, paso 10). Borra la sesión del token; quien lo
 * invoca (el Route Handler de T1.15) sustituye además la cookie por `clearedSessionCookie()`.
 */
import type { AuditLog } from "@/application/ports/audit-log";
import type { SessionStore } from "@/application/ports/session-store";

export interface LogoutDependencies {
  readonly sessions: SessionStore;
  readonly auditLog: AuditLog;
}

export function makeLogout({ sessions, auditLog }: LogoutDependencies) {
  return async function logout({ sessionToken }: { readonly sessionToken: string | null }): Promise<void> {
    if (!sessionToken) return;
    const session = await sessions.findValid(sessionToken);
    await sessions.revoke(sessionToken);
    if (session === null) return;
    await auditLog.record({
      action: "auth.logout",
      userId: session.userId,
      entityType: "app_user",
      entityId: session.userId,
      metadata: {},
    });
  };
}
