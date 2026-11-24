/**
 * Caso de uso de login (specs/02-architecture-plan.md §5.2, pasos 2 a 9; ADR-0002; CLAUDE.md §3.1).
 *
 * Orden: límites de intentos → validación → búsqueda → verificación (siempre, también con un hash ficticio)
 * → bloqueo y usuario inactivo → sesión. Usuario inexistente, contraseña incorrecta, cuenta bloqueada y
 * usuario desactivado reciben exactamente la misma respuesta: el motivo real solo queda en `audit_log`.
 */
import { z } from "zod";
import type { AuditLog } from "@/application/ports/audit-log";
import type { Clock } from "@/application/ports/clock";
import type { PasswordHasher } from "@/application/ports/password-hasher";
import type { RateLimiter, RateLimitKeys } from "@/application/ports/rate-limiter";
import type { SessionStore } from "@/application/ports/session-store";
import type { UserRepository } from "@/application/ports/user-repository";
import type { Role } from "@/domain/access/role";

export const LOGIN_RATE_LIMITS = Object.freeze({
  perIpAndEmail: Object.freeze({ limit: 5, windowSeconds: 15 * 60 }),
  perIp: Object.freeze({ limit: 20, windowSeconds: 15 * 60 }),
});
/** Ventana más larga de 02 §5.6 (importación y exportación: 1 h): lo anterior ya no afecta a ningún límite. */
export const RATE_LIMIT_MAX_WINDOW_SECONDS = 60 * 60;
export const MAX_FAILED_LOGINS = 10;
export const ACCOUNT_LOCK_MS = 15 * 60_000;
export const INVALID_CREDENTIALS_MESSAGE = "Credenciales no válidas";

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MAX_LENGTH = 256;

/** DTO de entrada (02 §5.4). Los mensajes nunca repiten el valor recibido. */
const loginInputSchema = z.strictObject({
  email: z
    .string("Introduce tu correo electrónico.")
    .trim()
    .toLowerCase()
    .max(EMAIL_MAX_LENGTH, `El correo no puede superar ${EMAIL_MAX_LENGTH} caracteres.`)
    .pipe(z.email("Introduce un correo electrónico válido.")),
  password: z
    .string("Introduce tu contraseña.")
    .min(1, "Introduce tu contraseña.")
    .max(PASSWORD_MAX_LENGTH, `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`),
});

export interface LoginRequest {
  /** Datos del formulario, sin validar. */
  readonly email: unknown;
  readonly password: unknown;
  /** IP del cliente (`client-ip.ts`) o `unknown`. */
  readonly ip: string;
  readonly userAgent: string | null;
  /** Token de la cookie de sesión que ya tuviera el navegador. */
  readonly previousSessionToken: string | null;
}

export type LoginResult =
  | { readonly ok: true; readonly sessionToken: string; readonly sessionExpiresAt: Date; readonly userId: string; readonly role: Role }
  | { readonly ok: false; readonly error: "RATE_LIMITED"; readonly retryAfterSeconds: number }
  | { readonly ok: false; readonly error: "INVALID_INPUT"; readonly fieldErrors: Partial<Record<"email" | "password", string[]>> }
  | { readonly ok: false; readonly error: "INVALID_CREDENTIALS"; readonly message: string };

export interface LoginDependencies {
  readonly users: UserRepository;
  readonly hasher: PasswordHasher;
  readonly sessions: SessionStore;
  readonly rateLimiter: RateLimiter;
  readonly rateLimitKeys: RateLimitKeys;
  readonly auditLog: AuditLog;
  readonly clock: Clock;
}

type FailureReason = "unknown-user" | "wrong-password" | "locked" | "inactive";

const INVALID_CREDENTIALS: LoginResult = Object.freeze({
  ok: false,
  error: "INVALID_CREDENTIALS",
  message: INVALID_CREDENTIALS_MESSAGE,
});

