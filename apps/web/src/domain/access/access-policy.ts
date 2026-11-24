/**
 * Política de acceso RBAC (specs/02-architecture-plan.md §5.3; specs/01-domain-spec.md §9; CLAUDE.md §3.2).
 *
 * - Denegación por defecto: cualquier par (rol, permiso) que no esté en la matriz devuelve `false`, igual que
 *   un rol o un permiso desconocidos.
 * - Propiedad: los permisos concedidos «sobre lo propio» exigen que el recurso sea del docente vinculado al
 *   usuario. Sin recurso, o sin docente vinculado, no se puede comprobar y se deniega.
 * - P-04: un docente también puede ver el horario de los grupos a los que da clase.
 *
 * Es TypeScript puro: quien la usa (las guardas de servidor) aporta el usuario y el recurso ya cargados.
 */
import type { Permission } from "./permission";
import type { Role } from "./role";

/** Usuario que solicita el acceso. `role` llega de fuera (sesión/BD): un rol desconocido no tiene permisos. */
export interface Actor {
  readonly role: string;
  /** Docente vinculado al usuario (`teacher.user_id`), o `null` si no es docente. */
  readonly teacherId: string | null;
  /** Grupos a los que da clase en el horario vigente (P-04). */
  readonly taughtClassGroupIds: ReadonlySet<string>;
}

/** Recurso sobre el que se comprueba la propiedad. */
export type AccessResource =
  | { readonly kind: "teacher"; readonly teacherId: string }
  | { readonly kind: "classGroup"; readonly classGroupId: string };

/**
 * - `always`: concedido sin condiciones.
 * - `own`: solo sobre recursos del propio docente.
 * - `ownOrTaughtGroup`: el propio docente o un grupo al que da clase (P-04).
 */
type Grant = "always" | "own" | "ownOrTaughtGroup";

type GrantsByRole = Readonly<Partial<Record<Role, Grant>>>;

// Matriz de specs/02-architecture-plan.md §5.3. Lo que no aparece (incluido «—» en la spec) se deniega.
const ACCESS_MATRIX: ReadonlyMap<Permission, ReadonlyMap<Role, Grant>> = new Map(
  (
    [
      ["config:read", { ADMIN_DIRECCION: "always", INVITADO_DEMO: "always" }],
      ["config:write", { ADMIN_DIRECCION: "always" }],
      ["academic:read", { ADMIN_DIRECCION: "always", INVITADO_DEMO: "always" }],
      ["academic:write", { ADMIN_DIRECCION: "always" }],
      ["availability:write:any", { ADMIN_DIRECCION: "always" }],
      ["availability:write:own-soft", { ADMIN_DIRECCION: "always", DOCENTE: "own" }],
      ["availability:request-forbidden", { DOCENTE: "own" }],
      ["engine:run", { ADMIN_DIRECCION: "always" }],
      ["engine:read", { ADMIN_DIRECCION: "always", INVITADO_DEMO: "always" }],
      ["timetable:select-current", { ADMIN_DIRECCION: "always" }],
      ["timetable:edit", { ADMIN_DIRECCION: "always" }],
      ["timetable:read:any", { ADMIN_DIRECCION: "always", INVITADO_DEMO: "always" }],
      ["timetable:read:own", { ADMIN_DIRECCION: "always", DOCENTE: "ownOrTaughtGroup" }],
      ["io:import", { ADMIN_DIRECCION: "always" }],
      ["io:export:any", { ADMIN_DIRECCION: "always", INVITADO_DEMO: "always" }],
      ["io:export:own", { ADMIN_DIRECCION: "always", DOCENTE: "own" }],
      ["users:manage", { ADMIN_DIRECCION: "always" }],
    ] satisfies readonly (readonly [Permission, GrantsByRole])[]
  ).map(([permission, grants]) => [permission, new Map(Object.entries(grants) as [Role, Grant][])]),
);

function isOwnTeacher(actor: Actor, resource: AccessResource | undefined): boolean {
  return (
    resource?.kind === "teacher" &&
    actor.teacherId !== null &&
    actor.teacherId !== "" &&
    resource.teacherId === actor.teacherId
  );
}

function isTaughtGroup(actor: Actor, resource: AccessResource | undefined): boolean {
  return (
    resource?.kind === "classGroup" &&
    actor.teacherId !== null &&
    actor.teacherId !== "" &&
    actor.taughtClassGroupIds.has(resource.classGroupId)
  );
}

function isGrantMet(grant: Grant, actor: Actor, resource: AccessResource | undefined): boolean {
  switch (grant) {
    case "always":
      return true;
    case "own":
      return isOwnTeacher(actor, resource);
    case "ownOrTaughtGroup":
      return isOwnTeacher(actor, resource) || isTaughtGroup(actor, resource);
  }
}

/** ¿Puede `actor` ejercer `permission` (sobre `resource`, si el permiso depende de la propiedad)? */
export function isAllowed(actor: Actor, permission: Permission, resource?: AccessResource): boolean {
  // Rol y permiso llegan de fuera aunque el tipo diga otra cosa. Un Map (a diferencia de un objeto) no
  // hereda claves como `toString` o `__proto__`: lo desconocido no se encuentra y se deniega.
  const grant = ACCESS_MATRIX.get(permission)?.get(actor.role as Role);
  return grant !== undefined && isGrantMet(grant, actor, resource);
}
