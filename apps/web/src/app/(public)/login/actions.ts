"use server";

/**
 * Server Action de login (specs/02-architecture-plan.md §5.2, paso 1). Es la única acción sin `withPermission`
 * (lista blanca de 02 §5.3): por definición se usa sin sesión. La lógica está en el caso de uso y su adaptador.
 */
import { redirect } from "next/navigation";
import type { LoginFormState } from "@/application/auth/login-form";
import { getContainer } from "@/lib/container";

export async function login(_state: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const outcome = await getContainer().loginAction(formData);
  if (outcome.ok) redirect(outcome.redirectTo);
  return outcome.state;
}