export function makeLogin(deps: LoginDependencies): (request: LoginRequest) => Promise<LoginResult> {
  const { users, hasher, sessions, rateLimiter, rateLimitKeys, auditLog, clock } = deps;

  // Hash ficticio con los parámetros actuales: verificar un usuario inexistente cuesta lo mismo que uno real.
  let dummyPasswordHash: Promise<string> | undefined;
  const dummyHash = () => (dummyPasswordHash ??= hasher.hash(crypto.randomUUID()));

  /**
   * Límites de 02 §5.6. Por (ip, correo) cuenta todos los intentos. Por ip solo cuenta los fallos (se consulta
   * aquí y se incrementa en `reject`): un claustro entero sale a Internet con la misma IP del centro.
   */
  async function checkLoginLimits(request: LoginRequest): Promise<LoginResult | null> {
    // Antes de validar: el correo sin validar solo se usa (seudonimizado) como clave del límite.
    const email = typeof request.email === "string" ? request.email : "";
    const decisions = [
      await rateLimiter.consume(rateLimitKeys.loginByIpAndEmail(request.ip, email), LOGIN_RATE_LIMITS.perIpAndEmail),
      await rateLimiter.peek(rateLimitKeys.loginByIp(request.ip), LOGIN_RATE_LIMITS.perIp),
    ];
    const waits = decisions.flatMap((decision) => (decision.allowed ? [] : [decision.retryAfterSeconds]));
    return waits.length === 0 ? null : { ok: false, error: "RATE_LIMITED", retryAfterSeconds: Math.max(...waits) };
  }

  async function reject(userId: string | null, ip: string, reason: FailureReason): Promise<LoginResult> {
    await rateLimiter.consume(rateLimitKeys.loginByIp(ip), LOGIN_RATE_LIMITS.perIp);
    await auditLog.record({
      action: "auth.login.failed",
      userId,
      entityType: "app_user",
      entityId: userId,
      metadata: { ip, reason },
    });
    return INVALID_CREDENTIALS;
  }

  async function rejectWrongPassword(userId: string, ip: string, now: Date): Promise<LoginResult> {
    const failures = await users.recordFailedLogin(userId);
    const result = await reject(userId, ip, "wrong-password");
    if (failures >= MAX_FAILED_LOGINS) {
      const lockedUntil = new Date(now.getTime() + ACCOUNT_LOCK_MS);
      await users.lockUntil(userId, lockedUntil);
      await auditLog.record({
        action: "auth.account.locked",
        userId,
        entityType: "app_user",
        entityId: userId,
        metadata: { ip, lockedUntil: lockedUntil.toISOString() },
      });
    }
    return result;
  }

  return async function login(request: LoginRequest): Promise<LoginResult> {
    const limited = await checkLoginLimits(request);
    if (limited) return limited;

    const input = loginInputSchema.safeParse({ email: request.email, password: request.password });
    if (!input.success) {
      return { ok: false, error: "INVALID_INPUT", fieldErrors: z.flattenError(input.error).fieldErrors };
    }
    const { email, password } = input.data;

    const user = await users.findCredentialsByEmail(email);
    // Siempre se verifica, para que el tiempo de respuesta no revele si el usuario existe o está bloqueado.
    const passwordMatches = await hasher.verify(password, user?.passwordHash ?? (await dummyHash()));
    if (user === null) return reject(null, request.ip, "unknown-user");

    const now = clock.now();
    if (user.lockedUntil !== null && user.lockedUntil > now) return reject(user.id, request.ip, "locked");
    if (!user.isActive) return reject(user.id, request.ip, "inactive");
    if (!passwordMatches) return rejectWrongPassword(user.id, request.ip, now);

    await users.recordSuccessfulLogin(user.id, now);
    if (hasher.needsRehash(user.passwordHash)) await users.updatePasswordHash(user.id, await hasher.hash(password));

    // Fijación de sesión: la sesión que traía el navegador no sobrevive al login.
    if (request.previousSessionToken) await sessions.revoke(request.previousSessionToken);
    const { token, session } = await sessions.create({ userId: user.id, ip: request.ip, userAgent: request.userAgent });

    await sessions.purgeExpired();
    await rateLimiter.purgeExpired(RATE_LIMIT_MAX_WINDOW_SECONDS);
    await auditLog.record({
      action: "auth.login.succeeded",
      userId: user.id,
      entityType: "app_user",
      entityId: user.id,
      metadata: { ip: request.ip },
    });
    return { ok: true, sessionToken: token, sessionExpiresAt: session.expiresAt, userId: user.id, role: user.role };
  };
}
