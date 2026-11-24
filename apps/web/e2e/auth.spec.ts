/**
 * T1.17 — E2E de autenticación (specs/02-architecture-plan.md §5.2, §5.5 y §5.6).
 */
import {
  chooseTheme,
  expect,
  hasSessionCookie,
  INVALID_CREDENTIALS,
  loginAs,
  newClientContext,
  pageAlert,
  submitLogin,
  test,
  users,
} from "./fixtures/users";

test.describe("login", () => {
  test("un login correcto redirige a / con la aplicación", async ({ page }) => {
    await loginAs(page, users.admin);
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
    await expect(page.getByRole("banner")).toContainText(users.admin.displayName);
  });

  test("un login incorrecto muestra el mensaje genérico y no crea sesión", async ({ page }) => {
    await submitLogin(page, users.admin.email, "contraseña-incorrecta");
    await expect(pageAlert(page)).toHaveText(INVALID_CREDENTIALS);
    await expect(page).toHaveURL(/\/login/);
    expect(await hasSessionCookie(page.context())).toBe(false);
  });

  test("un usuario inexistente recibe exactamente el mismo mensaje", async ({ page }) => {
    await submitLogin(page, "nadie@demo.local", "contraseña-incorrecta");
    await expect(pageAlert(page)).toHaveText(INVALID_CREDENTIALS);
  });

  test("el 6.º intento en 15 min se rechaza aunque la contraseña sea correcta, sin crear sesión", async ({ page, browser }) => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await submitLogin(page, users.teacher.email, `incorrecta-${attempt}`);
      await expect(pageAlert(page)).toHaveText(INVALID_CREDENTIALS);
    }
    await submitLogin(page, users.teacher.email, users.teacher.password);
    await expect(pageAlert(page)).toHaveText(/^Demasiados intentos\. Espera \d+ minutos? y vuelve a intentarlo\.$/);
    await expect(page).toHaveURL(/\/login/);
    expect(await hasSessionCookie(page.context())).toBe(false);

    // El límite es por (IP, correo), no un bloqueo de la cuenta: desde otra IP entra. Además reinicia el
    // contador de fallos de la cuenta, así que el test no deja rastro para la siguiente ejecución.
    const otherClient = await newClientContext(browser);
    await loginAs(await otherClient.newPage(), users.teacher);
    await otherClient.close();
  });
});

test.describe("logout", () => {
  test("tras cerrar sesión, volver a / redirige a /login", async ({ page }) => {
    await loginAs(page, users.admin);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await hasSessionCookie(page.context())).toBe(false);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("cabeceras de seguridad (02 §5.5)", () => {
  test.use({ storageState: users.admin.storageState });

  for (const path of ["/login", "/"]) {
    test(`${path} lleva la CSP con nonce y X-Frame-Options: DENY`, async ({ page }) => {
      const response = await page.goto(path);
      const headers = response?.headers() ?? {};
      expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/]+=*' 'strict-dynamic'/);
      expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["x-content-type-options"]).toBe("nosniff");
    });
  }
});

test.describe("CSP en el navegador real", () => {
  test("la página hidrata y funciona sin violaciones de CSP", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Refused to (load|execute|apply|connect)/i.test(message.text())) violations.push(message.text());
    });
    page.on("pageerror", (error) => violations.push(`pageerror: ${error.message}`));
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        const store = ((window as unknown as { __cspViolations?: string[] }).__cspViolations ??= []);
        store.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });

    await loginAs(page, users.admin);
    // El conmutador de tema es un componente de cliente: si responde, React ha hidratado con los scripts del nonce.
    await chooseTheme(page, "Oscuro");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await chooseTheme(page, "Sistema");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);

    const reported = await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []);
    expect([...violations, ...reported]).toEqual([]);
  });
});
