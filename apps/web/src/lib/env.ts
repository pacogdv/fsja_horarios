/**
 * Variables de entorno del servidor web, validadas con Zod (specs/02-architecture-plan.md §5.4 y §5.7).
 *
 * - Los mensajes de error nombran la variable y el motivo, pero **nunca** su valor (pueden ser secretos).
 * - Ninguna variable es `NEXT_PUBLIC_*`: todas son solo de servidor y Next.js no las envía al navegador.
 * - `instrumentation.ts` llama a `getEnv()` al arrancar, así que un entorno inválido impide arrancar.
 */
import { z } from "zod";

const APP_ENVS = ["development", "test", "production"] as const;
const SECRET_MIN_LENGTH = 32;
/** Mínimo de las contraseñas `SEED_*`; lo comparte el seed (prisma/seed/users.ts). */
export const SEED_PASSWORD_MIN_LENGTH = 12;

/** Una variable vacía (`VAR=`) cuenta como ausente. */
const emptyAsMissing = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

function hasProtocol(value: string, protocols: readonly string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** `http(s)://host[:puerto]`, sin ruta, query ni barra final. */
function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
  } catch {
    return false;
  }
}

const secret = emptyAsMissing(
  z.string().min(SECRET_MIN_LENGTH, `debe tener al menos ${SECRET_MIN_LENGTH} caracteres`),
);
const seedEmail = emptyAsMissing(z.email("debe ser un correo electrónico válido").optional());
const seedPassword = emptyAsMissing(
  z.string().min(SEED_PASSWORD_MIN_LENGTH, `debe tener al menos ${SEED_PASSWORD_MIN_LENGTH} caracteres`).optional(),
);

const baseSchema = z.object({
  APP_ENV: emptyAsMissing(z.enum(APP_ENVS, `debe ser uno de: ${APP_ENVS.join(", ")}`)),
  APP_ORIGIN: emptyAsMissing(
    z.string().refine(isOrigin, "debe ser un origen http(s)://host[:puerto], sin ruta ni barra final"),
  ),
  TRUSTED_PROXY_HOPS: emptyAsMissing(
    z
      .enum(["0", "1", "2", "3"], "debe ser un entero entre 0 y 3")
      .default("0")
      .transform(Number),
  ),
  RATE_LIMIT_KEY_SECRET: secret,
  DATABASE_URL: emptyAsMissing(
    z.string().refine((value) => hasProtocol(value, ["postgres:", "postgresql:"]), "debe ser una URL postgres(ql)://"),
  ),
  SOLVER_URL: emptyAsMissing(
    z.string().refine((value) => hasProtocol(value, ["http:", "https:"]), "debe ser una URL http(s)://"),
  ),
  SOLVER_SERVICE_TOKEN: secret,
  SEED_ON_START: emptyAsMissing(
    z
      .enum(["true", "false"], "debe ser true o false")
      .default("false")
      .transform((value) => value === "true"),
  ),
  SEED_ADMIN_EMAIL: seedEmail,
  SEED_ADMIN_PASSWORD: seedPassword,
  SEED_TEACHER_EMAIL: seedEmail,
  SEED_TEACHER_PASSWORD: seedPassword,
  SEED_GUEST_EMAIL: seedEmail,
  SEED_GUEST_PASSWORD: seedPassword,
});

const SEED_KEYS = [
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
  "SEED_TEACHER_EMAIL",
  "SEED_TEACHER_PASSWORD",
  "SEED_GUEST_EMAIL",
  "SEED_GUEST_PASSWORD",
] as const;

/** Reglas que relacionan varias variables. */
const envSchema = baseSchema.superRefine((env, context) => {
  if (env.APP_ENV === "production" && !env.APP_ORIGIN.startsWith("https://")) {
    context.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "debe usar https en production" });
  }
  // Con 0 saltos, la IP sale de una X-Forwarded-For que el cliente puede falsificar (02 §5.6, verificado en T1.11).
  if (env.APP_ENV === "production" && env.TRUSTED_PROXY_HOPS === 0) {
    context.addIssue({
      code: "custom",
      path: ["TRUSTED_PROXY_HOPS"],
      message: "debe ser 1 o más en production: la web debe estar detrás del proxy inverso (02 §5.6)",
    });
  }
  if (!env.SEED_ON_START) return;
  if (env.APP_ENV === "production") {
    context.addIssue({
      code: "custom",
      path: ["SEED_ON_START"],
      message: "no puede ser true en production: el seed crea usuarios de demostración (TFM-02)",
    });
  }
  for (const key of SEED_KEYS) {
    if (env[key] === undefined) {
      context.addIssue({ code: "custom", path: [key], message: "es obligatoria cuando SEED_ON_START=true" });
    }
  }
});

export type Env = Readonly<z.output<typeof envSchema>>;

/** Nombres de todas las variables que valida este módulo. */
export const ENV_KEYS = Object.keys(baseSchema.shape) as readonly (keyof typeof baseSchema.shape)[];

/** Entorno inválido. Expone los nombres de las variables afectadas, nunca sus valores. */
export class EnvValidationError extends Error {
  readonly variables: readonly string[];

  constructor(problems: ReadonlyMap<string, string>) {
    const variables = [...problems.keys()].sort();
    const details = variables.map((name) => `  - ${name}: ${problems.get(name)}`).join("\n");
    super(`Variables de entorno inválidas:\n${details}\nRevisa .env.example.`);
    this.name = "EnvValidationError";
    this.variables = variables;
  }
}

/** Variables que nunca deben aparecer en logs ni serializaciones. */
const SECRET_KEYS: ReadonlySet<string> = new Set([
  "RATE_LIMIT_KEY_SECRET",
  "SOLVER_SERVICE_TOKEN",
  "DATABASE_URL",
  "SEED_ADMIN_PASSWORD",
  "SEED_TEACHER_PASSWORD",
  "SEED_GUEST_PASSWORD",
]);
const REDACTED = "[REDACTADO]";

/**
 * Hace que `JSON.stringify(env)` y `console.log(env)` muestren `[REDACTADO]` en lugar de los secretos.
 * Las propiedades siguen accesibles (`env.DATABASE_URL`). Los métodos añadidos no son enumerables, así
 * que no aparecen al recorrer o copiar el objeto.
 */
function withRedactedSecrets<T extends object>(env: T): T {
  const redacted = (): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(env).map(([key, value]) => [key, SECRET_KEYS.has(key) && value !== undefined ? REDACTED : value]),
    );
  Object.defineProperty(env, "toJSON", { value: redacted });
  Object.defineProperty(env, Symbol.for("nodejs.util.inspect.custom"), { value: redacted });
  return env;
}

/** Valida `source` (normalmente `process.env`) y devuelve el entorno tipado e inmutable. */
export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return Object.freeze(withRedactedSecrets(result.data));

  const problems = new Map<string, string>();
  for (const issue of result.error.issues) {
    const name = String(issue.path[0] ?? "(entorno)");
    if (problems.has(name)) continue;
    const missing = source[name] === undefined || source[name] === "";
    problems.set(name, missing && issue.code !== "custom" ? "es obligatoria" : issue.message);
  }
  throw new EnvValidationError(problems);
}

let cachedEnv: Env | undefined;

/** Entorno del proceso, validado la primera vez que se pide. */
export function getEnv(): Env {
  if (typeof window !== "undefined") {
    throw new Error("El entorno es solo de servidor: getEnv() no puede usarse en el navegador.");
  }
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

/** Solo para tests: olvida el entorno validado para volver a leer `process.env`. */
export function resetEnvForTests(): void {
  cachedEnv = undefined;
}
