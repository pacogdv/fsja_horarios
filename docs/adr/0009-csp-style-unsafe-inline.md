# ADR-0009 — CSP con nonce para scripts y `style-src 'unsafe-inline'` (riesgo aceptado)

- **Fecha:** 2026-11-22
- **Hito / tarea:** T1.1 (se implementa en T1.14)
- **Specs relacionadas:** `CLAUDE.md` §3.4; `specs/02-architecture-plan.md` §5.5

## Estado

**Aceptado**

## Contexto

`CLAUDE.md` §3.4 exige una CSP estricta. Los componentes de shadcn/ui se apoyan en Radix UI, que posiciona
popovers, tooltips y menús con **atributos `style` inline** calculados en tiempo de ejecución. Una CSP sin
`'unsafe-inline'` en `style-src` rompe esos componentes, y los nonces no se aplican a atributos `style`.

El vector principal de XSS es la ejecución de **scripts**, no de estilos.

## Decisión

1. `script-src 'self' 'nonce-{N}' 'strict-dynamic'`, con un **nonce distinto por petición** generado en
   `middleware.ts`. No se permite `'unsafe-inline'` ni `'unsafe-eval'` en scripts.
2. `style-src 'self' 'unsafe-inline'`, como **riesgo aceptado** documentado aquí.
3. El resto de directivas siguen la spec 02 §5.5: `default-src 'self'`, `object-src 'none'`,
   `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src 'self'` y
   `upgrade-insecure-requests`.
4. Las fuentes se autoalojan (`next/font/local`): no hace falta ningún origen externo de estilos ni de fuentes.

## Alternativas consideradas

| Alternativa | A favor | En contra | Motivo del descarte |
|-------------|---------|-----------|---------------------|
| `style-src` con nonce y sin `'unsafe-inline'` | CSP máxima | Rompe el posicionamiento de Radix; habría que sustituir shadcn/ui o parchearlo | Coste alto y riesgo de regresiones de UI |
| Hashes de estilos | Estricto | Los estilos de Radix son dinámicos y sus hashes no se pueden precalcular | Inviable |
| Prescindir de shadcn/ui | Sin estilos inline | Contradice el stack obligatorio (`CLAUDE.md` §1.2) | No permitido |

## Consecuencias

- **Positivas:**
  - Se bloquea la ejecución de scripts inyectados.
  - Los componentes accesibles de Radix funcionan sin cambios.
- **Negativas / riesgos aceptados:** una inyección de CSS podría alterar la presentación o, con
  selectores de atributo, filtrar datos visibles en la página (*CSS exfiltration*). Se mitiga así:
  - React escapa todo el contenido;
  - `dangerouslySetInnerHTML` está prohibido por lint (T1.3);
  - `connect-src`, `img-src` y `font-src` no permiten orígenes externos, de modo que un CSS inyectado no
    puede enviar datos fuera.
- **Seguimiento:** revisar en cada actualización mayor de Radix y shadcn/ui si admite estilos sin inline.
  T1.14 verifica las cabeceras con tests unitarios y T1.17 con E2E.

## Historial

- **2026-11-24 (T1.14):**
  - El nonce lo genera `src/proxy.ts`, el nombre que Next.js 16 da al antiguo `middleware.ts`.
  - Excepción acotada al punto 1: con `next dev` (`NODE_ENV=development`) se añade `'unsafe-eval'` a
    `script-src`, porque React lo usa en desarrollo para reconstruir trazas de error. Nunca se añade con
    `next start` ni en la imagen Docker, y un test lo comprueba (`src/proxy.test.ts`).
  - Para que Next.js aplique el nonce, todas las páginas se renderizan por petición (`connection()` en el
    layout raíz).
