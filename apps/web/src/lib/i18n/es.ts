/**
 * Textos de la interfaz en español (specs/02-architecture-plan.md §6.7), centralizados para una futura traducción.
 * Los mensajes que devuelve el servidor (errores de login o de autorización) viven con su caso de uso o su guarda.
 */
import type { Role } from "@/domain/access/role";

export const es = Object.freeze({
  appName: "FSJA Horarios",
  roles: Object.freeze({
    ADMIN_DIRECCION: "Dirección",
    DOCENTE: "Docente",
    INVITADO_DEMO: "Invitado (demo)",
  } satisfies Record<Role, string>),
  navigation: Object.freeze({
    label: "Navegación principal",
    sections: Object.freeze({
      configuration: "Configuración",
      data: "Datos",
      nonLective: "No lectiva",
      engine: "Motor",
      timetables: "Horarios",
      io: "Datos E/S",
      administration: "Administración",
    }),
    items: Object.freeze({
      home: "Inicio",
      myTimetable: "Mi horario",
      myPreferences: "Mis preferencias",
      exportMyTimetable: "Exportar mi horario",
      academicYear: "Curso",
      timeFrames: "Marcos",
      scopes: "Ámbitos",
      weights: "Pesos",
      departments: "Departamentos",
      teachers: "Profesores",
      classGroups: "Grupos",
      subjects: "Materias",
      rooms: "Aulas",
      activities: "Actividades",
      blocks: "Bloques",
      duties: "Guardias",
      meetings: "Reuniones",
      reductions: "Reducciones",
      validateAndRun: "Validar y calcular",
      runs: "Ejecuciones",
      timetables: "Horarios",
      importExport: "Importar / Exportar",
      users: "Usuarios",
    }),
  }),
  theme: Object.freeze({
    label: "Tema",
    light: "Claro",
    dark: "Oscuro",
    system: "Sistema",
  }),
  topbar: Object.freeze({
    logout: "Cerrar sesión",
  }),
  demoBanner: Object.freeze({
    label: "Modo demostración",
    text: "Modo demostración: solo lectura. Puedes consultar todo el centro de ejemplo, pero no modificar datos ni lanzar el motor.",
  }),
  login: Object.freeze({
    title: "Iniciar sesión",
    email: "Correo electrónico",
    password: "Contraseña",
    submit: "Entrar",
    submitting: "Entrando…",
  }),
});
