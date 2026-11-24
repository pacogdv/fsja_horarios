/**
 * Roles de usuario (CLAUDE.md §3.2; specs/02-architecture-plan.md §2.2, enum `user_role`).
 */
export const ROLES = Object.freeze(["ADMIN_DIRECCION", "DOCENTE", "INVITADO_DEMO"] as const);

export type Role = (typeof ROLES)[number];

const KNOWN_ROLES: ReadonlySet<unknown> = new Set(ROLES);

/** Valida un rol que llega de fuera (BD, sesión). Un Set no hereda claves como `toString` o `__proto__`. */
export function isRole(value: unknown): value is Role {
  return KNOWN_ROLES.has(value);
}
