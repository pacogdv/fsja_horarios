/**
 * T1.15 — Formulario de login con errores de validación accesibles (specs/02-architecture-plan.md §5.2 y
 * §6.7; WCAG 2.2: 3.3.1 identificación de errores, 4.1.3 mensajes de estado).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { INITIAL_LOGIN_FORM_STATE, type LoginFormState } from "@/application/auth/login-form";
import { LoginForm } from "./login-form";

type Action = (state: LoginFormState, formData: FormData) => Promise<LoginFormState>;

const respondWith = (state: LoginFormState) => vi.fn<Action>(async () => state);

async function submit(action: Action, next = "/") {
  render(<LoginForm action={action} next={next} />);
  await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@centro.example");
  await userEvent.type(screen.getByLabelText("Contraseña"), "secreta");
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginForm", () => {
  it("tiene campos etiquetados con el autocompletado correcto y sin errores al inicio", () => {
    render(<LoginForm action={respondWith(INITIAL_LOGIN_FORM_STATE)} next="/" />);
    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Correo electrónico")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("envía el correo, la contraseña y la ruta de vuelta (next)", async () => {
    const action = respondWith(INITIAL_LOGIN_FORM_STATE);
    await submit(action, "/mi-horario");
    const formData = action.mock.calls[0]?.[1];
    expect(formData?.get("email")).toBe("ana@centro.example");
    expect(formData?.get("password")).toBe("secreta");
    expect(formData?.get("next")).toBe("/mi-horario");
  });

  it("asocia cada error de campo a su input con aria-describedby y marca aria-invalid", async () => {
    await submit(
      respondWith({
        status: "error",
        email: "ana@",
        fieldErrors: { email: ["Introduce un correo electrónico válido."], password: ["Introduce tu contraseña."] },
      }),
    );
    const email = await screen.findByLabelText("Correo electrónico");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Introduce un correo electrónico válido.");
    const password = screen.getByLabelText("Contraseña");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription("Introduce tu contraseña.");
  });

  it("muestra el error general (credenciales, límite de intentos) como alerta y conserva el correo", async () => {
    await submit(respondWith({ status: "error", email: "ana@centro.example", formError: "Credenciales no válidas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Credenciales no válidas");
    expect(screen.getByLabelText("Correo electrónico")).toHaveValue("ana@centro.example");
    expect(screen.getByLabelText("Contraseña")).toHaveValue("");
    // El error general describe el formulario: el lector de pantalla lo anuncia y los campos no se marcan.
    expect(screen.getByLabelText("Correo electrónico")).not.toHaveAttribute("aria-invalid");
  });
});
