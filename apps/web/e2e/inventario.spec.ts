// Specs del plan-03: /inventario (listado) y /inventario/[id] (ficha).
// Siembra su propio lote + modelo + paquete + 2 laptops + costo_lineas vía clienteAdmin()
// (service_role) y limpia todo en afterAll — no depende de datos de otras specs.
import { expect, test } from '@playwright/test';
import { clienteAdmin, comoUsuario } from './helpers/db';

const FORMATO_USD = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  currencyDisplay: 'narrowSymbol',
});

let userId: string;
let modeloId: string;
let loteId: string;
let paqueteId: string;
let detalleCatalogoId: string;
let laptopRevisionId: string; // en_revision, service_tag ABC1234 -> alias "1234"
let laptopTransitoId: string; // en_transito, paquete en aduana_usa
let laptopSinTagId: string; // sin service_tag (simula alta por Calculadora -> "Convertir en lote")
let costoLineaRevisionId: string;

test.describe('Inventario', () => {
  test.beforeAll(async () => {
    const admin = clienteAdmin();
    userId = await comoUsuario();

    // Limpieza defensiva: si una corrida anterior fue interrumpida antes de su afterAll
    // (p. ej. detenida por el usuario), puede quedar un detalle de catálogo huérfano con
    // el mismo nombre, que choca con la restricción única (user_id, nombre).
    await admin.from('detalles_catalogo').delete().eq('user_id', userId).eq('nombre', 'Carcasa marcada');

    const { data: modelo, error: errModelo } = await admin
      .from('modelos')
      .insert({ marca: 'Dell', modelo: `Latitude E2E-INV ${Date.now()}`, cpu_gen: 8 })
      .select('id')
      .single();
    if (errModelo) throw errModelo;
    modeloId = modelo.id;

    const { data: lote, error: errLote } = await admin
      .from('lotes')
      .insert({ user_id: userId, precio_subasta: 500, envio_usa: 50 })
      .select('id')
      .single();
    if (errLote) throw errLote;
    loteId = lote.id;

    const { data: paquete, error: errPaquete } = await admin
      .from('paquetes')
      .insert({ user_id: userId, estado: 'aduana_usa' })
      .select('id')
      .single();
    if (errPaquete) throw errPaquete;
    paqueteId = paquete.id;

    const { data: detalle, error: errDetalle } = await admin
      .from('detalles_catalogo')
      .insert({ user_id: userId, nombre: 'Carcasa marcada', deduccion_base: 15, categoria: 'carcasa' })
      .select('id')
      .single();
    if (errDetalle) throw errDetalle;
    detalleCatalogoId = detalle.id;

    // cpu_gen 8 / i5 -> precio_base 220 en la plantilla sembrada para el usuario e2e.
    const { data: laptop1, error: errL1 } = await admin
      .from('laptops')
      .insert({
        user_id: userId,
        modelo_id: modeloId,
        lote_id: loteId,
        service_tag: 'ABC1234',
        cpu_tipo: 'i5',
        cpu_gen: 8,
        ram_gb: 8,
        ssd_gb: 256,
        pantalla_pulgadas: 14,
        estado: 'en_revision',
      })
      .select('id')
      .single();
    if (errL1) throw errL1;
    laptopRevisionId = laptop1.id;

    const { data: laptop2, error: errL2 } = await admin
      .from('laptops')
      .insert({
        user_id: userId,
        modelo_id: modeloId,
        lote_id: loteId,
        service_tag: 'ZZZ9999',
        cpu_tipo: 'i5',
        cpu_gen: 8,
        ram_gb: 8,
        ssd_gb: 256,
        estado: 'en_transito',
        paquete_id: paqueteId,
      })
      .select('id')
      .single();
    if (errL2) throw errL2;
    laptopTransitoId = laptop2.id;

    // Sin service_tag al nacer (como cualquier laptop creada por Calculadora -> "Convertir
    // en lote", ver Hallazgos plan-10b/plan-10c) — usada para probar el campo editable de
    // la ficha de inventario, único lugar de la app donde se puede fijar después.
    const { data: laptop3, error: errL3 } = await admin
      .from('laptops')
      .insert({
        user_id: userId,
        modelo_id: modeloId,
        lote_id: loteId,
        cpu_tipo: 'i5',
        cpu_gen: 8,
        ram_gb: 8,
        ssd_gb: 256,
        estado: 'evaluando',
      })
      .select('id')
      .single();
    if (errL3) throw errL3;
    laptopSinTagId = laptop3.id;

    const { data: linea, error: errLinea } = await admin
      .from('costo_lineas')
      .insert({
        user_id: userId,
        ambito: 'laptop',
        ambito_id: laptopRevisionId,
        tipo: 'revision',
        monto_estimado: 20,
        descripcion: 'Revisión general',
      })
      .select('id')
      .single();
    if (errLinea) throw errLinea;
    costoLineaRevisionId = linea.id;
  });

  test.afterAll(async () => {
    const admin = clienteAdmin();
    if (costoLineaRevisionId) await admin.from('costo_lineas').delete().eq('id', costoLineaRevisionId);
    if (laptopRevisionId) await admin.from('laptops').delete().eq('id', laptopRevisionId);
    if (laptopTransitoId) await admin.from('laptops').delete().eq('id', laptopTransitoId);
    if (laptopSinTagId) await admin.from('laptops').delete().eq('id', laptopSinTagId);
    if (detalleCatalogoId) await admin.from('detalles_catalogo').delete().eq('id', detalleCatalogoId);
    if (paqueteId) await admin.from('paquetes').delete().eq('id', paqueteId);
    if (loteId) await admin.from('lotes').delete().eq('id', loteId);
    if (modeloId) await admin.from('modelos').delete().eq('id', modeloId);
  });

  test('busqueda por alias encuentra la laptop y el filtro por estado funciona', async ({ page }) => {
    await page.goto('/inventario');

    await page.getByLabel('Buscar por alias').fill('1234');
    await expect(page.getByRole('link', { name: '1234', exact: true })).toBeVisible();
    // Se acota a un link exacto de alias (no getByText genérico): el nombre de modelo
    // sembrado incluye Date.now() y podría contener "9999" por azar como subcadena.
    await expect(page.getByRole('link', { name: '9999', exact: true })).toHaveCount(0);

    await page.getByLabel('Buscar por alias').fill('');
    await page.getByLabel('Estado').selectOption('vendida');
    await expect(page.getByRole('link', { name: '1234', exact: true })).toHaveCount(0);

    await page.getByLabel('Estado').selectOption('en_revision');
    await expect(page.getByRole('link', { name: '1234', exact: true })).toBeVisible();
  });

  test('la laptop en_transito muestra el sub-estado del paquete (aduana_usa)', async ({ page }) => {
    await page.goto('/inventario');
    await page.getByLabel('Buscar por alias').fill('9999');
    await expect(page.getByText('Aduana USA')).toBeVisible();
  });

  test('ficha: agregar detalle "Carcasa marcada" con deducción 15 baja el precio sugerido en 15', async ({ page }) => {
    await page.goto(`/inventario/${laptopRevisionId}`);

    const sugeridoBase = FORMATO_USD.format(220);
    const sugeridoConDeduccion = FORMATO_USD.format(205);

    await expect(page.getByTestId('precio-sugerido')).toContainText(sugeridoBase);

    await page.getByLabel('Detalle a agregar').selectOption(detalleCatalogoId);
    await expect(page.getByLabel('Deducción')).toHaveValue('15');
    await page.getByRole('button', { name: 'Agregar detalle' }).click();

    await expect(page.getByTestId('precio-sugerido')).toContainText(sugeridoConDeduccion);
    // Se acota a la fila (<li>) de "Detalles aplicados": el mismo texto también existe
    // como <option> en el select "Detalle a agregar", lo que rompería un getByText genérico.
    await expect(page.locator('li').filter({ hasText: 'Carcasa marcada' })).toBeVisible();
  });

  test('registrar monto_real de la línea revision en 0 actualiza el timeline con desviación', async ({ page }) => {
    await page.goto(`/inventario/${laptopRevisionId}`);

    await page.getByLabel('Monto real — Revisión').fill('0');
    await page.getByRole('button', { name: 'Registrar' }).click();

    // exact: true para calzar solo con el resumen del tipo ("Real: $0,00"); sin esto
    // también coincide (por subcadena) con la fila individual, que además trae la fecha.
    await expect(page.getByText(`Real: ${FORMATO_USD.format(0)}`, { exact: true })).toBeVisible();
    await expect(page.getByText(/Desviación:/)).toBeVisible();
    await expect(page.getByLabel('Monto real — Revisión')).toHaveCount(0);
  });

  test('transición en_revision -> lista_para_venta es visible, se puede confirmar y "vendida" no se ofrece', async ({
    page,
  }) => {
    await page.goto(`/inventario/${laptopRevisionId}`);

    await expect(page.getByRole('button', { name: /Vendida/ })).toHaveCount(0);

    await page.getByRole('button', { name: '→ Lista para venta' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar' }).click();

    await expect(page.getByTestId('estado-chip')).toContainText('Lista para venta');

    await page.reload();
    await expect(page.getByTestId('estado-chip')).toContainText('Lista para venta');
  });

  test('editar condición (batería 4.5h) persiste tras recargar', async ({ page }) => {
    await page.goto(`/inventario/${laptopTransitoId}`);

    await page.getByLabel('Batería (horas)').fill('4.5');
    await page.getByRole('button', { name: 'Guardar condición' }).click();

    await page.reload();
    await expect(page.getByLabel('Batería (horas)')).toHaveValue('4.5');
  });

  test('fijar service_tag en una laptop sin alias (alta por Calculadora) persiste y recalcula el alias', async ({
    page,
  }) => {
    await page.goto(`/inventario/${laptopSinTagId}`);

    // Sin service_tag, alias generado es null -> encabezado sin texto antes del modelo.
    await expect(page.getByLabel('Service tag')).toHaveValue('');

    const nuevoTag = 'CALC5678';
    await page.getByLabel('Service tag').fill(nuevoTag);
    await page.getByRole('button', { name: 'Guardar service tag' }).click();

    await page.reload();
    await expect(page.getByLabel('Service tag')).toHaveValue(nuevoTag);
    // `alias` es columna generada (últimos 4 caracteres de service_tag).
    await expect(page.locator('h1')).toContainText('5678');
  });
});
