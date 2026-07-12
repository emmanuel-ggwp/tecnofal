// Specs del plan-06: /ventas (listado + ganancia), registrar venta (RPC registrar_venta),
// garantías vigentes y devolución (RPC devolver_garantia), y compradores.
// Siembra su propia laptop "lista_para_venta" (lote_reparto costo_asignado 200 + costo_linea
// parte real 25 -> costo_directo 225) y una laptop "en_revision" vía clienteAdmin() (service_role)
// y limpia todo en afterAll — no depende de datos de otras specs. `ventas`/`compradores`/
// `movimientos` de este dominio son exclusivos del plan-06 (ningún otro plan los toca).
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
let laptopVentaId: string; // lista_para_venta -> costo_directo 225 (200 reparto + 25 parte real)
let laptopRevisionId: string; // en_revision -> no debe aparecer en el selector de venta
let costoLineaId: string;
let cuentaUsdId: string;
let cuentaVesId: string;
let ventaId: string;
let compradorNombre: string;
let sufijo: string;

test.describe('Ventas', () => {
  test.beforeAll(async () => {
    const admin = clienteAdmin();
    userId = await comoUsuario();
    sufijo = String(Date.now());
    compradorNombre = `Comprador E2E ${sufijo}`;

    const { data: modelo, error: errModelo } = await admin
      .from('modelos')
      .insert({ marca: 'Dell', modelo: `Latitude E2E-VTA ${sufijo}`, cpu_gen: 8 })
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

    const { data: laptopVenta, error: errLV } = await admin
      .from('laptops')
      .insert({
        user_id: userId,
        modelo_id: modeloId,
        lote_id: loteId,
        service_tag: `E2V${sufijo.slice(-7)}`,
        cpu_tipo: 'i5',
        cpu_gen: 8,
        ram_gb: 8,
        ssd_gb: 256,
        estado: 'lista_para_venta',
      })
      .select('id')
      .single();
    if (errLV) throw errLV;
    laptopVentaId = laptopVenta.id;

    const { data: laptopRevision, error: errLR } = await admin
      .from('laptops')
      .insert({
        user_id: userId,
        modelo_id: modeloId,
        lote_id: loteId,
        service_tag: `E2R${sufijo.slice(-7)}`,
        cpu_tipo: 'i5',
        cpu_gen: 8,
        ram_gb: 8,
        ssd_gb: 256,
        estado: 'en_revision',
      })
      .select('id')
      .single();
    if (errLR) throw errLR;
    laptopRevisionId = laptopRevision.id;

    const { error: errReparto } = await admin.from('lote_reparto').insert({
      lote_id: loteId,
      laptop_id: laptopVentaId,
      user_id: userId,
      valor_esperado_al_comprar: 200,
      proporcion: 1,
      costo_asignado: 200,
    });
    if (errReparto) throw errReparto;

    const { data: linea, error: errLinea } = await admin
      .from('costo_lineas')
      .insert({
        user_id: userId,
        ambito: 'laptop',
        ambito_id: laptopVentaId,
        tipo: 'parte',
        monto_estimado: 25,
        monto_real: 25,
        fecha_real: new Date().toISOString(),
        descripcion: 'Parte E2E ventas',
      })
      .select('id')
      .single();
    if (errLinea) throw errLinea;
    costoLineaId = linea.id;

    const { data: cuentas, error: errCuentas } = await admin
      .from('cuentas')
      .select('id, nombre, moneda')
      .eq('user_id', userId);
    if (errCuentas) throw errCuentas;
    const cuentaUsd = cuentas?.find((c) => c.nombre === 'Efectivo USD');
    const cuentaVes = cuentas?.find((c) => c.nombre === 'Efectivo Bs');
    if (!cuentaUsd) throw new Error('No se encontró la cuenta "Efectivo USD" sembrada por la plantilla del usuario.');
    if (!cuentaVes) throw new Error('No se encontró la cuenta "Efectivo Bs" sembrada por la plantilla del usuario.');
    cuentaUsdId = cuentaUsd.id;
    cuentaVesId = cuentaVes.id;
  });

  test.afterAll(async () => {
    const admin = clienteAdmin();
    if (ventaId) {
      await admin.from('movimientos').delete().eq('venta_id', ventaId);
      await admin.from('ventas').delete().eq('id', ventaId);
    }
    if (costoLineaId) await admin.from('costo_lineas').delete().eq('id', costoLineaId);
    if (loteId) await admin.from('lote_reparto').delete().eq('lote_id', loteId);
    if (laptopVentaId) await admin.from('laptops').delete().eq('id', laptopVentaId);
    if (laptopRevisionId) await admin.from('laptops').delete().eq('id', laptopRevisionId);
    if (loteId) await admin.from('lotes').delete().eq('id', loteId);
    if (modeloId) await admin.from('modelos').delete().eq('id', modeloId);
    if (compradorNombre) await admin.from('compradores').delete().eq('user_id', userId).eq('nombre', compradorNombre);
  });

  test('venta en VES: el precio en USD se calcula antes de confirmar (monto/tasa)', async ({ page }) => {
    await page.goto('/ventas');
    await page.getByRole('button', { name: '+ Registrar venta' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Laptop').selectOption(laptopVentaId);
    await page.getByLabel('Moneda').selectOption('VES');
    await page.getByLabel('Monto (Bs)').fill('20000');
    await page.getByLabel('Tasa').fill('50');

    await expect(page.getByTestId('precio-calculado')).toContainText(FORMATO_USD.format(400));

    // No confirmamos: solo se valida la previsualización. Cancelamos para no consumir la laptop.
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('vender a $400 USD con comprador nuevo: aparece en la tabla con ganancia bruta 175', async ({ page }) => {
    await page.goto('/ventas');
    await page.getByRole('button', { name: '+ Registrar venta' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Laptop').selectOption(laptopVentaId);
    await page.getByLabel('Comprador').selectOption('__nuevo__');
    await page.getByLabel('Nombre').fill(compradorNombre);
    await page.getByLabel('Moneda').selectOption('USD');
    await page.getByLabel('Precio (USD)').fill('400');
    await page.getByLabel('Cuenta destino').selectOption(cuentaUsdId);
    await page.getByRole('button', { name: 'Confirmar' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);

    const fila = page.locator('tr', { hasText: compradorNombre });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText(FORMATO_USD.format(175));

    const admin = clienteAdmin();
    const { data: venta, error } = await admin
      .from('ventas')
      .select('id, estado, precio_venta')
      .eq('laptop_id', laptopVentaId)
      .single();
    if (error) throw error;
    ventaId = venta.id;
    expect(venta.estado).toBe('activa');
    expect(Number(venta.precio_venta)).toBe(400);

    const { data: laptop, error: errLaptop } = await admin
      .from('laptops')
      .select('estado')
      .eq('id', laptopVentaId)
      .single();
    if (errLaptop) throw errLaptop;
    expect(laptop.estado).toBe('vendida');

    const { data: movimiento, error: errMov } = await admin
      .from('movimientos')
      .select('tipo, monto, cuenta_id')
      .eq('venta_id', ventaId)
      .single();
    if (errMov) throw errMov;
    expect(movimiento.tipo).toBe('ingreso');
    expect(Number(movimiento.monto)).toBe(400);
    expect(movimiento.cuenta_id).toBe(cuentaUsdId);
  });

  test('la venta aparece en garantías vigentes con ~120 días restantes', async ({ page }) => {
    await page.goto('/ventas');
    await page.getByRole('tab', { name: 'Garantías' }).click();

    const filaGarantia = page.locator('tr').filter({ has: page.getByTestId('dias-restantes') }).first();
    await expect(filaGarantia).toBeVisible();

    const texto = await filaGarantia.getByTestId('dias-restantes').textContent();
    const dias = Number((texto ?? '').replace(/\D/g, ''));
    expect(dias).toBeGreaterThan(100);
    expect(dias).toBeLessThan(130);
  });

  test('devolución por garantía: venta devuelta_garantia, laptop para_repuestos, egreso 400 y ganancia sale de los acumulados', async ({
    page,
  }) => {
    await page.goto('/ventas');
    await page.getByRole('tab', { name: 'Garantías' }).click();
    await page.getByRole('button', { name: 'Devolución' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await expect(page.getByLabel('Monto del reembolso')).toHaveValue('400');
    await page.getByLabel('Cuenta de reembolso').selectOption(cuentaUsdId);
    await page.getByRole('button', { name: 'Confirmar devolución' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);

    const admin = clienteAdmin();
    const { data: venta, error } = await admin.from('ventas').select('estado').eq('id', ventaId).single();
    if (error) throw error;
    expect(venta.estado).toBe('devuelta_garantia');

    const { data: laptop, error: errLaptop } = await admin
      .from('laptops')
      .select('estado')
      .eq('id', laptopVentaId)
      .single();
    if (errLaptop) throw errLaptop;
    expect(laptop.estado).toBe('para_repuestos');

    const { data: movimientos, error: errMov } = await admin
      .from('movimientos')
      .select('tipo, monto')
      .eq('venta_id', ventaId)
      .eq('tipo', 'egreso');
    if (errMov) throw errMov;
    expect(movimientos?.length).toBe(1);
    expect(Number(movimientos?.[0].monto)).toBe(400);

    // La ganancia sale de los acumulados del listado (estado ya no es 'activa').
    await page.getByRole('tab', { name: 'Ventas' }).click();
    await expect(page.getByTestId('total-ganancia-bruta')).toContainText(FORMATO_USD.format(0));
    await expect(page.getByTestId('total-ganancia-neta')).toContainText(FORMATO_USD.format(0));
  });

  test('una laptop en_revision no aparece en el selector de venta', async ({ page }) => {
    await page.goto('/ventas');
    await page.getByRole('button', { name: '+ Registrar venta' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const opciones = await page.getByLabel('Laptop').locator('option').allTextContents();
    const aliasRevision = `E2R${sufijo.slice(-7)}`.slice(-4);
    expect(opciones.some((o) => o.includes(aliasRevision))).toBe(false);
  });
});
