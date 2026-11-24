// @vitest-environment node
/**
 * T1.13 — Guardas de servidor: `requireSession` y `withPermission`.
 * Refs: specs/02-architecture-plan.md §5.3 y §5.6; CLAUDE.md §3.2.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Permission } from "@/domain/access/permission";
import { FakeClock, FakeSessionStore, FakeUserRepository } from "../../../test/fakes/auth";
import {
  ACCESS_DENIED_MESSAGES,
  type AuthenticatedSession,
  deferWithPermission,
  isAccessDenied,
  makeGuards,
  Unauthenticated,
} from "./guards";

const APP_ORIGIN = "https://horarios.example";

let sessions: FakeSessionStore;
let users: FakeUserRepository;
let cookieToken: string | null;
let guards: ReturnType<typeof makeGuards>;

/** Usuario con sesión vigente; devuelve su token. */
function signIn(id: string, role: "ADMIN_DIRECCION" | "DOCENTE" | "INVITADO_DEMO", extra: Record<string, unknown> = {}) {
  users.add({ id, email: `${id}@centro.example`, passwordHash: "h", role, ...extra });
  const token = `token-${id}`;
  sessions.seed(token, id);
  return token;
}

const request = (method: string, origin?: string | null) =>
  new Request(`${APP_ORIGIN}/api/x`, {
    method,
    headers: origin === null ? {} : { origin: origin ?? APP_ORIGIN },
  });

beforeEach(() => {
  sessions = new FakeSessionStore(new FakeClock());
  users = new FakeUserRepository();
  cookieToken = null;
  guards = makeGuards({ readSessionToken: async () => cookieToken, sessions, users, appOrigin: APP_ORIGIN });
});

describe("T1.13 requireSession [02 §5.3]", () => {
  it("devuelve la sesión con el usuario, su rol y su nombre visible (T1.15: barra superior)", async () => {
    cookieToken = signIn("u-admin", "ADMIN_DIRECCION", { displayName: "Ana Directora" });
    const session = await guards.requireSession();
    expect(session).toMatchObject({
      sessionId: "seeded-token-u-admin",
      userId: "u-admin",
      role: "ADMIN_DIRECCION",
      displayName: "Ana Directora",
    });
    expect(session.actor).toMatchObject({ role: "ADMIN_DIRECCION", teacherId: null });
  });

  it("incluye el docente vinculado y los grupos a los que da clase (P-04)", async () => {
    cookieToken = signIn("u-doc", "DOCENTE", { teacherId: "t-1", taughtClassGroupIds: ["g-1"] });
    const { actor } = await guards.requireSession();
    expect(actor.teacherId).toBe("t-1");
    expect([...actor.taughtClassGroupIds]).toEqual(["g-1"]);
  });

  it.each([
    ["sin cookie", () => null],
    ["con un token sin sesión vigente", () => "token-inexistente"],
    [
      "con un usuario desactivado",
      () => signIn("u-off", "DOCENTE", { isActive: false }),
    ],
    [
      "con una sesión cuyo usuario ya no existe",
      () => {
        sessions.seed("token-huerfano", "u-borrado");
        return "token-huerfano";
      },
    ],
  ])("lanza Unauthenticated (401) %s", async (_case, setup) => {
    cookieToken = setup();
    const error = await guards.requireSession().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Unauthenticated);
    expect((error as Unauthenticated).status).toBe(401);
  });

  it("los errores que no son de autenticación (p. ej. la BD caída) se propagan", async () => {
    cookieToken = signIn("u-admin", "ADMIN_DIRECCION");
    vi.spyOn(sessions, "findValid").mockRejectedValue(new Error("BD caída"));
    await expect(guards.requireSession()).rejects.toThrow("BD caída");
  });
});

