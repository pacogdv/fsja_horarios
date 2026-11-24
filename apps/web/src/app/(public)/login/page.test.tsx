/**
 * T1.15 — Página de login (specs/02-architecture-plan.md §5.2): formulario con la ruta de vuelta `next`.
 * `next` solo se pasa si es un único texto; la acción lo vuelve a filtrar (sin redirecciones abiertas).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ login: vi.fn() }));

const { default: LoginPage } = await import("./page");

async function renderPage(searchParams: Record<string, string | string[] | undefined>) {
  render(await LoginPage({ searchParams: Promise.resolve(searchParams) }));
}

const nextField = () => document.querySelector<HTMLInputElement>('input[type="hidden"][name="next"]');

describe("LoginPage", () => {
  it("muestra el título y el formulario", async () => {
    await renderPage({});
    expect(screen.getByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
  });

  it("pasa next al formulario", async () => {
    await renderPage({ next: "/mi-horario" });
    expect(nextField()).toHaveValue("/mi-horario");
  });

  it.each([
    ["ausente", {}],
    ["repetido (?next=a&next=b)", { next: ["/a", "/b"] }],
  ])("con next %s usa /", async (_case, searchParams) => {
    await renderPage(searchParams);
    expect(nextField()).toHaveValue("/");
  });
});
