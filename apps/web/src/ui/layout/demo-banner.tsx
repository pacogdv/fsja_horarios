/**
 * Banner de modo demo (specs/02-architecture-plan.md §6.3; TFM-03). Solo informa: la escritura la bloquean las
 * guardas de servidor con 403 y un mensaje explicativo.
 */
import type { Role } from "@/domain/access/role";
import { es } from "@/lib/i18n/es";

export function DemoBanner({ role }: { readonly role: Role }) {
  if (role !== "INVITADO_DEMO") return null;
  return (
    <div
      role="note"
      aria-label={es.demoBanner.label}
      className="border-b border-warning bg-surface-muted px-6 py-2 text-sm text-foreground"
    >
      {es.demoBanner.text}
    </div>
  );
}
