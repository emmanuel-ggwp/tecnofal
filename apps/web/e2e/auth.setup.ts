// Proyecto "setup": inicia sesión por UI UNA vez y guarda el storageState que
// reutilizan todas las specs (proyecto chromium depende de este).
import { expect, test as setup } from '@playwright/test';
import { E2E_EMAIL, E2E_PASSWORD } from './helpers/db';

const ARCHIVO_ESTADO = 'e2e/.auth/state.json';

setup('login e2e y guardar estado', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('complementary', { name: 'Navegación principal' })).toBeVisible();
  await page.context().storageState({ path: ARCHIVO_ESTADO });
});
