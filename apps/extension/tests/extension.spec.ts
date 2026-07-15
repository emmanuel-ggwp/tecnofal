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
    if (url.includes('/mye/myebay/watchlist') || url.includes('/myb/watchlist')) {
      return route.fulfill({ contentType: 'text/html', body: fixture('watchlist.html') });
    }
    return route.fulfill({ status: 204, body: '' });
  });
  // Descripción del vendedor: iframe cross-origin (itm.ebaydesc.com) — ver src/content/descripcion.ts
  await context.route('https://itm.ebaydesc.com/**', async (route) => (
    route.fulfill({ contentType: 'text/html', body: fixture('descripcion.html') })
  ));
});

test.afterAll(async () => {
  await context?.close();
});

// ---- helpers para leer IndexedDB (Dexie) del service worker vía el protocolo de mensajes ----
// No hay UI para esto: se abre una página propia de la extensión (popup) y desde ahí se llama
// chrome.runtime.sendMessage, igual que lo haría cualquier content script.
async function extensionId(): Promise<string> {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  return worker.url().split('/')[2];
}

interface ListingObtenido {
  fechaFinSubasta: string | null;
  vendedor: string | null;
  vendedorPctPositivo: number | null;
  vendedorTotalVentas: number | null;
  cantidadOfertas: number | null;
}

