/**
 * Seed mínimo (specs/03-tasks.md T1.16; specs/01-domain-spec.md TFM-01 y TFM-02). Lo lanza `run.mjs`.
 *
 * Orden: guarda de producción → variables → conexión → usuarios. Si algo falla, devuelve un código distinto de
 * 0 y el arranque del contenedor se detiene. La salida no incluye contraseñas ni la URL de la BD.
 */
import type { PasswordHasher } from "@/application/ports/password-hasher";
import { Argon2PasswordHasher } from "@/infrastructure/auth/argon2-hasher";
import { createPrismaClient } from "@/infrastructure/db/prisma-client";
import { assertSeedAllowed, SeedNotAllowedError } from "./production-guard";
import { parseSeedUsers, SeedConfigError, seedUsers } from "./users";

export interface SeedOutput {
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

const DATABASE_URL_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

function databaseUrlProblem(value: string | undefined): string | null {
  if (!value) return "es obligatoria";
  try {
    return DATABASE_URL_PROTOCOLS.has(new URL(value).protocol) ? null : "debe ser una URL postgres(ql)://";
  } catch {
    return "debe ser una URL postgres(ql)://";
  }
}

export async function runSeed(
  env: Readonly<Record<string, string | undefined>>,
  output: SeedOutput = { log: console.log, error: console.error },
  hasher: PasswordHasher = new Argon2PasswordHasher(),
): Promise<number> {
  try {
    assertSeedAllowed(env.APP_ENV);
    const urlProblem = databaseUrlProblem(env.DATABASE_URL);
    if (urlProblem !== null) throw new SeedConfigError(new Map([["DATABASE_URL", urlProblem]]));
    const users = parseSeedUsers(env);

    const db = createPrismaClient(env.DATABASE_URL ?? "");
    try {
      const report = await seedUsers(db, hasher, users);
      output.log(
        `Seed de usuarios: ${report.created} creados, ${report.updated} actualizados, ${report.unchanged} sin cambios.`,
      );
    } finally {
      await db.$disconnect();
    }
    return 0;
  } catch (error) {
    if (error instanceof SeedNotAllowedError || error instanceof SeedConfigError) {
      output.error(error.message);
    } else {
      // Errores de conexión o de BD: el mensaje de pg/Prisma no incluye la contraseña de la URL.
      output.error(`El seed ha fallado: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    }
    return 1;
  }
}
