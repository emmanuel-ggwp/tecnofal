// Specs de la pantalla /listings (Etapa 3/3). Siembra vía clienteAdmin() de e2e/helpers/db.ts;
// limpieza garantizada al final del describe (beforeAll/afterAll — los tests comparten el
// mismo seed base porque todos verifican distintas facetas de la misma lista filtrada).
// Títulos y ebay_item_id llevan el timestamp del run para no chocar con otras specs que
// también escriben en `listings` (ej. calculadora.spec.ts) sobre el mismo usuario e2e.
import { expect, test } from '@playwright/test';
import { clienteAdmin, comoUsuario } from './helpers/db';

const DINERO = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' });

test.describe.configure({ mode: 'serial' });

test.describe('Listings', () => {
  const ts = Date.now();
  const admin = clienteAdmin();

  const T = {
    unaHora: `Listing 1h ${ts}`,
    dosDias: `Listing 2 dias ${ts}`,
    finalizada: `Listing finalizada ${ts}`,
    sinFecha: `Listing sin fecha ${ts}`,
    comprado: `Listing comprado ${ts}`,
    descartado: `Listing descartado ${ts}`,
  };
  const URL_UNA_HORA = 'https://www.ebay.com/itm/999999999999';

  let userId: string;
  const idsSeed: string[] = [];

  test.beforeAll(async () => {
    userId = await comoUsuario();
    const ahora = Date.now();
    const filas = [
      {
        user_id: userId,
        ebay_item_id: `E2ELIST${ts}1H`,
        url: URL_UNA_HORA,
        titulo: T.unaHora,
        precio_visto: 100,
        precio_puja_decente: 90,
        semaforo: 'verde',
        estado: 'visto',
        fecha_fin_subasta: new Date(ahora + 60 * 60 * 1000).toISOString(),
      },
      {
        user_id: userId,
        ebay_item_id: `E2ELIST${ts}2D`,
        url: 'https://www.ebay.com/itm/111111111111',
        titulo: T.dosDias,
        precio_visto: 200,
        precio_puja_decente: 180,
        semaforo: 'amarillo',
        estado: 'evaluado',
        fecha_fin_subasta: new Date(ahora + 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        user_id: userId,
        ebay_item_id: `E2ELIST${ts}PAST`,
        url: null,
        titulo: T.finalizada,
        precio_visto: 50,
        precio_puja_decente: 40,
        semaforo: 'rojo',
        estado: 'visto',
        fecha_fin_subasta: new Date(ahora - 60 * 60 * 1000).toISOString(),
      },
      {
        user_id: userId,
        ebay_item_id: `E2ELIST${ts}NULL`,
        url: null,
        titulo: T.sinFecha,
        precio_visto: 70,
        precio_puja_decente: 60,
        semaforo: null,
        estado: 'evaluado',
        fecha_fin_subasta: null,
      },
      {
        user_id: userId,
        ebay_item_id: `E2ELIST${ts}COMPRADO`,
        url: null,
        titulo: T.comprado,
        precio_visto: 300,
        precio_puja_decente: 250,
        semaforo: 'verde',
        estado: 'comprado',
        fecha_fin_subasta: null,
      },
      {
        user_id: userId,
        ebay_item_id: `E2ELIST${ts}DESCARTADO`,
        url: null,
        titulo: T.descartado,
        precio_visto: 10,
        precio_puja_decente: 5,
        semaforo: 'rojo',
        estado: 'descartado',
        fecha_fin_subasta: null,
      },
    ];
    const { data, error } = await admin.from('listings').insert(filas).select('id');
    expect(error, error ? JSON.stringify(error) : undefined).toBeNull();
    idsSeed.push(...(data ?? []).map((f) => f.id as string));
  });

  test.afterAll(async () => {
    if (idsSeed.length) await admin.from('listings').delete().in('id', idsSeed);
  });

  /** Títulos propios de este run, en el orden en que aparecen en la tabla de escritorio. */
  async function tituloOrdenPropio(page: import('@playwright/test').Page): Promise<string[]> {
    const filas = page.locator('table tbody tr');
    await expect(filas.first()).toBeVisible();
    const textos = await filas.allTextContents();
    return textos.filter((t) => t.includes(String(ts))).map((t) => {
      const m = Object.values(T).find((titulo) => t.includes(titulo));
      return m ?? t;
    });
  }

  test('filtro por defecto: oculta finalizadas, ordena por fecha_fin_subasta ASC nulls last', async ({ page }) => {
    await page.goto('/listings');
    const orden = await tituloOrdenPropio(page);
    expect(orden).toEqual([T.unaHora, T.dosDias, T.sinFecha]);
    expect(orden).not.toContain(T.finalizada);
  });

  test('destildar "Ocultar finalizadas" revela la finalizada', async ({ page }) => {
    await page.goto('/listings');
    await expect(page.getByText(T.finalizada)).toHaveCount(0);
    await page.getByTestId('listings-filtro-ocultar-finalizadas').uncheck();
    await expect(page.getByText(T.finalizada)).toBeVisible();
  });

  test('compradas/descartadas ocultas hasta activar "Incluir compradas/descartadas"', async ({ page }) => {
    await page.goto('/listings');
    await expect(page.getByText(T.comprado)).toHaveCount(0);
    await expect(page.getByText(T.descartado)).toHaveCount(0);
    await page.getByTestId('listings-filtro-incluir-compradas-descartadas').check();
    await expect(page.getByText(T.comprado)).toBeVisible();
    await expect(page.getByText(T.descartado)).toBeVisible();
  });

  test('link a eBay: href y target="_blank" correctos', async ({ page }) => {
    await page.goto('/listings');
    const fila = page.locator('table tbody tr').filter({ hasText: T.unaHora });
    await expect(fila).toBeVisible();
    const link = fila.getByTestId('fila-listing-link');
    await expect(link).toHaveAttribute('href', URL_UNA_HORA);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('precio, puja máx. decente y semáforo visibles con los valores sembrados', async ({ page }) => {
    await page.goto('/listings');
    const fila = page.locator('table tbody tr').filter({ hasText: T.unaHora });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText(DINERO.format(100));
    await expect(fila).toContainText(DINERO.format(90));
    // semáforo: punto de color, sin texto — solo confirmamos que el marcador está presente.
    await expect(fila.locator('span[aria-hidden]').first()).toBeVisible();
  });

  test('responsive: tarjetas en mobile (375px), tabla en desktop (1280px), nunca ambos', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/listings');
    await expect(page.getByTestId('listings-mobile')).toBeVisible();
    await expect(page.getByTestId('listings-desktop-tabla')).toBeHidden();
    await expect(page.getByTestId('listing-card').first()).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await expect(page.getByTestId('listings-desktop-tabla')).toBeVisible();
    await expect(page.getByTestId('listings-mobile')).toBeHidden();
  });

  test('botón "Refrescar ahora" trae un listing sembrado después de la carga inicial', async ({ page }) => {
    await page.goto('/listings');
    const tituloNuevo = `Listing refresco ${Date.now()}`;
    let idNuevo: string | undefined;
    try {
      await expect(page.getByText(tituloNuevo)).toHaveCount(0);

      const { data, error } = await admin
        .from('listings')
        .insert({
          user_id: userId,
          ebay_item_id: `E2ELIST${ts}REFRESH`,
          url: null,
          titulo: tituloNuevo,
          precio_visto: 42,
          precio_puja_decente: 35,
          semaforo: 'verde',
          estado: 'visto',
          fecha_fin_subasta: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single();
      expect(error).toBeNull();
      idNuevo = data?.id as string;

      await page.getByTestId('listings-refrescar').click();
      await expect(page.getByText(tituloNuevo)).toBeVisible();
    } finally {
      if (idNuevo) await admin.from('listings').delete().eq('id', idNuevo);
    }
  });
});
