"use client";

/**
 * Conmutador de tema (specs/02-architecture-plan.md §6.2): grupo de radios nativos, accesible con teclado
 * (flechas) y lectores de pantalla. Aplica el tema al momento y lo guarda en cookie para el SSR.
 */
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { cn } from "@/ui/utils";
import { THEME_PREFERENCES, type ThemePreference, themeAttribute, themeCookie } from "./theme";

function applyTheme(preference: ThemePreference): void {
  const attribute = themeAttribute(preference);
  if (attribute === undefined) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = attribute;
  // `document.cookie` y no `cookieStore`: este último aún no está en todos los navegadores objetivo.
  document.cookie = themeCookie(preference, { secure: window.location.protocol === "https:" });
}

export function ThemeToggle({ initialPreference }: { readonly initialPreference: ThemePreference }) {
  const [preference, setPreference] = useState(initialPreference);

  function choose(next: ThemePreference): void {
    setPreference(next);
    applyTheme(next);
  }

  return (
    <div role="radiogroup" aria-label={es.theme.label} className="flex rounded-md border bg-surface p-0.5 text-sm">
      {THEME_PREFERENCES.map((option) => (
        <label
          key={option}
          className={cn(
            "cursor-pointer rounded px-2 py-1 text-muted-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring",
            preference === option && "bg-surface-muted text-foreground",
          )}
        >
          <input
            type="radio"
            name="theme"
            value={option}
            checked={preference === option}
            onChange={() => choose(option)}
            className="sr-only"
          />
          {es.theme[option]}
        </label>
      ))}
    </div>
  );
}
