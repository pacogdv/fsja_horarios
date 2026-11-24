/**
 * T1.15 — Sidebar filtrado por permisos y con el elemento activo marcado (specs/02-architecture-plan.md §6.3).
 */
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./app-sidebar";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

beforeEach(() => {
  pathname.current = "/";
});

const navigation = () => screen.getByRole("navigation", { name: "Navegación principal" });
const linkTexts = () => within(navigation()).getAllByRole("link").map((link) => link.textContent);

describe("AppSidebar", () => {
  it("DOCENTE ve solo Inicio, Mi horario, Mis preferencias y Exportar mi horario", () => {
    render(<AppSidebar role="DOCENTE" />);
    expect(linkTexts()).toEqual(["Inicio", "Mi horario", "Mis preferencias", "Exportar mi horario"]);
  });

  it("ADMIN_DIRECCION ve la administración de usuarios con su encabezado de sección", () => {
    render(<AppSidebar role="ADMIN_DIRECCION" />);
    expect(within(navigation()).getByRole("heading", { name: "Administración" })).toBeInTheDocument();
    expect(within(navigation()).getByRole("link", { name: "Usuarios" })).toHaveAttribute("href", "/administracion/usuarios");
  });

  it("INVITADO_DEMO no ve la administración de usuarios", () => {
    render(<AppSidebar role="INVITADO_DEMO" />);
    expect(within(navigation()).queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument();
  });

  it("marca con aria-current la página actual, también en sus subrutas", () => {
    pathname.current = "/datos/profesores/123";
    render(<AppSidebar role="ADMIN_DIRECCION" />);
    expect(within(navigation()).getByRole("link", { name: "Profesores" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation()).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("Inicio solo está activo en la raíz", () => {
    render(<AppSidebar role="DOCENTE" />);
    expect(within(navigation()).getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation()).getByRole("link", { name: "Mi horario" })).not.toHaveAttribute("aria-current");
  });
});
