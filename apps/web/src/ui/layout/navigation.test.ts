/**
 * T1.15 — Navegación del sidebar filtrada por permisos (specs/02-architecture-plan.md §6.3; TFM-03).
 * Es solo presentación: la autorización real la hacen las guardas de servidor (02 §5.3).
 */
import { describe, expect, it } from "vitest";
import { navigationFor } from "./navigation";

const labels = (role: Parameters<typeof navigationFor>[0]) =>
  navigationFor(role).flatMap((section) => section.items.map((item) => item.label));

const hrefs = (role: Parameters<typeof navigationFor>[0]) =>
  navigationFor(role).flatMap((section) => section.items.map((item) => item.href));

describe("navigationFor", () => {
  it("DOCENTE ve solo Inicio, Mi horario, Mis preferencias y Exportar mi horario [02 §6.3]", () => {
    expect(labels("DOCENTE")).toEqual(["Inicio", "Mi horario", "Mis preferencias", "Exportar mi horario"]);
  });

  it("ADMIN_DIRECCION ve todas las secciones de 02 §6.3 y no las entradas «mi …», que cubren las generales", () => {
    const sections = navigationFor("ADMIN_DIRECCION").map((section) => section.title);
    expect(sections).toEqual([null, "Configuración", "Datos", "No lectiva", "Motor", "Horarios", "Datos E/S", "Administración"]);
    expect(labels("ADMIN_DIRECCION")).toEqual(expect.arrayContaining(["Inicio", "Usuarios", "Validar y calcular", "Importar / Exportar"]));
    expect(labels("ADMIN_DIRECCION")).not.toEqual(expect.arrayContaining(["Mi horario"]));
    expect(labels("ADMIN_DIRECCION")).not.toEqual(expect.arrayContaining(["Mis preferencias"]));
    expect(labels("ADMIN_DIRECCION")).not.toEqual(expect.arrayContaining(["Exportar mi horario"]));
  });

  it("INVITADO_DEMO navega por todo el centro en lectura (TFM-03), sin administración", () => {
    const sections = navigationFor("INVITADO_DEMO").map((section) => section.title);
    expect(sections).toEqual([null, "Configuración", "Datos", "No lectiva", "Motor", "Horarios", "Datos E/S"]);
    expect(labels("INVITADO_DEMO")).not.toContain("Usuarios");
    expect(labels("INVITADO_DEMO")).not.toContain("Mi horario");
  });

  it.each(["ADMIN_DIRECCION", "DOCENTE", "INVITADO_DEMO"] as const)("%s: no hay secciones vacías", (role) => {
    for (const section of navigationFor(role)) expect(section.items.length).toBeGreaterThan(0);
  });

  it.each(["ADMIN_DIRECCION", "DOCENTE", "INVITADO_DEMO"] as const)(
    "%s: los enlaces son rutas internas únicas de (app)",
    (role) => {
      const all = hrefs(role);
      expect(new Set(all).size).toBe(all.length);
      for (const href of all) expect(href).toMatch(/^\/(?!\/)[a-z0-9/-]*$/);
    },
  );

  it.each(["", "SUPERUSER", "toString"])("un rol desconocido (%j) solo ve Inicio", (role) => {
    expect(labels(role as "DOCENTE")).toEqual(["Inicio"]);
  });
});
