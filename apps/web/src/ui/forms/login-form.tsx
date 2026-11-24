"use client";

/**
 * Formulario de login (specs/02-architecture-plan.md §5.2). Errores accesibles (WCAG 2.2, 3.3.1 y 4.1.3):
 * - cada error de campo se asocia a su input con `aria-describedby` y lo marca con `aria-invalid`;
 * - el error general (credenciales, límite de intentos) se anuncia como alerta.
 */
import { useActionState, useId } from "react";
import { INITIAL_LOGIN_FORM_STATE, type LoginFormState } from "@/application/auth/login-form";
import { es } from "@/lib/i18n/es";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Label } from "@/ui/components/ui/label";

export interface LoginFormProps {
  readonly action: (state: LoginFormState, formData: FormData) => Promise<LoginFormState>;
  /** Ruta a la que volver tras el login. El servidor la vuelve a validar (sin redirecciones abiertas). */
  readonly next: string;
}

function FieldError({ id, messages }: { readonly id: string; readonly messages: readonly string[] | undefined }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-danger">
      {messages.join(" ")}
    </p>
  );
}

export function LoginForm({ action, next }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_LOGIN_FORM_STATE);
  const id = useId();
  const emailErrorId = `${id}-email-error`;
  const passwordErrorId = `${id}-password-error`;
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const fieldA11y = (errorId: string, messages: readonly string[] | undefined) =>
    messages?.length ? { "aria-invalid": true, "aria-describedby": errorId } : {};

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {state.status === "error" && state.formError && (
        <p role="alert" className="rounded-md border border-danger bg-surface-muted px-3 py-2 text-sm text-danger">
          {state.formError}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-email`}>{es.login.email}</Label>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.status === "error" ? state.email : ""}
          {...fieldA11y(emailErrorId, errors?.email)}
        />
        <FieldError id={emailErrorId} messages={errors?.email} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-password`}>{es.login.password}</Label>
        <Input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          {...fieldA11y(passwordErrorId, errors?.password)}
        />
        <FieldError id={passwordErrorId} messages={errors?.password} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? es.login.submitting : es.login.submit}
      </Button>
    </form>
  );
}
