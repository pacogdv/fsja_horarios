/**
 * Arranque del servidor en el runtime de Node: valida el entorno para que un `.env` incompleto o inválido
 * impida arrancar, en lugar de fallar más tarde en mitad de una petición (specs/02-architecture-plan.md §5.4).
 *
 * Vive aparte de instrumentation.ts porque usa APIs exclusivas de Node (`process.exit`), y Next.js compila
 * instrumentation.ts también para el runtime edge.
 */
import { EnvValidationError, getEnv } from "@/lib/env";

export function validateEnvOrExit(): void {
  try {
    getEnv();
  } catch (error) {
    if (!(error instanceof EnvValidationError)) throw error;
    // Next.js captura los errores de register() y deja el servidor respondiendo 500: hay que salir.
    // El mensaje nombra las variables, nunca sus valores.
    console.error(error.message);
    process.exit(1);
  }
}
