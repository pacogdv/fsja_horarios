/**
 * Página de login (specs/02-architecture-plan.md §5.2). `next` se pasa tal cual al formulario: la acción lo
 * filtra en el servidor antes de redirigir (sin redirecciones abiertas).
 */
import type { Metadata } from "next";
import { es } from "@/lib/i18n/es";
import { LoginForm } from "@/ui/forms/login-form";
import { login } from "./actions";

export const metadata: Metadata = { title: `${es.login.title} · ${es.appName}` };

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section aria-labelledby="login-title" className="flex w-full max-w-sm flex-col gap-6 rounded-lg border bg-surface p-6">
        <header className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-primary">{es.appName}</p>
          <h1 id="login-title" className="text-2xl font-semibold">
            {es.login.title}
          </h1>
        </header>
        <LoginForm action={login} next={typeof next === "string" ? next : "/"} />
      </section>
    </main>
  );
}
