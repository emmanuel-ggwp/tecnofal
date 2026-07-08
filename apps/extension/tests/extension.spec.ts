import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(aqui, '../dist');
const fixture = (n: string) => fs.readFileSync(path.join(aqui, 'fixtures', n), 'utf8');

let context: BrowserContext;

test.beforeAll(async () => {
  if (!fs.existsSync(path.join(dist, 'manifest.json'))) {
    throw new Error('Compila primero: npm run build -w @tecnofal/extension');
  }
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  // Sin red real: fixtures locales para ebay.com (el content script matchea por URL)
  await context.route('https://www.ebay.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/sch/')) return route.fulfill({ contentType: 'text/html', body: fixture('search.html') });
    if (url.includes('/itm/')) return route.fulfill({ contentType: 'text/html', body: fixture('listing.html') });
    return route.fulfill({ status: 204, body: '' });
  });
});

test.afterAll(async () => {
  await context?.close();
});

test('búsqueda: aparecen badges de semáforo en los resultados', async () => {
  const page = await context.newPage();
  await page.goto('https://www.ebay.com/sch/i.html?_nkw=dell+latitude');
  const badges = page.locator('.tf-badge');
  await expect(badges.first()).toBeVisible({ timeout: 20_000 });
  expect(await badges.count()).toBeGreaterThanOrEqual(4);
  // FOR PARTS y Celeron deben ser rojos
  const textos = await badges.allTextContents();
  expect(textos.filter((t) => t.includes('🔴')).length).toBeGreaterThanOrEqual(2);
  await page.close();
});

test('listing: el panel de evaluación se monta y muestra S_decente / S_max', async () => {
  const page = await context.newPage();
  await page.goto('https://www.ebay.com/itm/111111111111');
  await expect(page.locator('#tecnofal-panel-host')).toBeAttached({ timeout: 20_000 });
  // Playwright atraviesa shadow DOM
  await expect(page.getByText('S_decente')).toBeVisible();
  await expect(page.getByText('S_max')).toBeVisible();
  await expect(page.getByText('Partes faltantes', { exact: false })).toBeVisible();
  await page.close();
});
