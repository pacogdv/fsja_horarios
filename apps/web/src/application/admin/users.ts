/**
 * Administración de usuarios (specs/03-tasks.md T3.9). T1.17 adelanta el listado y el desbloqueo de cuentas:
 * «ADMIN_DIRECCION puede desbloquear una cuenta al instante» (02 §5.2, ADR-0002). El CRUD llega en T3.9.
 *
 * La autorización (`users:manage`) no es de estos casos de uso: la aplica `withPermission` en el adaptador de
 * entrada, antes de llamarlos (02 §5.3).
 */
import { z } from "zod";
import type { AuditLog } from "@/application/ports/audit-log";
import type { Clock } from "@/application/ports/clock";
import type { UserRepository } from "@/application/ports/user-repository";
import type { Role } from "@/domain/access/role";

export const INVALID_USER_MESSAGE = "El usuario indicado no es válido.";
export const USER_NOT_FOUND_MESSAGE = "El usuario ya no existe.";

/** Fila del listado de usuarios. Nunca incluye el hash de la contraseña. */
export interface UserListItem {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly isActive: boolean;
  /** Bloqueo temporal por intentos fallidos todavía vigente. */
  readonly isLocked: boolean;
}

export function makeListUsers({ users, clock }: { readonly users: UserRepository; readonly clock: Clock }) {
  return async function listUsers(): Promise<UserListItem[]> {
    const now = clock.now();
    return (await users.listUsers()).map(({ lockedUntil, ...user }) => ({
      ...user,
      isLocked: lockedUntil !== null && lockedUntil > now,
    }));
  };
}

export type UnlockUserResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: "INVALID_INPUT" | "NOT_FOUND"; readonly message: string };

const unlockUserInput = z.strictObject({ userId: z.uuid() });

export function makeUnlockUser({ users, auditLog }: { readonly users: UserRepository; readonly auditLog: AuditLog }) {
  /** `actorUserId` es quien desbloquea (la sesión); `input` llega del formulario, sin validar. */
  return async function unlockUser(actorUserId: string, input: unknown): Promise<UnlockUserResult> {
    const parsed = unlockUserInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "INVALID_INPUT", message: INVALID_USER_MESSAGE };

    const { userId } = parsed.data;
    if (!(await users.unlock(userId))) return { ok: false, error: "NOT_FOUND", message: USER_NOT_FOUND_MESSAGE };
    await auditLog.record({ action: "auth.account.unlocked", userId: actorUserId, entityType: "app_user", entityId: userId, metadata: {} });
    return { ok: true };
  };
}
