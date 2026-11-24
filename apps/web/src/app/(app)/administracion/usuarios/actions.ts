"use server";

/**
 * Acciones de administración de usuarios (T3.9, adelantado en T1.17). Cada una va envuelta en
 * `withPermission("users:manage")` (02 §5.3): sin permiso devuelve la denegación sin ejecutar nada.
 */
import { revalidatePath } from "next/cache";
import { getContainer, withPermission } from "@/lib/container";

const USERS_PATH = "/administracion/usuarios";

/** Desbloquea una cuenta bloqueada por intentos fallidos (02 §5.2). Firma de `useActionState`. */
export const unlockUser = withPermission("users:manage", async (session, _state: unknown, formData: FormData) => {
  const result = await getContainer().unlockUser(session.userId, { userId: formData.get("userId") });
  if (result.ok) revalidatePath(USERS_PATH);
  return result;
});
