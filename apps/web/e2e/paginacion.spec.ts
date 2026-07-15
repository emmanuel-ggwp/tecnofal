// Spec del plan-11: paginación en cliente del componente compartido `Tabla`.
// Siembra su propio modelo + lote + 30 laptops vía clienteAdmin() (service_role) y filtra la
// pantalla de /inventario por ese modelo para aislar el conteo (el usuario e2e es compartido y
// otras specs pueden dejar laptops). Limpia todo en afterAll.
import { expect, test } from '@playwright/test';
import { clienteAdmin, comoUsuario } from './helpers/db';

const TOTAL = 30; // > 25 (tamaño de página por defecto) para forzar 2 páginas.

let userId: string;
let modeloId: string;
let modeloEtiqueta: string;
let loteId: string;
let laptopIds: string[] = [];

test.describe('Paginación de tablas (Tabla compartido)', () => {
  test.beforeAll(async () => {
    const admin = clienteAdmin();
    userId = await comoUsuario();

    const marca = 'Dell';
    const modelo = `Latitude E2E-PAG ${Date.now()}`;
    modeloEtiqueta = `${marca} ${modelo}`;
    const { data: m, error: errM } = await admin
      .from('modelos')
      .insert({ marca, modelo, cpu_gen: 8 })
      .select('id')
      .single();
    if (errM) throw errM;
    modeloId = m.id;

    const { data: lote, error: errLote } = await admin
      .from('lotes')
      .insert({ user_id: userId, precio_subasta: 500, envio_usa: 50 })
      .select('id')
      .single();
    if (errLote) throw errLote;
    loteId = lote.id;

    // 30 laptops con service_tag distinto (alias = últimos 4) sobre el mismo modelo/lote.
    const filas = Array.from({ length: TOTAL }, (_, i) => ({
      user_id: userId,
      modelo_id: modeloId,
      lote_id: loteId,
      service_tag: `PAG${String(i + 1).padStart(5, '0')}`,
      cpu_tipo: 'i5' as const,
      cpu_gen: 8,
      ram_gb: 8,
      ssd_gb: 256,
      estado: 'lista_para_venta' as const,
    }));
    const { data: creadas, error: errL } = await admin.from('laptops').insert(filas).select('id');
    if (errL) throw errL;
    laptopIds = (creadas ?? []).map((l) => l.id as string);
    expect(laptopIds.length).toBe(TOTAL);
  });

  test.afterAll(async () => {
    const admin = clienteAdmin();
    if (laptopIds.length) await admin.from('laptops').delete().in('id', laptopIds);
    if (loteId) await admin.from('lotes').delete().eq('id', loteId);
    if (modeloId) await admin.from('modelos').delete().eq('id', modeloId);
  });

  test('corta en 25 por página, navega entre páginas y respeta el tamaño', async ({ page }) => {
    await page.goto('/inventario');
    // Aísla el conteo a las 30 laptops sembradas filtrando por el modelo único.
    await page.getByLabel('Marca / modelo').selectOption({ label: modeloEtiqueta });

    const filasVisibles = page.getByTestId('fila-inventario-link');
    const paginacion = page.getByTestId('paginacion');
    const rango = page.getByTestId('paginacion-rango');
    const anterior = page.getByTestId('paginacion-anterior');
    const siguiente = page.getByTestId('paginacion-siguiente');

    // Página 1: 25 filas, rango "1–25 de 30", "Anterior" deshabilitado.
    await expect(paginacion).toBeVisible();
    await expect(filasVisibles).toHaveCount(25);
    await expect(rango).toContainText('1');
    await expect(rango).toContainText('25');
    await expect(rango).toContainText('30');
    await expect(anterior).toBeDisabled();
    await expect(siguiente).toBeEnabled();

    // Página 2: las 5 restantes, "Siguiente" deshabilitado.
    await siguiente.click();
    await expect(filasVisibles).toHaveCount(5);
    await expect(rango).toContainText('26');
    await expect(rango).toContainText('30');
    await expect(siguiente).toBeDisabled();
    await expect(anterior).toBeEnabled();

    // Volver a la página 1.
    await anterior.click();
    await expect(filasVisibles).toHaveCount(25);

    // Tamaño 50: las 30 caben en una página; "Siguiente" queda deshabilitado (el control
    // sigue visible porque 30 > 10, el tamaño mínimo — no queda atascado).
    await page.getByTestId('paginacion-tamano').selectOption('50');
    await expect(filasVisibles).toHaveCount(TOTAL);
    await expect(siguiente).toBeDisabled();
    await expect(anterior).toBeDisabled();
  });

  test('al reducir el resultado con un filtro no queda en una página fuera de rango', async ({ page }) => {
    await page.goto('/inventario');
    await page.getByLabel('Marca / modelo').selectOption({ label: modeloEtiqueta });

    const filasVisibles = page.getByTestId('fila-inventario-link');
    const siguiente = page.getByTestId('paginacion-siguiente');

    // Ir a la página 2, luego buscar un alias único → 1 sola fila; debe reencuadrar a pág. 1.
    await siguiente.click();
    await expect(filasVisibles).toHaveCount(5);

    await page.getByLabel('Buscar por alias').fill('0007'); // alias de PAG00007
    await expect(filasVisibles).toHaveCount(1);
    await expect(page.getByRole('link', { name: '0007', exact: true })).toBeVisible();
  });
});
