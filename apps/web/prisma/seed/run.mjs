/**
 * Lanzador del seed: `node prisma/seed/run.mjs` (pnpm db:seed, y en Docker docker-entrypoint.sh).
 *
 * jiti ejecuta el TypeScript del seed sin compilarlo y resuelve el alias `@/` de tsconfig (ADR-0010). La caché en
 * disco se desactiva porque en la imagen el código es de root y el proceso no puede escribir en él.
 */
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) },
  fsCache: false,
});

const { runSeed } = await jiti.import("./index.ts");
process.exitCode = await runSeed(process.env);
