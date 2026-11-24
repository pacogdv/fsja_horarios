/**
 * Hook de arranque de Next.js: se ejecuta una vez al iniciar el servidor.
 *
 * Next.js lo compila para los runtimes de Node y edge. El código que usa APIs de Node está en
 * instrumentation-node.ts y solo se importa en la rama `nodejs`, que el compilador elimina en edge. El
 * runtime edge no tiene acceso a los secretos del servidor, así que tampoco los valida (el proxy, antes
 * middleware, corre en Node desde Next.js 16).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnvOrExit } = await import("./instrumentation-node");
    validateEnvOrExit();
  }
}
