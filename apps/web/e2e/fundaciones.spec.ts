// Specs de humo del plan-00: auth, guardia, navegación y stubs.
import { expect, test } from '@playwright/test';
import { E2E_EMAIL } from './helpers/db';

const RUTAS: { href: string; nombre: string }[] = [
  { href: '/', nombre: 'Dashboard' },
  { href: '/inventario', nombre: 'Inventario' },
  { href: '/calculadora', nombre: 'Calculadora' },
  { href: '/lotes', nombre: 'Lotes' },
  { href: '/partes', nombre: 'Partes' },
  { href: '/ventas', nombre: 'Ventas' },
  { href: '/cuentas', nombre: 'Cuentas' },
  { href: '/configuracion', nombre: 'Configuración' },
];

test.describe('sin sesión', () => {
  // Contexto limpio: sin el storageState del proyecto (anónimo).
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login inválido muestra error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo').fill('nadie@tecnofal.test');
    await page.getByLabel('Contraseña').fill('clave-mala');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByTestId('login-error')).toContainText('incorrectos');
  });

  test('una ruta del panel redirige a /login', async ({ page }) => {
    await page.goto('/inventario');
    await page.waitForURL('**/login');
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });
});

test.describe('con sesión', () => {
  test('el dashboard carga y muestra el email del usuario', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('complementary', { name: 'Navegación principal' })).toBeVisible();
    await expect(page.getByText(E2E_EMAIL)).toBeVisible();
  });

  test('/login con sesión redirige al dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.waitForURL((url) => url.pathname === '/');
  });

  test('la sidebar navega a las 8 rutas y cada stub renderiza', async ({ page }) => {
    await page.goto('/');
    for (const r of RUTAS) {
      await page.getByRole('complementary', { name: 'Navegación principal' }).getByRole('link', { name: r.nombre }).click();
      await page.waitForURL((url) => url.pathname === r.href);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(r.nombre);
    }
  });

  // Va de último: signOut revoca la sesión guardada en el storageState compartido.
  test('logout vuelve a /login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /salir/i }).click();
    await page.waitForURL('**/login');
  });
});
