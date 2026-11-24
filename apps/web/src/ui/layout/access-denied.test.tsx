/**
 * Página de acceso denegado (specs/02-architecture-plan.md §5.3; T1.17): la muestran las páginas cuyo loader
 * deniega el permiso. Es solo presentación: los datos ya no se han cargado.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccessDenied } from "./access-denied";

describe("AccessDenied", () => {
  it("muestra el título y el motivo que da la guarda", () => {
    render(<AccessDenied message="No tienes permiso para realizar esta acción." />);
    expect(screen.getByRole("heading", { level: 1, name: "Acceso denegado" })).toBeInTheDocument();
    expect(screen.getByText("No tienes permiso para realizar esta acción.")).toBeInTheDocument();
  });

  it("ofrece volver al inicio", () => {
    render(<AccessDenied message="x" />);
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });
});
