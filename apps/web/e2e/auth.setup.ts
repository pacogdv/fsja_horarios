/**
 * Proyecto `setup` de Playwright: inicia sesión una vez por rol y guarda la sesión en e2e/.auth/ (ignorado por
 * git). El resto de tests la reutilizan, así que no gastan intentos de login (02 §5.6).
 */
import { loginAs, test, users, type RoleKey } from "./fixtures/users";

for (const role of ["admin", "teacher", "guest"] as const satisfies readonly RoleKey[]) {
  test(`sesión de ${role}`, async ({ page }) => {
    await loginAs(page, users[role]);
    await page.context().storageState({ path: users[role].storageState });
  });
}
