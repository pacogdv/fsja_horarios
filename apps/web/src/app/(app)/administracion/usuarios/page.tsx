/**
 * Administración de usuarios (T3.9, adelantado en T1.17: listado y desbloqueo). El loader va envuelto en
 * `withPermission("users:manage")`: sin permiso se muestra «Acceso denegado» y no se carga ningún dato (02 §5.3).
 */
import type { Metadata } from "next";
import { getContainer, isAccessDenied, withPermission } from "@/lib/container";
import { es } from "@/lib/i18n/es";
import { UsersTable } from "@/ui/admin/users-table";
import { AccessDenied } from "@/ui/layout/access-denied";
import { unlockUser } from "./actions";

export const metadata: Metadata = { title: `${es.users.title} · ${es.appName}` };

const loadUsers = withPermission("users:manage", async () => getContainer().listUsers());

export default async function UsersPage() {
  const users = await loadUsers();
  if (isAccessDenied(users)) return <AccessDenied message={users.message} />;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{es.users.title}</h1>
      <UsersTable users={users} unlockAction={unlockUser} />
    </section>
  );
}
