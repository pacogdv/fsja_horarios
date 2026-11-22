# CLAUDE.md — Constitución del proyecto FSJA Horarios

Aplicación web profesional para **generar y gestionar horarios escolares** en centros educativos
(Infantil, Primaria, ESO y Bachillerato). El proyecto sigue **Spec-Driven Development (SDD)**:
las especificaciones en `/specs` son la única fuente de verdad y el código las implementa.

Estas reglas son permanentes y se aplican en todas las sesiones. Si una instrucción puntual
contradice este documento, se debe señalar la contradicción antes de actuar.

---

## 1. Stack tecnológico obligatorio

### 1.1 Estructura del monorepo

```
/
├── apps/
│   └── web/            # Next.js (App Router) — Frontend + BFF + dueño del esquema de BD
├── services/
│   └── solver/         # FastAPI + OR-Tools CP-SAT — motor de optimización (sin estado, sin BD)
├── specs/              # Especificaciones funcionales y contratos (fuente de verdad)
├── docs/               # Documentación técnica, ADRs, diagramas y material de defensa
├── docker-compose.yml  # PostgreSQL + web + solver
├── .env.example        # Variables de entorno documentadas (sin valores reales)
└── CLAUDE.md
```

### 1.2 `/apps/web`
- **Next.js** con **App Router** y **TypeScript** con `strict: true` (además `noUncheckedIndexedAccess`
  y `noImplicitOverride`). Prohibido `any` implícito o explícito salvo justificación comentada.
- **Tailwind CSS** + **shadcn/ui** para la interfaz.
- **TanStack Query** para estado de servidor en cliente.
- **Zod** para validar toda entrada (formularios, Route Handlers, Server Actions, variables de entorno,
  respuestas del solver).
- **Prisma** como ORM. `/apps/web` es el **único dueño del esquema de PostgreSQL y de sus migraciones**.

### 1.3 `/services/solver`
- **Python 3.12+**, **FastAPI**, **Pydantic v2**, **Google OR-Tools (CP-SAT)**.
- El solver **no accede a la base de datos**. Recibe un problema completo como JSON tipado y devuelve
  una solución (o un diagnóstico de conflictos) como JSON tipado.
- Es **sin estado**: misma entrada + misma semilla ⇒ resultado reproducible.
- Gestión de dependencias con `uv` (o `poetry`), tipado comprobado con `mypy --strict`, lint con `ruff`.

### 1.4 Base de datos y contrato web ↔ solver
- **PostgreSQL** gestionado exclusivamente desde `/apps/web` (Prisma + migraciones versionadas).
- **Contrato JSON estricto** entre web y solver:
  - Definido en `/specs/contracts/` (esquema versionado, con campo `schemaVersion`).
  - Modelado en Pydantic (solver) y en Zod (web); ambos deben coincidir con la spec.
  - El JSON Schema generado desde Pydantic se usa en tests de contrato en ambos lados.
  - Cualquier cambio del contrato es un **cambio de spec**: se actualiza primero `/specs/contracts/`,
    se incrementa la versión y se adaptan ambos lados en la misma tarea.

### 1.5 Infraestructura local
- `docker-compose.yml` reproducible con tres servicios: `db` (PostgreSQL), `web` y `solver`.
- El solver solo es accesible desde la red interna de Docker (no se expone públicamente).
- Arranque completo con un único comando (`docker compose up`).

---

## 2. Arquitectura y buenas prácticas

### 2.1 Arquitectura limpia / hexagonal
Separación estricta en capas, con dependencias apuntando **siempre hacia el dominio**:

| Capa | Contenido | Puede depender de |
|------|-----------|-------------------|
| **Dominio** | Entidades, value objects, reglas e invariantes (docentes, grupos, materias, franjas, aulas, restricciones) | Nada externo |
| **Casos de uso / Aplicación** | Orquestación (p. ej. `GenerarHorario`, `RegistrarPreferenciasDocente`), puertos (interfaces) | Dominio |
| **Adaptadores / Infraestructura** | Repositorios Prisma, cliente HTTP del solver, auth, email, logging | Aplicación, Dominio |
| **UI / Entrada** | Componentes React, páginas, Route Handlers, Server Actions, endpoints FastAPI | Aplicación |

Organización orientativa en web: `src/domain`, `src/application`, `src/infrastructure`, `src/app` (UI y rutas).
En el solver: `solver/domain` (modelo del problema), `solver/constraints` (una restricción por módulo),
`solver/application` (construcción y resolución del modelo), `solver/api` (FastAPI).

### 2.2 Reglas
- **Prohibido** poner lógica de negocio en componentes React, Route Handlers, Server Actions o endpoints
  FastAPI. Estos solo validan la entrada, invocan un caso de uso y mapean la salida.
- El dominio no importa Next.js, Prisma, FastAPI ni OR-Tools (en el solver, OR-Tools se encapsula en la
  capa de construcción del modelo).
- Código autodocumentado: nombres expresivos en el lenguaje del dominio, funciones pequeñas y con una
  sola responsabilidad. Comentarios solo para explicar el *porqué*.
- Tipado estricto: `strict: true` en TS; type hints completos en Python verificados con `mypy --strict`.
- Errores de dominio explícitos (tipos/clases de error o `Result`), nunca strings sueltos.
- Cada restricción del solver (dura o ponderable) vive en su propio módulo, con su referencia a la spec.
- Decisiones de arquitectura relevantes se registran como ADR en `/docs/adr/NNNN-titulo.md`.

