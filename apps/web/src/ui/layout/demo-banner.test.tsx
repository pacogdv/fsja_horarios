/**
 * T1.15 — Banner de modo demo solo para INVITADO_DEMO (specs/02-architecture-plan.md §6.3; TFM-03).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoBanner } from "./demo-banner";

describe("DemoBanner", () => {
  it("con INVITADO_DEMO avisa de que es solo lectura", () => {
    render(<DemoBanner role="INVITADO_DEMO" />);
    const banner = screen.getByRole("note", { name: "Modo demostración" });
    expect(banner).toHaveTextContent(/solo lectura/i);
  });

  it.each(["ADMIN_DIRECCION", "DOCENTE"] as const)("con %s no aparece", (role) => {
    const { container } = render(<DemoBanner role={role} />);
    expect(container).toBeEmptyDOMElement();
  });
});
