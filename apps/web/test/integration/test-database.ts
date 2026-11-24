/**
 * Destino de la BD de los tests de integración (specs/03-tasks.md §0.3 y T1.7).
 *
 * La configuración global de Vitest BORRA y recrea esta BD en cada ejecución. Para que un error de
 * configuración nunca destruya datos reales, solo se aceptan nombres en minúsculas que terminen en `_test`.
 * Los mensajes de error no incluyen la URL: lleva la contraseña (CLAUDE.md §3.4).
 */

/** Nombres seguros: también se usan como identificadores en `DROP/CREATE DATABASE`. */
const TEST_DATABASE_NAME = /^[a-z][a-z0-9_]*_test$/;
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const MAINTENANCE_DATABASE = "postgres";

export class TestDatabaseConfigError extends Error {
  constructor(problem: string) {
    super(
      `TEST_DATABASE_URL ${problem}.\n` +
        "Formato: postgresql://<usuario>:<contraseña>@127.0.0.1:5432/fsja_test (ver .env.example).\n" +
        "La BD se arranca con `docker compose up -d db`.",
    );
    this.name = "TestDatabaseConfigError";
  }
}

export interface TestDatabaseTarget {
  /** BD de tests (se recrea en cada ejecución). */
  readonly testName: string;
  readonly testUrl: string;
  /** BD shadow que usa `prisma migrate diff --from-migrations`. */
  readonly shadowName: string;
  readonly shadowUrl: string;
  /** Conexión a la BD de mantenimiento, para borrar y crear las anteriores. */
  readonly adminUrl: string;
}

function withDatabase(url: URL, database: string): string {
  const copy = new URL(url);
  copy.pathname = `/${database}`;
  return copy.toString();
}

export function resolveTestDatabase(value: string | undefined): TestDatabaseTarget {
  if (value === undefined || value === "") throw new TestDatabaseConfigError("no está definida");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TestDatabaseConfigError("no es una URL válida");
  }
  if (!POSTGRES_PROTOCOLS.has(url.protocol)) throw new TestDatabaseConfigError("debe ser una URL postgres(ql)://");

  let testName: string;
  try {
    testName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new TestDatabaseConfigError("tiene un nombre de BD mal codificado");
  }
  if (!TEST_DATABASE_NAME.test(testName)) {
    throw new TestDatabaseConfigError(
      "debe apuntar a una BD en minúsculas cuyo nombre termine en _test (por seguridad: los tests la borran)",
    );
  }

  const shadowName = `${testName}_shadow`;
  return {
    testName,
    testUrl: withDatabase(url, testName),
    shadowName,
    shadowUrl: withDatabase(url, shadowName),
    adminUrl: withDatabase(url, MAINTENANCE_DATABASE),
  };
}
