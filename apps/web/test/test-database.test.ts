// @vitest-environment node
/**
 * T1.7 — Destino de la BD de tests de integración. La configuración global de Vitest BORRA y recrea esa BD,
 * así que solo se acepta una BD cuyo nombre termine en `_test`, y los errores nunca muestran la URL (lleva
 * la contraseña). Refs: specs/03-tasks.md §0.3 y T1.7; CLAUDE.md §3.4.
 */
import { describe, expect, it } from "vitest";
import { resolveTestDatabase, TestDatabaseConfigError } from "./integration/test-database";

const PASSWORD = "contraseña-muy-secreta";
// Host distintivo: el mensaje de ayuda incluye un ejemplo con 127.0.0.1, que no debe confundirse con una fuga.
const HOST = "db-secreta.internal:6543";
const url = (database: string, protocol = "postgresql") =>
  `${protocol}://fsja:${encodeURIComponent(PASSWORD)}@${HOST}/${database}`;

function configError(value: string | undefined): TestDatabaseConfigError {
  try {
    resolveTestDatabase(value);
  } catch (error) {
    if (error instanceof TestDatabaseConfigError) return error;
    throw error;
  }
  throw new Error("se esperaba un TestDatabaseConfigError");
}

describe("T1.7 resolveTestDatabase", () => {
  it("deriva la BD de tests, su BD shadow y la conexión de administración", () => {
    const target = resolveTestDatabase(url("fsja_test"));
    expect(target.testName).toBe("fsja_test");
    expect(target.shadowName).toBe("fsja_test_shadow");
    expect(new URL(target.testUrl).pathname).toBe("/fsja_test");
    expect(new URL(target.shadowUrl).pathname).toBe("/fsja_test_shadow");
    expect(new URL(target.adminUrl).pathname).toBe("/postgres");
  });

  it("conserva credenciales, host y parámetros en las tres URL", () => {
    const target = resolveTestDatabase(`${url("fsja_test")}?sslmode=disable`);
    for (const derived of [target.testUrl, target.shadowUrl, target.adminUrl]) {
      const parsed = new URL(derived);
      expect(decodeURIComponent(parsed.password)).toBe(PASSWORD);
      expect(parsed.host).toBe(HOST);
      expect(parsed.searchParams.get("sslmode")).toBe("disable");
    }
  });

  it("acepta el esquema postgres://", () => {
    expect(resolveTestDatabase(url("fsja_test", "postgres")).testName).toBe("fsja_test");
  });

  it.each([undefined, ""])("sin TEST_DATABASE_URL (%j) explica cómo configurarla", (value) => {
    const error = configError(value);
    expect(error.message).toContain("TEST_DATABASE_URL");
    expect(error.message).toContain("docker compose up -d db");
  });

  it.each([
    ["una BD que no termina en _test", url("fsja")],
    ["la BD de mantenimiento", url("postgres")],
    ["un nombre con mayúsculas o símbolos", url("Fsja-x_test")],
    ["un nombre con comillas (inyección de identificadores)", url('x"_test')],
    ["una URL sin nombre de BD", `postgresql://fsja:x@${HOST}/`],
    ["un protocolo que no es PostgreSQL", url("fsja_test", "mysql")],
    ["un texto que no es una URL", "no es una url"],
  ])("rechaza %s", (_case, value) => {
    expect(() => resolveTestDatabase(value)).toThrow(TestDatabaseConfigError);
  });

  it("los errores nunca muestran la URL ni la contraseña", () => {
    for (const value of [url("fsja"), url("fsja_test", "mysql"), `${url("x")}%zz`]) {
      const error = configError(value);
      expect(error.message).not.toContain(PASSWORD);
      expect(error.message).not.toContain(encodeURIComponent(PASSWORD));
      expect(error.message).not.toContain("db-secreta");
    }
  });
});
