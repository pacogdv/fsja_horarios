/**
 * Preferencia de tema (specs/02-architecture-plan.md §6.2). La cookie la escribe el navegador y la lee el
 * servidor para pintar `data-theme` sin parpadeo; no es sensible, así que no es `HttpOnly`.
 */
export const THEME_COOKIE = "fsja_theme";
export const THEME_PREFERENCES = Object.freeze(["light", "dark", "system"] as const);
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

const KNOWN_PREFERENCES: ReadonlySet<string> = new Set(THEME_PREFERENCES);
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** El valor llega del navegador: cualquier cosa que no sea una preferencia conocida es `system`. */
export function parseThemePreference(value: string | undefined): ThemePreference {
  return value !== undefined && KNOWN_PREFERENCES.has(value) ? (value as ThemePreference) : "system";
}

/** Valor de `data-theme`: solo se fuerza claro u oscuro; con `system` manda `prefers-color-scheme`. */
export function themeAttribute(preference: ThemePreference): "light" | "dark" | undefined {
  return preference === "system" ? undefined : preference;
}

export function themeCookie(preference: ThemePreference, { secure }: { readonly secure: boolean }): string {
  return `${THEME_COOKIE}=${preference}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
