/**
 * Administración de usuarios: listado y desbloqueo de cuentas (specs/03-tasks.md T3.9, adelantado en T1.17;
 * specs/02-architecture-plan.md §5.2: «ADMIN_DIRECCION puede desbloquear una cuenta al instante»).
 * La autorización (`users:manage`) la hace `withPermission` en el adaptador de entrada, no el caso de uso.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { FakeAuditLog, FakeClock, FakeUserRepository } from "../../../test/fakes/auth";
import { makeListUsers, makeUnlockUser, USER_NOT_FOUND_MESSAGE } from "./users";

const ADMIN_ID = "0196b8e4-0000-7000-8000-000000000001";
const LOCKED_ID = "0196b8e4-0000-7000-8000-000000000002";
const ACTIVE_ID = "0196b8e4-0000-7000-8000-000000000003";

let users: FakeUserRepository;
let auditLog: FakeAuditLog;
let clock: FakeClock;

beforeEach(() => {
  clock = new FakeClock();
  users = new FakeUserRepository();
  auditLog = new FakeAuditLog();
  users.add({ id: ADMIN_ID, email: "ana@centro.example", passwordHash: "argon2:x", role: "ADMIN_DIRECCION", displayName: "Ana" });
  users.add({
    id: LOCKED_ID,
    email: "luis@centro.example",
    passwordHash: "argon2:y",
    displayName: "Luis",
    failedLoginCount: 0,
    lockedUntil: new Date(clock.now().getTime() + 10 * 60_000),
  });
  users.add({ id: ACTIVE_ID, email: "bea@centro.example", passwordHash: "argon2:z", displayName: "Bea", isActive: false });
});

describe("makeListUsers", () => {
  it("lista los usuarios por correo con su estado, sin el hash de la contraseña", async () => {
    const list = await makeListUsers({ users, clock })();
    expect(list).toEqual([
      { id: ADMIN_ID, email: "ana@centro.example", displayName: "Ana", role: "ADMIN_DIRECCION", isActive: true, isLocked: false },
      { id: ACTIVE_ID, email: "bea@centro.example", displayName: "Bea", role: "DOCENTE", isActive: false, isLocked: false },
      { id: LOCKED_ID, email: "luis@centro.example", displayName: "Luis", role: "DOCENTE", isActive: true, isLocked: true },
    ]);
    expect(JSON.stringify(list)).not.toContain("argon2:");
  });

  it("un bloqueo ya vencido no cuenta como bloqueado", async () => {
    clock.advance(11 * 60_000);
    const list = await makeListUsers({ users, clock })();
    expect(list.find((user) => user.id === LOCKED_ID)?.isLocked).toBe(false);
  });
});

describe("makeUnlockUser", () => {
  it("quita el bloqueo, reinicia los fallos y lo registra en audit_log con quién lo hizo", async () => {
    users.byEmail("luis@centro.example").failedLoginCount = 3;
    const unlock = makeUnlockUser({ users, auditLog });
    expect(await unlock(ADMIN_ID, { userId: LOCKED_ID })).toEqual({ ok: true });
    expect(users.byEmail("luis@centro.example")).toMatchObject({ lockedUntil: null, failedLoginCount: 0 });
    expect(auditLog.entries).toEqual([
      { action: "auth.account.unlocked", userId: ADMIN_ID, entityType: "app_user", entityId: LOCKED_ID, metadata: {} },
    ]);
  });

  it.each([
    ["sin userId", {}],
    ["con un userId que no es un UUID", { userId: "1 OR 1=1" }],
    ["con campos de más", { userId: LOCKED_ID, role: "ADMIN_DIRECCION" }],
    ["con un valor que no es un objeto", "luis"],
  ])("rechaza la entrada %s sin tocar nada", async (_case, input) => {
    const result = await makeUnlockUser({ users, auditLog })(ADMIN_ID, input);
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    expect(users.byEmail("luis@centro.example").lockedUntil).not.toBeNull();
    expect(auditLog.entries).toEqual([]);
  });

  it("con un usuario que no existe responde NOT_FOUND y no registra nada", async () => {
    const result = await makeUnlockUser({ users, auditLog })(ADMIN_ID, { userId: "0196b8e4-0000-7000-8000-0000000000ff" });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND", message: USER_NOT_FOUND_MESSAGE });
    expect(auditLog.entries).toEqual([]);
  });
});
