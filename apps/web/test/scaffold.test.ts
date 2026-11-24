// @vitest-environment node
/**
 * T1.3 — Andamiaje de apps/web: configuración de TypeScript, scripts, Next.js, Vitest y capas.
 * Refs: CLAUDE.md §1.2 y §2; specs/02-architecture-plan.md §1.2; specs/03-tasks.md T1.3.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const webDir = fileURLToPath(new URL("..", import.meta.url));
const fromWeb = (...segments: string[]): string => path.join(webDir, ...segments);

interface PackageJson {
  name: string;
  private: boolean;
  scripts: Record<string, string>;
}

const packageJson = JSON.parse(readFileSync(fromWeb("package.json"), "utf8")) as PackageJson;

function readTsconfig(): ts.ParsedCommandLine {
  const configPath = fromWeb("tsconfig.json");
  const { config, error } = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  return ts.parseJsonConfigFileContent(config, ts.sys, webDir);
}

describe("T1.3 tsconfig", () => {
  const { options, raw } = readTsconfig() as ts.ParsedCommandLine & { raw: { exclude?: string[] } };

  it("activa strict, noUncheckedIndexedAccess y noImplicitOverride", () => {
    expect(options.strict).toBe(true);
    expect(options.noUncheckedIndexedAccess).toBe(true);
    expect(options.noImplicitOverride).toBe(true);
  });

  it("define el alias @/* hacia src/*", () => {
    expect(options.paths?.["@/*"]).toEqual(["./src/*"]);
  });

  it("excluye los fixtures de lint, que contienen violaciones a propósito", () => {
    expect(raw.exclude).toContain("test/lint-fixtures");
  });
});

describe("T1.3 package.json", () => {
  it("se llama 'web' (lo usa scripts/check.sh) y es privado", () => {
    expect(packageJson.name).toBe("web");
    expect(packageJson.private).toBe(true);
  });

  it("dev escucha solo en 127.0.0.1 (no expone el servidor en la red local)", () => {
    expect(packageJson.scripts.dev).toMatch(/^next dev\b.*\s-H 127\.0\.0\.1(\s|$)/);
  });

  it("define lint, typecheck, test (proyecto unit) y test:e2e", () => {
    expect(packageJson.scripts.lint).toMatch(/^eslint \. --max-warnings=0$/);
    expect(packageJson.scripts.typecheck).toMatch(/\btsc --noEmit\b/);
    expect(packageJson.scripts.test).toBe("vitest run --project unit");
    expect(packageJson.scripts["test:e2e"]).toMatch(/^playwright test\b/);
  });

  it("define test:coverage, que mide la cobertura del proyecto unit (revisión de seguridad de H1)", () => {
    expect(packageJson.scripts["test:coverage"]).toBe("vitest run --project unit --coverage");
  });
});

describe("T1.3 next.config.ts", () => {
  it("no revela la tecnología (poweredByHeader: false) y genera salida standalone", async () => {
    const { default: nextConfig } = (await import("../next.config")) as {
      default: { poweredByHeader?: boolean; output?: string };
    };
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(nextConfig.output).toBe("standalone");
  });
});

describe("T1.3 vitest.config.ts", () => {
  it("declara los proyectos unit (jsdom) e integration (node)", async () => {
    const { default: vitestConfig } = (await import("../vitest.config")) as {
      default: { test?: { projects?: { test?: { name?: string; environment?: string } }[] } };
    };
    const projects = (vitestConfig.test?.projects ?? []).map((project) => ({
      name: project.test?.name,
      environment: project.test?.environment,
    }));
    expect(projects).toEqual([
      { name: "unit", environment: "jsdom" },
      { name: "integration", environment: "node" },
    ]);
  });
});

describe("T1.3 capas", () => {
  it.each(["domain", "application", "infrastructure", "ui", "lib"])(
    "src/%s tiene un README.md que explica la capa y sus dependencias permitidas",
    (layer) => {
      const readme = fromWeb("src", layer, "README.md");
      expect(existsSync(readme)).toBe(true);
      expect(readFileSync(readme, "utf8")).toMatch(/Puede depender de/);
    },
  );

  it("src/lib/container.ts es el composition root y exporta createContainer", async () => {
    const container = (await import("@/lib/container")) as { createContainer?: unknown };
    expect(typeof container.createContainer).toBe("function");
  });
});
