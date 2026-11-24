/**
 * Usuarios del seed (specs/01-domain-spec.md TFM-01): uno por rol, con las credenciales de las variables `SEED_*`.
 *
 * Es idempotente:
 * - crea los que faltan;
 * - deja tal cual los que ya están como deben;
 * - restaura los que se hayan modificado (rol, estado, bloqueo, nombre o contraseña), para que las credenciales
 *   documentadas funcionen siempre.
 * Solo toca los correos de las variables `SEED_*`: el resto de usuarios no se lee ni se modifica.
 */
import { z } from "zod";
import type { PasswordHasher } from "@/application/ports/password-hasher";
import type { Role } from "@/domain/access/role";
import type { DatabaseClient } from "@/infrastructure/db/prisma-client";
import { SEED_PASSWORD_MIN_LENGTH } from "@/lib/env";

/** Igual que el formulario de login (application/auth/login.ts): una contraseña más larga no se podría usar. */
const PASSWORD_MAX_LENGTH = 256;
const EMAIL_MAX_LENGTH = 254;

const SEED_ACCOUNTS = [
  { role: "ADMIN_DIRECCION", displayName: "Dirección (demo)", emailVar: "SEED_ADMIN_EMAIL", passwordVar: "SEED_ADMIN_PASSWORD" },
  { role: "DOCENTE", displayName: "Docente (demo)", emailVar: "SEED_TEACHER_EMAIL", passwordVar: "SEED_TEACHER_PASSWORD" },
  { role: "INVITADO_DEMO", displayName: "Invitado (demo)", emailVar: "SEED_GUEST_EMAIL", passwordVar: "SEED_GUEST_PASSWORD" },
] as const satisfies readonly { role: Role; displayName: string; emailVar: string; passwordVar: string }[];

export interface SeedUser {
  readonly role: Role;
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}

export interface SeedReport {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
}

/** Variables del seed ausentes o inválidas. Nombra las variables, nunca sus valores (son credenciales). */
export class SeedConfigError extends Error {
  readonly variables: readonly string[];

  constructor(problems: ReadonlyMap<string, string>) {
    const variables = [...problems.keys()];
    super(`Variables del seed inválidas:\n${variables.map((name) => `  - ${name}: ${problems.get(name)}`).join("\n")}`);
    this.name = "SeedConfigError";
    this.variables = variables;
  }
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH, `no puede superar ${EMAIL_MAX_LENGTH} caracteres`)
  .pipe(z.email("debe ser un correo electrónico válido"));
const passwordSchema = z
  .string()
  .min(SEED_PASSWORD_MIN_LENGTH, `debe tener al menos ${SEED_PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `no puede superar ${PASSWORD_MAX_LENGTH} caracteres`);

/** Valor validado de una variable, o `undefined` tras anotar el problema. Vacía cuenta como ausente. */
function readVariable<T>(
  source: Readonly<Record<string, string | undefined>>,
  name: string,
  schema: z.ZodType<T>,
  problems: Map<string, string>,
): T | undefined {
  const raw = source[name];
  if (raw === undefined || raw === "") {
    problems.set(name, "es obligatoria");
    return undefined;
  }
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  problems.set(name, result.error.issues[0]?.message ?? "no es válida");
  return undefined;
}

export function parseSeedUsers(source: Readonly<Record<string, string | undefined>>): SeedUser[] {
  const problems = new Map<string, string>();
  const users: SeedUser[] = [];
  const emailOwners = new Map<string, string>();

  for (const account of SEED_ACCOUNTS) {
    const email = readVariable(source, account.emailVar, emailSchema, problems);
    const password = readVariable(source, account.passwordVar, passwordSchema, problems);
    if (email !== undefined && emailOwners.has(email)) {
      problems.set(account.emailVar, `repite el correo de ${emailOwners.get(email)}: cada rol necesita su propio usuario`);
    } else if (email !== undefined) {
      emailOwners.set(email, account.emailVar);
    }
    if (email !== undefined && password !== undefined) {
      users.push({ role: account.role, displayName: account.displayName, email, password });
    }
  }

  if (problems.size > 0) throw new SeedConfigError(problems);
  return users;
}

async function isPasswordCurrent(hasher: PasswordHasher, password: string, passwordHash: string): Promise<boolean> {
  return !hasher.needsRehash(passwordHash) && (await hasher.verify(password, passwordHash));
}

export async function seedUsers(db: DatabaseClient, hasher: PasswordHasher, users: readonly SeedUser[]): Promise<SeedReport> {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const user of users) {
    const existing = await db.appUser.findUnique({
      where: { email: user.email },
      select: { id: true, passwordHash: true, role: true, displayName: true, isActive: true, failedLoginCount: true, lockedUntil: true },
    });

    if (existing === null) {
      await db.appUser.create({
        data: { email: user.email, passwordHash: await hasher.hash(user.password), displayName: user.displayName, role: user.role },
      });
      created += 1;
      continue;
    }

    const passwordCurrent = await isPasswordCurrent(hasher, user.password, existing.passwordHash);
    const upToDate =
      passwordCurrent &&
      existing.role === user.role &&
      existing.displayName === user.displayName &&
      existing.isActive &&
      existing.failedLoginCount === 0 &&
      existing.lockedUntil === null;
    if (upToDate) {
      unchanged += 1;
      continue;
    }

    await db.appUser.update({
      where: { id: existing.id },
      data: {
        role: user.role,
        displayName: user.displayName,
        isActive: true,
        failedLoginCount: 0,
        lockedUntil: null,
        ...(passwordCurrent ? {} : { passwordHash: await hasher.hash(user.password) }),
      },
    });
    updated += 1;
  }

  return { created, updated, unchanged };
}
