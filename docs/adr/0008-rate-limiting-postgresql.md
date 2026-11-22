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
3. Las claves llevan prefijo por operación (por ejemplo `login:ip:<ip>` y `login:ip-email:<ip>:<sha256(email)>`).
   El correo se guarda hasheado para no conservar datos personales en claro.
4. Al superar el límite se responde `429` con `Retry-After`. Los límites concretos están en la spec 02 §5.6.
5. Las filas de ventanas pasadas se purgan de forma oportunista.

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
  Redis sin tocar los casos de uso.
