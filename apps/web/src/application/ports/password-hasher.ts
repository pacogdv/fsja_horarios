/**
 * Puerto de hash de contraseñas (specs/02-architecture-plan.md §5.2; CLAUDE.md §3.1).
 * Los casos de uso de autenticación dependen de esta interfaz, no de la librería concreta.
 */
export interface PasswordHasher {
  /** Devuelve el hash (formato PHC) de `password`, con sal aleatoria. */
  hash(password: string): Promise<string>;
  /** `true` si `password` corresponde a `passwordHash`. Nunca lanza: un hash ilegible da `false`. */
  verify(password: string, passwordHash: string): Promise<boolean>;
  /** `true` si `passwordHash` se generó con parámetros más débiles que los actuales (o es ilegible). */
  needsRehash(passwordHash: string): boolean;
}
