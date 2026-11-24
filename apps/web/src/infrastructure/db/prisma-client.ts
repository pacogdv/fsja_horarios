/**
 * Cliente de Prisma (ADR-0001). Solo `src/infrastructure/db` lo usa: el resto de capas acceden a los datos a
 * través de los puertos de `application` (specs/02-architecture-plan.md §1.2).
 *
 * Prisma 7 se conecta mediante el driver adapter de node-postgres. Para no exponer datos personales en
 * errores ni en logs (CLAUDE.md §3.4):
 * - Prisma solo registra avisos. No registra consultas (mostrarían sus parámetros) ni errores: los errores
 *   llegan como excepciones a quien llama, que decide qué registrar.
 * - Los errores de validación reproducen los argumentos de la llamada (correo, hash de contraseña…) aunque
 *   se use el formato `minimal`: se sustituyen por `InvalidDatabaseQueryError`, que solo nombra el modelo
 *   y la operación.
 * - Los errores conocidos (`P2002`…) se conservan: nombran la restricción, no los datos.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "@/lib/env";
import { Prisma, PrismaClient } from "./generated/prisma/client";

/** Consulta mal construida (error de programación). No incluye los argumentos ni el error original. */
export class InvalidDatabaseQueryError extends Error {
  constructor(model: string | undefined, operation: string) {
    super(`Consulta no válida en ${model ?? "(sin modelo)"}.${operation} (argumentos omitidos).`);
    this.name = "InvalidDatabaseQueryError";
  }
}

export function createPrismaClient(databaseUrl: string) {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
    log: ["warn"],
    errorFormat: "minimal",
  });
  return client.$extends({
    name: "hide-query-arguments-in-errors",
    query: {
      async $allOperations({ model, operation, args, query }) {
        try {
          return await query(args);
        } catch (error) {
          // Sin `cause`: el error original contiene los argumentos.
          if (error instanceof Prisma.PrismaClientValidationError) throw new InvalidDatabaseQueryError(model, operation);
          throw error;
        }
      },
    },
  });
}

export type DatabaseClient = ReturnType<typeof createPrismaClient>;

// En desarrollo, la recarga en caliente de Next.js vuelve a evaluar este módulo: se reutiliza el cliente
// para no abrir un pool de conexiones nuevo en cada recarga.
const globalForPrisma = globalThis as typeof globalThis & { fsjaPrisma?: DatabaseClient };

/** Cliente compartido del proceso, conectado a `DATABASE_URL` (validada en `src/lib/env.ts`). */
export function getPrismaClient(): DatabaseClient {
  globalForPrisma.fsjaPrisma ??= createPrismaClient(getEnv().DATABASE_URL);
  return globalForPrisma.fsjaPrisma;
}
