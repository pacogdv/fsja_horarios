// @vitest-environment node
/**
 * T1.12 — Caso de uso de logout (paso 10 de specs/02-architecture-plan.md §5.2).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { FakeAuditLog, FakeClock, FakeSessionStore } from "../../../test/fakes/auth";
import { makeLogout } from "./logout";

let sessions: FakeSessionStore;
let auditLog: FakeAuditLog;
let logout: ReturnType<typeof makeLogout>;

beforeEach(() => {
  sessions = new FakeSessionStore(new FakeClock());
  auditLog = new FakeAuditLog();
  logout = makeLogout({ sessions, auditLog });
});

describe("T1.12 logout [02 §5.2 paso 10]", () => {
  it("borra la sesión del token y lo registra en audit_log", async () => {
    sessions.seed("token-ana", "u-ana");
    await logout({ sessionToken: "token-ana" });
    expect(sessions.revoked).toEqual(["token-ana"]);
    expect(await sessions.findValid("token-ana")).toBeNull();
    expect(auditLog.entries).toEqual([
      { action: "auth.logout", userId: "u-ana", entityType: "app_user", entityId: "u-ana", metadata: {} },
    ]);
  });

  it("con un token desconocido o caducado no falla y no registra nada", async () => {
    await expect(logout({ sessionToken: "desconocido" })).resolves.toBeUndefined();
    expect(sessions.revoked).toEqual(["desconocido"]);
    expect(auditLog.entries).toEqual([]);
  });

  it("sin cookie de sesión no hace nada", async () => {
    await expect(logout({ sessionToken: null })).resolves.toBeUndefined();
    expect(sessions.revoked).toEqual([]);
    expect(auditLog.entries).toEqual([]);
  });
});
