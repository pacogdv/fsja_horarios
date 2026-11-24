/**
 * T1.7 (revisión de seguridad) — Los errores de Prisma no exponen los datos de la operación.
 * Con el formato por defecto ("colorless"), un error de validación reproduce los argumentos de la llamada
 * (correo, hash de contraseña…) y, con `log: ["error"]`, acabaría en los logs. CLAUDE.md §3.4.
 */
import { afterAll, afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import type { UserRole } from "./generated/prisma/client";
import { resetEnvForTests } from "@/lib/env";
import { createPrismaClient, getPrismaClient, InvalidDatabaseQueryError } from "./prisma-client";

const { testUrl } = inject("testDatabase");
const prisma = createPrismaClient(testUrl);

const SECRET_EMAIL = "persona.privada@centro.example";
const SECRET_HASH = "$argon2id$v=19$m=19456,t=2,p=1$hash-que-no-debe-salir";

afterAll(async () => {
  await prisma.$disconnect();
});

// Todo lo que el proceso escribe en consola durante cada test: Prisma registra sus errores por ahí.
let written: string[] = [];
beforeEach(() => {
  written = [];
  const capture = (...parts: unknown[]) => {
    written.push(parts.map(String).join(" "));
  };
  for (const method of ["log", "info", "warn", "error"] as const) vi.spyOn(console, method).mockImplementation(capture);
  for (const stream of [process.stdout, process.stderr]) {
    vi.spyOn(stream, "write").mockImplementation((chunk: unknown) => {
      capture(chunk);
      return true;
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function errorOf(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error("se esperaba un error de Prisma");
}

function expectNoPersonalData(text: string): void {
  expect(text).not.toContain(SECRET_EMAIL);
  expect(text).not.toContain(SECRET_HASH);
  expect(text).not.toContain("Nombre Privado");
}

describe("T1.7 getPrismaClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvForTests();
  });

  it("usa DATABASE_URL del entorno validado y reutiliza el mismo cliente (un solo pool por proceso)", async () => {
    for (const [name, value] of Object.entries({
      APP_ENV: "test",
      APP_ORIGIN: "http://localhost:3000",
      RATE_LIMIT_KEY_SECRET: "r".repeat(32),
      DATABASE_URL: testUrl,
      SOLVER_URL: "http://solver:8000",
      SOLVER_SERVICE_TOKEN: "s".repeat(32),
    })) {
      vi.stubEnv(name, value);
    }
    const client = getPrismaClient();
    expect(getPrismaClient()).toBe(client);
    await expect(client.$queryRaw`SELECT 1 AS ok`).resolves.toEqual([{ ok: 1 }]);
    await client.$disconnect();
  });
});

describe("T1.7 errores de Prisma sin datos de la operación [CLAUDE.md §3.4]", () => {
  it("un error de validación no reproduce los argumentos ni en el error ni en los logs", async () => {
    const error = await errorOf(
      prisma.appUser.create({
        data: {
          email: SECRET_EMAIL,
          passwordHash: SECRET_HASH,
          displayName: "Nombre Privado",
          role: "ROL_INEXISTENTE" as UserRole,
        },
      }),
    );
    expect(error).toBeInstanceOf(InvalidDatabaseQueryError);
    expect(error.message).toContain("AppUser.create");
    expectNoPersonalData(`${error.message}\n${error.stack ?? ""}\n${JSON.stringify(error)}`);
    expect(error.cause).toBeUndefined();
    expectNoPersonalData(written.join("\n"));
  });

  it("un error de unicidad conserva su código (P2002) sin reproducir los argumentos", async () => {
    const data = { email: SECRET_EMAIL, passwordHash: SECRET_HASH, displayName: "Nombre Privado", role: "DOCENTE" as const };
    await prisma.appUser.deleteMany({ where: { email: SECRET_EMAIL } });
    await prisma.appUser.create({ data });
    const error = await errorOf(prisma.appUser.create({ data }));
    expect(error).toMatchObject({ code: "P2002" });
    expectNoPersonalData(`${error.message}\n${JSON.stringify(error)}`);
    expectNoPersonalData(written.join("\n"));
    await prisma.appUser.deleteMany({ where: { email: SECRET_EMAIL } });
  });
});
