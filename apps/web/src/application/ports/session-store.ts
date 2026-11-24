/**
 * Puerto del almacén de sesiones opacas (specs/02-architecture-plan.md §5.2; ADR-0002).
 *
 * El token en claro solo existe en la cookie del navegador y en el valor que devuelve `create`: el almacén
 * guarda únicamente su hash.
 */
export interface Session {
  readonly id: string;
  readonly userId: string;
  /** Caducidad absoluta (8 h desde el login). */
  readonly expiresAt: Date;
  /** Caducidad por inactividad (30 min desde la última renovación). */
  readonly idleExpiresAt: Date;
}

export interface NewSessionInput {
  readonly userId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface SessionStore {
  /** Crea una sesión y devuelve el token en claro, que solo debe ir a la cookie. */
  create(input: NewSessionInput): Promise<{ readonly token: string; readonly session: Session }>;
  /** Sesión vigente del token (renovando la inactividad si toca), o `null`. Nunca lanza por un token inválido. */
  findValid(token: string): Promise<Session | null>;
  /** Invalida la sesión de ese token (logout). */
  revoke(token: string): Promise<void>;
  /** Invalida todas las sesiones del usuario (desactivación, cambio de rol, contraseña). */
  revokeAllForUser(userId: string): Promise<void>;
  /** Borra las sesiones caducadas y devuelve cuántas. */
  purgeExpired(): Promise<number>;
}
