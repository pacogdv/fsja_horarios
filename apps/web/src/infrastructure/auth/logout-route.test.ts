/**
 * T1.15 — Route Handler de logout (specs/02-architecture-plan.md §5.2, paso 10, y §5.3, lista blanca).
 */
import { describe, expect, it, vi } from "vitest";
import { ACCESS_DENIED_MESSAGES } from "./guards";
import { makeLogoutRoute } from "./logout-route";

const APP_ORIGIN = "https://horarios.example";

function setup(token: string | null) {
  const logout = vi.fn<(token: string) => Promise<void>>(async () => undefined);
  const clearSessionCookie = vi.fn(async () => undefined);
  const route = makeLogoutRoute({ logout, readSessionToken: async () => token, clearSessionCookie, appOrigin: APP_ORIGIN });
  return { logout, clearSessionCookie, route };
}

const post = (origin: string | null = APP_ORIGIN) =>
  new Request(`${APP_ORIGIN}/api/auth/logout`, { method: "POST", headers: origin === null ? {} : { origin } });

describe("makeLogoutRoute", () => {
  it("revoca la sesión, borra la cookie y redirige a /login con 303", async () => {
    const { route, logout, clearSessionCookie } = setup("tok");
    const response = await route(post());
    expect(logout).toHaveBeenCalledWith("tok");
    expect(clearSessionCookie).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("sin cookie no llama al caso de uso, pero borra la cookie y redirige igual", async () => {
    const { route, logout, clearSessionCookie } = setup(null);
    const response = await route(post());
    expect(logout).not.toHaveBeenCalled();
    expect(clearSessionCookie).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
  });

  it.each([
    ["de otro origen", "https://evil.example"],
    ["sin Origin", null],
  ])("rechaza con 403 una petición %s (CSRF) sin tocar la sesión", async (_case, origin) => {
    const { route, logout, clearSessionCookie } = setup("tok");
    const response = await route(post(origin));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: ACCESS_DENIED_MESSAGES.crossOrigin });
    expect(logout).not.toHaveBeenCalled();
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });
});
