/**
 * T1.15 — Conmutador de tema (specs/02-architecture-plan.md §6.2): fuerza claro u oscuro con `data-theme`,
 * vuelve al del sistema y guarda la preferencia en cookie para que el SSR la pinte sin parpadeo.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.cookie = "fsja_theme=; Path=/; Max-Age=0";
});

const option = (name: string) => screen.getByRole("radio", { name });

describe("ThemeToggle", () => {
  it("muestra las tres opciones en un grupo accesible y marca la inicial", () => {
    render(<ThemeToggle initialPreference="system" />);
    expect(screen.getByRole("radiogroup", { name: "Tema" })).toBeInTheDocument();
    expect(option("Sistema")).toBeChecked();
    expect(option("Claro")).not.toBeChecked();
    expect(option("Oscuro")).not.toBeChecked();
  });

  it("al elegir Oscuro fuerza data-theme=dark y lo guarda en cookie", async () => {
    render(<ThemeToggle initialPreference="system" />);
    await userEvent.click(option("Oscuro"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("fsja_theme=dark");
    expect(option("Oscuro")).toBeChecked();
  });

  it("al elegir Claro fuerza data-theme=light (aunque el sistema esté en oscuro)", async () => {
    render(<ThemeToggle initialPreference="dark" />);
    await userEvent.click(option("Claro"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.cookie).toContain("fsja_theme=light");
  });

  it("al volver a Sistema quita data-theme: manda prefers-color-scheme", async () => {
    document.documentElement.dataset.theme = "dark";
    render(<ThemeToggle initialPreference="dark" />);
    await userEvent.click(option("Sistema"));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.cookie).toContain("fsja_theme=system");
  });

  it("se maneja con teclado (flechas del grupo de opciones)", async () => {
    render(<ThemeToggle initialPreference="light" />);
    option("Claro").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(option("Oscuro")).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