async function obtenerListing(itemId: string): Promise<ListingObtenido | null> {
  const id = await extensionId();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/src/popup/index.html`);
  const listing = await page.evaluate(
    (itemId) => chrome.runtime.sendMessage({ tipo: 'listings:obtener', id: itemId }),
    itemId,
  );
  await page.close();
  return listing as ListingObtenido | null;
}

test('búsqueda: aparecen badges de semáforo en los resultados', async () => {
  const page = await context.newPage();
  await page.goto('https://www.ebay.com/sch/i.html?_nkw=dell+latitude');
  const badges = page.locator('.tf-badge');
  await expect(badges.first()).toBeVisible({ timeout: 20_000 });
  expect(await badges.count()).toBeGreaterThanOrEqual(4);
  // FOR PARTS y Celeron deben bloquear (glifo ✗, sin verde/check — search.ts ya no usa
  // emoji de color, pinta el fondo vía Badge.color y usa ✓/✗ como glifo, ver renderBadge())
  const textos = await badges.allTextContents();
  expect(textos.filter((t) => t.includes('✗')).length).toBeGreaterThanOrEqual(2);
  await page.close();
});

test('listing: el panel de evaluación se monta y muestra el headline de puja / S_decente', async () => {
  // "S_max" ya no es un rótulo real del panel (Panel.tsx no lo renderiza como texto —
  // el headline usa "Puja máxima para ganancia decente" cuando S_decente es alcanzable,
  // o "...mínimo hasta" cuando solo S_max lo es; son mutuamente excluyentes). Esta laptop
  // (i5-8350U, 16GB/512GB, batería+cargador confirmados) alcanza ganancia decente, así que
  // el headline real a esperar es el de "Puja máxima para ganancia decente".
  const page = await context.newPage();
  await page.goto('https://www.ebay.com/itm/111111111111');
  await expect(page.locator('#tecnofal-panel-host')).toBeAttached({ timeout: 20_000 });
  // Playwright atraviesa shadow DOM
  await expect(page.getByText('Puja máxima para ganancia decente', { exact: false })).toBeVisible();
  await expect(page.getByText('S_decente')).toBeVisible();
  await expect(page.getByText('Partes faltantes', { exact: false })).toBeVisible();
  await page.close();
});

test('listing: el countdown de la página ("Finaliza en 12 min 31 s") se parsea y persiste como fechaFinSubasta', async () => {
  const page = await context.newPage();
  await page.goto('https://www.ebay.com/itm/555555555555');
  await expect(page.locator('#tecnofal-panel-host')).toBeAttached({ timeout: 20_000 });
  await page.close();
  // marcarVisto() envía 'listings:guardar' async al montar el panel — dar tiempo al roundtrip
  await new Promise((r) => setTimeout(r, 500));

  const guardado = await obtenerListing('555555555555');
  expect(guardado).not.toBeNull();
  expect(guardado?.fechaFinSubasta).not.toBeNull();
  const fin = new Date(guardado!.fechaFinSubasta as string).getTime();
  const ahora = Date.now();
  // "12 min 31 s" desde que se abrió la página: debe caer entre ahora y ahora+15min
  expect(fin).toBeGreaterThan(ahora);
  expect(fin).toBeLessThan(ahora + 15 * 60_000);
});

test('búsqueda: countdown divergente ("Quedan 2h 15m") actualiza el fechaFinSubasta de un listing ya guardado', async () => {
  // 1) el listing ya está guardado (visto) con un countdown corto, capturado en la página individual
  const p1 = await context.newPage();
  await p1.goto('https://www.ebay.com/itm/222222222222');
  await expect(p1.locator('#tecnofal-panel-host')).toBeAttached({ timeout: 20_000 });
  await p1.close();
  await new Promise((r) => setTimeout(r, 500));
  const antes = await obtenerListing('222222222222');
  expect(antes?.fechaFinSubasta).not.toBeNull();

  // 2) la grilla (search.html) muestra el mismo item con "Quedan 2h 15m" — diverge > 2min del
  // guardado (~12min) ⇒ content/search.ts debe enviar listings:actualizarTiempo para corregirlo
  const p2 = await context.newPage();
  await p2.goto('https://www.ebay.com/sch/i.html?_nkw=dell+latitude');
  await expect(p2.locator('.tf-badge').first()).toBeVisible({ timeout: 20_000 });
  // el envío de listings:actualizarTiempo está debounced 150ms (encolarCheck) — cerrar la página
  // antes de eso destruye el content script y el mensaje nunca sale.
  await new Promise((r) => setTimeout(r, 500));
  await p2.close();
  await new Promise((r) => setTimeout(r, 800));

  const despues = await obtenerListing('222222222222');
  const finAntes = new Date(antes!.fechaFinSubasta as string).getTime();
  const finDespues = new Date(despues!.fechaFinSubasta as string).getTime();
  // saltó de ~12min a ~2h15m: la diferencia debe ser de más de 1h
  expect(finDespues - finAntes).toBeGreaterThan(60 * 60_000);
});

test('búsqueda: el tooltip del badge incluye vendedor y cantidad de ofertas (layout .s-card)', async () => {
  const page = await context.newPage();
  await page.goto('https://www.ebay.com/sch/i.html?_nkw=dell+latitude');
  await expect(page.locator('.tf-badge').first()).toBeVisible({ timeout: 20_000 });
  const title = await page.locator('li.s-card .tf-badge').getAttribute('title');
  expect(title).toContain('sam-74545');
  expect(title).toContain('100% positivo');
  expect(title).toContain('Ofertas: 33');
  await page.close();
});

test('listing: vendedor y cantidad de ofertas se scrapean y persisten', async () => {
  const page = await context.newPage();
  await page.goto('https://www.ebay.com/itm/777777777777');
  await expect(page.locator('#tecnofal-panel-host')).toBeAttached({ timeout: 20_000 });
  await page.close();
  await new Promise((r) => setTimeout(r, 500));

  const guardado = await obtenerListing('777777777777');
  expect(guardado?.vendedor).toBe('sam-74545');
  expect(guardado?.vendedorPctPositivo).toBe(100);
  expect(guardado?.vendedorTotalVentas).toBe(4);
  expect(guardado?.cantidadOfertas).toBe(0);
});

test('listing: la descripción del iframe cross-origin (ebaydesc.com) alimenta "cargador incluido"', async () => {
  // El título/specifics del fixture NO mencionan cargador — solo aparece en descripcion.html,
  // servida por el iframe #desc_ifr (ver src/content/descripcion.ts + listing.tsx). Si el
  // content script no la capturara, "Cargador" quedaría marcado como faltante (checked).
  const page = await context.newPage();
  await page.goto('https://www.ebay.com/itm/333333333333');
  await expect(page.locator('#tecnofal-panel-host')).toBeAttached({ timeout: 20_000 });
  const panel = page.locator('#tecnofal-panel-host');
  await expect(panel.getByLabel('Cargador', { exact: false })).not.toBeChecked();
  await page.close();
});

test('listing: el panel muestra el vendedor', async () => {
  const page = await context.newPage();
  await page.goto('https://www.ebay.com/itm/888888888888');
  const panel = page.locator('#tecnofal-panel-host');
  await expect(panel).toBeAttached({ timeout: 20_000 });
  // "sam-74545" también aparece en la página cruda (fixture) fuera del panel — acotar al shadow host
  await expect(panel.getByText('sam-74545', { exact: false })).toBeVisible();
  await page.close();
});

test('watchlist: aparecen badges de semáforo y avisos de vendedor sobre las tarjetas', async () => {
  const page = await context.newPage();
  await page.goto('https://www.ebay.com/mye/myebay/watchlist');
  const badges = page.locator('.tf-badge');
  await expect(badges.first()).toBeVisible({ timeout: 20_000 });
  expect(await badges.count()).toBeGreaterThanOrEqual(4);

  // Lenovo "FOR PARTS no power" de un vendedor con pocas ventas y bajo % positivo: bloqueada
  const bloqueada = page.locator('div.m-item-3-col:has(input[data-itemid="900000000002"]) .tf-badge');
  await expect(bloqueada).toContainText('✗');

  const float = page.locator('div.m-item-3-col:has(input[data-itemid="900000000002"]) .tf-vendor-float');
  await expect(float).toContainText('Menos de 15 ventas');
  await expect(float).toContainText('debajo de 80%');
  await page.close();
});

test('watchlist: el % de batería del título se muestra como chip', async () => {
  const page = await context.newPage();
  await page.goto('https://www.ebay.com/mye/myebay/watchlist');
  const chip = page.locator('div.m-item-3-col:has(input[data-itemid="900000000001"]) .tf-bateria');
  await expect(chip).toBeVisible({ timeout: 20_000 });
  await expect(chip).toHaveText('🔋53%');
  await page.close();
});

test('watchlist: un item ya visto muestra la marca de estado pero NUNCA el atenuado/grayscale de la tarjeta', async () => {
  // asegura el estado "visto" para 111111111111 sin depender del orden de otros tests: abre el
  // listing y espera el roundtrip de 'listings:guardar' (mismo patrón que el test de countdown).
  const p1 = await context.newPage();
  await p1.goto('https://www.ebay.com/itm/111111111111');
  await expect(p1.locator('#tecnofal-panel-host')).toBeAttached({ timeout: 20_000 });
  await p1.close();
  await new Promise((r) => setTimeout(r, 500));

  const page = await context.newPage();
  await page.goto('https://www.ebay.com/mye/myebay/watchlist');
  const tarjeta = page.locator('div.m-item-3-col:has(input[data-itemid="111111111111"])');
  await expect(tarjeta.locator('.tf-visto, .tf-estado')).toBeVisible({ timeout: 20_000 });
  await expect(tarjeta).not.toHaveClass(/tf-item--visto/);
  expect(await tarjeta.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await page.close();
});

test('watchlist: al cargar corrige el fechaFinSubasta de un item ya guardado usando su countdown ("2h 46m", sin palabra disparadora)', async () => {
  // id EXCLUSIVO de este test (900000000099, no tocado por ningún otro test del archivo): abrir
  // el listing solo llama a marcarVisto()/recalcula fechaFinSubasta la PRIMERA vez que se ve
  // (listing.tsx: `if (!previo) void marcarVisto(...)`) — reusar un id ya visto por otro test
  // (ej. 111111111111) haría que esta apertura sea un no-op y el "antes" quede obsoleto.
  const p1 = await context.newPage();
  await p1.goto('https://www.ebay.com/itm/900000000099');
  await expect(p1.locator('#tecnofal-panel-host')).toBeAttached({ timeout: 20_000 });
  await p1.close();
  await new Promise((r) => setTimeout(r, 500));
  const antes = await obtenerListing('900000000099');
  expect(antes?.fechaFinSubasta).not.toBeNull();

  // 2) la Watchlist (watchlist.html) muestra el mismo item con "2h 46m" — a diferencia de
  // search.ts, sin "Quedan"/"left" (formato real de la Watchlist) — diverge > 2min del guardado
  // (~12min) ⇒ watchlist.ts debe corregirlo apenas carga, sin esperar los 5 min del intervalo.
  const p2 = await context.newPage();
  await p2.goto('https://www.ebay.com/mye/myebay/watchlist');
  await expect(p2.locator('.tf-badge').first()).toBeVisible({ timeout: 20_000 });
  await new Promise((r) => setTimeout(r, 800));
  await p2.close();

  const despues = await obtenerListing('900000000099');
  const finAntes = new Date(antes!.fechaFinSubasta as string).getTime();
  const finDespues = new Date(despues!.fechaFinSubasta as string).getTime();
  // saltó de ~12min a ~2h46m: la diferencia debe ser de más de 1h
  expect(finDespues - finAntes).toBeGreaterThan(60 * 60_000);
});
