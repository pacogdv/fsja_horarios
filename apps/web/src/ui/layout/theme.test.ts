/**
 * T1.15 — Preferencia de tema (specs/02-architecture-plan.md §6.2): `light`, `dark` o `system`, guardada en la
 * cookie `fsja_theme`. El valor llega del navegador: cualquier otro se trata como `system`.
 */
import { describe, expect, it } from "vitest";
import { parseThemePreference, THEME_COOKIE, themeAttribute, themeCookie } from "./theme";

describe("parseThemePreference", () => {
  it.each(["light", "dark", "system"] as const)("acepta %s", (value) => {
    expect(parseThemePreference(value)).toBe(value);
  });

  it.each([undefined, "", "DARK", "blue", "dark; Path=/", "__proto__", "toString"])(
    "trata %j como system (respeta prefers-color-scheme)",
    (value) => {
      expect(parseThemePreference(value)).toBe("system");
    },
  );
});

describe("themeAttribute", () => {
  it("fuerza el modo con data-theme solo si se ha elegido claro u oscuro", () => {
    expect(themeAttribute("light")).toBe("light");
    expect(themeAttribute("dark")).toBe("dark");
    expect(themeAttribute("system")).toBeUndefined();
  });
});

describe("themeCookie", () => {
  it("guarda la preferencia un año en todo el sitio, con SameSite=Lax", () => {
    expect(THEME_COOKIE).toBe("fsja_theme");
    expect(themeCookie("dark", { secure: false })).toBe("fsja_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax");
  });

  it("añade Secure si la página va por HTTPS", () => {
    expect(themeCookie("light", { secure: true })).toBe("fsja_theme=light; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });
});
