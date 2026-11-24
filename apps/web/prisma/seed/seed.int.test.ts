/**
 * T1.16 — Seed mínimo de usuarios (specs/03-tasks.md T1.16; specs/01-domain-spec.md TFM-01 y TFM-02).
 *
 * - Con `APP_ENV=production` (o sin un entorno de desarrollo explícito) termina con código ≠ 0 sin conectarse.
 * - Crea los tres usuarios, uno por rol, con las credenciales de las variables `SEED_*`.
 * - Es idempotente: una segunda ejecución no duplica ni cambia nada.
 */
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { verify } from "@node-rs/argon2";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { Argon2PasswordHasher } from "@/infrastructure/auth/argon2-hasher";
import { createPrismaClient } from "@/infrastructure/db/prisma-client";
import { runSeed } from "./index";
import { assertSeedAllowed, SeedNotAllowedError } from "./production-guard";
import { parseSeedUsers, SeedConfigError, seedUsers } from "./users";

const { testUrl } = inject("testDatabase");
const db = createPrismaClient(testUrl);
const hasher = new Argon2PasswordHasher();
const runFile = fileURLToPath(new URL("./run.mjs", import.meta.url));
const execFileAsync = promisify(execFile);

const SEED_ENV = {
  SEED_ADMIN_EMAIL: "admin@demo.local",
  SEED_ADMIN_PASSWORD: "admin-demo-password-1",
  SEED_TEACHER_EMAIL: "docente@demo.local",
  SEED_TEACHER_PASSWORD: "docente-demo-password-1",
  SEED_GUEST_EMAIL: "invitado@demo.local",
  SEED_GUEST_PASSWORD: "invitado-demo-password-1",
} as const;
const PASSWORDS = [SEED_ENV.SEED_ADMIN_PASSWORD, SEED_ENV.SEED_TEACHER_PASSWORD, SEED_ENV.SEED_GUEST_PASSWORD];

