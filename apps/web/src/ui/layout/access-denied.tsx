/**
 * Acceso denegado (specs/02-architecture-plan.md §5.3). La pinta una página cuyo loader `withPermission`
 * deniega; el mensaje es el de la guarda (sin permiso, o cuenta de demo de solo lectura).
 */
import Link from "next/link";
import { es } from "@/lib/i18n/es";

export function AccessDenied({ message }: { readonly message: string }) {
  return (
    <section className="flex max-w-xl flex-col gap-3">
      <h1 className="text-2xl font-semibold">{es.accessDenied.title}</h1>
      <p className="text-muted-foreground">{message}</p>
      <Link href="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        {es.accessDenied.backHome}
      </Link>
    </section>
  );
}
