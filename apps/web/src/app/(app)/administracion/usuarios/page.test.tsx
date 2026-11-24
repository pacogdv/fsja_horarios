/**
 * Página de usuarios (T3.9, adelantado en T1.17): el loader va envuelto en `withPermission("users:manage")`.
 * Sin permiso se muestra «Acceso denegado» y no se carga ningún dato (02 §5.3).
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserListItem } from "@/application/admin/users";

const state = vi.hoisted(() => ({ allowed: true, permissions: [] as string[] }));
const listUsers = vi.fn(async (): Promise<UserListItem[]> => [
  { id: "u-ana", email: "ana@centro.example", displayName: "Ana", role: "ADMIN_DIRECCION", isActive: true, isLocked: false },
]);

vi.mock("@/lib/container", () => ({
  getContainer: () => ({ listUsers }),
  isAccessDenied: (value: unknown) => typeof value === "object" && value !== null && "ok" in value && value.ok === false,
  withPermission:
    (permission: string, handler: (session: unknown, ...args: unknown[]) => Promise<unknown>) =>
    async (...args: unknown[]) => {
      state.permissions.push(permission);
      return state.allowed ? handler({ userId: "u-ana" }, ...args) : { ok: false, status: 403, error: "FORBIDDEN", message: "Sin permiso." };
    },
}));
vi.mock("./actions", () => ({ unlockUser: vi.fn() }));

const { default: UsersPage } = await import("./page");

beforeEach(() => {
  state.allowed = true;
  state.permissions = [];
  listUsers.mockClear();
});

describe("administracion/usuarios", () => {
  it("exige users:manage", async () => {
    render(await UsersPage());
    expect(state.permissions).toEqual(["users:manage"]);
  });

  it("con permiso lista los usuarios", async () => {
    render(await UsersPage());
    expect(screen.getByRole("heading", { level: 1, name: "Usuarios" })).toBeInTheDocument();
    expect(screen.getByText("ana@centro.example")).toBeInTheDocument();
  });

  it("sin permiso muestra Acceso denegado con el motivo y no carga los usuarios", async () => {
    state.allowed = false;
    render(await UsersPage());
    expect(screen.getByRole("heading", { level: 1, name: "Acceso denegado" })).toBeInTheDocument();
    expect(screen.getByText("Sin permiso.")).toBeInTheDocument();
    expect(listUsers).not.toHaveBeenCalled();
  });
});
