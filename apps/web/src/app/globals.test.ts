// @vitest-environment node
/**
 * T1.15 — Tokens de diseño de globals.css: paleta de specs/02-architecture-plan.md §6.2 en claro y oscuro, y
 * contraste ≥ 4.5:1 de los tokens de texto sobre los fondos (WCAG 2.2 AA, 02 §6.7).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

/** Paleta de 02 §6.2, copiada de la spec (no de la implementación). */
const SPEC_PALETTE = {
  light: {
    background: "#F7F6F3",
    surface: "#FFFFFF",
    "surface-muted": "#EFEDE8",
    border: "#DEDAD2",
    foreground: "#1C1E21",
    "muted-foreground": "#5F646B",
    primary: "#1F3A5F",
    "primary-foreground": "#FFFFFF",
    accent: "#B08D57",
    success: "#2F6B4F",
    warning: "#8A5F10",
    danger: "#A23B3B",
    info: "#2D5D7B",
    ring: "#1F3A5F",
  },
  dark: {
    background: "#111315",
    surface: "#181B1F",
    "surface-muted": "#1F2328",
    border: "#2C3137",
    foreground: "#E8E6E1",
    "muted-foreground": "#9BA1A8",
    primary: "#8FB1DB",
    "primary-foreground": "#0E1A2B",
    accent: "#C9A971",
    success: "#6FBF94",
    warning: "#E0B252",
    danger: "#E58A8A",
    info: "#7DB3D6",
    ring: "#8FB1DB",
  },
} as const;

type Mode = keyof typeof SPEC_PALETTE;
type Token = keyof (typeof SPEC_PALETTE)["light"];

const TEXT_TOKENS = ["foreground", "muted-foreground", "primary", "success", "warning", "danger", "info"] as const;
const BACKGROUND_TOKENS = ["background", "surface", "surface-muted"] as const;
const MIN_TEXT_CONTRAST = 4.5;

/** Declaraciones `--token: valor` del primer bloque cuyo selector es exactamente `selector`. */
function tokensOf(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  if (block === undefined) throw new Error(`globals.css no tiene el bloque ${selector}`);
  return Object.fromEntries([...block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, name = "", value = ""]) => [name, value.trim()]));
}

const LIGHT_SELECTOR = ":root";
const FORCED_DARK_SELECTOR = ':root[data-theme="dark"]';
const SYSTEM_DARK_SELECTOR = ':root:not([data-theme="light"])';

const palette = (mode: Mode) => tokensOf(mode === "light" ? LIGHT_SELECTOR : FORCED_DARK_SELECTOR);

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [red = 0, green = 0, blue = 0] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Contraste WCAG 2.x entre dos colores `#RRGGBB`. */
function contrast(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

describe("contraste WCAG (comprobación del cálculo)", () => {
  it("negro sobre blanco es 21:1 y un color consigo mismo 1:1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBe(1);
  });
});

describe.each(["light", "dark"] as const)("paleta en modo %s [02 §6.2]", (mode) => {
  it("los tokens coinciden con la spec", () => {
    const tokens = palette(mode);
    for (const [token, value] of Object.entries(SPEC_PALETTE[mode])) {
      expect(tokens[token]?.toUpperCase(), `--${token}`).toBe(value);
    }
  });

  const pairs = [
    ...TEXT_TOKENS.flatMap((text) => BACKGROUND_TOKENS.map((background) => [text, background] as const)),
    ["primary-foreground", "primary"] as const,
  ] satisfies readonly (readonly [Token, Token])[];

  it.each(pairs)(`--%s sobre --%s tiene contraste ≥ ${MIN_TEXT_CONTRAST}:1`, (text, background) => {
    const tokens = palette(mode);
    const ratio = contrast(tokens[text] ?? "", tokens[background] ?? "");
    expect(ratio, `${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});

describe("modo oscuro: sistema o forzado [02 §6.2]", () => {
  it("el oscuro del sistema (prefers-color-scheme) y el forzado (data-theme) son idénticos", () => {
    expect(tokensOf(SYSTEM_DARK_SELECTOR)).toEqual(tokensOf(FORCED_DARK_SELECTOR));
  });

  it("el oscuro del sistema solo se aplica con prefers-color-scheme: dark y si no se ha forzado el claro", () => {
    expect(css).toMatch(
      /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{/,
    );
  });

  it("cada modo declara su color-scheme (controles nativos y barras de desplazamiento)", () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/);
  });
});
