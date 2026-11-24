# ADR-0008 — Rate limiting con ventana fija en PostgreSQL

- **Fecha:** 2026-11-22
- **Hito / tarea:** T1.1 (se implementa en T1.11)
- **Specs relacionadas:** `CLAUDE.md` §3.4; `specs/02-architecture-plan.md` §5.6

## Estado

**Aceptado**

## Contexto

`CLAUDE.md` §3.4 exige rate limiting en los endpoints sensibles: login y ejecución del motor. La spec 02
añade la validación, la importación y la exportación PDF en lote.

El despliegue previsto es de **una sola instancia web** más PostgreSQL. Los límites deben sobrevivir a
reinicios de la web y ser atómicos ante peticiones concurrentes.

## Decisión

1. Se implementa un adaptador `RateLimiter` (puerto en `application/ports`) con **ventana fija**,
   respaldado por la tabla `rate_limit_bucket(key, window_start, count)`.
2. El incremento es atómico, con una sola sentencia `INSERT … ON CONFLICT (key, window_start) DO UPDATE
   SET count = count + 1 RETURNING count`.
3. Las claves llevan prefijo por operación (por ejemplo `login:ip:<hmac(ip)>` y
   `login:ip-email:<hmac(ip)>:<hmac(email)>`). El correo y la IP (dato personal según el RGPD) se
   seudonimizan con `HMAC-SHA256(RATE_LIMIT_KEY_SECRET, "<tipo>:<valor>")`, con el correo normalizado: un
   SHA-256 sin clave se podría revertir probando un diccionario con los correos del centro o recorriendo el
   espacio IPv4.
4. **IP del cliente**: se toma de `X-Forwarded-For` contando `TRUSTED_PROXY_HOPS` entradas desde la
   derecha, nunca la entrada de más a la izquierda (la controla el cliente). Si no se puede determinar,
   se usa la clave compartida `unknown`. Sin esto, tras el proxy inverso del H6 un atacante esquivaría
   los límites por IP falsificando la cabecera.
5. Al superar el límite se responde `429` con `Retry-After`. Los límites concretos están en la spec 02 §5.6.
6. Las filas de ventanas pasadas se purgan de forma oportunista.

## Alternativas consideradas

| Alternativa | A favor | En contra | Motivo del descarte |
|-------------|---------|-----------|---------------------|
| Redis (`INCR` + `EXPIRE`) | Muy rápido; estándar de facto | Un servicio más que desplegar, asegurar y respaldar | Complejidad innecesaria con una sola instancia |
| Memoria del proceso | Trivial | Se pierde al reiniciar; no sirve con varias instancias; un atacante puede forzar reinicios | No es fiable para el login |
| Ventana deslizante o token bucket | Límites más suaves | Más complejo de implementar atómicamente en SQL | La ventana fija basta para estos umbrales bajos |

## Consecuencias

- **Positivas:**
  - Sin infraestructura adicional.
  - Atómico y persistente.
  - Se prueba con tests de integración de concurrencia (T1.11).
- **Negativas / riesgos aceptados:**
  - Una escritura en BD por petición limitada (solo en las operaciones sensibles).
  - Con ventana fija se pueden concentrar hasta el doble de peticiones en el cambio de ventana. Es
    aceptable porque se combina con el bloqueo de cuenta tras 10 fallos (T1.12).
- **Seguimiento:** si se escala horizontalmente con mucha carga, se sustituye el adaptador por uno de
  Redis sin tocar los casos de uso. T1.11 verifica la extracción de IP y la seudonimización de claves.

## Historial

- **2026-11-22:** revisión de seguridad del H1. Se cambia el SHA-256 sin clave del correo por HMAC con
  `RATE_LIMIT_KEY_SECRET` y se fija la extracción de la IP del cliente (`TRUSTED_PROXY_HOPS`). La
  decisión de fondo (ventana fija en PostgreSQL) no cambia.
- **2026-11-24 (T1.11):** la IP también se seudonimiza con HMAC, como ya exigía la spec 02 §5.6 («las claves
  no contienen datos personales en claro»); el ejemplo anterior la dejaba en claro. Se verifica que Next.js
  solo rellena `X-Forwarded-For` si el cliente no la envía, así que `TRUSTED_PROXY_HOPS = 0` queda
  restringido a local y `env.ts` lo rechaza en production.
- **2026-11-24 (revisión de T1.12):** el límite de login por ip pasa a contar solo los intentos fallidos
  (`RateLimiter.peek` antes de verificar y `consume` al fallar). Contando también los correctos, un centro
  con todo el profesorado tras la misma IP pública (NAT) bloquearía el login al 21.º docente en 15 min. El
  límite por (ip, correo) sigue contando todos los intentos.
- **2026-11-24 (revisión de T1.15):** el punto 5 (`429` con `Retry-After`) aplica a los Route Handlers. El
  login es una Server Action (spec 02 §5.2), que no puede fijar el código HTTP: devuelve `RATE_LIMITED` con
  `retryAfterSeconds` y el formulario muestra cuánto esperar (spec 02 §5.6; T1.17 ajustado).
