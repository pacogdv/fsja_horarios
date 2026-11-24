/**
 * T1.7 — Esquema de identidad y curso: migración inicial, ausencia de deriva y restricciones.
 * Refs: specs/02-architecture-plan.md §2.1–2.3; specs/03-tasks.md T1.7; ADR-0001.
 *
 * La configuración global (test/integration/global-setup.ts) recrea `fsja_test` y le aplica
 * `prisma migrate deploy` antes de estos tests.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "./prisma-client";

const { testUrl, shadowUrl } = inject("testDatabase");
const prisma = createPrismaClient(testUrl);

const webDir = fileURLToPath(new URL("../../..", import.meta.url));
const schemaPath = path.join(webDir, "prisma", "schema.prisma");
const PRISMA_TIMEOUT_MS = 60_000;

/** Ejecuta el CLI de Prisma contra la BD de tests. */
function runPrisma(args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [path.join(webDir, "node_modules", "prisma", "build", "index.js"), ...args], {
    cwd: webDir,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: testUrl, SHADOW_DATABASE_URL: shadowUrl },
  });
}

/** `--exit-code`: 0 = sin diferencias, 2 = hay diferencias, 1 = error. */
function diffMigrationsAgainst(schema: string): SpawnSyncReturns<string> {
  return runPrisma(["migrate", "diff", "--from-migrations", "prisma/migrations", "--to-schema", schema, "--exit-code"]);
}

async function createSchool(name = "FSJA") {
  return prisma.school.create({ data: { name, timezone: "Europe/Madrid" } });
}

async function createUser(email: string) {
  return prisma.appUser.create({
    data: { email, passwordHash: "$argon2id$v=19$test", displayName: "Usuaria de prueba", role: "DOCENTE" },
  });
}

