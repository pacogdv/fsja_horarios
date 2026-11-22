// @vitest-environment node
/**
 * T1.4 — Variables de entorno validadas con Zod.
 * Refs: CLAUDE.md §3.5; specs/02-architecture-plan.md §5.4 y §5.7; specs/03-tasks.md T1.4; TFM-02.
 */
import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV_KEYS, EnvValidationError, getEnv, parseEnv, resetEnvForTests } from "./env";

type Source = Record<string, string | undefined>;

const SECRET_32 = "a".repeat(32);

const VALID: Readonly<Source> = {
  APP_ENV: "development",
  APP_ORIGIN: "http://localhost:3000",
  TRUSTED_PROXY_HOPS: "0",
  RATE_LIMIT_KEY_SECRET: SECRET_32,
  DATABASE_URL: "postgresql://fsja:clave-de-prueba@db:5432/fsja",
  SOLVER_URL: "http://solver:8000",
  SOLVER_SERVICE_TOKEN: SECRET_32,
  SEED_ON_START: "false",
};

const SEEDS: Readonly<Source> = {
  SEED_ADMIN_EMAIL: "admin@demo.local",
  SEED_ADMIN_PASSWORD: "contraseña-admin",
  SEED_TEACHER_EMAIL: "docente@demo.local",
  SEED_TEACHER_PASSWORD: "contraseña-docente",
  SEED_GUEST_EMAIL: "invitado@demo.local",
  SEED_GUEST_PASSWORD: "contraseña-invitado",
};

const REQUIRED = [
  "APP_ENV",
  "APP_ORIGIN",
  "RATE_LIMIT_KEY_SECRET",
  "DATABASE_URL",
  "SOLVER_URL",
  "SOLVER_SERVICE_TOKEN",
] as const;

/** Ejecuta parseEnv esperando un EnvValidationError y lo devuelve para inspeccionarlo. */
function expectInvalid(source: Source): EnvValidationError {
  try {
    parseEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvValidationError);
    return error as EnvValidationError;
  }
  throw new Error("parseEnv debería haber fallado");
}

describe("T1.4 entorno válido", () => {
  it("devuelve los valores tipados, con los valores por defecto aplicados", () => {
    const env = parseEnv({ ...VALID, TRUSTED_PROXY_HOPS: undefined, SEED_ON_START: undefined });
    expect(env.APP_ENV).toBe("development");
    expect(env.TRUSTED_PROXY_HOPS).toBe(0);
    expect(env.SEED_ON_START).toBe(false);
    expect(env.DATABASE_URL).toBe(VALID.DATABASE_URL);
  });

  it("las opcionales vacías (VAR=) toman su valor por defecto", () => {
    const env = parseEnv({ ...VALID, TRUSTED_PROXY_HOPS: "", SEED_ON_START: "", SEED_ADMIN_EMAIL: "" });
    expect(env.TRUSTED_PROXY_HOPS).toBe(0);
    expect(env.SEED_ON_START).toBe(false);
    expect(env.SEED_ADMIN_EMAIL).toBeUndefined();
  });

  it("ignora variables ajenas al esquema", () => {
    expect(parseEnv({ ...VALID, PATH: "/usr/bin", HOME: "/home/x" })).not.toHaveProperty("PATH");
  });
});

describe("T1.4 errores: nombran la variable y nunca muestran su valor", () => {
  it.each(REQUIRED)("si falta %s, el error la nombra", (name) => {
    const error = expectInvalid({ ...VALID, [name]: undefined });
    expect(error.variables).toEqual([name]);
    expect(error.message).toContain(name);
  });

  it.each(REQUIRED)("%s vacía (VAR=) cuenta como ausente", (name) => {
    expect(expectInvalid({ ...VALID, [name]: "" }).variables).toEqual([name]);
  });

  it("un secreto inválido no aparece en el mensaje", () => {
    const leaked = "secreto-demasiado-corto";
    const error = expectInvalid({ ...VALID, RATE_LIMIT_KEY_SECRET: leaked });
    expect(error.message).toContain("RATE_LIMIT_KEY_SECRET");
    expect(error.message).not.toContain(leaked);
    expect(JSON.stringify(error)).not.toContain(leaked);
  });

  it("una DATABASE_URL inválida no filtra la contraseña que contiene", () => {
    const error = expectInvalid({ ...VALID, DATABASE_URL: "mysql://admin:SuperSecreta123@db/fsja" });
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).not.toContain("SuperSecreta123");
  });

  it("informa de todas las variables inválidas a la vez", () => {
    const error = expectInvalid({ ...VALID, APP_ENV: "staging", SOLVER_URL: undefined });
    expect(error.variables).toEqual(["APP_ENV", "SOLVER_URL"]);
  });
});

