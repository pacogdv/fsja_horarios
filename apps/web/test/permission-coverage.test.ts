// @vitest-environment node
/**
 * T1.13 — Todo punto de entrada del servidor declara su permiso (denegación por defecto, CLAUDE.md §3.2).
 * Refs: specs/02-architecture-plan.md §5.3 ("Test de cobertura").
 *
 * Recorre todos los `actions.ts` (Server Actions) y `route.ts` (Route Handlers) de `src/app` y falla si
 * alguna exportación no está envuelta en `withPermission(...)` o `withPermission.route(...)`. La única
 * excepción es el login, en una lista blanca explícita: por definición, se usa sin sesión.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const appDir = fileURLToPath(new URL("../src/app", import.meta.url));
const HANDLER_FILES = new Set(["actions.ts", "route.ts"]);

/** `archivo relativo a src/app#exportación` que se ejecutan sin sesión. Solo el login. */
const PUBLIC_EXPORTS: ReadonlySet<string> = new Set(["(public)/login/actions.ts#login"]);

/** Exportaciones de configuración de rutas de Next.js: no son puntos de entrada. */
const ROUTE_SEGMENT_CONFIG = new Set(["dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime", "preferredRegion", "maxDuration"]);

/** `withPermission(...)`, `withPermission.route(...)` o `guards.withPermission(...)`. */
function isPermissionWrapper(expression: ts.Expression): boolean {
  if (!ts.isCallExpression(expression)) return false;
  const callee = expression.expression.getText();
  return /(^|\.)withPermission(\.route)?$/.test(callee);
}

/** Exportaciones que no pasan por `withPermission`. `relativePath` es relativo a src/app. */
export function unguardedExports(source: string, relativePath: string): string[] {
  const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const isRoute = path.basename(relativePath) === "route.ts";
  const violations: string[] = [];
  const report = (name: string) => {
    if (!PUBLIC_EXPORTS.has(`${relativePath}#${name}`)) violations.push(`${relativePath}#${name}`);
  };
  const isExported = (node: ts.Node) =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = declaration.name.getText();
        if (isRoute && ROUTE_SEGMENT_CONFIG.has(name)) continue;
        if (!declaration.initializer || !isPermissionWrapper(declaration.initializer)) report(name);
      }
    } else if (ts.isFunctionDeclaration(statement) && isExported(statement)) {
      report(statement.name?.getText() ?? "default");
    } else if (ts.isClassDeclaration(statement) && isExported(statement)) {
      report(statement.name?.getText() ?? "default");
    } else if (ts.isExportAssignment(statement)) {
      if (!isPermissionWrapper(statement.expression)) report("default");
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      // `export { x }` o `export * from`: no se puede comprobar cómo se definió; se exige definirlo aquí.
      const names = statement.exportClause && ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements.filter((element) => !element.isTypeOnly).map((element) => element.name.getText())
        : ["*"];
      names.forEach(report);
    }
  }
  return violations;
}

function handlerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return handlerFiles(full);
    return HANDLER_FILES.has(entry.name) ? [full] : [];
  });
}

describe("T1.13 analizador de exportaciones", () => {
  const actions = "(app)/configuracion/actions.ts";
  const route = "api/runs/[runId]/route.ts";

  it("acepta exportaciones envueltas en withPermission, withPermission.route o guards.withPermission", () => {
    const source = `
      "use server";
      export const saveYear = withPermission("config:write", async () => {});
      export const readYear = guards.withPermission("config:read", async () => {});
      export type Input = { name: string };
      export interface Output { ok: boolean }`;
    expect(unguardedExports(source, actions)).toEqual([]);
    expect(unguardedExports(`export const GET = withPermission.route("engine:read", async () => new Response());`, route)).toEqual([]);
  });

  it.each([
    ["una función exportada", `export async function saveYear() {}`, ["saveYear"]],
    ["una constante con una función sin envolver", `export const saveYear = async () => {};`, ["saveYear"]],
    ["una llamada a otra función", `export const saveYear = withLogging(async () => {});`, ["saveYear"]],
    ["withPermission solo dentro del cuerpo", `export const saveYear = async () => withPermission("config:write", h)();`, ["saveYear"]],
    ["una exportación por defecto", `export default async function () {}`, ["default"]],
    ["una exportación por defecto de una expresión", `export default handler;`, ["default"]],
    ["una reexportación con nombre", `const saveYear = withPermission("config:write", h); export { saveYear };`, ["saveYear"]],
    ["una reexportación de otro módulo", `export * from "./otro";`, ["*"]],
    ["una exportación sin valor inicial", `export let saveYear;`, ["saveYear"]],
  ])("detecta %s", (_case, source, names) => {
    expect(unguardedExports(source, actions)).toEqual(names.map((name) => `${actions}#${name}`));
  });

  it("en route.ts admite la configuración de segmento de Next.js, pero no en actions.ts", () => {
    const source = `export const dynamic = "force-dynamic"; export const runtime = "nodejs";`;
    expect(unguardedExports(source, route)).toEqual([]);
    expect(unguardedExports(source, actions)).toEqual([`${actions}#dynamic`, `${actions}#runtime`]);
  });

  it("la lista blanca solo cubre la acción de login, no otras del mismo archivo ni de otros", () => {
    const login = "(public)/login/actions.ts";
    const source = `export async function login() {} export async function resetPassword() {}`;
    expect(unguardedExports(source, login)).toEqual([`${login}#resetPassword`]);
    expect(unguardedExports(`export async function login() {}`, actions)).toEqual([`${actions}#login`]);
  });
});

describe("T1.13 cobertura de permisos en src/app [02 §5.3]", () => {
  it("todas las exportaciones de actions.ts y route.ts están envueltas en withPermission", () => {
    const violations = handlerFiles(appDir).flatMap((file) =>
      unguardedExports(readFileSync(file, "utf8"), path.relative(appDir, file).split(path.sep).join("/")),
    );
    expect(violations).toEqual([]);
  });
});
