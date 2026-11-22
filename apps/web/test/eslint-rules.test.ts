// @vitest-environment node
/**
 * T1.3 — Las reglas de ESLint hacen cumplir la arquitectura y las prohibiciones de seguridad.
 * Cada fixture se analiza como si estuviera en una ruta concreta de src/, porque las reglas de
 * capas dependen de la ruta del archivo (specs/02-architecture-plan.md §1.2).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const webDir = fileURLToPath(new URL("..", import.meta.url));
const fixturesDir = path.join(webDir, "test", "lint-fixtures");
const eslint = new ESLint({ cwd: webDir });

/** El primer análisis carga el parser de TypeScript y los plugins: en frío supera los 5 s por defecto. */
const LINT_TIMEOUT_MS = 30_000;

/** Analiza un fixture como si viviera en `virtualPath` y devuelve las reglas con severidad de error. */
async function lintErrors(fixture: string, virtualPath: string): Promise<(string | null)[]> {
  const code = readFileSync(path.join(fixturesDir, fixture), "utf8");
  const [result] = await eslint.lintText(code, { filePath: path.join(webDir, virtualPath) });
  if (!result) throw new Error(`ESLint no devolvió resultado para ${fixture}`);
  return result.messages.filter((message) => message.severity === 2).map((message) => message.ruleId);
}

describe("T1.3 ESLint: violaciones que deben fallar", { timeout: LINT_TIMEOUT_MS }, () => {
  it.each([
    // Dependencias entre capas (02 §1.2)
    ["domain-imports-prisma.ts", "src/domain/fixture.ts", "no-restricted-imports"],
    ["domain-imports-next.ts", "src/domain/fixture.ts", "no-restricted-imports"],
    ["domain-imports-infrastructure.ts", "src/domain/fixture.ts", "no-restricted-imports"],
    ["domain-uses-fetch.ts", "src/domain/fixture.ts", "no-restricted-globals"],
    ["application-imports-infrastructure.ts", "src/application/auth/fixture.ts", "no-restricted-imports"],
    ["ui-imports-infrastructure.tsx", "src/ui/fixture.tsx", "no-restricted-imports"],
    ["app-imports-infrastructure.tsx", "src/app/fixture/page.tsx", "no-restricted-imports"],
    ["app-imports-prisma.tsx", "src/app/fixture/page.tsx", "no-restricted-imports"],
    // Prohibiciones de seguridad (CLAUDE.md §3.4)
    ["dangerous-html.tsx", "src/ui/fixture.tsx", "no-restricted-syntax"],
    ["query-raw-unsafe.ts", "src/infrastructure/db/fixture.ts", "no-restricted-syntax"],
    ["execute-raw-unsafe.ts", "src/infrastructure/db/fixture.ts", "no-restricted-syntax"],
    // Tipado estricto (CLAUDE.md §2)
    ["explicit-any.ts", "src/domain/fixture.ts", "@typescript-eslint/no-explicit-any"],
    // Intentos de esquivar las reglas (revisión de seguridad de T1.3)
    ["domain-dynamic-import-infrastructure.ts", "src/domain/fixture.ts", "no-restricted-syntax"],
    ["dynamic-import-non-literal.ts", "src/ui/fixture.ts", "no-restricted-syntax"],
    ["ui-reexports-infrastructure.ts", "src/ui/fixture.ts", "no-restricted-imports"],
    ["inline-disable-bypass.ts", "src/domain/fixture.ts", "no-restricted-imports"],
    ["query-raw-unsafe-computed.ts", "src/infrastructure/db/fixture.ts", "no-restricted-syntax"],
    ["dangerous-html-create-element.tsx", "src/ui/fixture.tsx", "no-restricted-syntax"],
    ["dangerous-html-spread.tsx", "src/ui/fixture.tsx", "no-restricted-syntax"],
  ])("%s en %s falla con %s", async (fixture, virtualPath, expectedRule) => {
    expect(await lintErrors(fixture, virtualPath)).toContain(expectedRule);
  });
});

describe("T1.3 ESLint: dependencias permitidas que no deben fallar", { timeout: LINT_TIMEOUT_MS }, () => {
  it.each([
    ["clean-domain.ts", "src/domain/fixture.ts"],
    ["container-imports-infrastructure.ts", "src/lib/container.ts"],
    ["infrastructure-imports-application.ts", "src/infrastructure/db/fixture.ts"],
    ["app-imports-application.tsx", "src/app/fixture/page.tsx"],
    ["app-dynamic-import-ui.tsx", "src/app/fixture/page.tsx"],
  ])("%s en %s no tiene errores", async (fixture, virtualPath) => {
    expect(await lintErrors(fixture, virtualPath)).toEqual([]);
  });
});
