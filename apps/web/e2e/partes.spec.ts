// Specs del plan-05: /partes (Stock, Específicas, Catálogo, Órdenes).
// Siembra su propio modelo + lote + laptops + partes_catalogo vía clienteAdmin() (service_role)
// y limpia todo en afterAll — no depende de datos de otras specs. No asume valores semilla
// compartidos (parametros/precios/ajustes) porque esta spec no los usa.
import { expect, test } from '@playwright/test';
import { clienteAdmin, comoUsuario } from './helpers/db';

const FORMATO_USD = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  currencyDisplay: 'narrowSymbol',
});

const SUFIJO = Date.now().toString().slice(-6);
const NOMBRE_SSD = `SSD E2E-PARTES ${SUFIJO}`;
// Parte separada y exclusiva del test de instalación: Playwright reinicia el worker (proceso)
// tras cualquier test que falle en este archivo, lo que puede hacer que dos tests compartan
// beforeAll (mismo worker, mismos ids) o no (worker fresco, ids nuevos) de forma no
// determinista. Para que el test de "instalar" nunca dependa de si el de "compra" corrió
// antes en el mismo proceso (evita doble conteo de stock), usa su propia parte que solo él
// siembra y consume.
const NOMBRE_SSD_INSTALAR = `SSD-INSTALAR E2E-PARTES ${SUFIJO}`;
const NOMBRE_TECLADO = `Teclado E2E-PARTES ${SUFIJO}`;
const NOMBRE_PANTALLA = `Pantalla E2E-PARTES ${SUFIJO}`;
const NOMBRE_BATERIA = `Batería E2E-PARTES ${SUFIJO}`;
// Nunca recibe una compra (sin fila en partes_stock): usada para probar el rechazo por
// stock insuficiente directamente contra el RPC (el botón "Instalar" se deshabilita en la UI
// cuando cantidad < 1, así que ese camino no es alcanzable con clics).
const NOMBRE_SIN_STOCK = `SinStock E2E-PARTES ${SUFIJO}`;

let userId: string;
let modeloId: string;
let loteId: string;
let laptopFaltaPartesId: string;
let laptopFaltaPartesAlias: string;
let laptopDonanteId: string;
let laptopDonanteAlias: string;

let parteSsdId: string;
let parteSsdInstalarId: string;
let parteTecladoId: string;
let partePantallaId: string;
let parteBateriaId: string;
let parteSinStockId: string;

let ordenId: string | null = null;
let especificaId: string | null = null;

