/**
 * Logout (specs/02-architecture-plan.md §5.2, paso 10). En la lista blanca de 02 §5.3: ningún permiso es común a
 * los tres roles. Comprueba el origen (CSRF), revoca la sesión, borra la cookie y redirige a /login.
 */
import { getContainer } from "@/lib/container";

export async function POST(request: Request): Promise<Response> {
  return getContainer().logoutRoute(request);
}
