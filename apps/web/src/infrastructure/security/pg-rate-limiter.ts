/**
 * Rate limiter de ventana fija sobre `rate_limit_bucket` (specs/02-architecture-plan.md §5.6; ADR-0008).
 *
 * - Las ventanas se alinean con el epoch: `window_start = ⌊now / ventana⌋ · ventana`.
 * - El incremento es atómico: una sola sentencia `INSERT … ON CONFLICT DO UPDATE … RETURNING count`, así
 *   que las peticiones concurrentes nunca pierden ni duplican cuentas.
 * - `$queryRaw` con plantilla etiquetada: los valores van como parámetros, nunca concatenados (ADR-0001).
 */
import type { Clock } from "@/application/ports/clock";
import type { RateLimitDecision, RateLimiter, RateLimitRule } from "@/application/ports/rate-limiter";
import type { DatabaseClient } from "@/infrastructure/db/prisma-client";

const KEY_MAX_LENGTH = 512;

function assertValidRule(rule: RateLimitRule): void {
  if (!Number.isInteger(rule.limit) || rule.limit < 1) throw new RangeError("limit debe ser un entero ≥ 1");
  if (!Number.isInteger(rule.windowSeconds) || rule.windowSeconds < 1) {
    throw new RangeError("windowSeconds debe ser un entero ≥ 1");
  }
}

function assertValidKey(key: string): void {
  if (key.length === 0 || key.length > KEY_MAX_LENGTH) {
    throw new RangeError(`la clave debe tener entre 1 y ${KEY_MAX_LENGTH} caracteres`);
  }
}

export class PgRateLimiter implements RateLimiter {
  constructor(
    private readonly db: DatabaseClient,
    private readonly clock: Clock,
  ) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const window = this.currentWindow(key, rule);
    const [bucket] = await this.db.$queryRaw<{ count: number }[]>`
      INSERT INTO rate_limit_bucket (key, window_start, count)
      VALUES (${key}, ${window.start}, 1)
      ON CONFLICT (key, window_start)
      DO UPDATE SET count = rate_limit_bucket.count + 1, updated_at = now()
      RETURNING count`;
    if (bucket === undefined) throw new Error("rate_limit_bucket: el incremento no devolvió el contador");
    return decide(bucket.count, rule, window);
  }

  async peek(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const window = this.currentWindow(key, rule);
    const bucket = await this.db.rateLimitBucket.findUnique({
      where: { key_windowStart: { key, windowStart: window.start } },
      select: { count: true },
    });
    // Decide como si se contara esta petición, sin contarla.
    return decide((bucket?.count ?? 0) + 1, rule, window);
  }

  async purgeExpired(maxWindowSeconds: number): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - maxWindowSeconds * 1000);
    const { count } = await this.db.rateLimitBucket.deleteMany({ where: { windowStart: { lte: cutoff } } });
    return count;
  }

  /** Ventana fija vigente, alineada con el epoch. Valida antes la clave y la regla. */
  private currentWindow(key: string, rule: RateLimitRule): Window {
    assertValidKey(key);
    assertValidRule(rule);
    const now = this.clock.now().getTime();
    const lengthMs = rule.windowSeconds * 1000;
    const startMs = Math.floor(now / lengthMs) * lengthMs;
    return { start: new Date(startMs), remainingMs: startMs + lengthMs - now };
  }
}

interface Window {
  readonly start: Date;
  /** Milisegundos hasta la siguiente ventana. */
  readonly remainingMs: number;
}

/** Decisión con el contador que habría tras la petición. */
function decide(countAfterRequest: number, rule: RateLimitRule, window: Window): RateLimitDecision {
  if (countAfterRequest <= rule.limit) return { allowed: true, remaining: rule.limit - countAfterRequest };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(window.remainingMs / 1000)) };
}
