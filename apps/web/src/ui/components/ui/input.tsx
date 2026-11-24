/**
 * Campo de texto de shadcn/ui (estilo new-york), adaptado a los tokens de 02 §6.2. `aria-invalid` pinta el
 * borde de error, además del mensaje asociado con `aria-describedby` (el color nunca es la única señal).
 */
import type { ComponentProps } from "react";
import { cn } from "@/ui/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-9 w-full rounded-md border bg-surface px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}
