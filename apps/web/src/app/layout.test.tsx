/**
 * El nonce de la CSP solo se aplica a páginas renderizadas por petición (specs/02-architecture-plan.md §5.5;
 * T1.14). Una página prerenderizada en el build sale con scripts sin nonce, y la CSP los bloquea.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const connection = vi.fn(() => Promise.resolve());
vi.mock("next/server", () => ({ connection }));

const { default: RootLayout } = await import("./layout");

describe("RootLayout", () => {
  beforeEach(() => connection.mockClear());

  it("espera a la petición (connection) antes de renderizar: todas las páginas son dinámicas", async () => {
    await RootLayout({ children: null });
    expect(connection).toHaveBeenCalledOnce();
  });
});
