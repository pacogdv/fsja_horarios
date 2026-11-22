# Architecture Decision Records (ADR)

Registro de las decisiones de arquitectura del proyecto. Cada ADR sigue la [plantilla](0000-plantilla.md)
(Estado, Contexto, Decisión, Alternativas consideradas y Consecuencias). Un ADR aceptado no se reescribe:
si la decisión cambia, se crea otro que lo **sustituye**. Las precisiones que no cambian la decisión
(endurecimiento, riesgos descubiertos, aclaraciones) se permiten, y se anotan en una sección final
`Historial` con fecha y motivo.

Verificación automática: `./scripts/check-adrs.sh`.

## Índice

| Nº | Título | Estado | Tarea |
|----|--------|--------|-------|
| 0001 | [Prisma como ORM y `apps/web` como única dueña del esquema de BD](0001-prisma-web-duena-esquema.md) | Aceptado | T1.1 |
| 0002 | [Sesiones opacas almacenadas en BD en lugar de JWT](0002-sesiones-opacas-en-bd.md) | Aceptado | T1.1 |
| 0003 | La Fase A (pre-validación) se implementa en el solver | Pendiente | T2.1 |
| 0004 | Ejecución asíncrona con trabajos en memoria y polling desde el BFF | Pendiente | T4.1 |
| 0005 | Modelo sin índice de sesión y puntos de control para solapamientos | Pendiente | T2.1 |
| 0006 | Multi-solución secuencial con restricción de diversidad | Pendiente | T2.1 |
| 0007 | Revalidación de ediciones en el solver y paridad de reglas web ↔ solver | Pendiente | T4.1 |
| 0008 | [Rate limiting con ventana fija en PostgreSQL](0008-rate-limiting-postgresql.md) | Aceptado | T1.1 |
| 0009 | [CSP con nonce para scripts y `style-src 'unsafe-inline'`](0009-csp-style-unsafe-inline.md) | Aceptado | T1.1 |
| 0010 | [Registro de dependencias](0010-registro-dependencias.md) | Aceptado | T1.1 (lo amplían T2.1, T4.1 y T5.1) |
| 0011 | Librería de generación de PDF | Pendiente | T5.1 |
