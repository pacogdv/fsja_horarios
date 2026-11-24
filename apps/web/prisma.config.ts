/**
 * Configuración del CLI de Prisma 7 (ADR-0001). Prisma 7 no lee los archivos .env: las URL llegan del
 * entorno del proceso (Docker Compose, CI o la configuración global de los tests de integración).
 *
 * - DATABASE_URL: BD sobre la que actúan `migrate deploy` y `migrate diff --to-config-datasource`.
 * - SHADOW_DATABASE_URL: BD desechable que usa `migrate diff --from-migrations` para reproducir las
 *   migraciones y comparar. Solo en desarrollo y CI.
 *
 * `prisma generate` no necesita conexión: con las variables vacías, solo fallan los comandos que se
 * conectan a la BD, y lo hacen con un error explícito.
 */
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
