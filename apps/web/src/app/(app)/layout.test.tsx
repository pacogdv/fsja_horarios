/**
 * T1.15 — Layout de las rutas autenticadas (specs/02-architecture-plan.md §5.3 y §6.3; TFM-03).
 * Sin sesión vigente redirige a /login (el proxy solo mira si hay cookie; aquí se valida de verdad).
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/container";

const state = vi.hoisted(() => ({ user: null as CurrentUser | null, theme: undefined as string | undefined }));

class RedirectError extends Error {}
const redirect = vi.fn((url: string) => {
  throw new RedirectError(url);
});

vi.mock("@/lib/container", () => ({ getContainer: () => ({ currentUser: async () => state.user }) }));
vi.mock("next/navigation", () => ({ redirect, usePathname: () => "/" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fsja_theme" && state.theme ? { name, value: state.theme } : undefined) }),
}));

const { default: AppLayout } = await import("./layout");

async function renderLayout() {
  render(await AppLayout({ children: <p>Contenido</p> }));
}

beforeEach(() => {
  redirect.mockClear();
  state.user = { userId: "u1", role: "ADMIN_DIRECCION", displayName: "Ana Directora" };
  state.theme = undefined;
});

describe("(app)/layout", () => {
  it("sin sesión vigente redirige a /login y no pinta nada", async () => {
    state.user = null;
    await expect(AppLayout({ children: <p>Contenido</p> })).rejects.toBeInstanceOf(RedirectError);
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("con sesión pinta sidebar, barra superior y contenido en un main", async () => {
    await renderLayout();
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("Ana Directora");
    expect(screen.getByRole("main")).toHaveTextContent("Contenido");
  });

  it("filtra el sidebar con el rol de la sesión", async () => {
    state.user = { userId: "u2", role: "DOCENTE", displayName: "Luis" };
    await renderLayout();
    expect(screen.queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mi horario" })).toBeInTheDocument();
  });

  it("muestra el banner de demo solo con INVITADO_DEMO", async () => {
    await renderLayout();
    expect(screen.queryByRole("note", { name: "Modo demostración" })).not.toBeInTheDocument();
  });

  it("con INVITADO_DEMO muestra el banner de solo lectura", async () => {
    state.user = { userId: "u3", role: "INVITADO_DEMO", displayName: "Invitado" };
    await renderLayout();
    expect(screen.getByRole("note", { name: "Modo demostración" })).toBeInTheDocument();
  });

  it("el conmutador de tema parte de la preferencia guardada en cookie", async () => {
    state.theme = "dark";
    await renderLayout();
    expect(screen.getByRole("radio", { name: "Oscuro" })).toBeChecked();
  });
});