describe("T1.13 withPermission (Server Actions y loaders)", () => {
  it("sin sesión devuelve 401 y no ejecuta el handler", async () => {
    const handler = vi.fn();
    const action = guards.withPermission("config:write", handler);
    expect(await action()).toEqual({
      ok: false,
      status: 401,
      error: "UNAUTHENTICATED",
      message: ACCESS_DENIED_MESSAGES.unauthenticated,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("sin permiso devuelve 403 y no ejecuta el handler", async () => {
    cookieToken = signIn("u-doc", "DOCENTE");
    const handler = vi.fn();
    expect(await guards.withPermission("config:write", handler)()).toEqual({
      ok: false,
      status: 403,
      error: "FORBIDDEN",
      message: ACCESS_DENIED_MESSAGES.forbidden,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("a INVITADO_DEMO le explica que la demo es de solo lectura (TFM-03)", async () => {
    cookieToken = signIn("u-demo", "INVITADO_DEMO");
    expect(await guards.withPermission("engine:run", vi.fn())()).toMatchObject({
      status: 403,
      message: ACCESS_DENIED_MESSAGES.demoReadOnly,
    });
  });

  it("con permiso ejecuta el handler con la sesión y los argumentos, y devuelve su resultado", async () => {
    cookieToken = signIn("u-admin", "ADMIN_DIRECCION");
    const handler = vi.fn(async (session: AuthenticatedSession, name: string) => `${session.userId}:${name}`);
    expect(await guards.withPermission("config:write", handler)("curso")).toBe("u-admin:curso");
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-admin" }), "curso");
  });

  it("un permiso desconocido se deniega (denegación por defecto)", async () => {
    cookieToken = signIn("u-admin", "ADMIN_DIRECCION");
    const handler = vi.fn();
    expect(await guards.withPermission("config:delete" as Permission, handler)()).toMatchObject({ status: 403 });
    expect(handler).not.toHaveBeenCalled();
  });

  describe("permisos sobre lo propio (resource)", () => {
    const readOwnTimetable = () =>
      guards.withPermission(
        "timetable:read:own",
        async (session: AuthenticatedSession, teacherId: string) => `horario de ${teacherId} para ${session.userId}`,
        { resource: (teacherId: string) => ({ kind: "teacher", teacherId }) },
      );

    it("concede el recurso del propio docente", async () => {
      cookieToken = signIn("u-doc", "DOCENTE", { teacherId: "t-1" });
      expect(await readOwnTimetable()("t-1")).toBe("horario de t-1 para u-doc");
    });

    it("deniega el de otro docente con 403", async () => {
      cookieToken = signIn("u-doc", "DOCENTE", { teacherId: "t-1" });
      expect(await readOwnTimetable()("t-2")).toMatchObject({ status: 403 });
    });

    it("sin resolver el recurso, un permiso de propiedad se deniega", async () => {
      cookieToken = signIn("u-doc", "DOCENTE", { teacherId: "t-1" });
      expect(await guards.withPermission("timetable:read:own", async () => "horario")()).toMatchObject({ status: 403 });
    });
  });
});

describe("T1.13 withPermission.route (Route Handlers)", () => {
  const ok = () => vi.fn(async () => new Response("hecho", { status: 200 }));

  it("sin sesión responde 401 y no ejecuta el handler", async () => {
    const handler = ok();
    const response = await guards.withPermission.route("timetable:read:any", handler)(request("GET"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: ACCESS_DENIED_MESSAGES.unauthenticated });
    expect(handler).not.toHaveBeenCalled();
  });

  it("sin permiso responde 403 y no ejecuta el handler", async () => {
    cookieToken = signIn("u-doc", "DOCENTE");
    const handler = ok();
    const response = await guards.withPermission.route("timetable:read:any", handler)(request("GET"));
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("con permiso devuelve la respuesta del handler, que recibe la sesión y la petición", async () => {
    cookieToken = signIn("u-admin", "ADMIN_DIRECCION");
    const handler = ok();
    const incoming = request("POST");
    const response = await guards.withPermission.route<{ params: object }>("config:write", handler)(incoming, { params: {} });
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-admin" }), incoming, { params: {} });
  });

  it.each([
    ["sin Origin", null],
    ["con otro Origin", "https://atacante.example"],
  ])("una mutación %s responde 403 antes de leer la sesión (CSRF) [02 §5.6]", async (_case, origin) => {
    cookieToken = signIn("u-admin", "ADMIN_DIRECCION");
    const readSession = vi.spyOn(sessions, "findValid");
    const handler = ok();
    const response = await guards.withPermission.route("config:write", handler)(request("DELETE", origin));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: ACCESS_DENIED_MESSAGES.crossOrigin });
    expect(handler).not.toHaveBeenCalled();
    expect(readSession).not.toHaveBeenCalled();
  });

  it("un GET sin Origin no se rechaza por CSRF", async () => {
    cookieToken = signIn("u-admin", "ADMIN_DIRECCION");
    expect((await guards.withPermission.route("config:read", ok())(request("GET", null))).status).toBe(200);
  });

  it("las respuestas de error no se guardan en caché", async () => {
    const response = await guards.withPermission.route("config:read", ok())(request("GET"));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

/** Handler que solo se ejecuta si la guarda concede el permiso. */
const done = () => vi.fn<(session: AuthenticatedSession) => Promise<string>>(async () => "hecho");

describe("T1.17 isAccessDenied: ¿pinta la página datos o «Acceso denegado»? [02 §5.3]", () => {
  it("reconoce las denegaciones reales de withPermission (401 y 403)", async () => {
    const unauthenticated = await guards.withPermission("config:read", done())();
    cookieToken = signIn("u-teacher", "DOCENTE");
    const forbidden = await guards.withPermission("config:write", done())();
    expect(isAccessDenied(unauthenticated)).toBe(true);
    expect(isAccessDenied(forbidden)).toBe(true);
  });

  it.each([
    ["el resultado de un handler", "hecho"],
    ["una lista de datos", [{ id: "u1" }]],
    ["un resultado de negocio fallido sin estado HTTP", { ok: false, error: "NOT_FOUND", message: "No existe." }],
    ["un estado que no es 401/403", { ok: false, status: 500, message: "x" }],
    ["un éxito", { ok: true, status: 403 }],
    ["null", null],
    ["undefined", undefined],
  ])("no confunde %s con una denegación", (_case, value) => {
    expect(isAccessDenied(value)).toBe(false);
  });
});

describe("T1.17 deferWithPermission (withPermission perezoso del composition root)", () => {
  it("no crea las guardas al envolver: next build importa las acciones sin entorno", () => {
    const getGuards = vi.fn(() => guards);
    deferWithPermission(getGuards)("config:read", done());
    expect(getGuards).not.toHaveBeenCalled();
  });

  it("al ejecutarse delega en withPermission con el mismo permiso, handler, argumentos y opciones", async () => {
    cookieToken = signIn("u-teacher", "DOCENTE", { teacherId: "t-1" });
    const handler = vi.fn(async (_session: AuthenticatedSession, teacherId: string) => `horario de ${teacherId}`);
    const action = deferWithPermission(() => guards)("timetable:read:own", handler, {
      resource: (teacherId: string) => ({ kind: "teacher", teacherId }),
    });
    expect(await action("t-1")).toBe("horario de t-1");
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-teacher" }), "t-1");
    expect(isAccessDenied(await action("t-2"))).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
