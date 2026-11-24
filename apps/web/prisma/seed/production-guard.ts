/**
 * Guarda del seed (specs/01-domain-spec.md TFM-02): el seed crea usuarios de demostración con credenciales
 * conocidas, así que nunca se ejecuta en producción.
 *
 * Denegación por defecto: solo se permite un entorno de desarrollo explícito. Un `APP_ENV` ausente, mal escrito
 * o desconocido también se rechaza. La comprobación se hace antes de conectarse a la BD.
 */
const SEED_ENVIRONMENTS: ReadonlySet<string> = new Set(["development", "test"]);

export class SeedNotAllowedError extends Error {
  constructor(appEnv: string | undefined) {
    const received = appEnv === undefined || appEnv === "" ? "sin definir" : JSON.stringify(appEnv.slice(0, 32));
    super(
      `El seed solo se ejecuta con APP_ENV=development o APP_ENV=test (APP_ENV ${received}). ` +
        "Nunca en production: crea usuarios de demostración (TFM-02).",
    );
    this.name = "SeedNotAllowedError";
  }
}

export function assertSeedAllowed(appEnv: string | undefined): void {
  if (appEnv === undefined || !SEED_ENVIRONMENTS.has(appEnv)) throw new SeedNotAllowedError(appEnv);
}
