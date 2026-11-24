/**
 * Usuarios y utilidades de los E2E (specs/03-tasks.md T1.17).
 *
 * Los E2E se ejecutan contra el stack de Docker en desarrollo con el seed activado (T1.16), así que las
 * credenciales son las mismas variables `SEED_*` que recibe el contenedor `web`.
 *
 * Aislamiento de los límites de intentos: el login limita por IP y por (IP, correo) (02 §5.6). Cada test usa una
 * IP de cliente aleatoria en `X-Forwarded-For`. Solo funciona porque el stack de desarrollo tiene
 * `TRUSTED_PROXY_HOPS=0`, y entonces la última entrada de la cabecera es la IP. En producción (≥ 1 salto, lo exige
 * env.ts) la cabecera del cliente no cuenta.
 */
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Browser, type BrowserContext, type Cookie, type Locator, type Page } from "@playwright/test";

export type RoleKey = "admin" | "teacher" | "guest";

export interface E2EUser {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  /** Sesión guardada por `auth.setup.ts`. */
  readonly storageState: string;
}

const AUTH_DIR = fileURLToPath(new URL("../.auth", import.meta.url));

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta ${name}: los E2E usan las mismas credenciales SEED_* que el contenedor web (ver README).`);
  }
  return value;
}

function user(role: RoleKey, prefix: string, displayName: string): E2EUser {
  return {
    email: required(`SEED_${prefix}_EMAIL`).trim().toLowerCase(),
    password: required(`SEED_${prefix}_PASSWORD`),
    displayName,
    storageState: path.join(AUTH_DIR, `${role}.json`),
  };
}

/** Los tres usuarios del seed (prisma/seed/users.ts). */
export const users: Readonly<Record<RoleKey, E2EUser>> = {
  admin: user("admin", "ADMIN", "Dirección (demo)"),
  teacher: user("teacher", "TEACHER", "Docente (demo)"),
  guest: user("guest", "GUEST", "Invitado (demo)"),
};

export const INVALID_CREDENTIALS = "Credenciales no válidas";
export const DEMO_READ_ONLY = "La cuenta de demostración es de solo lectura: no puede modificar datos ni lanzar el motor.";
export const SESSION_COOKIE = "__Host-fsja_session";

/** IP aleatoria del rango privado 10.0.0.0/8: cada test parte con los límites de intentos a cero. */
export function randomClientIp(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

/**
 * Test con una IP de cliente propia en cada ejecución. El segundo parámetro no se llama `use` para que la regla
 * de hooks de React no lo confunda con `React.use`.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide) => {
    await provide({ ...extraHTTPHeaders, "x-forwarded-for": randomClientIp() });
  },
});
export { expect };

/** Contexto de navegador nuevo, con otra IP de cliente y, si se indica, la sesión de un usuario. */
export function newClientContext(browser: Browser, storageState?: string): Promise<BrowserContext> {
  return browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": randomClientIp() }, ...(storageState ? { storageState } : {}) });
}

/**
 * Mensaje de la página (errores del formulario, resultado de una acción). Se busca dentro de `main`: Next.js añade
 * fuera su propio `role="alert"` (el anunciador de rutas para lectores de pantalla).
 */
export function pageAlert(page: Page): Locator {
  return page.getByRole("main").getByRole("alert");
}

/** Elige una opción del conmutador de tema como un usuario: con clic en su etiqueta visible. */
export async function chooseTheme(page: Page, option: "Claro" | "Oscuro" | "Sistema"): Promise<void> {
  await page.getByRole("radiogroup", { name: "Tema" }).getByText(option, { exact: true }).click();
}

/** Rellena y envía el formulario de login. No espera al resultado: cada test comprueba el suyo. */
export async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

export async function loginAs(page: Page, account: E2EUser): Promise<void> {
  await submitLogin(page, account.email, account.password);
  await expect(page).toHaveURL("/");
}

/** Cookies de la sesión guardada de un usuario. */
export function sessionCookies(account: E2EUser): Cookie[] {
  return (JSON.parse(readFileSync(account.storageState, "utf8")) as { cookies: Cookie[] }).cookies;
}

export async function hasSessionCookie(context: BrowserContext): Promise<boolean> {
  return (await context.cookies()).some((cookie) => cookie.name === SESSION_COOKIE && cookie.value !== "");
}