describe("T1.4 secretos", () => {
  it.each(["SOLVER_SERVICE_TOKEN", "RATE_LIMIT_KEY_SECRET"])("%s exige al menos 32 caracteres", (name) => {
    expect(expectInvalid({ ...VALID, [name]: "a".repeat(31) }).variables).toEqual([name]);
    expect(() => parseEnv({ ...VALID, [name]: "a".repeat(32) })).not.toThrow();
  });
});

describe("T1.4 TRUSTED_PROXY_HOPS", () => {
  it.each([
    ["0", 0],
    ["1", 1],
    ["3", 3],
  ])("acepta %s", (value, expected) => {
    expect(parseEnv({ ...VALID, TRUSTED_PROXY_HOPS: value }).TRUSTED_PROXY_HOPS).toBe(expected);
  });

  it.each(["4", "-1", "1.5", "abc", " 1", "0x1", "1e0"])("rechaza %j", (value) => {
    expect(expectInvalid({ ...VALID, TRUSTED_PROXY_HOPS: value }).variables).toEqual(["TRUSTED_PROXY_HOPS"]);
  });
});

describe("T1.4 APP_ENV y URLs", () => {
  it("APP_ENV solo admite development, test o production", () => {
    expect(expectInvalid({ ...VALID, APP_ENV: "staging" }).variables).toEqual(["APP_ENV"]);
  });

  it.each(["http://localhost:3000/app", "https://horarios.example/", "ftp://localhost", "localhost:3000"])(
    "APP_ORIGIN rechaza %j (debe ser un origen sin ruta)",
    (value) => {
      expect(expectInvalid({ ...VALID, APP_ORIGIN: value }).variables).toEqual(["APP_ORIGIN"]);
    },
  );

  it("APP_ORIGIN debe usar https en production", () => {
    const production = { ...VALID, APP_ENV: "production" };
    expect(expectInvalid({ ...production, APP_ORIGIN: "http://horarios.example" }).variables).toEqual([
      "APP_ORIGIN",
    ]);
    expect(parseEnv({ ...production, APP_ORIGIN: "https://horarios.example" }).APP_ORIGIN).toBe(
      "https://horarios.example",
    );
  });

  it.each(["postgres://u:p@db:5432/fsja", "postgresql://u:p@db/fsja"])("DATABASE_URL acepta %s", (value) => {
    expect(parseEnv({ ...VALID, DATABASE_URL: value }).DATABASE_URL).toBe(value);
  });

  it.each(["mysql://u:p@db/fsja", "no es una url"])("DATABASE_URL rechaza %j", (value) => {
    expect(expectInvalid({ ...VALID, DATABASE_URL: value }).variables).toEqual(["DATABASE_URL"]);
  });

  it.each(["ftp://solver:8000", "solver:8000"])("SOLVER_URL rechaza %j", (value) => {
    expect(expectInvalid({ ...VALID, SOLVER_URL: value }).variables).toEqual(["SOLVER_URL"]);
  });
});

describe("T1.4 seed (TFM-02)", () => {
  it.each(["yes", "1", "TRUE", "on"])("SEED_ON_START rechaza %j (solo true o false)", (value) => {
    expect(expectInvalid({ ...VALID, SEED_ON_START: value }).variables).toEqual(["SEED_ON_START"]);
  });

  it("SEED_ON_START=false es false (no se convierte a true)", () => {
    expect(parseEnv({ ...VALID, SEED_ON_START: "false" }).SEED_ON_START).toBe(false);
  });

  it("SEED_ON_START=true con las credenciales de seed es válido", () => {
    expect(parseEnv({ ...VALID, ...SEEDS, SEED_ON_START: "true" }).SEED_ON_START).toBe(true);
  });

  it("SEED_ON_START=true con APP_ENV=production hace fallar la validación", () => {
    const error = expectInvalid({
      ...VALID,
      ...SEEDS,
      APP_ENV: "production",
      APP_ORIGIN: "https://horarios.example",
      SEED_ON_START: "true",
    });
    expect(error.variables).toEqual(["SEED_ON_START"]);
  });

  it("SEED_ON_START=true exige las seis variables SEED_*", () => {
    expect(expectInvalid({ ...VALID, SEED_ON_START: "true" }).variables).toEqual(Object.keys(SEEDS).sort());
  });

  it("SEED_ON_START=true valida el formato de correos y la longitud de contraseñas", () => {
    const error = expectInvalid({
      ...VALID,
      ...SEEDS,
      SEED_ON_START: "true",
      SEED_ADMIN_EMAIL: "no-es-un-correo",
      SEED_GUEST_PASSWORD: "corta",
    });
    expect(error.variables).toEqual(["SEED_ADMIN_EMAIL", "SEED_GUEST_PASSWORD"]);
    expect(error.message).not.toContain("corta");
  });
});

