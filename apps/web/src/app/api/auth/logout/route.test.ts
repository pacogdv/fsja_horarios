/**
 * T1.15 — Route Handler de logout (specs/02-architecture-plan.md §5.2, paso 10): solo `POST`, que delega en el
 * adaptador del composition root (origen, revocación, cookie y redirección).
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";

const response = new Response(null, { status: 303, headers: { location: "/login" } });
const logoutRoute = vi.fn(async () => response);
vi.mock("@/lib/container", () => ({ getContainer: () => ({ logoutRoute }) }));

const routeModule = await import("./route");

describe("api/auth/logout", () => {
  it("POST delega en el adaptador con la petición", async () => {
    const request = new Request("https://horarios.example/api/auth/logout", { method: "POST" });
    expect(await routeModule.POST(request)).toBe(response);
    expect(logoutRoute).toHaveBeenCalledWith(request);
  });

  it("no exporta GET: un enlace o una imagen no pueden cerrar la sesión (Next.js responde 405)", () => {
    expect(Object.keys(routeModule)).toEqual(["POST"]);
  });
});
