/**
 * T1.15 — Barra superior (specs/02-architecture-plan.md §6.3): usuario, conmutador de tema y cierre de sesión.
 * El selector de curso llega en T2.x (`configuracion/curso`) y la paleta de comandos está pendiente de asignar.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Topbar } from "./topbar";

describe("Topbar", () => {
  it("muestra el nombre del usuario y el rol en texto legible", () => {
    render(<Topbar displayName="Ana Directora" role="ADMIN_DIRECCION" themePreference="system" />);
    const banner = screen.getByRole("banner");
    expect(within(banner).getByText("Ana Directora")).toBeInTheDocument();
    expect(within(banner).getByText("Dirección")).toBeInTheDocument();
  });

  it("incluye el conmutador de tema con la preferencia actual", () => {
    render(<Topbar displayName="Ana" role="DOCENTE" themePreference="dark" />);
    expect(screen.getByRole("radio", { name: "Oscuro" })).toBeChecked();
  });

  it("cierra sesión con un POST a /api/auth/logout (nunca con un GET: un enlace o una imagen podrían dispararlo)", () => {
    render(<Topbar displayName="Ana" role="DOCENTE" themePreference="system" />);
    const button = screen.getByRole("button", { name: "Cerrar sesión" });
    const form = button.closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/auth/logout");
  });
});
