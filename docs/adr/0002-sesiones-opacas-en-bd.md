# ADR-0002 — Sesiones opacas almacenadas en BD en lugar de JWT

- **Fecha:** 2026-11-22
- **Hito / tarea:** T1.1 (se implementa en T1.10 y T1.12)
- **Specs relacionadas:** `CLAUDE.md` §3.1; `specs/02-architecture-plan.md` §5.2

## Estado

**Aceptado**

## Contexto

`CLAUDE.md` §3.1 pide autenticación con sesiones o JWT firmados. La aplicación es un BFF (Next.js) con una
sola audiencia, el propio navegador, y tiene requisitos de **revocación inmediata**:
- logout;
- desactivar un usuario o cambiarle el rol (T3.9);
- bloqueo tras intentos fallidos.

Además, el rol `INVITADO_DEMO` no debe conservar acceso si se retira.

## Decisión

1. Al iniciar sesión se genera un **token aleatorio de 32 bytes** (`crypto.randomBytes`), que viaja en la
   cookie `__Host-fsja_session` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sin `Domain`).
2. En la tabla `user_session` solo se guarda el **SHA-256 del token**. El token en claro nunca se almacena.
3. La sesión caduca a las 8 h (absoluta) o tras 30 min de inactividad. La renovación deslizante se hace
   como máximo una vez cada 5 min.
4. Cada petición autenticada busca la sesión por hash. Revocar es borrar filas, con efecto inmediato.
5. Las contraseñas se protegen con **Argon2id** (`m = 19 MiB`, `t = 2`, `p = 1`, parámetros OWASP).

## Alternativas consideradas

| Alternativa | A favor | En contra | Motivo del descarte |
|-------------|---------|-----------|---------------------|
| JWT firmado en cookie (sin estado) | Sin consulta a BD por petición | La revocación exige listas negras o caducidades muy cortas con refresh; hay que gestionar el secreto de firma; más fácil de configurar mal (`alg`, caducidad) | No cumple la revocación inmediata sin añadir estado, con lo que pierde su ventaja |
| Auth.js / NextAuth | Integración rápida | Más dependencias y abstracción; el flujo de credenciales con bloqueo y rate limit propios exige personalizarlo mucho | El flujo es sencillo y se quiere controlar y explicar en la defensa |
| Cookie firmada con los datos de sesión (iron-session) | Sin tabla | Misma limitación de revocación que JWT | Igual que JWT |

## Consecuencias

- **Positivas:**
  - Revocación inmediata.
  - No hace falta un secreto de firma: el token es aleatorio y solo se guarda su hash, así que una fuga
    de la BD no permite suplantar sesiones.
  - Es fácil de auditar.
- **Negativas / riesgos aceptados:**
  - Una consulta a BD por petición autenticada. Es asumible con una sola instancia y un índice único
    sobre `token_hash`.
  - Hay que limpiar las sesiones caducadas. Se hace con un borrado oportunista en cada login correcto
    (T1.10).
  - **Bloqueo dirigido de cuentas**: el bloqueo tras 10 fallos (spec 02 §5.2) permite que quien conozca un
    correo deje esa cuenta inaccesible durante 15 min. Se acepta el riesgo, con estas mitigaciones:
    - el bloqueo es temporal y no se acumula;
    - la respuesta no revela que la cuenta está bloqueada;
    - los límites por IP (ADR-0008) encarecen el ataque;
    - `ADMIN_DIRECCION` puede desbloquear al instante (T3.9);
    - cada bloqueo queda en `audit_log`.
- **Seguimiento:** si se escalara horizontalmente, la tabla sigue siendo compartida y no hace falta
  ningún cambio. Si la latencia de BD fuera un problema, se añadiría una caché con TTL corto.

## Historial

- **2026-11-22:** revisión de seguridad del H1. Se documentan el riesgo de bloqueo dirigido y sus
  mitigaciones, y se concreta la purga de sesiones caducadas. La decisión no cambia.
