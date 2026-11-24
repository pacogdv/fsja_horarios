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
