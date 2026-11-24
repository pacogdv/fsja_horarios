/**
 * Navegación del sidebar (specs/02-architecture-plan.md §6.3), filtrada por los permisos del rol.
 *
 * Es solo presentación: ocultar un enlace no protege nada, la autorización la hacen las guardas (02 §5.3).
 * Las entradas «mi …» se ocultan a quien ya tiene el permiso general (`hiddenWith`): Dirección ve Horarios,
 * no Mi horario. Editor y Versiones necesitan el horario vigente y se añaden con él (H4).
 */
import { roleHasPermission } from "@/domain/access/access-policy";
import type { Permission } from "@/domain/access/permission";
import type { Role } from "@/domain/access/role";
import { es } from "@/lib/i18n/es";

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

export interface NavSection {
  /** `null` en la sección inicial, que no lleva encabezado. */
  readonly title: string | null;
  readonly items: readonly NavItem[];
}

interface NavEntry extends NavItem {
  /** Permiso necesario; `null` para cualquier usuario autenticado. */
  readonly requires: Permission | null;
  /** Se oculta si el rol tiene este permiso (más general). */
  readonly hiddenWith?: Permission;
}

const { sections, items } = es.navigation;

const NAVIGATION: readonly { readonly title: string | null; readonly entries: readonly NavEntry[] }[] = [
  {
    title: null,
    entries: [
      { href: "/", label: items.home, requires: null },
      { href: "/mi-horario", label: items.myTimetable, requires: "timetable:read:own", hiddenWith: "timetable:read:any" },
      {
        href: "/mis-preferencias",
        label: items.myPreferences,
        requires: "availability:write:own-soft",
        hiddenWith: "availability:write:any",
      },
      { href: "/importar-exportar", label: items.exportMyTimetable, requires: "io:export:own", hiddenWith: "io:export:any" },
    ],
  },
  {
    title: sections.configuration,
    entries: [
      { href: "/configuracion/curso", label: items.academicYear, requires: "config:read" },
      { href: "/configuracion/marcos", label: items.timeFrames, requires: "config:read" },
      { href: "/configuracion/caracteristicas", label: items.scopes, requires: "config:read" },
      { href: "/configuracion/pesos", label: items.weights, requires: "config:read" },
    ],
  },
  {
    title: sections.data,
    entries: [
      { href: "/datos/departamentos", label: items.departments, requires: "academic:read" },
      { href: "/datos/profesores", label: items.teachers, requires: "academic:read" },
      { href: "/datos/grupos", label: items.classGroups, requires: "academic:read" },
      { href: "/datos/materias", label: items.subjects, requires: "academic:read" },
      { href: "/datos/aulas", label: items.rooms, requires: "academic:read" },
      { href: "/datos/actividades", label: items.activities, requires: "academic:read" },
      { href: "/datos/bloques", label: items.blocks, requires: "academic:read" },
    ],
  },
  {
    title: sections.nonLective,
    entries: [
      { href: "/no-lectiva/guardias", label: items.duties, requires: "academic:read" },
      { href: "/no-lectiva/reuniones", label: items.meetings, requires: "academic:read" },
      { href: "/no-lectiva/reducciones", label: items.reductions, requires: "academic:read" },
    ],
  },
  {
    // La demo ve la pre-validación (lectura); lanzar el motor responde 403 con mensaje explicativo (TFM-03).
    title: sections.engine,
    entries: [
      { href: "/motor", label: items.validateAndRun, requires: "engine:read" },
      { href: "/motor/ejecuciones", label: items.runs, requires: "engine:read" },
    ],
  },
  {
    title: sections.timetables,
    entries: [{ href: "/horarios", label: items.timetables, requires: "timetable:read:any" }],
  },
  {
    title: sections.io,
    entries: [{ href: "/importar-exportar", label: items.importExport, requires: "io:export:any" }],
  },
  {
    title: sections.administration,
    entries: [{ href: "/administracion/usuarios", label: items.users, requires: "users:manage" }],
  },
];

function isVisible(role: Role, entry: NavEntry): boolean {
  if (entry.requires !== null && !roleHasPermission(role, entry.requires)) return false;
  return entry.hiddenWith === undefined || !roleHasPermission(role, entry.hiddenWith);
}

export function navigationFor(role: Role): readonly NavSection[] {
  return NAVIGATION.map(({ title, entries }) => ({
    title,
    items: entries.filter((entry) => isVisible(role, entry)).map(({ href, label }) => ({ href, label })),
  })).filter((section) => section.items.length > 0);
}
