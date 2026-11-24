/**
 * Cliente de Prisma (ADR-0001). Solo `src/infrastructure/db` lo usa: el resto de capas acceden a los datos a
 * través de los puertos de `application` (specs/02-architecture-plan.md §1.2).
 *
 * Prisma 7 se conecta mediante el driver adapter de node-postgres. El registro se limita a avisos y
 * errores: el log de consultas mostraría parámetros con datos personales (CLAUDE.md §3.4).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "@/lib/env";
import { PrismaClient } from "./generated/prisma/client";

export type { PrismaClient };

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
    log: ["warn", "error"],
  });
}

// En desarrollo, la recarga en caliente de Next.js vuelve a evaluar este módulo: se reutiliza el cliente
// para no abrir un pool de conexiones nuevo en cada recarga.
const globalForPrisma = globalThis as typeof globalThis & { fsjaPrisma?: PrismaClient };

/** Cliente compartido del proceso, conectado a `DATABASE_URL` (validada en `src/lib/env.ts`). */
export function getPrismaClient(): PrismaClient {
  globalForPrisma.fsjaPrisma ??= createPrismaClient(getEnv().DATABASE_URL);
  return globalForPrisma.fsjaPrisma;
}
