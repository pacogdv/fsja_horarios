// @vitest-environment node
/**
 * T1.9 — Hash de contraseñas Argon2id con los parámetros de OWASP.
 * Refs: specs/02-architecture-plan.md §5.2 (paso 5); ADR-0002; CLAUDE.md §3.1.
 */
import { hash as hashWith, parseOptions } from "@node-rs/argon2";
import { describe, expect, it } from "vitest";
import type { PasswordHasher } from "@/application/ports/password-hasher";
import { ARGON2_PARAMETERS, Argon2PasswordHasher } from "./argon2-hasher";

const hasher: PasswordHasher = new Argon2PasswordHasher();
const PASSWORD = "Correcta-Caballo-Batería-Grapa";

// Valores numéricos de los enums de @node-rs/argon2 (son `const enum` y no se pueden importar).
const ARGON2I = 1;
const ARGON2ID = 2;
const VERSION_0X10 = 0;
const VERSION_0X13 = 1;

describe("T1.9 parámetros Argon2id [02 §5.2]", () => {
  it("usa m = 19456 KiB, t = 2, p = 1", () => {
    expect(ARGON2_PARAMETERS).toEqual({ memoryCost: 19456, timeCost: 2, parallelism: 1 });
  });

  it("genera hashes Argon2id v19 en formato PHC con esos parámetros", async () => {
    const hashed = await hasher.hash(PASSWORD);
    expect(hashed.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
    expect(parseOptions(hashed)).toMatchObject({
      algorithm: ARGON2ID,
      version: VERSION_0X13,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  it("usa una sal aleatoria: dos hashes de la misma contraseña son distintos", async () => {
    expect(await hasher.hash(PASSWORD)).not.toBe(await hasher.hash(PASSWORD));
  });

  it("el hash no contiene la contraseña en claro", async () => {
    const hashed = await hasher.hash(PASSWORD);
    expect(hashed).not.toContain(PASSWORD);
    expect(hashed).not.toContain(Buffer.from(PASSWORD).toString("base64").replace(/=+$/, ""));
  });
});

describe("T1.9 verify", () => {
  it("devuelve true con la contraseña correcta", async () => {
    expect(await hasher.verify(PASSWORD, await hasher.hash(PASSWORD))).toBe(true);
  });

  it("devuelve false con una contraseña incorrecta (también si solo cambia una mayúscula)", async () => {
    const hashed = await hasher.hash(PASSWORD);
    expect(await hasher.verify("otra-contraseña", hashed)).toBe(false);
    expect(await hasher.verify(PASSWORD.toLowerCase(), hashed)).toBe(false);
    expect(await hasher.verify("", hashed)).toBe(false);
  });

  it("admite contraseñas con caracteres no ASCII", async () => {
    const unicode = "contraseña ñandú 🔐 ÀÉÎÕÜ";
    expect(await hasher.verify(unicode, await hasher.hash(unicode))).toBe(true);
  });

  it("verifica hashes con parámetros antiguos (el login funciona antes de rehashear)", async () => {
    const legacy = await hashWith(PASSWORD, { memoryCost: 4096, timeCost: 1, parallelism: 1 });
    expect(await hasher.verify(PASSWORD, legacy)).toBe(true);
  });

  it.each([
    ["vacío", ""],
    ["texto cualquiera", "no-es-un-hash"],
    ["prefijo PHC sin sal ni hash", "$argon2id$v=19$m=19456,t=2,p=1$"],
    ["hash bcrypt", "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5J1rZ3G0Y7fN7yWj2r5o2C2oYbQYk2a"],
    ["algoritmo desconocido", "$argon2x$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2g"],
    ["parámetros no numéricos", "$argon2id$v=19$m=abc,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2g"],
    ["base64 inválido", "$argon2id$v=19$m=19456,t=2,p=1$***$***"],
    ["bytes de control", "$argon2id$\u0000\u0001\u0002"],
  ])("con un hash mal formado (%s) devuelve false sin lanzar", async (_case, malformed) => {
    await expect(hasher.verify(PASSWORD, malformed)).resolves.toBe(false);
  });

  it("con un hash truncado devuelve false sin lanzar", async () => {
    const hashed = await hasher.hash(PASSWORD);
    await expect(hasher.verify(PASSWORD, hashed.slice(0, -10))).resolves.toBe(false);
  });

  it("con entradas que no son texto (datos externos mal tipados) devuelve false sin lanzar", async () => {
    const hashed = await hasher.hash(PASSWORD);
    for (const value of [undefined, null, 42, {}]) {
      await expect(hasher.verify(PASSWORD, value as unknown as string)).resolves.toBe(false);
      await expect(hasher.verify(value as unknown as string, hashed)).resolves.toBe(false);
    }
  });
});

describe("T1.9 needsRehash", () => {
  it("es false con un hash generado con los parámetros actuales", async () => {
    expect(hasher.needsRehash(await hasher.hash(PASSWORD))).toBe(false);
  });

  it.each([
    ["memoria inferior (m = 4096)", { memoryCost: 4096, timeCost: 2, parallelism: 1 }],
    ["menos iteraciones (t = 1)", { memoryCost: 19456, timeCost: 1, parallelism: 1 }],
    ["memoria e iteraciones inferiores", { memoryCost: 8192, timeCost: 1, parallelism: 1 }],
    ["algoritmo Argon2i", { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: ARGON2I }],
    ["versión 0x10", { memoryCost: 19456, timeCost: 2, parallelism: 1, version: VERSION_0X10 }],
  ])("es true con un hash de parámetros inferiores: %s", async (_case, options) => {
    expect(hasher.needsRehash(await hashWith(PASSWORD, options))).toBe(true);
  });

  it.each(["", "no-es-un-hash", "$argon2id$v=19$m=abc,t=2,p=1$x$y"])(
    "es true (sin lanzar) con un hash ilegible %j: se sustituirá por uno válido",
    (malformed) => {
      expect(hasher.needsRehash(malformed)).toBe(true);
    },
  );
});
