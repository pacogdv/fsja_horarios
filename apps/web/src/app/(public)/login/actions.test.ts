/**
 * T1.15 — Server Action de login (specs/02-architecture-plan.md §5.2, pasos 1 y 9): delega en el adaptador del
 * composition root y solo redirige si el login es correcto, a la ruta que este ya ha filtrado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_LOGIN_FORM_STATE } from "@/application/auth/login-form";
import type { LoginActionOutcome } from "@/lib/container";

const outcome = vi.hoisted(() => ({ current: null as LoginActionOutcome | null }));
const loginAction = vi.fn(async () => outcome.current);

class RedirectError extends Error {}
const redirect = vi.fn((url: string) => {
  throw new RedirectError(url);
});

vi.mock("@/lib/container", () => ({ getContainer: () => ({ loginAction }) }));
vi.mock("next/navigation", () => ({ redirect }));

const { login } = await import("./actions");

beforeEach(() => {
  loginAction.mockClear();
  redirect.mockClear();
});

describe("login (Server Action)", () => {
  it("con login correcto redirige a la ruta que devuelve el adaptador", async () => {
    outcome.current = { ok: true, redirectTo: "/mi-horario" };
    const formData = new FormData();
    await expect(login(INITIAL_LOGIN_FORM_STATE, formData)).rejects.toBeInstanceOf(RedirectError);
    expect(loginAction).toHaveBeenCalledWith(formData);
    expect(redirect).toHaveBeenCalledWith("/mi-horario");
  });

  it("con login fallido devuelve el estado del formulario sin redirigir", async () => {
    const state = { status: "error", email: "ana@centro.example", formError: "Credenciales no válidas" } as const;
    outcome.current = { ok: false, state };
    expect(await login(INITIAL_LOGIN_FORM_STATE, new FormData())).toEqual(state);
    expect(redirect).not.toHaveBeenCalled();
  });
});
