/**
 * T1.8 — Política de acceso (RBAC) con denegación por defecto y comprobación de propiedad.
 * Refs: specs/01-domain-spec.md §9 y P-04; specs/02-architecture-plan.md §5.3; CLAUDE.md §3.2.
 *
 * La matriz esperada se escribe aquí a partir de la spec, sin importarla de la implementación: si alguien
 * cambia un permiso en el código sin cambiar la spec, este test falla.
 */
import { describe, expect, it } from "vitest";
import { type AccessResource, type Actor, isAllowed, roleHasPermission } from "./access-policy";
import { isPermission, type Permission, PERMISSIONS } from "./permission";
import { isRole, type Role, ROLES } from "./role";

/**
 * - `true` / `false`: concedido o denegado sin condiciones («—» en la spec cuenta como denegado).
 * - `"owner"`: solo si el recurso es del propio docente.
 * - `"owner-or-taught-group"`: el suyo o el de un grupo al que da clase (P-04).
 */
type Expected = boolean | "owner" | "owner-or-taught-group";

// specs/02-architecture-plan.md §5.3 (derivada de specs/01-domain-spec.md §9).
const SPEC_MATRIX: Record<Permission, Record<Role, Expected>> = {
  "config:read": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: true },
  "config:write": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: false },
  "academic:read": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: true },
  "academic:write": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: false },
  "availability:write:any": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: false },
  "availability:write:own-soft": { ADMIN_DIRECCION: true, DOCENTE: "owner", INVITADO_DEMO: false },
  "availability:request-forbidden": { ADMIN_DIRECCION: false, DOCENTE: "owner", INVITADO_DEMO: false },
  "engine:run": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: false },
  "engine:read": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: true },
  "timetable:select-current": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: false },
  "timetable:edit": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: false },
  "timetable:read:any": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: true },
  "timetable:read:own": { ADMIN_DIRECCION: true, DOCENTE: "owner-or-taught-group", INVITADO_DEMO: false },
  "io:import": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: false },
  "io:export:any": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: true },
  "io:export:own": { ADMIN_DIRECCION: true, DOCENTE: "owner", INVITADO_DEMO: false },
  "users:manage": { ADMIN_DIRECCION: true, DOCENTE: false, INVITADO_DEMO: false },
};

const OWN_TEACHER = "teacher-own";
const OTHER_TEACHER = "teacher-other";
const TAUGHT_GROUP = "group-taught";
const OTHER_GROUP = "group-other";

const actor = (role: string, teacherId: string | null = OWN_TEACHER): Actor => ({
  role,
  teacherId,
  taughtClassGroupIds: new Set([TAUGHT_GROUP]),
});

const ownTeacher: AccessResource = { kind: "teacher", teacherId: OWN_TEACHER };
const otherTeacher: AccessResource = { kind: "teacher", teacherId: OTHER_TEACHER };
const taughtGroup: AccessResource = { kind: "classGroup", classGroupId: TAUGHT_GROUP };
const otherGroup: AccessResource = { kind: "classGroup", classGroupId: OTHER_GROUP };
const ALL_RESOURCES = [undefined, ownTeacher, otherTeacher, taughtGroup, otherGroup] as const;

describe("T1.8 catálogo de roles y permisos", () => {
  it("la matriz del test cubre exactamente los permisos y roles del dominio [02 §5.3]", () => {
    expect(Object.keys(SPEC_MATRIX).sort()).toEqual([...PERMISSIONS].sort());
    for (const permission of PERMISSIONS) {
      expect(Object.keys(SPEC_MATRIX[permission]).sort()).toEqual([...ROLES].sort());
    }
  });

  it("los roles son los tres de CLAUDE.md §3.2", () => {
    expect([...ROLES].sort()).toEqual(["ADMIN_DIRECCION", "DOCENTE", "INVITADO_DEMO"]);
  });

  it("los catálogos no se pueden modificar en tiempo de ejecución", () => {
    expect(Object.isFrozen(ROLES)).toBe(true);
    expect(Object.isFrozen(PERMISSIONS)).toBe(true);
  });

  it.each([...ROLES])("isRole reconoce %s", (role) => expect(isRole(role)).toBe(true));
  it.each([...PERMISSIONS])("isPermission reconoce %s", (permission) => expect(isPermission(permission)).toBe(true));

  it.each(["", "ADMIN", "admin_direccion", "toString", "__proto__", "constructor", 42, null, undefined, {}])(
    "isRole rechaza %j",
    (value) => expect(isRole(value)).toBe(false),
  );

  it.each(["", "config:delete", "CONFIG:READ", "toString", "__proto__", "hasOwnProperty", 7, null, undefined])(
    "isPermission rechaza %j",
    (value) => expect(isPermission(value)).toBe(false),
  );
});