test.describe('Partes', () => {
  test.beforeAll(async () => {
    const admin = clienteAdmin();
    userId = await comoUsuario();

    // Limpieza defensiva por si una corrida anterior fue interrumpida antes de su afterAll.
    await admin.from('partes_catalogo').delete().eq('user_id', userId).ilike('nombre', `%${SUFIJO}%`);

    const { data: modelo, error: errModelo } = await admin
      .from('modelos')
      .insert({ marca: 'Dell', modelo: `Latitude E2E-PARTES ${SUFIJO}`, cpu_gen: 8 })
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

    const { data: laptop1, error: errL1 } = await admin
      .from('laptops')
      .insert({
        user_id: userId,
        modelo_id: modeloId,
        lote_id: loteId,
        service_tag: `PRT${SUFIJO}`.slice(0, 10),
        cpu_tipo: 'i5',
        cpu_gen: 8,
        ram_gb: 8,
        ssd_gb: 256,
        estado: 'falta_partes',
      })
      .select('id, alias')
      .single();
    if (errL1) throw errL1;
    laptopFaltaPartesId = laptop1.id;
    laptopFaltaPartesAlias = laptop1.alias;

    const { data: laptop2, error: errL2 } = await admin
      .from('laptops')
      .insert({
        user_id: userId,
        modelo_id: modeloId,
        lote_id: loteId,
        service_tag: `DON${SUFIJO}`.slice(0, 10),
        cpu_tipo: 'i5',
        cpu_gen: 8,
        estado: 'evaluando',
        es_donante: true,
      })
      .select('id, alias')
      .single();
    if (errL2) throw errL2;
    laptopDonanteId = laptop2.id;
    laptopDonanteAlias = laptop2.alias;

    const { data: partes, error: errPartes } = await admin
      .from('partes_catalogo')
      .insert([
        { user_id: userId, nombre: NOMBRE_SSD, precio_referencia: 25 },
        // precio_referencia deliberadamente distinto del costo_promedio resultante (25, ver
        // la compra sembrada en el test de instalación): si el RPC aplicara por error
        // precio_referencia en vez de costo_promedio, la aserción de costo_aplicado ~25 lo
        // detectaría (antes ambos valores coincidían en 25 y el bug habría pasado inadvertido).
        { user_id: userId, nombre: NOMBRE_SSD_INSTALAR, precio_referencia: 40 },
        { user_id: userId, nombre: NOMBRE_TECLADO, precio_referencia: 100 },
        { user_id: userId, nombre: NOMBRE_PANTALLA, precio_referencia: 300 },
        { user_id: userId, nombre: NOMBRE_BATERIA, precio_referencia: 30 },
        { user_id: userId, nombre: NOMBRE_SIN_STOCK, precio_referencia: 10 },
      ])
      .select('id, nombre');
    if (errPartes) throw errPartes;
    parteSsdId = partes.find((p) => p.nombre === NOMBRE_SSD)!.id;
    parteSsdInstalarId = partes.find((p) => p.nombre === NOMBRE_SSD_INSTALAR)!.id;
    parteTecladoId = partes.find((p) => p.nombre === NOMBRE_TECLADO)!.id;
    partePantallaId = partes.find((p) => p.nombre === NOMBRE_PANTALLA)!.id;
    parteBateriaId = partes.find((p) => p.nombre === NOMBRE_BATERIA)!.id;
    parteSinStockId = partes.find((p) => p.nombre === NOMBRE_SIN_STOCK)!.id;
  });

  test.afterAll(async () => {
    const admin = clienteAdmin();
    if (especificaId) await admin.from('partes_especificas').delete().eq('id', especificaId);
    if (laptopFaltaPartesId) {
      await admin.from('laptop_partes').delete().eq('laptop_id', laptopFaltaPartesId);
      await admin.from('costo_lineas').delete().eq('ambito', 'laptop').eq('ambito_id', laptopFaltaPartesId);
    }
    if (ordenId) {
      await admin.from('orden_partes_items').delete().eq('orden_id', ordenId);
      await admin.from('ordenes_partes').delete().eq('id', ordenId);
    }
    const parteIds = [
      parteSsdId,
      parteSsdInstalarId,
      parteTecladoId,
      partePantallaId,
      parteBateriaId,
      parteSinStockId,
    ].filter(Boolean);
    if (parteIds.length) {
      await admin.from('partes_especificas').delete().in('parte_id', parteIds);
      await admin.from('partes_compras').delete().in('parte_id', parteIds);
      await admin.from('partes_stock').delete().in('parte_id', parteIds);
      await admin.from('partes_catalogo').delete().in('id', parteIds);
    }
    if (laptopFaltaPartesId) await admin.from('laptops').delete().eq('id', laptopFaltaPartesId);
    if (laptopDonanteId) await admin.from('laptops').delete().eq('id', laptopDonanteId);
    if (loteId) await admin.from('lotes').delete().eq('id', loteId);
    if (modeloId) await admin.from('modelos').delete().eq('id', modeloId);
  });

  test('compra de 2 SSD a $20 y luego 2 a $30 deja stock 4 @ $25 (promedio ponderado)', async ({ page }) => {
    await page.goto('/partes');
    const fila = page.locator('tr').filter({ hasText: NOMBRE_SSD });
    await expect(fila).toBeVisible();

    await fila.getByLabel(`Cantidad — ${NOMBRE_SSD}`).fill('2');
    await fila.getByLabel(`Costo unitario — ${NOMBRE_SSD}`).fill('20');
    await fila.getByRole('button', { name: 'Comprar' }).click();

    // Columnas de la fila de Stock: 0 Parte, 1 Cantidad, 2 Costo promedio, 3 Valor total.
    await expect(page.locator('tr').filter({ hasText: NOMBRE_SSD }).locator('td').nth(2)).toHaveText(
      FORMATO_USD.format(20),
    );

    const filaOtraVez = page.locator('tr').filter({ hasText: NOMBRE_SSD });
    await filaOtraVez.getByLabel(`Cantidad — ${NOMBRE_SSD}`).fill('2');
    await filaOtraVez.getByLabel(`Costo unitario — ${NOMBRE_SSD}`).fill('30');
    await filaOtraVez.getByRole('button', { name: 'Comprar' }).click();

    const filaFinal = page.locator('tr').filter({ hasText: NOMBRE_SSD });
    await expect(filaFinal.locator('td').nth(1)).toHaveText('4');
    await expect(filaFinal.locator('td').nth(2)).toHaveText(FORMATO_USD.format(25));
  });

  test('orden con 2 ítems: prorrateo 10/30, manual 25 re-prorratea a 15, recibir aterriza el costo', async ({ page }) => {
    await page.goto('/partes');
    const fuenteOrden = `E2E-${SUFIJO}`;
    await page.getByRole('button', { name: 'Órdenes' }).click();
    await page.getByRole('button', { name: '+ Nueva orden' }).click();
    await page.getByLabel('Origen').fill('ebay');
    await page.getByLabel('Fuente').fill(fuenteOrden);
    await page.getByLabel('Envío USA').fill('40');
    await page.getByLabel('Fees').fill('0');
    await page.getByRole('button', { name: 'Crear orden' }).click();

    const filaOrden = page.locator('tr').filter({ hasText: fuenteOrden });
    await expect(filaOrden).toBeVisible();
    await filaOrden.getByRole('link', { name: 'Ver detalle' }).click();
    await expect(page).toHaveURL(/\/partes\/ordenes\//);
    ordenId = page.url().split('/partes/ordenes/')[1];

    await page.getByLabel('Parte a agregar').selectOption(parteTecladoId);
    await page.getByLabel('Cantidad').fill('1');
    await page.getByLabel('Precio unitario').fill('100');
    await page.getByRole('button', { name: 'Agregar ítem' }).click();

    await expect(page.locator('tr').filter({ hasText: NOMBRE_TECLADO })).toBeVisible();

    await page.getByLabel('Parte a agregar').selectOption(partePantallaId);
    await page.getByLabel('Cantidad').fill('1');
    await page.getByLabel('Precio unitario').fill('300');
    await page.getByRole('button', { name: 'Agregar ítem' }).click();

    await expect(page.locator('tr').filter({ hasText: NOMBRE_PANTALLA })).toBeVisible();

    await page.getByRole('button', { name: 'Prorratear' }).click();

    // Columnas de Ítems: 0 Parte, 1 Cantidad, 2 Precio unitario, 3 Prorrateo, 4 Manual, 5 Recibido.
    await expect(page.locator('tr').filter({ hasText: NOMBRE_TECLADO }).locator('td').nth(3)).toHaveText(
      FORMATO_USD.format(10),
    );
    await expect(page.locator('tr').filter({ hasText: NOMBRE_PANTALLA }).locator('td').nth(3)).toHaveText(
      FORMATO_USD.format(30),
    );

    const filaTeclado = page.locator('tr').filter({ hasText: NOMBRE_TECLADO });
    await filaTeclado.getByLabel(`Prorrateo manual — ${NOMBRE_TECLADO}`).fill('25');
    await filaTeclado.getByRole('button', { name: 'Fijar' }).click();

    await expect(page.locator('tr').filter({ hasText: NOMBRE_TECLADO }).locator('td').nth(3)).toHaveText(
      FORMATO_USD.format(25),
    );
    await expect(page.locator('tr').filter({ hasText: NOMBRE_PANTALLA }).locator('td').nth(3)).toHaveText(
      FORMATO_USD.format(15),
    );

    await page.getByRole('button', { name: 'Recibir' }).click();
    await expect(page.getByText('Recibida')).toBeVisible();

    const admin = clienteAdmin();
    const { data: stockTeclado } = await admin
      .from('partes_stock')
      .select('cantidad, costo_promedio')
      .eq('parte_id', parteTecladoId)
      .single();
    expect(Number(stockTeclado!.cantidad)).toBe(1);
    expect(Number(stockTeclado!.costo_promedio)).toBeCloseTo(125, 2);

    const { data: stockPantalla } = await admin
      .from('partes_stock')
      .select('cantidad, costo_promedio')
      .eq('parte_id', partePantallaId)
      .single();
    expect(Number(stockPantalla!.cantidad)).toBe(1);
    expect(Number(stockPantalla!.costo_promedio)).toBeCloseTo(315, 2);
  });

  test('instalar 1 SSD en laptop falta_partes baja el stock a 3 y crea laptop_partes + costo_linea', async ({ page }) => {
    // Usa su propia parte (NOMBRE_SSD_INSTALAR) sembrada aquí mismo: Playwright reinicia el
    // worker (y por tanto el módulo + beforeAll, con nuevos ids) tras cualquier test que falle
    // en este archivo, así que dos tests pueden terminar compartiendo el mismo proceso (mismos
    // ids) o no, de forma no determinista — reusar la parte del test de "compra" arriesgaría
    // doble conteo de stock si ambos corren en el mismo worker. Con una parte exclusiva el
    // resultado es determinista sin importar el reparto de workers.
    const admin = clienteAdmin();
    const { error: errSeedCompras } = await admin.from('partes_compras').insert([
      { user_id: userId, parte_id: parteSsdInstalarId, cantidad: 2, costo_unitario: 20, fecha: '2026-07-10' },
      { user_id: userId, parte_id: parteSsdInstalarId, cantidad: 2, costo_unitario: 30, fecha: '2026-07-10' },
    ]);
    if (errSeedCompras) throw errSeedCompras;

    await page.goto('/partes');
    const fila = page.locator('tr').filter({ hasText: NOMBRE_SSD_INSTALAR });
    await expect(fila.locator('td').nth(1)).toHaveText('4');

    await fila.getByRole('button', { name: 'Instalar' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Buscar laptop por alias').fill(laptopFaltaPartesAlias);
    await page.getByRole('button', { name: laptopFaltaPartesAlias, exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar instalación' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('tr').filter({ hasText: NOMBRE_SSD_INSTALAR }).locator('td').nth(1)).toHaveText('3');

    const { data: laptopParte } = await admin
      .from('laptop_partes')
      .select('costo_aplicado, parte_especifica_id')
      .eq('laptop_id', laptopFaltaPartesId)
      .eq('parte_id', parteSsdInstalarId)
      .single();
    expect(Number(laptopParte!.costo_aplicado)).toBeCloseTo(25, 2);
    expect(laptopParte!.parte_especifica_id).toBeNull();

    // Filtrado también por descripcion: laptopFaltaPartesId puede recibir otra costo_linea
    // tipo 'parte' desde el test de cosecha (misma laptop de destino) si comparten worker.
    const { data: costoLinea } = await admin
      .from('costo_lineas')
      .select('monto_real, descripcion, tipo')
      .eq('ambito', 'laptop')
      .eq('ambito_id', laptopFaltaPartesId)
      .eq('tipo', 'parte')
      .eq('descripcion', NOMBRE_SSD_INSTALAR)
      .single();
    expect(Number(costoLinea!.monto_real)).toBeCloseTo(25, 2);
  });

  test('instalar una parte sin stock es rechazada por el RPC (0 filas de efecto)', async () => {
    // NOMBRE_SIN_STOCK nunca recibió una compra, así que no tiene fila en partes_stock:
    // StockTab deshabilita el botón "Instalar" cuando cantidad < 1 (ver
    // src/app/(panel)/partes/StockTab.tsx), por lo que este camino de rechazo no es
    // alcanzable con clics — se llama al RPC directamente para verificar que el "todo o nada"
    // de la migración 0022 realmente rechaza la instalación y no deja rastros.
    const admin = clienteAdmin();
    const { error } = await admin.rpc('instalar_parte', {
      p_laptop_id: laptopFaltaPartesId,
      p_parte_id: parteSinStockId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/no hay stock disponible/i);

    const { data: laptopPartesSinStock } = await admin
      .from('laptop_partes')
      .select('id')
      .eq('laptop_id', laptopFaltaPartesId)
      .eq('parte_id', parteSinStockId);
    expect(laptopPartesSinStock ?? []).toHaveLength(0);

    const { data: costoLineasSinStock } = await admin
      .from('costo_lineas')
      .select('id')
      .eq('ambito', 'laptop')
      .eq('ambito_id', laptopFaltaPartesId)
      .eq('descripcion', NOMBRE_SIN_STOCK);
    expect(costoLineasSinStock ?? []).toHaveLength(0);
  });

  test('cosechar batería de donante crea específica origen cosechada costo 0 y se puede asignar a otra laptop', async ({
    page,
  }) => {
    await page.goto('/partes');
    await page.getByRole('button', { name: 'Específicas' }).click();
    await page.getByRole('button', { name: 'Cosechar' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Buscar donante por alias').fill(laptopDonanteAlias);
    await page.getByRole('button', { name: laptopDonanteAlias, exact: true }).click();
    await page.getByLabel('Tipo de parte').selectOption(parteBateriaId);
    await page.getByLabel('Identificador').fill(`BAT-${SUFIJO}`);
    await page.getByRole('button', { name: 'Confirmar cosecha' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Columnas de Específicas: 0 Parte, 1 Identificador, 2 Costo, 3 Origen, 4 Asignada a.
    const filaBateria = page.locator('tr').filter({ hasText: `BAT-${SUFIJO}` });
    await expect(filaBateria).toBeVisible();
    await expect(filaBateria.locator('td').nth(2)).toHaveText(FORMATO_USD.format(0));
    await expect(filaBateria.locator('td').nth(3)).toHaveText('Cosechada');

    const admin = clienteAdmin();
    const { data: especifica } = await admin
      .from('partes_especificas')
      .select('id, origen, costo_real, cosechada_de_laptop_id')
      .eq('parte_id', parteBateriaId)
      .eq('identificador', `BAT-${SUFIJO}`)
      .single();
    especificaId = especifica!.id;
    expect(especifica!.origen).toBe('cosechada');
    expect(Number(especifica!.costo_real)).toBe(0);
    expect(especifica!.cosechada_de_laptop_id).toBe(laptopDonanteId);

    await filaBateria.getByRole('button', { name: 'Asignar a laptop' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Buscar laptop por alias').fill(laptopFaltaPartesAlias);
    await page.getByRole('button', { name: laptopFaltaPartesAlias, exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar instalación' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.locator('tr').filter({ hasText: `BAT-${SUFIJO}` }).locator('td').nth(4),
    ).toHaveText(laptopFaltaPartesAlias);

    // La UI (columna "Asignada a") refleja laptop_asignada_id vía join, pero se verifica
    // también directo en la tabla: es el campo que el RPC instalar_parte debe fijar y que
    // gobierna el rechazo de reasignación probado más abajo.
    const { data: especificaTrasAsignar } = await admin
      .from('partes_especificas')
      .select('laptop_asignada_id')
      .eq('id', especificaId)
      .single();
    expect(especificaTrasAsignar!.laptop_asignada_id).toBe(laptopFaltaPartesId);

    const { data: laptopParteEspecifica } = await admin
      .from('laptop_partes')
      .select('costo_aplicado, parte_especifica_id')
      .eq('laptop_id', laptopFaltaPartesId)
      .eq('parte_especifica_id', especificaId)
      .single();
    expect(laptopParteEspecifica!.parte_especifica_id).toBe(especificaId);
    expect(Number(laptopParteEspecifica!.costo_aplicado)).toBe(0);

    // Reasignar una específica ya asignada debe ser rechazado por el RPC (confirmado
    // manualmente en el contenedor desechable). La UI ya ni siquiera ofrece el botón
    // "Asignar a laptop" una vez asignada (EspecificasTab: `!e.laptopAsignadaId`), así que
    // este camino solo es alcanzable llamando al RPC directamente.
    const { error: errorReasignar } = await admin.rpc('instalar_parte', {
      p_laptop_id: laptopDonanteId,
      p_especifica_id: especificaId,
    });
    expect(errorReasignar).not.toBeNull();
    expect(errorReasignar!.message).toMatch(/ya está asignada/i);

    const { data: especificaSinCambios } = await admin
      .from('partes_especificas')
      .select('laptop_asignada_id')
      .eq('id', especificaId)
      .single();
    expect(especificaSinCambios!.laptop_asignada_id).toBe(laptopFaltaPartesId);
  });
});
