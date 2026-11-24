/**
 * Configuración global del proyecto Vitest `integration` (specs/03-tasks.md §0.3 y T1.7).
 *
 * Antes de los tests:
 *   1. Lee `TEST_DATABASE_URL` del entorno o, si no está, del `.env` de la raíz del monorepo (sin cargar el
 *      resto de variables de ese archivo en el proceso).
 *   2. Borra y recrea `fsja_test` y su BD shadow (solo nombres que terminan en `_test`: test-database.ts).
 *   3. Aplica `prisma migrate deploy` sobre la BD vacía.
 * Los tests reciben las URL con `inject("testDatabase")`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { Client } from "pg";
import type { TestProject } from "vitest/node";
import { resolveTestDatabase } from "./test-database";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabase: { testUrl: string; shadowUrl: string };
  }
}

const webDir = fileURLToPath(new URL("../..", import.meta.url));
const rootEnvFile = path.join(webDir, "..", "..", ".env");

function readTestDatabaseUrl(): string | undefined {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!existsSync(rootEnvFile)) return undefined;
  return parseEnv(readFileSync(rootEnvFile, "utf8")).TEST_DATABASE_URL;
}

async function recreateDatabases(adminUrl: string, names: readonly string[]): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    for (const name of names) {
      // Los identificadores no admiten parámetros: el nombre ya está validado (/^[a-z][a-z0-9_]*_test$/,
      // más el sufijo _shadow) y además se escapa.
      const database = client.escapeIdentifier(name);
      await client.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
      await client.query(`CREATE DATABASE ${database}`);
    }
  } finally {
    await client.end();
  }
}

function migrateDeploy(databaseUrl: string): void {
  execFileSync(process.execPath, [path.join(webDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: webDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

export default async function setup(project: TestProject): Promise<void> {
  const target = resolveTestDatabase(readTestDatabaseUrl());
  await recreateDatabases(target.adminUrl, [target.testName, target.shadowName]);
  migrateDeploy(target.testUrl);
  project.provide("testDatabase", { testUrl: target.testUrl, shadowUrl: target.shadowUrl });
}