describe("T1.8 matriz completa de permisos [01 §9, 02 §5.3]", () => {
  const cases = ROLES.flatMap((role) =>
    PERMISSIONS.map((permission) => [role, permission, SPEC_MATRIX[permission][role]] as const),
  );

  it.each(cases.filter(([, , expected]) => expected === true))(
    "%s tiene %s sin condiciones (con o sin recurso)",
    (role, permission) => {
      for (const resource of ALL_RESOURCES) expect(isAllowed(actor(role), permission, resource)).toBe(true);
      expect(isAllowed(actor(role, null), permission)).toBe(true);
    },
  );

  it.each(cases.filter(([, , expected]) => expected === false))(
    "%s NO tiene %s, ni siquiera sobre sus propios recursos",
    (role, permission) => {
      for (const resource of ALL_RESOURCES) expect(isAllowed(actor(role), permission, resource)).toBe(false);
    },
  );

  describe.each(cases.filter(([, , expected]) => expected === "owner" || expected === "owner-or-taught-group"))(
    "%s tiene %s solo sobre recursos propios",
    (role, permission, expected) => {
      it("se concede sobre su propio horario o plantilla", () => {
        expect(isAllowed(actor(role), permission, ownTeacher)).toBe(true);
      });

      it("se deniega sobre los de otro docente", () => {
        expect(isAllowed(actor(role), permission, otherTeacher)).toBe(false);
      });

      it("se deniega sin recurso: la propiedad no se puede comprobar", () => {
        expect(isAllowed(actor(role), permission)).toBe(false);
      });

      it("se deniega si el usuario no está vinculado a un docente", () => {
        expect(isAllowed(actor(role, null), permission, ownTeacher)).toBe(false);
        expect(isAllowed(actor(role, null), permission, { kind: "teacher", teacherId: "" })).toBe(false);
      });

      it("se deniega sobre un grupo al que no da clase", () => {
        expect(isAllowed(actor(role), permission, otherGroup)).toBe(false);
      });

      it(
        expected === "owner-or-taught-group"
          ? "se concede sobre un grupo al que da clase (P-04)"
          : "se deniega incluso sobre un grupo al que da clase (solo lo suyo)",
        () => {
          expect(isAllowed(actor(role), permission, taughtGroup)).toBe(expected === "owner-or-taught-group");
        },
      );
    },
  );
});

describe("T1.8 denegación por defecto [CLAUDE.md §3.2]", () => {
  it.each(["config:delete", "", "CONFIG:READ", "toString", "__proto__", "constructor", "valueOf"])(
    "un permiso no listado (%j) se deniega incluso a ADMIN_DIRECCION",
    (permission) => {
      for (const resource of ALL_RESOURCES) {
        expect(isAllowed(actor("ADMIN_DIRECCION"), permission as Permission, resource)).toBe(false);
      }
    },
  );

  it.each(["", "ADMIN", "admin_direccion", "SUPERUSER", "toString", "__proto__", "constructor"])(
    "un rol no listado (%j) no tiene ningún permiso",
    (role) => {
      for (const permission of PERMISSIONS) {
        for (const resource of ALL_RESOURCES) expect(isAllowed(actor(role), permission, resource)).toBe(false);
      }
    },
  );

  it("un recurso de tipo desconocido no concede permisos de propiedad", () => {
    const unknown = { kind: "room", teacherId: OWN_TEACHER } as unknown as AccessResource;
    expect(isAllowed(actor("DOCENTE"), "timetable:read:own", unknown)).toBe(false);
  });
});

describe("T1.15 roleHasPermission: ¿puede el rol ejercer el permiso sobre algún recurso? [02 §6.3]", () => {
  const cases = ROLES.flatMap((role) =>
    PERMISSIONS.map((permission) => [role, permission, SPEC_MATRIX[permission][role] !== false] as const),
  );

  it.each(cases)("%s / %s → %s (la propiedad cuenta como concedido: el sidebar no tiene recurso)", (role, permission, expected) => {
    expect(roleHasPermission(role, permission)).toBe(expected);
  });

  it.each(["", "SUPERUSER", "toString", "__proto__"])("un rol desconocido (%j) no tiene ningún permiso", (role) => {
    for (const permission of PERMISSIONS) expect(roleHasPermission(role, permission)).toBe(false);
  });

  it("un permiso desconocido se deniega", () => {
    expect(roleHasPermission("ADMIN_DIRECCION", "config:delete" as Permission)).toBe(false);
  });
});
