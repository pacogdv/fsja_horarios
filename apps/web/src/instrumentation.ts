/**
 * Hook de arranque de Next.js: se ejecuta una vez al iniciar el servidor.
 * Valida el entorno para que un `.env` incompleto o inválido impida arrancar, en lugar de fallar más
 * tarde en mitad de una petición (specs/02-architecture-plan.md §5.4).
 */
import { EnvValidationError, getEnv } from "@/lib/env";

export async function register(): Promise<void> {
  // El runtime edge (middleware) no tiene acceso a los secretos del servidor: solo se valida en Node.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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