/** Ejecuta el seed como lo hace Docker: `node prisma/seed/run.mjs`, con un entorno controlado. */
async function runSeedCli(env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    // Sin heredar process.env: el resultado no depende de la shell de quien ejecuta los tests.
    const { stdout, stderr } = await execFileAsync(process.execPath, [runFile], {
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env },
      timeout: 60_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? -1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

const storedUsers = () =>
  db.appUser.findMany({
    orderBy: { email: "asc" },
    select: { id: true, email: true, role: true, displayName: true, isActive: true, passwordHash: true, updatedAt: true },
  });

beforeEach(async () => {
  await db.appUser.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("guarda de producción (TFM-02)", () => {
  it.each(["development", "test"])("permite APP_ENV=%s", (appEnv) => {
    expect(() => assertSeedAllowed(appEnv)).not.toThrow();
  });

  it.each(["production", undefined, "", "Production", "staging"])(
    "rechaza APP_ENV=%j: solo se permite un entorno de desarrollo explícito",
    (appEnv) => {
      expect(() => assertSeedAllowed(appEnv)).toThrow(SeedNotAllowedError);
    },
  );

  it("con APP_ENV=production el CLI sale con código ≠ 0 sin tocar la BD", async () => {
    await db.appUser.create({ data: { email: "real@centro.example", passwordHash: "h", displayName: "Real", role: "DOCENTE" } });
    const result = await runSeedCli({ APP_ENV: "production", DATABASE_URL: testUrl, ...SEED_ENV });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/production/);
    expect((await storedUsers()).map((user) => user.email)).toEqual(["real@centro.example"]);
  });

  it("la guarda va antes de cualquier conexión: con una BD inalcanzable el error es el de producción", async () => {
    const result = await runSeedCli({
      APP_ENV: "production",
      DATABASE_URL: "postgresql://nadie:nada@127.0.0.1:1/inexistente_test",
      ...SEED_ENV,
    });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/production/);
    expect(result.stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });
});

describe("parseSeedUsers (variables SEED_*)", () => {
  it("devuelve un usuario por rol con sus credenciales", () => {
    expect(parseSeedUsers(SEED_ENV).map(({ role, email }) => [role, email])).toEqual([
      ["ADMIN_DIRECCION", "admin@demo.local"],
      ["DOCENTE", "docente@demo.local"],
      ["INVITADO_DEMO", "invitado@demo.local"],
    ]);
  });

  it("normaliza el correo (espacios y mayúsculas), como el login", () => {
    const [admin] = parseSeedUsers({ ...SEED_ENV, SEED_ADMIN_EMAIL: "  Admin@Demo.LOCAL " });
    expect(admin?.email).toBe("admin@demo.local");
  });

  it("nombra las variables que faltan o no son válidas, sin mostrar sus valores", () => {
    const secret = "corta";
    const attempt = () => parseSeedUsers({ ...SEED_ENV, SEED_TEACHER_PASSWORD: secret, SEED_GUEST_EMAIL: "no-es-correo", SEED_ADMIN_EMAIL: undefined });
    expect(attempt).toThrow(SeedConfigError);
    try {
      attempt();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("SEED_ADMIN_EMAIL");
      expect(message).toContain("SEED_TEACHER_PASSWORD");
      expect(message).toContain("SEED_GUEST_EMAIL");
      expect(message).not.toContain(secret);
      expect(message).not.toContain("no-es-correo");
    }
  });

  it("rechaza correos repetidos: cada rol necesita su propio usuario", () => {
    expect(() => parseSeedUsers({ ...SEED_ENV, SEED_GUEST_EMAIL: SEED_ENV.SEED_ADMIN_EMAIL })).toThrow(/SEED_GUEST_EMAIL/);
  });
});

describe("seedUsers (TFM-01: un usuario por rol)", () => {
  it("crea los 3 usuarios, activos, con su rol y una contraseña Argon2id que verifica", async () => {
    await seedUsers(db, hasher, parseSeedUsers(SEED_ENV));
    const users = await storedUsers();
    expect(users.map(({ email, role, isActive }) => ({ email, role, isActive }))).toEqual([
      { email: "admin@demo.local", role: "ADMIN_DIRECCION", isActive: true },
      { email: "docente@demo.local", role: "DOCENTE", isActive: true },
      { email: "invitado@demo.local", role: "INVITADO_DEMO", isActive: true },
    ]);
    const byEmail = new Map(users.map((user) => [user.email, user]));
    const credentials = [
      [SEED_ENV.SEED_ADMIN_EMAIL, SEED_ENV.SEED_ADMIN_PASSWORD],
      [SEED_ENV.SEED_TEACHER_EMAIL, SEED_ENV.SEED_TEACHER_PASSWORD],
      [SEED_ENV.SEED_GUEST_EMAIL, SEED_ENV.SEED_GUEST_PASSWORD],
    ] as const;
    for (const [email, password] of credentials) {
      const hash = byEmail.get(email)?.passwordHash ?? "";
      expect(hash).toMatch(/^\$argon2id\$/);
      expect(await verify(hash, password)).toBe(true);
    }
  });

  it("es idempotente: la segunda ejecución no duplica ni modifica nada", async () => {
    const users = parseSeedUsers(SEED_ENV);
    expect(await seedUsers(db, hasher, users)).toEqual({ created: 3, updated: 0, unchanged: 0 });
    const first = await storedUsers();
    expect(await seedUsers(db, hasher, users)).toEqual({ created: 0, updated: 0, unchanged: 3 });
    expect(await storedUsers()).toEqual(first);
  });

  it("si cambia la contraseña de una variable, actualiza solo ese usuario (las credenciales documentadas funcionan)", async () => {
    await seedUsers(db, hasher, parseSeedUsers(SEED_ENV));
    const report = await seedUsers(db, hasher, parseSeedUsers({ ...SEED_ENV, SEED_GUEST_PASSWORD: "nueva-password-demo-1" }));
    expect(report).toEqual({ created: 0, updated: 1, unchanged: 2 });
    const guest = await db.appUser.findUniqueOrThrow({ where: { email: SEED_ENV.SEED_GUEST_EMAIL } });
    expect(await verify(guest.passwordHash, "nueva-password-demo-1")).toBe(true);
  });

  it("restaura un usuario de demo modificado: rol, estado y bloqueo", async () => {
    await seedUsers(db, hasher, parseSeedUsers(SEED_ENV));
    await db.appUser.update({
      where: { email: SEED_ENV.SEED_GUEST_EMAIL },
      data: { role: "ADMIN_DIRECCION", isActive: false, failedLoginCount: 7, lockedUntil: new Date(Date.now() + 60_000) },
    });
    expect(await seedUsers(db, hasher, parseSeedUsers(SEED_ENV))).toEqual({ created: 0, updated: 1, unchanged: 2 });
    expect(await db.appUser.findUniqueOrThrow({ where: { email: SEED_ENV.SEED_GUEST_EMAIL } })).toMatchObject({
      role: "INVITADO_DEMO",
      isActive: true,
      failedLoginCount: 0,
      lockedUntil: null,
    });
  });

  it("no toca usuarios que no son de demo", async () => {
    const real = await db.appUser.create({ data: { email: "real@centro.example", passwordHash: "h", displayName: "Real", role: "DOCENTE" } });
    await seedUsers(db, hasher, parseSeedUsers(SEED_ENV));
    expect(await db.appUser.findUniqueOrThrow({ where: { id: real.id } })).toEqual(real);
  });
});

describe("runSeed (orquestación, en proceso para medir su cobertura)", () => {
  function capture() {
    const logs: string[] = [];
    const errors: string[] = [];
    return { output: { log: (message: string) => logs.push(message), error: (message: string) => errors.push(message) }, logs, errors };
  }

  it("con un entorno válido siembra y devuelve 0", async () => {
    const { output, logs, errors } = capture();
    expect(await runSeed({ APP_ENV: "test", DATABASE_URL: testUrl, ...SEED_ENV }, output)).toBe(0);
    expect(logs).toEqual(["Seed de usuarios: 3 creados, 0 actualizados, 0 sin cambios."]);
    expect(errors).toEqual([]);
  });

  it.each([
    ["ausente", undefined],
    ["que no es una URL", "no-es-una-url"],
    ["con otro protocolo", "mysql://u:p@localhost/fsja_test"],
  ])("rechaza DATABASE_URL %s sin conectarse", async (_case, url) => {
    const { output, errors } = capture();
    expect(await runSeed({ APP_ENV: "test", DATABASE_URL: url, ...SEED_ENV }, output)).toBe(1);
    expect(errors.join("\n")).toContain("DATABASE_URL");
  });

  it("si la BD no responde devuelve 1 y el error no contiene la contraseña de DATABASE_URL", async () => {
    const { output, errors } = capture();
    const databaseUrl = "postgresql://seed:clave-super-secreta@127.0.0.1:1/inexistente_test";
    expect(await runSeed({ APP_ENV: "test", DATABASE_URL: databaseUrl, ...SEED_ENV }, output)).toBe(1);
    expect(errors.join("\n")).toMatch(/^El seed ha fallado: /);
    expect(errors.join("\n")).not.toContain("clave-super-secreta");
    for (const password of PASSWORDS) expect(errors.join("\n")).not.toContain(password);
  });

  it("un valor lanzado que no es un Error también se informa con código 1", async () => {
    const { output, errors } = capture();
    const failingHasher = { hash: () => Promise.reject("fallo raro"), verify: async () => false, needsRehash: () => false };
    expect(await runSeed({ APP_ENV: "test", DATABASE_URL: testUrl, ...SEED_ENV }, output, failingHasher)).toBe(1);
    expect(errors).toEqual(["El seed ha fallado: fallo raro"]);
  });
});

// Cada ejecución del CLI arranca Node y transpila el seed con jiti (~2-3 s): el límite por defecto de Vitest
// (5 s) se queda corto para dos ejecuciones, y un proceso que sigue vivo tras el timeout ensuciaría el test
// siguiente.
describe("CLI (node prisma/seed/run.mjs, como en Docker)", { timeout: 30_000 }, () => {
  it("con APP_ENV=test crea los usuarios, es idempotente y no escribe contraseñas en la salida", async () => {
    const env = { APP_ENV: "test", DATABASE_URL: testUrl, ...SEED_ENV };
    const first = await runSeedCli(env);
    expect(first.code, first.stderr).toBe(0);
    expect(first.stdout).toMatch(/3 creados/);
    const second = await runSeedCli(env);
    expect(second.code, second.stderr).toBe(0);
    expect(second.stdout).toMatch(/0 creados.*3 sin cambios/);
    expect(await db.appUser.count()).toBe(3);
    for (const output of [first.stdout, first.stderr, second.stdout, second.stderr]) {
      for (const password of PASSWORDS) expect(output).not.toContain(password);
    }
  });

  it("sin las variables SEED_* sale con código ≠ 0 y las nombra", async () => {
    const result = await runSeedCli({ APP_ENV: "development", DATABASE_URL: testUrl });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("SEED_ADMIN_PASSWORD");
    expect(await db.appUser.count()).toBe(0);
  });

  it("sin DATABASE_URL sale con código ≠ 0 y lo dice", async () => {
    const result = await runSeedCli({ APP_ENV: "development", ...SEED_ENV });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("DATABASE_URL");
  });
});