describe("T1.4 esquema y .env.example", () => {
  const examplePath = fileURLToPath(new URL("../../../../.env.example", import.meta.url));
  const exampleLines = readFileSync(examplePath, "utf8").split("\n");
  const example: Source = Object.fromEntries(
    exampleLines
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );

  it("ninguna variable es NEXT_PUBLIC_* (Next.js las incrusta en el código del navegador)", () => {
    expect(ENV_KEYS.filter((key) => key.startsWith("NEXT_PUBLIC_"))).toEqual([]);
  });

  it.each(ENV_KEYS)(".env.example documenta %s con un comentario encima", (key) => {
    const index = exampleLines.findIndex((line) => line.startsWith(`${key}=`));
    expect(index).toBeGreaterThan(0);
    expect(exampleLines[index - 1]).toMatch(/^#/);
  });

  it("al validar .env.example solo fallan los secretos que hay que rellenar", () => {
    expect(expectInvalid(example).variables).toEqual(["DATABASE_URL", "RATE_LIMIT_KEY_SECRET", "SOLVER_SERVICE_TOKEN"]);
  });
});

describe("T1.4 los secretos no se filtran al serializar o imprimir el entorno (CLAUDE.md §3.4)", () => {
  const secrets = {
    RATE_LIMIT_KEY_SECRET: "R".repeat(32),
    SOLVER_SERVICE_TOKEN: "T".repeat(32),
    DATABASE_URL: "postgresql://fsja:CLAVE-BD-PRIVADA@db:5432/fsja",
    SEED_ADMIN_PASSWORD: "clave-admin-privada",
    SEED_TEACHER_PASSWORD: "clave-docente-privada",
    SEED_GUEST_PASSWORD: "clave-invitado-privada",
  };
  const env = parseEnv({ ...VALID, ...SEEDS, ...secrets, SEED_ON_START: "true" });
  const leaks = (text: string): string[] =>
    Object.values(secrets).filter((value) => text.includes(value) || text.includes("CLAVE-BD-PRIVADA"));

  it("JSON.stringify muestra [REDACTADO] en lugar de los secretos", () => {
    const json = JSON.stringify(env);
    expect(leaks(json)).toEqual([]);
    expect(JSON.parse(json)).toMatchObject({ SOLVER_SERVICE_TOKEN: "[REDACTADO]", APP_ENV: "development" });
  });

  it("console.log (util.inspect) muestra [REDACTADO] en lugar de los secretos", () => {
    const printed = inspect(env, { depth: 5 });
    expect(leaks(printed)).toEqual([]);
    expect(printed).toContain("[REDACTADO]");
    expect(printed).toContain("development");
  });

  it("los secretos siguen accesibles como propiedades para quien los necesita", () => {
    expect(env.SOLVER_SERVICE_TOKEN).toBe(secrets.SOLVER_SERVICE_TOKEN);
    expect(env.DATABASE_URL).toBe(secrets.DATABASE_URL);
    expect({ ...env }.RATE_LIMIT_KEY_SECRET).toBe(secrets.RATE_LIMIT_KEY_SECRET);
  });

  it("un secreto opcional ausente se serializa como ausente, no como [REDACTADO]", () => {
    const withoutSeeds = JSON.parse(JSON.stringify(parseEnv(VALID))) as Record<string, unknown>;
    expect(withoutSeeds).not.toHaveProperty("SEED_ADMIN_PASSWORD");
  });
});

describe("T1.4 getEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvForTests();
  });

  it("valida process.env una sola vez y reutiliza el resultado", () => {
    for (const [key, value] of Object.entries(VALID)) vi.stubEnv(key, value);
    const first = getEnv();
    vi.stubEnv("APP_ENV", "staging");
    expect(getEnv()).toBe(first);
  });

  it("lanza EnvValidationError si process.env es inválido", () => {
    for (const [key, value] of Object.entries(VALID)) vi.stubEnv(key, value);
    vi.stubEnv("SOLVER_SERVICE_TOKEN", "corto");
    expect(() => getEnv()).toThrow(EnvValidationError);
  });
});
