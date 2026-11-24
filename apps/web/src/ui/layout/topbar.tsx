/**
 * Barra superior (specs/02-architecture-plan.md §6.3): usuario, conmutador de tema y cierre de sesión. El selector
 * de curso llega con `configuracion/curso` (H2) y la paleta de comandos (⌘K) está pendiente de asignar.
 */
import type { Role } from "@/domain/access/role";
import { es } from "@/lib/i18n/es";
import { Button } from "@/ui/components/ui/button";
import type { ThemePreference } from "./theme";
import { ThemeToggle } from "./theme-toggle";

export interface TopbarProps {
  readonly displayName: string;
  readonly role: Role;
  readonly themePreference: ThemePreference;
}

export function Topbar({ displayName, role, themePreference }: TopbarProps) {
  return (
    <header className="flex items-center justify-end gap-4 border-b bg-surface px-6 py-2">
      <ThemeToggle initialPreference={themePreference} />
      <p className="flex flex-col text-right text-sm leading-tight">
        <span className="font-medium">{displayName}</span>
        <span className="text-xs text-muted-foreground">{es.roles[role]}</span>
      </p>
      {/* POST: un enlace o una imagen de otra web no pueden cerrar la sesión (el Route Handler comprueba Origin). */}
      <form method="post" action="/api/auth/logout">
        <Button type="submit" variant="outline" size="sm">
          {es.topbar.logout}
        </Button>
      </form>
    </header>
  );
}
