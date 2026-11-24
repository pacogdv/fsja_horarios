/**
 * Layout de las rutas autenticadas (specs/02-architecture-plan.md §5.3 y §6.3).
 *
 * El proxy solo comprueba que haya cookie: aquí se valida la sesión de verdad y, si no es válida, se vuelve al
 * login. El sidebar y el banner de demo dependen del rol, pero son solo presentación: cada acción y cada
 * Route Handler se autoriza en el servidor con `withPermission`.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getContainer } from "@/lib/container";
import { AppSidebar } from "@/ui/layout/app-sidebar";
import { DemoBanner } from "@/ui/layout/demo-banner";
import { parseThemePreference, THEME_COOKIE } from "@/ui/layout/theme";
import { Topbar } from "@/ui/layout/topbar";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getContainer().currentUser();
  if (user === null) redirect("/login");
  const themePreference = parseThemePreference((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="flex min-h-screen">
      <AppSidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar displayName={user.displayName} role={user.role} themePreference={themePreference} />
        <DemoBanner role={user.role} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
