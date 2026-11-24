"use client";

/**
 * Sidebar de la aplicación (specs/02-architecture-plan.md §6.3): secciones con encabezado en versalitas y el
 * elemento activo con barra de 3 px en `--primary` sobre `--surface-muted`. Plegado y versión móvil: pendientes.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/domain/access/role";
import { es } from "@/lib/i18n/es";
import { cn } from "@/ui/utils";
import { navigationFor } from "./navigation";

const isActive = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export function AppSidebar({ role }: { readonly role: Role }) {
  const pathname = usePathname();
  return (
    <nav aria-label={es.navigation.label} className="flex w-66 shrink-0 flex-col gap-4 border-r bg-surface p-3">
      <p className="px-3 pt-2 text-base font-semibold text-primary">{es.appName}</p>
      {navigationFor(role).map((section) => (
        <section key={section.title ?? "inicio"} className="flex flex-col gap-1">
          {section.title !== null && (
            <h2 className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{section.title}</h2>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isActive(item.href, pathname);
              return (
                <li key={`${item.href}#${item.label}`}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md border-l-3 border-transparent px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted",
                      active && "border-primary bg-surface-muted font-medium",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
