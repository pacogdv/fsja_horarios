/**
 * Tabla de usuarios con desbloqueo de cuentas (T3.9, adelantado en T1.17). La acción la autoriza el servidor
 * (`withPermission("users:manage")`): si la deniega, el formulario muestra el motivo.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UserListItem } from "@/application/admin/users";
import { UsersTable, type UnlockUserAction } from "./users-table";

const USERS: UserListItem[] = [
  { id: "u-ana", email: "ana@centro.example", displayName: "Ana", role: "ADMIN_DIRECCION", isActive: true, isLocked: false },
  { id: "u-luis", email: "luis@centro.example", displayName: "Luis", role: "DOCENTE", isActive: true, isLocked: true },
  { id: "u-bea", email: "bea@centro.example", displayName: "Bea", role: "INVITADO_DEMO", isActive: false, isLocked: false },
];

const row = (name: string) => screen.getByRole("row", { name: new RegExp(name) });

describe("UsersTable", () => {
  it("lista nombre, correo, rol legible y estado de cada usuario", () => {
    render(<UsersTable users={USERS} unlockAction={vi.fn<UnlockUserAction>()} />);
    expect(within(row("Ana")).getByText("ana@centro.example")).toBeInTheDocument();
    expect(within(row("Ana")).getByText("Dirección")).toBeInTheDocument();
    expect(within(row("Ana")).getByText("Activa")).toBeInTheDocument();
    expect(within(row("Luis")).getByText("Bloqueada")).toBeInTheDocument();
    expect(within(row("Bea")).getByText("Desactivada")).toBeInTheDocument();
  });

  it("solo ofrece desbloquear las cuentas bloqueadas", () => {
    render(<UsersTable users={USERS} unlockAction={vi.fn<UnlockUserAction>()} />);
    expect(within(row("Luis")).getByRole("button", { name: "Desbloquear a Luis" })).toBeInTheDocument();
    expect(within(row("Ana")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("envía el id del usuario y anuncia el resultado", async () => {
    const unlockAction = vi.fn<UnlockUserAction>(async () => ({ ok: true }));
    render(<UsersTable users={USERS} unlockAction={unlockAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Desbloquear a Luis" }));
    expect(unlockAction.mock.calls[0]?.[1].get("userId")).toBe("u-luis");
    expect(await screen.findByRole("status")).toHaveTextContent("Cuenta desbloqueada.");
  });

  it("si el servidor deniega la acción, muestra su motivo como alerta", async () => {
    const message = "La cuenta de demostración es de solo lectura: no puede modificar datos ni lanzar el motor.";
    const unlockAction = vi.fn<UnlockUserAction>(async () => ({ ok: false, message }));
    render(<UsersTable users={USERS} unlockAction={unlockAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Desbloquear a Luis" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("sin usuarios lo indica", () => {
    render(<UsersTable users={[]} unlockAction={vi.fn<UnlockUserAction>()} />);
    expect(screen.getByText("No hay usuarios.")).toBeInTheDocument();
  });
});
