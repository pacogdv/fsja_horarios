/**
 * T1.17 — E2E de permisos (specs/02-architecture-plan.md §5.3; TFM-03). La autorización la hace el servidor: los
 * tests llegan a las páginas y acciones directamente, sin depender de lo que la UI muestre u oculte.
 */
import {
  DEMO_READ_ONLY,
  expect,
  INVALID_CREDENTIALS,
  loginAs,
  newClientContext,
  pageAlert,
  sessionCookies,
  submitLogin,
  test,
  users,
} from "./fixtures/users";

const USERS_PAGE = "/administracion/usuarios";
const MAX_FAILED_LOGINS = 10;
const ATTEMPTS_PER_CLIENT = 5;

test.describe("DOCENTE", () => {
  test.use({ storageState: users.teacher.storageState });

  test(`en ${USERS_PAGE} recibe la página de acceso denegado, sin datos`, async ({ page }) => {
    await page.goto(USERS_PAGE);
    await expect(page.getByRole("heading", { level: 1, name: "Acceso denegado" })).toBeVisible();
    await expect(page.getByText("No tienes permiso para realizar esta acción.")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText(users.admin.email)).toHaveCount(0);
  });

  test("el sidebar solo muestra Inicio, Mi horario, Mis preferencias y Exportar mi horario", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link")).toHaveText([
      "Inicio",
      "Mi horario",
      "Mis preferencias",
      "Exportar mi horario",
    ]);
  });
});

test.describe("INVITADO_DEMO", () => {
  test.use({ storageState: users.guest.storageState });

  test("ve el banner de solo lectura", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("note", { name: "Modo demostración" })).toContainText("solo lectura");
  });

  test(`en ${USERS_PAGE} recibe acceso denegado con el mensaje de la demo`, async ({ page }) => {
    await page.goto(USERS_PAGE);
    await expect(page.getByRole("heading", { level: 1, name: "Acceso denegado" })).toBeVisible();
    await expect(page.getByText(DEMO_READ_ONLY)).toBeVisible();
  });
});

// Flujo con estado compartido: bloquea la cuenta del docente, la demo intenta desbloquearla y Dirección lo hace.
test.describe.serial("bloqueo de cuenta y desbloqueo (02 §5.2; TFM-03)", () => {
  test(`${MAX_FAILED_LOGINS} fallos seguidos bloquean la cuenta, con el mismo mensaje genérico`, async ({ browser }) => {
    // El límite por (IP, correo) corta a los 5 intentos: hacen falta dos clientes para llegar a 10 fallos.
    for (let client = 0; client < MAX_FAILED_LOGINS / ATTEMPTS_PER_CLIENT; client += 1) {
      const context = await newClientContext(browser);
      const page = await context.newPage();
      for (let attempt = 0; attempt < ATTEMPTS_PER_CLIENT; attempt += 1) {
        await submitLogin(page, users.teacher.email, `incorrecta-${client}-${attempt}`);
        await expect(pageAlert(page)).toHaveText(INVALID_CREDENTIALS);
      }
      await context.close();
    }
    const context = await newClientContext(browser);
    const page = await context.newPage();
    await submitLogin(page, users.teacher.email, users.teacher.password);
    await expect(pageAlert(page)).toHaveText(INVALID_CREDENTIALS);
    await context.close();
  });

  test("INVITADO_DEMO no puede ejecutar la Server Action de desbloqueo: 403 con el mensaje de la demo", async ({ browser }) => {
    const context = await newClientContext(browser, users.admin.storageState);
    const page = await context.newPage();
    await page.goto(USERS_PAGE);
    const teacherRow = page.getByRole("row", { name: new RegExp(users.teacher.email) });
    await expect(teacherRow.getByText("Bloqueada")).toBeVisible();

    // La demo nunca ve este formulario; aquí lo envía con su propia sesión, como haría quien lo fabrique.
    await context.clearCookies();
    await context.addCookies(sessionCookies(users.guest));
    const actionResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(USERS_PAGE));
    await teacherRow.getByRole("button", { name: `Desbloquear a ${users.teacher.displayName}` }).click();
    expect(await (await actionResponse).text()).toContain('"status":403');
    await expect(pageAlert(page)).toHaveText(DEMO_READ_ONLY);
    await context.close();

    // La cuenta sigue bloqueada.
    const admin = await newClientContext(browser, users.admin.storageState);
    const adminPage = await admin.newPage();
    await adminPage.goto(USERS_PAGE);
    await expect(adminPage.getByRole("row", { name: new RegExp(users.teacher.email) }).getByText("Bloqueada")).toBeVisible();
    await admin.close();
  });

  test("ADMIN_DIRECCION desbloquea la cuenta y el docente vuelve a entrar", async ({ browser }) => {
    const admin = await newClientContext(browser, users.admin.storageState);
    const page = await admin.newPage();
    await page.goto(USERS_PAGE);
    const teacherRow = page.getByRole("row", { name: new RegExp(users.teacher.email) });
    await teacherRow.getByRole("button", { name: `Desbloquear a ${users.teacher.displayName}` }).click();
    await expect(page.getByRole("row", { name: new RegExp(users.teacher.email) }).getByText("Activa")).toBeVisible();
    await admin.close();

    const teacher = await newClientContext(browser);
    await loginAs(await teacher.newPage(), users.teacher);
    await teacher.close();
  });
});
