/**
 * T1.12 — Repositorio de usuarios (credenciales y estado de login) sobre PostgreSQL.
 * Refs: specs/02-architecture-plan.md §2.2 y §5.2.
 */
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "@/infrastructure/db/prisma-client";
import { PrismaUserRepository } from "./user-repository";

const { testUrl } = inject("testDatabase");
const prisma = createPrismaClient(testUrl);
const repository = new PrismaUserRepository(prisma);

let userId: string;

beforeEach(async () => {
  await prisma.userSession.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.appUser.deleteMany();
  const user = await prisma.appUser.create({
    data: { email: "Ana@Centro.example", passwordHash: "$argon2id$hash", displayName: "Ana", role: "ADMIN_DIRECCION" },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const stored = () => prisma.appUser.findUniqueOrThrow({ where: { id: userId } });

describe("T1.12 PrismaUserRepository", () => {
  it("findCredentialsByEmail devuelve solo lo necesario para el login, sin distinguir mayúsculas", async () => {
    expect(await repository.findCredentialsByEmail("ana@centro.example")).toEqual({
      id: userId,
      passwordHash: "$argon2id$hash",
      role: "ADMIN_DIRECCION",
      isActive: true,
      failedLoginCount: 0,
      lockedUntil: null,
    });
  });

  it("findCredentialsByEmail devuelve null si no existe", async () => {
    expect(await repository.findCredentialsByEmail("nadie@centro.example")).toBeNull();
  });

  it("recordFailedLogin incrementa el contador de forma atómica y devuelve el nuevo valor", async () => {
    const counts = await Promise.all(Array.from({ length: 10 }, () => repository.recordFailedLogin(userId)));
    expect(counts.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect((await stored()).failedLoginCount).toBe(10);
  });

  it("lockUntil bloquea hasta la fecha indicada y reinicia el contador", async () => {
    await repository.recordFailedLogin(userId);
    const until = new Date("2026-11-24T08:15:00.000Z");
    await repository.lockUntil(userId, until);
    expect(await stored()).toMatchObject({ lockedUntil: until, failedLoginCount: 0 });
  });

  it("recordSuccessfulLogin reinicia fallos y bloqueo y guarda la fecha del login", async () => {
    await repository.recordFailedLogin(userId);
    await repository.lockUntil(userId, new Date("2026-11-24T08:15:00.000Z"));
    const at = new Date("2026-11-24T09:00:00.000Z");
    await repository.recordSuccessfulLogin(userId, at);
    expect(await stored()).toMatchObject({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: at });
  });

  it("findPrincipal devuelve rol, estado y nombre visible; sin docente ni grupos hasta T3.8 y el horario vigente (H5)", async () => {
    expect(await repository.findPrincipal(userId)).toEqual({
      role: "ADMIN_DIRECCION",
      displayName: "Ana",
      isActive: true,
      teacherId: null,
      taughtClassGroupIds: new Set(),
    });
  });

  it("findPrincipal refleja la desactivación y devuelve null si el usuario no existe", async () => {
    await prisma.appUser.update({ where: { id: userId }, data: { isActive: false } });
    expect((await repository.findPrincipal(userId))?.isActive).toBe(false);
    await prisma.appUser.delete({ where: { id: userId } });
    expect(await repository.findPrincipal(userId)).toBeNull();
  });

  it("updatePasswordHash sustituye el hash", async () => {
    await repository.updatePasswordHash(userId, "$argon2id$nuevo");
    expect((await stored()).passwordHash).toBe("$argon2id$nuevo");
  });
});

describe("T1.17 (adelanto de T3.9) listado y desbloqueo", () => {
  it("listUsers devuelve los usuarios por correo, sin el hash de la contraseña", async () => {
    await prisma.appUser.create({
      data: { email: "bea@centro.example", passwordHash: "$argon2id$otro", displayName: "Bea", role: "DOCENTE", isActive: false },
    });
    const list = await repository.listUsers();
    expect(list.map(({ email, displayName, role, isActive, lockedUntil }) => ({ email, displayName, role, isActive, lockedUntil }))).toEqual([
      { email: "Ana@Centro.example", displayName: "Ana", role: "ADMIN_DIRECCION", isActive: true, lockedUntil: null },
      { email: "bea@centro.example", displayName: "Bea", role: "DOCENTE", isActive: false, lockedUntil: null },
    ]);
    expect(list[0]?.id).toBe(userId);
    expect(JSON.stringify(list)).not.toContain("argon2id");
  });

  it("unlock quita el bloqueo y reinicia los fallos, y devuelve true", async () => {
    await repository.recordFailedLogin(userId);
    await prisma.appUser.update({ where: { id: userId }, data: { lockedUntil: new Date("2030-01-01T00:00:00.000Z") } });
    expect(await repository.unlock(userId)).toBe(true);
    expect(await stored()).toMatchObject({ lockedUntil: null, failedLoginCount: 0 });
  });

  it("unlock devuelve false si el usuario no existe", async () => {
    expect(await repository.unlock("0196b8e4-0000-7000-8000-0000000000ff")).toBe(false);
  });
});
