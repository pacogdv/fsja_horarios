/**
 * Adaptador Argon2id del puerto `PasswordHasher` (specs/02-architecture-plan.md §5.2; ADR-0002).
 *
 * Parámetros de OWASP para Argon2id: 19 MiB de memoria, 2 iteraciones y 1 hilo. Si cambian, los hashes
 * existentes siguen verificándose y `needsRehash` indica cuándo sustituirlos tras un login correcto.
 */
import { type Algorithm, hash, parseOptions, verify, type Version } from "@node-rs/argon2";
import type { PasswordHasher } from "@/application/ports/password-hasher";

export const ARGON2_PARAMETERS = Object.freeze({ memoryCost: 19456, timeCost: 2, parallelism: 1 });

// Valores de los `const enum` de @node-rs/argon2, que no se pueden referenciar con `isolatedModules`.
const ARGON2ID: Algorithm = 2;
const VERSION_0X13: Version = 1;

const HASH_OPTIONS = { ...ARGON2_PARAMETERS, algorithm: ARGON2ID, version: VERSION_0X13 };

export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, HASH_OPTIONS);
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    if (typeof password !== "string" || typeof passwordHash !== "string") return false;
    try {
      return await verify(passwordHash, password);
    } catch {
      // Hash mal formado o ilegible: se trata como una contraseña incorrecta, sin dar detalles.
      return false;
    }
  }

  needsRehash(passwordHash: string): boolean {
    let current;
    try {
      current = parseOptions(passwordHash);
    } catch {
      return true;
    }
    return (
      current.algorithm !== ARGON2ID ||
      current.version !== VERSION_0X13 ||
      current.memoryCost < ARGON2_PARAMETERS.memoryCost ||
      current.timeCost < ARGON2_PARAMETERS.timeCost ||
      current.parallelism < ARGON2_PARAMETERS.parallelism
    );
  }
}
