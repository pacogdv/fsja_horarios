// @ts-check
/**
 * ESLint de apps/web. Además de las reglas de Next.js (React, hooks, accesibilidad y TypeScript),
 * hace cumplir la arquitectura por capas (specs/02-architecture-plan.md §1.2) y las prohibiciones de
 * seguridad de CLAUDE.md §3.4. Los tests de estas reglas están en test/eslint-rules.test.ts.
 *
 * Las reglas no se pueden desactivar con comentarios en src/ (`noInlineConfig`): cualquier excepción se
 * declara aquí, donde se revisa.
 */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const ARCHITECTURE = "Ver specs/02-architecture-plan.md §1.2 (dependencias entre capas).";

/**
 * Módulos prohibidos por capa. `patterns` alimenta `no-restricted-imports` (imports estáticos y
 * re-exportaciones); `source` es una expresión regular para los imports dinámicos `import("…")`, que
 * `no-restricted-imports` no revisa. Se usa `\x2F` en lugar de `/` porque los selectores de ESLint
 * delimitan las expresiones regulares con barras.
 */
const layer = (name) => ({
  patterns: [`@/${name}`, `@/${name}/**`, `**/${name}`, `**/${name}/**`],
  source: `(^|\\x2F)${name}(\\x2F|$)`,
});

const FORBIDDEN = {
  infrastructure: {
    ...layer("infrastructure"),
    message: `Esta capa no puede importar infrastructure: usa un puerto de application. ${ARCHITECTURE}`,
  },
  application: { ...layer("application"), message: `El dominio no depende de application. ${ARCHITECTURE}` },
  ui: { ...layer("ui"), message: `Esta capa no puede depender de la UI. ${ARCHITECTURE}` },
  app: { ...layer("app"), message: `Esta capa no puede depender de las rutas de Next.js. ${ARCHITECTURE}` },
  lib: { ...layer("lib"), message: `El dominio no depende de lib. ${ARCHITECTURE}` },
  prisma: {
    patterns: ["@prisma/*", "@prisma/client", "**/generated/prisma", "**/generated/prisma/**"],
    source: "^@prisma\\x2F|(^|\\x2F)generated\\x2Fprisma(\\x2F|$)",
    message: `Prisma solo se usa en src/infrastructure/db (ADR-0001). ${ARCHITECTURE}`,
  },
  frameworks: {
    patterns: ["next", "next/*", "react", "react/*", "react-dom", "react-dom/*", "server-only", "client-only"],
    source: "^(next|react|react-dom|server-only|client-only)(\\x2F|$)",
    message: `Esta capa es TypeScript puro: sin Next.js ni React. ${ARCHITECTURE}`,
  },
};

/** Selectores de seguridad que aplican a todo src/ (CLAUDE.md §3.4). */
const SECURITY_SELECTORS = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: "dangerouslySetInnerHTML está prohibido (riesgo de XSS). Ver CLAUDE.md §3.4.",
  },
  {
    // createElement("div", { dangerouslySetInnerHTML }) o <div {...{ dangerouslySetInnerHTML }} />.
    selector: "Property[key.name='dangerouslySetInnerHTML'], Property[key.value='dangerouslySetInnerHTML']",
    message: "dangerouslySetInnerHTML está prohibido (riesgo de XSS). Ver CLAUDE.md §3.4.",
  },
  {
    // prisma.$queryRawUnsafe(…) y prisma["$queryRawUnsafe"](…).
    selector:
      "MemberExpression[property.name=/^\\$(queryRawUnsafe|executeRawUnsafe)$/], MemberExpression[property.value=/^\\$(queryRawUnsafe|executeRawUnsafe)$/]",
    message:
      "$queryRawUnsafe/$executeRawUnsafe están prohibidos (SQL injection). Usa $queryRaw con plantilla etiquetada. Ver ADR-0001.",
  },
  {
    // import(variable) permite cargar código arbitrario y esquivar las reglas de capas.
    selector: "ImportExpression[source.type!='Literal']",
    message: "Los imports dinámicos deben usar una ruta literal (seguridad y reglas de capas).",
  },
];

/** Configuración de una capa: prohibiciones de import estático y dinámico, más las de seguridad. */
const restrictLayer = (...forbidden) => ({
  "no-restricted-imports": [
    "error",
    { patterns: forbidden.map(({ patterns, message }) => ({ group: patterns, message })) },
  ],
  "no-restricted-syntax": [
    "error",
    ...SECURITY_SELECTORS,
    ...forbidden.map(({ source, message }) => ({
      selector: `ImportExpression[source.value=/${source}/]`,
      message,
    })),
  ],
});

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,

  globalIgnores([".next/**", "node_modules/**", "coverage/**", "next-env.d.ts", "test/lint-fixtures/**"]),

  // --- Seguridad y tipado (todo el código) --------------------------------------------------------
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-syntax": ["error", ...SECURITY_SELECTORS],
    },
  },
  {
    // En src/ las reglas no se desactivan con comentarios: las excepciones se declaran en este archivo.
    files: ["src/**"],
    linterOptions: { noInlineConfig: true },
  },

  // --- Dependencias entre capas (02 §1.2) ----------------------------------------------------------
  {
    files: ["src/domain/**"],
    rules: {
      ...restrictLayer(
        FORBIDDEN.application,
        FORBIDDEN.infrastructure,
        FORBIDDEN.ui,
        FORBIDDEN.app,
        FORBIDDEN.lib,
        FORBIDDEN.prisma,
        FORBIDDEN.frameworks,
      ),
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: `El dominio no hace E/S: usa un puerto de application. ${ARCHITECTURE}` },
      ],
    },
  },
  {
    files: ["src/application/**"],
    rules: restrictLayer(FORBIDDEN.infrastructure, FORBIDDEN.ui, FORBIDDEN.app, FORBIDDEN.prisma, FORBIDDEN.frameworks),
  },
  {
    files: ["src/infrastructure/**"],
    rules: restrictLayer(FORBIDDEN.ui, FORBIDDEN.app),
  },
  {
    files: ["src/ui/**", "src/app/**"],
    rules: restrictLayer(FORBIDDEN.infrastructure, FORBIDDEN.prisma),
  },
  {
    // src/lib/container.ts es el composition root: el único punto de app/lib que instancia adaptadores.
    files: ["src/lib/**"],
    ignores: ["src/lib/container.ts"],
    rules: restrictLayer(FORBIDDEN.infrastructure, FORBIDDEN.prisma),
  },
]);
