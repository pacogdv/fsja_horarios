/**
 * Permisos de la aplicación (specs/02-architecture-plan.md §5.3, derivados de specs/01-domain-spec.md §9).
 *
 * Convención: `:any` actúa sobre cualquier recurso; `:own` y `:own-soft`, solo sobre los del propio docente.
 */
export const PERMISSIONS = Object.freeze([
  "config:read",
  "config:write",
  "academic:read",
  "academic:write",
  "availability:write:any",
  /** Solo los estados blandos de la propia plantilla: PREFERENTE / NO_PREFERENTE (MH-07). */
  "availability:write:own-soft",
  /** Solicitar una celda PROHIBIDO, que aprueba ADMIN_DIRECCION (P-03). */
  "availability:request-forbidden",
  "engine:run",
  "engine:read",
  "timetable:select-current",
  "timetable:edit",
  "timetable:read:any",
  "timetable:read:own",
  "io:import",
  "io:export:any",
  "io:export:own",
  "users:manage",
] as const);

export type Permission = (typeof PERMISSIONS)[number];

const KNOWN_PERMISSIONS: ReadonlySet<unknown> = new Set(PERMISSIONS);

/** Valida un permiso que llega de fuera. Un Set no hereda claves como `toString` o `__proto__`. */
export function isPermission(value: unknown): value is Permission {
  return KNOWN_PERMISSIONS.has(value);
}
