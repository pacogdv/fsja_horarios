"use client";

/**
 * Tabla de usuarios (T3.9, adelantado en T1.17) con desbloqueo de cuentas bloqueadas por intentos fallidos
 * (02 §5.2). La acción la autoriza el servidor: si la deniega (sin `users:manage`), se muestra su motivo.
 */
import { useActionState } from "react";
import type { UserListItem } from "@/application/admin/users";
import { es } from "@/lib/i18n/es";
import { Button } from "@/ui/components/ui/button";

/** Resultado de la acción: el del caso de uso o la denegación de `withPermission` (ambos con `message`). */
export type UnlockUserOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string };
export type UnlockUserAction = (state: UnlockUserOutcome | null, formData: FormData) => Promise<UnlockUserOutcome>;

function UnlockUserForm({ user, action }: { readonly user: UserListItem; readonly action: UnlockUserAction }) {
  const [outcome, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={user.id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`${es.users.unlock} a ${user.displayName}`}>
        {es.users.unlock}
      </Button>
      {outcome?.ok === true && <span role="status">{es.users.unlocked}</span>}
      {outcome?.ok === false && (
        <span role="alert" className="text-sm text-danger">
          {outcome.message}
        </span>
      )}
    </form>
  );
}

function statusOf(user: UserListItem): string {
  if (!user.isActive) return es.users.status.inactive;
  return user.isLocked ? es.users.status.locked : es.users.status.active;
}

export function UsersTable({ users, unlockAction }: { readonly users: readonly UserListItem[]; readonly unlockAction: UnlockUserAction }) {
  if (users.length === 0) return <p className="text-muted-foreground">{es.users.empty}</p>;
  return (
    <table className="w-full border-collapse overflow-hidden rounded-lg border bg-surface text-sm">
      <thead className="bg-surface-muted text-left">
        <tr>
          <th className="px-3 py-2 font-medium">{es.users.columns.name}</th>
          <th className="px-3 py-2 font-medium">{es.users.columns.email}</th>
          <th className="px-3 py-2 font-medium">{es.users.columns.role}</th>
          <th className="px-3 py-2 font-medium">{es.users.columns.status}</th>
          <th className="px-3 py-2 font-medium">
            <span className="sr-only">{es.users.columns.actions}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id} className="border-t">
            <td className="px-3 py-2">{user.displayName}</td>
            <td className="px-3 py-2">{user.email}</td>
            <td className="px-3 py-2">{es.roles[user.role]}</td>
            <td className="px-3 py-2">{statusOf(user)}</td>
            <td className="px-3 py-2">{user.isActive && user.isLocked && <UnlockUserForm user={user} action={unlockAction} />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
