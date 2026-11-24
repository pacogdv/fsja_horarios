/**
 * Etiqueta de shadcn/ui, con `<label>` nativo en lugar de `@radix-ui/react-label` (no aporta nada a un
 * formulario sin controles personalizados).
 */
import type { ComponentProps } from "react";
import { cn } from "@/ui/utils";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label data-slot="label" className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}
