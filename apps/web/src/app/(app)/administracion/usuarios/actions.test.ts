/**
 * Server Action de desbloqueo (T3.9, adelantado en T1.17): envuelta en `withPermission("users:manage")`, pasa
 * el id del formulario al caso de uso con el usuario de la sesión como autor, y revalida la página si va bien.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnlockUserResult } from "@/application/admin/users";

const state = vi.hoisted(() => ({ allowed: true, permissions: [] as string[] }));
const unlockUser = vi.fn<(actorUserId: string, input: unknown) => Promise<UnlockUserResult>>(async () => ({ ok: true }));
const revalidatePath = vi.fn();

vi.mock("@/lib/container", () => ({
  getContainer: () => ({ unlockUser }),
  withPermission:
    (permission: string, handler: (session: unknown, ...args: unknown[]) => Promise<unknown>) =>
    async (...args: unknown[]) => {
      state.permissions.push(permission);
      return state.allowed ? handler({ userId: "u-admin" }, ...args) : { ok: false, status: 403, error: "FORBIDDEN", message: "Solo lectura." };
    },
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const actions = await import("./actions");

const form = (userId: string) => {
  const data = new FormData();
  data.set("userId", userId);
  return data;
};

beforeEach(() => {
  state.allowed = true;
  state.permissions = [];
  unlockUser.mockClear();
  revalidatePath.mockClear();
});

describe("unlockUser (Server Action)", () => {
  it("exige users:manage y desbloquea con el usuario de la sesión como autor", async () => {
    expect(await actions.unlockUser(null, form("u-luis"))).toEqual({ ok: true });
    expect(state.permissions).toEqual(["users:manage"]);
    expect(unlockUser).toHaveBeenCalledWith("u-admin", { userId: "u-luis" });
    expect(revalidatePath).toHaveBeenCalledWith("/administracion/usuarios");
  });

  it("si el caso de uso falla devuelve su resultado y no revalida la página", async () => {
    const failure: UnlockUserResult = { ok: false, error: "NOT_FOUND", message: "El usuario ya no existe." };
    unlockUser.mockResolvedValueOnce(failure);
    expect(await actions.unlockUser(null, form("u-borrado"))).toEqual(failure);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sin permiso devuelve la denegación (403) sin llamar al caso de uso", async () => {
    state.allowed = false;
    expect(await actions.unlockUser(null, form("u-luis"))).toMatchObject({ ok: false, status: 403, message: "Solo lectura." });
    expect(unlockUser).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("solo exporta la acción envuelta (lo comprueba también permission-coverage.test.ts)", () => {
    expect(Object.keys(actions)).toEqual(["unlockUser"]);
  });
});
