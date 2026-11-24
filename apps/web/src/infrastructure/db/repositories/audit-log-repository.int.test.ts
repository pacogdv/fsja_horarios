/**
 * T1.12 — Registro de auditoría en `audit_log` (specs/02-architecture-plan.md §2.2 y §5.2, paso 9).
 */
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import type { Clock } from "@/application/ports/clock";
import { createPrismaClient } from "@/infrastructure/db/prisma-client";
import { PrismaAuditLog } from "./audit-log-repository";

const { testUrl } = inject("testDatabase");
const prisma = createPrismaClient(testUrl);
const AT = new Date("2026-11-24T08:00:00.000Z");
const clock: Clock = { now: () => AT };
const auditLog = new PrismaAuditLog(prisma, clock);

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.appUser.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("T1.12 PrismaAuditLog", () => {
  it("guarda la acción, el usuario, la entidad, los metadatos y el instante del reloj", async () => {
    const user = await prisma.appUser.create({
      data: { email: "ana@x.es", passwordHash: "h", displayName: "Ana", role: "DOCENTE" },
    });
    await auditLog.record({
      action: "auth.login.succeeded",
      userId: user.id,
      entityType: "app_user",
      entityId: user.id,
      metadata: { ip: "203.0.113.7" },
    });
    expect(await prisma.auditLog.findMany()).toEqual([
      expect.objectContaining({
        action: "auth.login.succeeded",
        userId: user.id,
        entityType: "app_user",
        entityId: user.id,
        metadata: { ip: "203.0.113.7" },
        at: AT,
      }),
    ]);
  });

  it("admite entradas sin usuario ni entidad (p. ej. login de un correo inexistente)", async () => {
    await auditLog.record({ action: "auth.login.failed", userId: null, entityType: "app_user", entityId: null, metadata: {} });
    expect(await prisma.auditLog.findFirst()).toMatchObject({ userId: null, entityId: null, metadata: {} });
  });
});