beforeEach(async () => {
  // Orden de borrado compatible con las claves externas.
  await prisma.auditLog.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.appUser.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.school.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("T1.7 migración inicial", () => {
  it("prisma migrate deploy se ha aplicado sobre la BD vacía (0001_init)", async () => {
    const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    expect(applied.map((row) => row.migration_name)).toEqual(["0001_init"]);
  });

  it("crea las tablas de identidad y curso [02 §2.2, §2.3]", async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    expect(tables.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(["academic_year", "app_user", "audit_log", "rate_limit_bucket", "school", "user_session"]),
    );
  });

  it("instala las extensiones citext y btree_gist [02 §2.1]", async () => {
    const extensions = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname IN ('citext', 'btree_gist') ORDER BY extname`;
    expect(extensions.map((row) => row.extname)).toEqual(["btree_gist", "citext"]);
  });

  it("volver a ejecutar prisma migrate deploy no aplica nada (idempotente)", () => {
    const result = runPrisma(["migrate", "deploy"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/No pending migrations to apply/);
  }, PRISMA_TIMEOUT_MS);
});

describe("T1.7 deriva entre migraciones y schema.prisma", () => {
  it("prisma migrate diff --from-migrations --to-schema no muestra deriva", () => {
    const result = diffMigrationsAgainst("prisma/schema.prisma");
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toMatch(/No difference detected/);
  }, PRISMA_TIMEOUT_MS);

  it("detecta la deriva si el esquema cambia (el test anterior no es un falso verde)", () => {
    // Prisma 7 devuelve 0 en silencio si no puede comparar (p. ej., sin datasource): se exige ver un 2.
    const directory = mkdtempSync(path.join(tmpdir(), "fsja-drift-"));
    try {
      const mutated = path.join(directory, "schema.prisma");
      writeFileSync(mutated, `${readFileSync(schemaPath, "utf8")}\nmodel DriftProbe {\n  id Int @id\n}\n`);
      const result = diffMigrationsAgainst(mutated);
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(2);
      expect(result.stdout).toMatch(/DriftProbe/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, PRISMA_TIMEOUT_MS);
});

describe("T1.7 academic_year: un único curso vigente por centro [02 §2.3]", () => {
  it("el índice único parcial impide dos cursos vigentes en el mismo centro", async () => {
    const school = await createSchool();
    await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2025-2026", startsOn: new Date("2025-09-01"), endsOn: new Date("2026-06-30"), isCurrent: true },
    });
    await expect(
      prisma.academicYear.create({
        data: { schoolId: school.id, name: "2026-2027", startsOn: new Date("2026-09-01"), endsOn: new Date("2027-06-30"), isCurrent: true },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("admite varios cursos no vigentes en el mismo centro", async () => {
    const school = await createSchool();
    for (const [name, isCurrent] of [["2024-2025", false], ["2025-2026", false], ["2026-2027", true]] as const) {
      await prisma.academicYear.create({
        data: { schoolId: school.id, name, startsOn: new Date("2026-09-01"), endsOn: new Date("2027-06-30"), isCurrent },
      });
    }
    expect(await prisma.academicYear.count({ where: { schoolId: school.id } })).toBe(3);
  });

  it("cada centro puede tener su propio curso vigente", async () => {
    for (const name of ["Centro A", "Centro B"]) {
      const school = await createSchool(name);
      await prisma.academicYear.create({
        data: { schoolId: school.id, name: "2026-2027", startsOn: new Date("2026-09-01"), endsOn: new Date("2027-06-30"), isCurrent: true },
      });
    }
    expect(await prisma.academicYear.count({ where: { isCurrent: true } })).toBe(2);
  });

  it("el nombre del curso es único dentro del centro", async () => {
    const school = await createSchool();
    const data = { schoolId: school.id, name: "2026-2027", startsOn: new Date("2026-09-01"), endsOn: new Date("2027-06-30") };
    await prisma.academicYear.create({ data });
    await expect(prisma.academicYear.create({ data })).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("T1.7 app_user.email no distingue mayúsculas (citext) [02 §2.2]", () => {
  it("Ana@x.es y ana@x.es chocan", async () => {
    await createUser("Ana@x.es");
    await expect(createUser("ana@x.es")).rejects.toMatchObject({ code: "P2002" });
  });

  it("la búsqueda por correo tampoco distingue mayúsculas", async () => {
    const created = await createUser("Ana@x.es");
    const found = await prisma.appUser.findUnique({ where: { email: "ANA@X.ES" } });
    expect(found?.id).toBe(created.id);
  });

  it("los identificadores son UUID v7 generados en la aplicación [02 §2.1]", async () => {
    const user = await createUser("uuid@x.es");
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("T1.7 sesiones y auditoría [02 §2.2]", () => {
  const tokenHash = () => new Uint8Array(32).fill(7);

  it("borrar un usuario borra sus sesiones (ON DELETE CASCADE)", async () => {
    const user = await createUser("sesion@x.es");
    await prisma.userSession.create({
      data: { userId: user.id, tokenHash: tokenHash(), expiresAt: new Date(), idleExpiresAt: new Date(), ip: "127.0.0.1" },
    });
    await prisma.appUser.delete({ where: { id: user.id } });
    expect(await prisma.userSession.count()).toBe(0);
  });

  it("token_hash es único", async () => {
    const user = await createUser("token@x.es");
    const data = { userId: user.id, tokenHash: tokenHash(), expiresAt: new Date(), idleExpiresAt: new Date() };
    await prisma.userSession.create({ data });
    await expect(prisma.userSession.create({ data })).rejects.toMatchObject({ code: "P2002" });
  });

  it("borrar un usuario conserva su rastro de auditoría (user_id pasa a NULL)", async () => {
    const user = await createUser("auditoria@x.es");
    const entry = await prisma.auditLog.create({
      data: { userId: user.id, action: "auth.login", entityType: "app_user", entityId: user.id },
    });
    await prisma.appUser.delete({ where: { id: user.id } });
    const kept = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(kept.userId).toBeNull();
    expect(kept.metadata).toEqual({});
  });
});
