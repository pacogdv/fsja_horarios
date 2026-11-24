/**
 * Puerto del rate limiter de ventana fija (specs/02-architecture-plan.md §5.6; ADR-0008).
 * Los límites concretos de cada operación están en la tabla de 02 §5.6.
 */
export interface RateLimitRule {
  /** Peticiones permitidas por ventana (entero ≥ 1). */
  readonly limit: number;
  /** Duración de la ventana en segundos (entero ≥ 1). */
  readonly windowSeconds: number;
}

export type RateLimitDecision =
  | { readonly allowed: true; readonly remaining: number }
  /** Al superar el límite se responde 429 con `Retry-After: retryAfterSeconds`. */
  | { readonly allowed: false; readonly retryAfterSeconds: number };

/** Claves de los límites. No contienen datos personales en claro (02 §5.6): el adaptador los seudonimiza. */
export interface RateLimitKeys {
  loginByIp(ip: string): string;
  loginByIpAndEmail(ip: string, email: string): string;
}

export interface RateLimiter {
  /** Cuenta una petición con esa clave y decide si se permite. */
  consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
  /** Decide si la siguiente petición se permitiría, sin contarla (límites que solo cuentan fallos). */
  peek(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
  /** Borra los contadores de ventanas terminadas hace más de `maxWindowSeconds`; devuelve cuántos. */
  purgeExpired(maxWindowSeconds: number): Promise<number>;
}