---

## 3. Estándares de seguridad (obligatorios)

### 3.1 Autenticación
- Contraseñas hasheadas con **Argon2id** (preferente) o bcrypt. Nunca se almacenan ni se registran en claro.
- Sesiones firmadas en cookie `HttpOnly`, `Secure`, `SameSite=Lax` (o JWT firmado con rotación y
  expiración corta). Secretos de firma solo por variable de entorno.
- Mensajes de error de login genéricos (sin revelar si el usuario existe).

### 3.2 Autorización (RBAC)
| Rol | Permisos |
|-----|----------|
| `ADMIN_DIRECCION` | Configuración total del centro, lanzamiento del motor, edición de horarios |
| `DOCENTE` | Consulta de su propio horario y envío de sus preferencias |
| `INVITADO_DEMO` | Solo lectura sobre datos de demostración; nunca escribe ni lanza el motor sobre datos reales |

- La autorización se comprueba **en el servidor** (casos de uso / BFF), nunca solo en la UI.
- Política de denegación por defecto: todo endpoint nuevo requiere declarar el rol permitido.
- Un `DOCENTE` solo accede a recursos propios (comprobación de propiedad, no solo de rol).

### 3.3 Validación de entradas
- **Toda** entrada externa se valida con **Zod** (TS) o **Pydantic v2** (Python) en el borde del sistema.
- Las respuestas del solver también se validan con Zod en web antes de usarse.

### 3.4 Protecciones
- **SQL Injection**: solo consultas parametrizadas (Prisma). `$queryRawUnsafe` prohibido.
- **XSS**: sin `dangerouslySetInnerHTML` salvo contenido saneado y justificado.
- **CSRF**: cookies `SameSite`, verificación de `Origin` en mutaciones y token CSRF en formularios fuera
  de Server Actions.
- **Cabeceras seguras**: CSP estricta (con nonce), HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **Rate limiting** obligatorio en login y en la ejecución del motor (además de límite de tiempo de
  resolución en el solver).
- Comunicación web → solver autenticada con token de servicio (variable de entorno).
- Logs sin datos sensibles (contraseñas, tokens, datos personales innecesarios).

### 3.5 Secretos
- Exclusivamente mediante **variables de entorno**.
- `.env.example` documentado con cada variable (propósito y formato, sin valores reales).
- `.env` y variantes (`.env.local`, `.env.*.local`) **siempre** en `.gitignore`. Nunca se commitean secretos.

---

## 4. Estrategia de testing (TDD / SDD)

**Ninguna funcionalidad se considera terminada sin sus tests pasando.**

### 4.1 `/services/solver`
- `pytest` (+ `pytest-cov`).
- Cobertura **≥ 90 %** en: restricciones duras, restricciones ponderables y detección de conflictos.
- Cada restricción tiene tests de caso factible, caso infactible y caso límite.
- Tests de contrato contra el JSON Schema de `/specs/contracts/`.

### 4.2 `/apps/web`
- **Vitest** + **React Testing Library**: dominio, casos de uso, validadores Zod, control de acceso y
  componentes críticos (p. ej. la rejilla del horario).
- **Playwright** E2E: flujo completo login → configuración → generación → visualización del horario,
  y comprobación de permisos por rol.

### 4.3 Definición de “hecho”
1. La spec correspondiente en `/specs` existe y está actualizada.
2. Tests escritos (idealmente antes del código) y pasando.
3. Lint, formateo y comprobación de tipos sin errores (`tsc --noEmit`, `eslint`, `ruff`, `mypy --strict`).
4. Sin secretos ni lógica de negocio fuera de su capa.

---

## 5. Reglas de flujo SDD para Claude

1. **Antes de implementar**, leer siempre la spec relevante en `/specs`. Si no existe, proponerla y
   redactarla primero.
2. **Si un cambio altera requisitos**, actualizar primero el archivo de `/specs` correspondiente
   (y el contrato si aplica) y después el código.
3. **Si el código y la spec discrepan**, la spec manda; señalar la discrepancia antes de cambiar nada.
4. **Trabajar por tareas pequeñas** y verificables. Tras cada cambio, ejecutar los tests afectados y no
   dar la tarea por completada hasta que pasen. Informar del resultado real, incluidos los fallos.
5. Referenciar la spec (ID o ruta) en tests y en restricciones del solver para mantener la trazabilidad.
6. No introducir dependencias, servicios o cambios de stack sin una ADR en `/docs/adr`.
7. No hacer commits ni push salvo petición expresa.

### Organización de `/specs`
- `specs/README.md` — índice y convenciones.
- `specs/domain/` — glosario y modelo del dominio escolar.
- `specs/features/` — una spec por funcionalidad (objetivo, reglas, criterios de aceptación).
- `specs/solver/` — restricciones duras y ponderables (ID, descripción, fórmula/criterio, peso).
- `specs/contracts/` — contrato JSON web ↔ solver versionado.
- `specs/security/` — roles, matriz de permisos y requisitos de seguridad.

---

## 6. Idioma y convenciones
- Documentación, specs y comunicación con el equipo: **español**.
- Código (identificadores) en **inglés**, salvo términos del dominio sin traducción clara, que se
  mantienen consistentes con el glosario de `specs/domain/`.
- Commits siguiendo Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`).
