/**
 * Layout raíz (specs/02-architecture-plan.md §5.5 y §6.2).
 * - T1.14: el nonce de la CSP solo se aplica a páginas renderizadas por petición. Una página prerenderizada en
 *   el build sale con scripts sin nonce, y la CSP los bloquea.
 * - T1.15: el tema elegido (cookie `fsja_theme`) se pinta en `<html data-theme>` desde el servidor, sin parpadeo.
 */
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const connection = vi.fn(() => Promise.resolve());
const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/server", () => ({ connection }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined) }),
}));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "font-inter-variable", className: "font-inter" }) }));

const { default: RootLayout } = await import("./layout");

type HtmlProps = { lang: string; "data-theme"?: string; className?: string };
const html = async () => (await RootLayout({ children: null })) as ReactElement<HtmlProps>;

describe("RootLayout", () => {
  beforeEach(() => {
    connection.mockClear();
    cookieJar.clear();
  });

  it("espera a la petición (connection) antes de renderizar: todas las páginas son dinámicas", async () => {
    await html();
    expect(connection).toHaveBeenCalledOnce();
  });

  it("está en español y carga la variable de la fuente Inter autoalojada", async () => {
    const { props } = await html();
    expect(props.lang).toBe("es");
    expect(props.className).toContain("font-inter-variable");
  });

  it.each([
    ["dark", "dark"],
    ["light", "light"],
  ])("con la cookie fsja_theme=%s pinta data-theme=%s", async (cookie, attribute) => {
    cookieJar.set("fsja_theme", cookie);
    expect((await html()).props["data-theme"]).toBe(attribute);
  });

  it.each([undefined, "system", "manipulada"])("con fsja_theme=%s no fuerza el tema: manda prefers-color-scheme", async (cookie) => {
    if (cookie !== undefined) cookieJar.set("fsja_theme", cookie);
    expect((await html()).props["data-theme"]).toBeUndefined();
  });
});
