/**
 * Utilidad `cn` de shadcn/ui (`components.json` → `@/ui/utils`): compone clases y resuelve los conflictos de
 * Tailwind (la última gana).
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
