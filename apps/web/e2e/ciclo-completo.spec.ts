// Plan-10b: e2e maestro del ciclo de vida completo de un lote de laptops, enteramente por
// UI (sin seeds intermedios más allá del catálogo de partes, el usuario e2e, y UN parche de
// metadata documentado más abajo). Recorre las 12 etapas del §3 de la especificación:
// calculadora → lote → paquete → recepción → revisión física → inventario → partes → venta →
// cuentas → dashboard → garantía → dashboard, y cierra verificando a mano (no copiado de la
// UI) que ganancia_neta = precio_venta − (costo_asignado + costo_de_parte + prorrateo_paquete
// + demás costo_lineas reales de la laptop), comparado contra v_ventas_ganancia Y la UI.
//
// Nota sobre el guard de plan-10a (migración 0024_guard_congelar_reparto.sql, ya aplicada):
// el reparto se congela UNA sola vez en la Etapa 4 — el flujo normal no cambia.
//
// Corre sola (no en paralelo con otros archivos) — así lo indica el plan.
import { expect, test } from '@playwright/test';
import { clienteAdmin, comoUsuario } from './helpers/db';

const FORMATO_USD = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  currencyDisplay: 'narrowSymbol',
});

async function leerValor(page: import('@playwright/test').Page, testid: string): Promise<number> {
  const attr = await page.getByTestId(testid).getAttribute('data-valor');
  return attr == null || attr === '' ? Number.NaN : Number(attr);
}

test.describe.configure({ mode: 'serial' });

test('ciclo de vida completo: calculadora → lote → paquete → venta → garantía (invariante de ganancia al centavo)', async ({
  page,
}) => {
  // 12 etapas por UI real contra un servidor next dev (sin build de producción) exceden
  // holgadamente el timeout por defecto de 45s (plan-00, pensado para specs de un solo
  // dominio) — este es EL spec largo a propósito (§ Objetivo del plan). 3 minutos da margen
  // cómodo sin ocultar una regresión real de rendimiento.
  test.setTimeout(180_000);

  const admin = clienteAdmin();
  const userId = await comoUsuario();
  const suf = Date.now().toString();

  // ---------------------------------------------------------------------
  // IDs sembrados por el propio test (para limpieza en el finally).
  // ---------------------------------------------------------------------
  let loteId: string | undefined;
  let laptopAId: string | undefined;
  let laptopBId: string | undefined;
  let paqueteId: string | undefined;
  let parteBateriaId: string | undefined;
  let parteSsdId: string | undefined;
  let ordenId: string | undefined;
  let ventaId: string | undefined;
  let compradorNombre: string | undefined;
  let conversionId: string | undefined;
  let movOrigenConvId: string | undefined;
  let movDestinoConvId: string | undefined;

  // Cuentas de la plantilla sembrada del usuario e2e (compartidas con todo el Grupo B).
  const { data: cuentas, error: errCuentas } = await admin
    .from('cuentas')
    .select('id, nombre')
    .eq('user_id', userId);
  if (errCuentas) throw errCuentas;
  const cuentaUsdId = cuentas?.find((c) => c.nombre === 'Efectivo USD')?.id as string;
  const cuentaZinliId = cuentas?.find((c) => c.nombre === 'Zinli')?.id as string;
  const cuentaBinanceId = cuentas?.find((c) => c.nombre === 'Binance')?.id as string;
  if (!cuentaUsdId) throw new Error('No se encontró la cuenta "Efectivo USD" sembrada por la plantilla del usuario.');
  if (!cuentaZinliId) throw new Error('No se encontró la cuenta "Zinli" sembrada por la plantilla del usuario.');
  if (!cuentaBinanceId) throw new Error('No se encontró la cuenta "Binance" sembrada por la plantilla del usuario.');

  try {
    // =====================================================================
    // Etapa 1 — Calculadora: evaluar compra eBay de 2 laptops → Convertir en lote
    // RPC registrar_compra_lote (0022) → laptops 'comprada'.
    // =====================================================================
    const precioSubasta = Number((300 + (Date.now() % 900) / 1000).toFixed(2));
    const envioUsa = 20;
    await test.step('Etapa 1: Calculadora — evaluar y convertir compra eBay de 2 laptops en lote', async () => {
      await page.goto('/calculadora');
      await expect(page.getByLabel('Precio subasta')).toBeVisible();
      await page.getByLabel('Precio subasta').fill(String(precioSubasta));
      await page.getByLabel('Envío USA').fill(String(envioUsa));
      await page.getByLabel('CPU tipo').selectOption('i5');
      await page.getByLabel('Generación CPU').fill('8');
      await page.getByLabel('RAM (GB)').fill('8');
      await page.getByLabel('SSD (GB)').fill('256');
      await page.getByLabel('Pantalla (pulgadas)').fill('14');
      await page.getByLabel('Cantidad de laptops').fill('2');

      await page.getByRole('button', { name: 'Convertir en lote' }).click();
      await page.getByRole('button', { name: 'Confirmar conversión' }).click();
      await expect(page.getByTestId('lote-creado')).toBeVisible();

      const { data: lote, error: eLote } = await admin
        .from('lotes')
        .select('id, origen')
        .eq('user_id', userId)
        .eq('precio_subasta', precioSubasta)
        .eq('envio_usa', envioUsa)
        .order('fecha_compra', { ascending: false })
        .limit(1)
        .single();
      if (eLote) throw eLote;
      expect(lote!.origen).toBe('ebay');
      loteId = lote!.id as string;

      const { data: laptops, error: eLap } = await admin
        .from('laptops')
        .select('id, estado')
        .eq('lote_id', loteId)
        .order('id');
      if (eLap) throw eLap;
      expect(laptops).toHaveLength(2);
      for (const l of laptops ?? []) expect(l.estado).toBe('comprada');
      laptopAId = laptops![0].id as string;
      laptopBId = laptops![1].id as string;
    });

    // Hallazgo operativo (ver Bitácora): la Calculadora nunca pide service_tag para las
    // laptops de un lote — `alias` (columna generada de `service_tag`) queda null para
    // siempre para estas unidades, y ningún otro lugar de la web permite editarlo después.
    // Eso hace inalcanzable por UI el buscador "por alias" de InstalarModal/CosecharModal
    // (Etapa 6 necesita localizar la laptop A ahí). Único parche de metadata fuera de UI de
    // todo este spec: se le asigna un service_tag a la laptop A vía admin (equivalente a la
    // "identificación física" que ocurriría en la vida real al recibir el lote) para poder
    // seguir el resto del flujo por UI. No afecta ninguna RPC transaccional ni el invariante.
    // El sufijo 'X' final asegura que el alias (últimos 4 chars) nunca coincida por
    // casualidad con la guía del paquete u otro texto derivado del mismo timestamp `suf`.
    const serviceTagA = `E2ECC${suf}X`.slice(-10);
    const aliasA = serviceTagA.slice(-4);
    {
      const { error } = await admin.from('laptops').update({ service_tag: serviceTagA }).eq('id', laptopAId);
      if (error) throw error;
    }

    // =====================================================================
    // Etapa 2 — Lotes: crear un paquete, agregar las 2 laptops + 1 ítem personal
    // RPC agregar_item_laptop_paquete (0022) → laptops 'en_transito'.
    // =====================================================================
    const guia = `E2ECICLO${suf}`;
    await test.step('Etapa 2: Paquete — agregar las 2 laptops del lote + 1 ítem personal', async () => {
      await page.goto('/lotes/paquetes');
      await page.getByTestId('boton-nuevo-paquete').click();
      await page.getByTestId('paquete-courier').fill('E2E Ciclo Courier');
      await page.getByTestId('paquete-guia').fill(guia);
      await page.getByTestId('paquete-guardar').click();
      await expect(page.getByTestId('paquete-guardar')).not.toBeVisible();

      const { data: paquete, error: eP } = await admin
        .from('paquetes')
        .select('id')
        .eq('user_id', userId)
        .eq('guia', guia)
        .maybeSingle();
      if (eP) throw eP;
      paqueteId = paquete!.id as string;

      await page.goto(`/lotes/paquetes/${paqueteId}`);

      // Laptop A y B: mismo volumen/valor declarado (2 pie³ / $200 cada una) para que el
      // prorrateo posterior de flete/seguro sea idéntico para ambas — no afecta el invariante
      // (solo se usa el de A) pero simplifica la verificación cruzada.
      await page.getByTestId('item-laptop-select').selectOption(laptopAId!);
      await page.getByTestId('item-laptop-volumen').fill('2');
      await page.getByTestId('item-laptop-valor').fill('200');
      await page.getByTestId('item-laptop-agregar').click();
      await expect(page.getByText(aliasA)).toBeVisible();

      await page.getByTestId('item-laptop-select').selectOption(laptopBId!);
      await page.getByTestId('item-laptop-volumen').fill('2');
      await page.getByTestId('item-laptop-valor').fill('200');
      await page.getByTestId('item-laptop-agregar').click();

      await page.getByTestId('item-personal-descripcion').fill(`Regalo personal E2E ${suf}`);
      await page.getByTestId('item-personal-volumen').fill('1');
      await page.getByTestId('item-personal-valor').fill('100');
      await page.getByTestId('item-personal-agregar').click();
      await expect(page.getByText(`Regalo personal E2E ${suf}`)).toBeVisible();

      const { data: enTransito, error: eT } = await admin
        .from('laptops')
        .select('id, estado, paquete_id')
        .in('id', [laptopAId, laptopBId]);
      if (eT) throw eT;
      for (const l of enTransito ?? []) {
        expect(l.estado).toBe('en_transito');
        expect(l.paquete_id).toBe(paqueteId);
      }
    });

    // =====================================================================
    // Etapa 3 — Avanzar sub-estados del paquete en orden → "Recibido" con
    // flete/seguro/revisión reales. RPC recibir_paquete (0015) → prorrateo + laptops
    // 'en_revision'.
    // =====================================================================
    let fleteProrrateadoA = 0;
    let seguroProrrateadoA = 0;
    let revisionProrrateadoA = 0;
    await test.step('Etapa 3: Paquete — avanzar en orden y recibir con costos reales (prorrateo)', async () => {
      const secuencia = [
        'factura',
        'aduana_usa',
        'transito_internacional',
        'aduana_venezuela',
        'central_caracas',
        'transito_nacional',
        'listo_para_entregar',
      ];
      for (const estado of secuencia) {
        await page.getByTestId(`paquete-avanzar-${estado}`).click();
        await page.waitForTimeout(150);
      }
      await expect(page.getByTestId('paquete-estado-actual')).toHaveText('listo_para_entregar');

      await page.getByTestId('boton-recibido').click();
      await page.getByTestId('recibido-flete').fill('100');
      await page.getByTestId('recibido-seguro').fill('10');
      // "Revisión" real (8): desde la migración 0026_prorratear_revision (hallazgo #6 del
      // backlog, cerrado 2026-07-11), prorratear_paquete también reparte 'revision' por
      // volumen (igual que flete) y v_laptop_costos/v_ventas_ganancia lo reflejan — por eso
      // el invariante de ganancia más abajo SÍ la incluye.
      await page.getByTestId('recibido-revision').fill('8');
      await page.getByTestId('recibido-confirmar').click();
      await expect(page.getByTestId('paquete-estado-actual')).toHaveText('recibido');

      const { data: laptopsFinal, error: eF } = await admin
        .from('laptops')
        .select('id, estado')
        .in('id', [laptopAId, laptopBId]);
      if (eF) throw eF;
      for (const l of laptopsFinal ?? []) expect(l.estado).toBe('en_revision');

      const { data: itemA, error: eIA } = await admin
        .from('paquete_items')
        .select('flete_prorrateado, seguro_prorrateado, revision_prorrateado')
        .eq('paquete_id', paqueteId)
        .eq('tipo', 'laptop')
        .eq('ref_id', laptopAId)
        .single();
      if (eIA) throw eIA;
      fleteProrrateadoA = Number(itemA!.flete_prorrateado);
      seguroProrrateadoA = Number(itemA!.seguro_prorrateado);
      revisionProrrateadoA = Number(itemA!.revision_prorrateado);
      // volumen 2/5 del total (5 pie³) * 100 = 40; valor 200/500 del total ($500) * 10 = 4;
      // revisión 2/5 del total (5 pie³) * 8 = 3.2 (misma base que flete: volumen).
      expect(fleteProrrateadoA).toBeCloseTo(40, 2);
      expect(seguroProrrateadoA).toBeCloseTo(4, 2);
      expect(revisionProrrateadoA).toBeCloseTo(3.2, 2);
    });

    // =====================================================================
    // Etapa 4 — Revisión física del lote: registrar 1 batería encontrada → "Congelar
    // reparto". RPC congelar_reparto_lote (con el guard de plan-10a: se llama UNA sola vez).
    // =====================================================================
    let costoAsignadoA = 0;
    await test.step('Etapa 4: Lote — revisión física (batería encontrada) y congelar reparto', async () => {
      const nombreBateria = `E2E Bateria Ciclo ${suf}`;
      const { data: parte, error: eParte } = await admin
        .from('partes_catalogo')
        .insert({ user_id: userId, nombre: nombreBateria, valor_nominal: 5 })
        .select('id')
        .single();
      if (eParte) throw eParte;
      parteBateriaId = parte!.id as string;

      await page.goto(`/lotes/${loteId}`);
      await page.getByTestId('parte-select').selectOption(parteBateriaId);
      await page.getByTestId('parte-cantidad').fill('1');
      await page.getByTestId('parte-agregar').click();
      await expect(page.getByRole('cell', { name: nombreBateria, exact: true })).toBeVisible();

      page.once('dialog', (d) => void d.accept());
      await page.getByTestId('boton-congelar-reparto').click();
      // Único llamado a congelar en todo el test: el guard de la migración 0024 bloquea un
      // segundo intento con "ya fue congelado" — no se ejercita aquí a propósito (ya lo
      // validó plan-10a; este spec solo confirma que el flujo normal de UNA congelada sigue
      // funcionando).
      await expect(page.getByTestId('boton-congelar-reparto')).not.toBeVisible({ timeout: 10_000 });

      const { data: reparto, error: eRep } = await admin
        .from('lote_reparto')
        .select('laptop_id, costo_asignado, proporcion')
        .eq('lote_id', loteId);
      if (eRep) throw eRep;
      expect(reparto).toHaveLength(2);
      const filaA = reparto!.find((r) => r.laptop_id === laptopAId)!;
      const filaB = reparto!.find((r) => r.laptop_id === laptopBId)!;
      // Ambas laptops nacieron con specs idénticas (i5/gen8/8GB/256GB/14") → mismo
      // precio_sugerido en el momento de congelar → proporción 50/50 exacta.
      expect(Number(filaA.proporcion)).toBeCloseTo(0.5, 6);
      expect(Number(filaB.proporcion)).toBeCloseTo(0.5, 6);
      expect(Number(filaA.costo_asignado)).toBeCloseTo(Number(filaB.costo_asignado), 6);
      costoAsignadoA = Number(filaA.costo_asignado);
      expect(costoAsignadoA).toBeGreaterThan(0);
    });

    // =====================================================================
    // Etapa 5 — Inventario: laptop A recibe un detalle de condición + specs post-upgrade
    // (ram/ssd editados), y pasa a 'falta_partes' (necesita el SSD de la Etapa 6).
    // =====================================================================
    await test.step('Etapa 5: Inventario — condición + upgrade de specs, en_revision → falta_partes', async () => {
      await page.goto(`/inventario/${laptopAId}`);
      await expect(page.getByTestId('estado-chip')).toContainText('En revisión');

      await page.getByRole('button', { name: '→ Falta partes' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Confirmar' }).click();
      await expect(page.getByTestId('estado-chip')).toContainText('Falta partes');

      await page.getByLabel('RAM (GB)').fill('16');
      await page.getByLabel('SSD (GB)').fill('512');
      await page.getByRole('button', { name: 'Guardar specs' }).click();
      // cargar() reconstruye TODO el formulario (incluida la condición) tras guardar specs;
      // recargamos aquí antes de tocar la condición para no perder la escritura en carrera.
      await page.waitForTimeout(300);
      await page.reload();
      await expect(page.getByLabel('RAM (GB)')).toHaveValue('16');
      await expect(page.getByLabel('SSD (GB)')).toHaveValue('512');

      await page.getByLabel('Batería (horas)').fill('4');
      await page.getByRole('button', { name: 'Guardar condición' }).click();
      await page.waitForTimeout(300);
      await page.reload();
      await expect(page.getByLabel('Batería (horas)')).toHaveValue('4');

      const { data: laptopA, error } = await admin
        .from('laptops')
        .select('ram_gb, ssd_gb, estado')
        .eq('id', laptopAId)
        .single();
      if (error) throw error;
      expect(laptopA!.ram_gb).toBe(16);
      expect(laptopA!.ssd_gb).toBe(512);
      expect(laptopA!.estado).toBe('falta_partes');
    });

    // =====================================================================
    // Etapa 6 — Partes: comprar un SSD vía una orden (con prorrateo de envío) → recibir la
    // orden → instalar el SSD en la laptop A (RPC instalar_parte, 0022) → costo_linea tipo
    // 'parte' creada.
    // =====================================================================
    let costoParteA = 0;
    await test.step('Etapa 6: Partes — comprar SSD por orden, recibir, e instalar en la laptop A', async () => {
      const nombreSsd = `SSD 512GB Upgrade E2E ${suf}`;
      const { data: parte, error: eParte } = await admin
        .from('partes_catalogo')
        .insert({ user_id: userId, nombre: nombreSsd, precio_referencia: 60 })
        .select('id')
        .single();
      if (eParte) throw eParte;
      parteSsdId = parte!.id as string;

      const fuenteOrden = `E2E-CICLO-${suf}`;
      await page.goto('/partes');
      await page.getByRole('button', { name: 'Órdenes' }).click();
      await page.getByRole('button', { name: '+ Nueva orden' }).click();
      await page.getByLabel('Origen').fill('ebay');
      await page.getByLabel('Fuente').fill(fuenteOrden);
      await page.getByLabel('Envío USA').fill('15');
      await page.getByLabel('Fees').fill('0');
      await page.getByRole('button', { name: 'Crear orden' }).click();

      const filaOrden = page.locator('tr').filter({ hasText: fuenteOrden });
      await expect(filaOrden).toBeVisible();
      await filaOrden.getByRole('link', { name: 'Ver detalle' }).click();
      await expect(page).toHaveURL(/\/partes\/ordenes\//);
      ordenId = page.url().split('/partes/ordenes/')[1];

      await page.getByLabel('Parte a agregar').selectOption(parteSsdId);
      await page.getByLabel('Cantidad').fill('1');
      await page.getByLabel('Precio unitario').fill('60');
      await page.getByRole('button', { name: 'Agregar ítem' }).click();
      await expect(page.locator('tr').filter({ hasText: nombreSsd })).toBeVisible();

      await page.getByRole('button', { name: 'Prorratear' }).click();
      // Único ítem de la orden → recibe el 100% del envío ($15).
      await expect(page.locator('tr').filter({ hasText: nombreSsd }).locator('td').nth(3)).toHaveText(
        FORMATO_USD.format(15),
      );

      await page.getByRole('button', { name: 'Recibir' }).click();
      await expect(page.getByText('Recibida')).toBeVisible();

      const { data: stockSsd, error: eStock } = await admin
        .from('partes_stock')
        .select('cantidad, costo_promedio')
        .eq('parte_id', parteSsdId)
        .single();
      if (eStock) throw eStock;
      expect(Number(stockSsd!.cantidad)).toBe(1);
      // costo_promedio = precio_unitario(60) + prorrateo(15)/cantidad(1) = 75.
      expect(Number(stockSsd!.costo_promedio)).toBeCloseTo(75, 2);

      await page.goto('/partes');
      const filaStock = page.locator('tr').filter({ hasText: nombreSsd });
      await expect(filaStock.locator('td').nth(1)).toHaveText('1');
      await filaStock.getByRole('button', { name: 'Instalar' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByLabel('Buscar laptop por alias').fill(aliasA);
      await page.getByRole('button', { name: aliasA, exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar instalación' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      const { data: laptopParte, error: eLP } = await admin
        .from('laptop_partes')
        .select('costo_aplicado')
        .eq('laptop_id', laptopAId)
        .eq('parte_id', parteSsdId)
        .single();
      if (eLP) throw eLP;
      costoParteA = Number(laptopParte!.costo_aplicado);
      expect(costoParteA).toBeCloseTo(75, 2);

      const { data: costoLinea, error: eCL } = await admin
        .from('costo_lineas')
        .select('monto_real, tipo')
        .eq('ambito', 'laptop')
        .eq('ambito_id', laptopAId)
        .eq('tipo', 'parte')
        .single();
      if (eCL) throw eCL;
      expect(Number(costoLinea!.monto_real)).toBeCloseTo(75, 2);
    });

    // =====================================================================
    // Etapa 7 — Inventario: la laptop A pasa de 'falta_partes' a 'lista_para_venta'
    // (sugerencia de v_sugerencia_partes_completas + confirmación manual).
    // =====================================================================
    await test.step('Etapa 7: Inventario — sugerencia de partes completas y confirmación falta_partes → lista_para_venta', async () => {
      const { data: sugerencia, error: eSug } = await admin
        .from('v_sugerencia_partes_completas')
        .select('laptop_id')
        .eq('laptop_id', laptopAId)
        .maybeSingle();
      if (eSug) throw eSug;
      expect(sugerencia).not.toBeNull();

      await page.goto(`/inventario/${laptopAId}`);
      await expect(
        page.getByText('Partes completas — confirmar el paso a', { exact: false }),
      ).toBeVisible();

      await page.getByRole('button', { name: '→ Lista para venta' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Confirmar' }).click();
      await expect(page.getByTestId('estado-chip')).toContainText('Lista para venta');

      const { data: laptopA, error } = await admin.from('laptops').select('estado').eq('id', laptopAId).single();
      if (error) throw error;
      expect(laptopA!.estado).toBe('lista_para_venta');
    });

    // ---------------------------------------------------------------------
    // Valores "reales usados en cada paso" para el invariante — leídos de las tablas base
    // (nunca de v_ventas_ganancia ni de la UI) justo antes de vender, momento en que ya son
    // estables (no cambian por el resto del flujo salvo por la venta/devolución en sí).
    // ---------------------------------------------------------------------
    const { data: costosA, error: eCostosA } = await admin
      .from('v_laptop_costos')
      .select('costo_proyectado')
      .eq('laptop_id', laptopAId)
      .single();
    if (eCostosA) throw eCostosA;
    const costoProyectadoA = Number(costosA!.costo_proyectado);
    // Sanity: sin líneas 'estimado' a nivel laptop, costo_proyectado == costo_asignado puro.
    expect(costoProyectadoA).toBeCloseTo(costoAsignadoA, 2);

    const { data: precioA, error: ePrecioA } = await admin
      .from('v_laptop_precio_sugerido')
      .select('precio_sugerido')
      .eq('laptop_id', laptopAId)
      .single();
    if (ePrecioA) throw ePrecioA;
    const precioSugeridoA = Number(precioA!.precio_sugerido);

    const costoDirectoA = costoAsignadoA + costoParteA;
    const costoFinalA = costoDirectoA + fleteProrrateadoA + seguroProrrateadoA + revisionProrrateadoA;
    const precioVenta = 700;
    const gananciaBrutaA = precioVenta - costoDirectoA;
    const gananciaNetaA = precioVenta - costoFinalA;

    // ---------- baseline del dashboard justo antes de vender ----------
    await page.goto('/');
    await expect(page.getByTestId('card-ganancia-bruta')).toBeVisible();
    const base = {
      gananciaBruta: await leerValor(page, 'card-ganancia-bruta'),
      gananciaNeta: await leerValor(page, 'card-ganancia-neta'),
      totalInvertido: await leerValor(page, 'card-total-invertido'),
      valorInventario: await leerValor(page, 'card-valor-inventario'),
      resultadoMes: await leerValor(page, 'resultado-cambiario-mes'),
      resultadoTotal: await leerValor(page, 'resultado-cambiario-total'),
      listaParaVenta: await leerValor(page, 'chip-estado-lista_para_venta'),
      vendida: await leerValor(page, 'chip-estado-vendida'),
      paraRepuestos: await leerValor(page, 'chip-estado-para_repuestos'),
    };

    // =====================================================================
    // Etapa 8 — Ventas: vender la laptop A en USD. RPC registrar_venta (0014) → 'vendida'.
    // =====================================================================
    compradorNombre = `Comprador E2E Ciclo ${suf}`;
    await test.step('Etapa 8: Ventas — vender la laptop A en USD', async () => {
      await page.goto('/ventas');
      await page.getByRole('button', { name: '+ Registrar venta' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await page.getByLabel('Laptop').selectOption(laptopAId!);
      await page.getByLabel('Comprador').selectOption('__nuevo__');
      await page.getByLabel('Nombre').fill(compradorNombre!);
      await page.getByLabel('Moneda').selectOption('USD');
      await page.getByLabel('Precio (USD)').fill(String(precioVenta));
      await page.getByLabel('Cuenta destino').selectOption(cuentaUsdId);
      await page.getByRole('button', { name: 'Confirmar' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      const fila = page.locator('tr', { hasText: compradorNombre! });
      await expect(fila).toBeVisible();
      await expect(fila).toContainText(FORMATO_USD.format(gananciaBrutaA));

      const { data: venta, error } = await admin
        .from('ventas')
        .select('id, estado, precio_venta')
        .eq('laptop_id', laptopAId)
        .single();
      if (error) throw error;
      ventaId = venta.id as string;
      expect(venta.estado).toBe('activa');
      expect(Number(venta.precio_venta)).toBe(precioVenta);

      const { data: laptopA, error: eLap } = await admin.from('laptops').select('estado').eq('id', laptopAId).single();
      if (eLap) throw eLap;
      expect(laptopA!.estado).toBe('vendida');

      // Invariante contra v_ventas_ganancia (nunca contra sí misma: todos los sumandos de
      // costoDirectoA/costoFinalA se leyeron de lote_reparto/laptop_partes/paquete_items).
      const { data: ganancia, error: eGan } = await admin
        .from('v_ventas_ganancia')
        .select('costo_directo, costo_final, ganancia_bruta, ganancia_neta')
        .eq('venta_id', ventaId)
        .single();
      if (eGan) throw eGan;
      expect(Number(ganancia!.costo_directo)).toBeCloseTo(costoDirectoA, 2);
      expect(Number(ganancia!.costo_final)).toBeCloseTo(costoFinalA, 2);
      expect(Number(ganancia!.ganancia_bruta)).toBeCloseTo(gananciaBrutaA, 2);
      expect(Number(ganancia!.ganancia_neta)).toBeCloseTo(gananciaNetaA, 2);
    });

    // =====================================================================
    // Etapa 9 — Cuentas: confirmar el ingreso de la venta en la cuenta elegida; conversión
    // Zinli→Binance (modal global, Ctrl+Shift+C). RPC registrar_conversion (0016).
    // =====================================================================
    const nota = `E2E conversion ciclo ${suf}`;
    await test.step('Etapa 9: Cuentas — ingreso de la venta + conversión Zinli→Binance', async () => {
      const { data: movVenta, error: eMov } = await admin
        .from('movimientos')
        .select('tipo, monto, cuenta_id')
        .eq('venta_id', ventaId)
        .eq('tipo', 'ingreso')
        .single();
      if (eMov) throw eMov;
      expect(Number(movVenta!.monto)).toBe(precioVenta);
      expect(movVenta!.cuenta_id).toBe(cuentaUsdId);

      await page.goto('/cuentas');
      await expect(page.getByRole('complementary', { name: 'Navegación principal' })).toBeVisible();
      // El listener del atajo lo registra <ConversionRapida/> (montada en el layout) en un
      // useEffect — la visibilidad del sidebar no garantiza que ese efecto ya haya corrido
      // (hidratación en curso bajo carga). Reintenta el keypress hasta que el modal aparezca,
      // en vez de asumir que un solo intento alcanza (visto flaky en corridas reales).
      const dialogo = page.getByRole('dialog', { name: 'Conversión rápida' });
      await expect(async () => {
        await page.keyboard.press('Control+Shift+C');
        await expect(dialogo).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 15_000 });

      await page.getByLabel('Cuenta origen').selectOption(cuentaZinliId);
      await page.getByLabel('Cuenta destino').selectOption(cuentaBinanceId);
      await page.getByLabel('Monto origen').fill('100');
      await page.getByLabel('Monto destino').fill('98');
      await page.getByLabel('Nota').fill(nota);
      await expect(page.getByTestId('tasa-implicita-rapida')).toHaveText('1.0204');
      await page.getByRole('button', { name: 'Confirmar' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      const { data: conversion, error: eConv } = await admin
        .from('conversiones')
        .select('id, movimiento_origen_id, movimiento_destino_id')
        .eq('nota', nota)
        .single();
      if (eConv) throw eConv;
      conversionId = conversion.id as string;
      movOrigenConvId = conversion.movimiento_origen_id as string;
      movDestinoConvId = conversion.movimiento_destino_id as string;
    });

    // =====================================================================
    // Etapa 10 — Dashboard: TODOS los números reflejan la venta + la conversión.
    // =====================================================================
    await test.step('Etapa 10: Dashboard — refleja venta (ganancia/inventario) y conversión (resultado cambiario)', async () => {
      await page.goto('/');
      await expect(page.getByTestId('card-ganancia-bruta')).toBeVisible();

      await expect
        .poll(async () => leerValor(page, 'card-ganancia-bruta'), { timeout: 15_000 })
        .toBeCloseTo(base.gananciaBruta + gananciaBrutaA, 2);
      await expect
        .poll(async () => leerValor(page, 'card-ganancia-neta'))
        .toBeCloseTo(base.gananciaNeta + gananciaNetaA, 2);
      await expect
        .poll(async () => leerValor(page, 'card-total-invertido'))
        .toBeCloseTo(base.totalInvertido - costoProyectadoA, 2);
      await expect
        .poll(async () => leerValor(page, 'card-valor-inventario'))
        .toBeCloseTo(base.valorInventario - precioSugeridoA, 2);
      await expect
        .poll(async () => leerValor(page, 'chip-estado-lista_para_venta'))
        .toBe(base.listaParaVenta - 1);
      await expect.poll(async () => leerValor(page, 'chip-estado-vendida')).toBe(base.vendida + 1);
      await expect
        .poll(async () => leerValor(page, 'resultado-cambiario-mes'))
        .toBeCloseTo(base.resultadoMes - 2, 2);
      await expect
        .poll(async () => leerValor(page, 'resultado-cambiario-total'))
        .toBeCloseTo(base.resultadoTotal - 2, 2);
    });

    // =====================================================================
    // Etapa 11 — Ventas: devolución por garantía. RPC devolver_garantia (0014) →
    // 'para_repuestos', movimiento de egreso.
    // =====================================================================
    await test.step('Etapa 11: Ventas — devolución por garantía', async () => {
      await page.goto('/ventas');
      await page.getByRole('tab', { name: 'Garantías' }).click();
      const filaGarantia = page.locator('tr', { hasText: compradorNombre! });
      await expect(filaGarantia).toBeVisible();
      await filaGarantia.getByRole('button', { name: 'Devolución' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await expect(page.getByLabel('Monto del reembolso')).toHaveValue(String(precioVenta));
      await page.getByLabel('Cuenta de reembolso').selectOption(cuentaUsdId);
      await page.getByRole('button', { name: 'Confirmar devolución' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      const { data: venta, error } = await admin.from('ventas').select('estado').eq('id', ventaId).single();
      if (error) throw error;
      expect(venta!.estado).toBe('devuelta_garantia');

      const { data: laptopA, error: eLap } = await admin.from('laptops').select('estado').eq('id', laptopAId).single();
      if (eLap) throw eLap;
      expect(laptopA!.estado).toBe('para_repuestos');

      const { data: movs, error: eMov } = await admin
        .from('movimientos')
        .select('tipo, monto')
        .eq('venta_id', ventaId)
        .eq('tipo', 'egreso');
      if (eMov) throw eMov;
      expect(movs?.length).toBe(1);
      expect(Number(movs?.[0].monto)).toBe(precioVenta);
    });

    // =====================================================================
    // Etapa 12 — Dashboard: la ganancia revertida ya NO aparece en los acumulados.
    // =====================================================================
    await test.step('Etapa 12: Dashboard — la ganancia de la venta revertida sale de los acumulados', async () => {
      await page.goto('/');
      await expect(page.getByTestId('card-ganancia-bruta')).toBeVisible();

      await expect
        .poll(async () => leerValor(page, 'card-ganancia-bruta'), { timeout: 15_000 })
        .toBeCloseTo(base.gananciaBruta, 2);
      await expect.poll(async () => leerValor(page, 'card-ganancia-neta')).toBeCloseTo(base.gananciaNeta, 2);
      // total_invertido / valor_inventario no cambian: la laptop ya estaba excluida (vendida)
      // y para_repuestos también lo excluye.
      await expect
        .poll(async () => leerValor(page, 'card-total-invertido'))
        .toBeCloseTo(base.totalInvertido - costoProyectadoA, 2);
      await expect
        .poll(async () => leerValor(page, 'card-valor-inventario'))
        .toBeCloseTo(base.valorInventario - precioSugeridoA, 2);
      await expect.poll(async () => leerValor(page, 'chip-estado-vendida')).toBe(base.vendida);
      await expect
        .poll(async () => leerValor(page, 'chip-estado-para_repuestos'))
        .toBe(base.paraRepuestos + 1);
      // La devolución no toca resultado cambiario (no es una conversión).
      await expect
        .poll(async () => leerValor(page, 'resultado-cambiario-total'))
        .toBeCloseTo(base.resultadoTotal - 2, 2);
    });
  } finally {
    // ---------------------------------------------------------------------
    // Limpieza completa (best-effort, orden respetando FKs) — deja la base como estaba.
    // ---------------------------------------------------------------------
    if (movOrigenConvId) await admin.from('movimientos').delete().eq('id', movOrigenConvId);
    if (movDestinoConvId) await admin.from('movimientos').delete().eq('id', movDestinoConvId);
    if (conversionId) await admin.from('conversiones').delete().eq('id', conversionId);

    if (ventaId) {
      await admin.from('movimientos').delete().eq('venta_id', ventaId);
      await admin.from('ventas').delete().eq('id', ventaId);
    }
    if (compradorNombre) {
      await admin.from('compradores').delete().eq('user_id', userId).eq('nombre', compradorNombre);
    }

    if (laptopAId) {
      await admin.from('laptop_partes').delete().eq('laptop_id', laptopAId);
      await admin.from('costo_lineas').delete().eq('ambito', 'laptop').eq('ambito_id', laptopAId);
      await admin.from('laptop_condicion').delete().eq('laptop_id', laptopAId);
    }

    if (ordenId) {
      await admin.from('orden_partes_items').delete().eq('orden_id', ordenId);
      await admin.from('ordenes_partes').delete().eq('id', ordenId);
    }
    if (parteSsdId) {
      await admin.from('partes_stock').delete().eq('parte_id', parteSsdId);
      await admin.from('partes_compras').delete().eq('parte_id', parteSsdId);
      await admin.from('partes_catalogo').delete().eq('id', parteSsdId);
    }

    // IMPORTANTE (hallazgo de la primera corrida): laptops.paquete_id y lote_reparto.laptop_id
    // son FK sin ON DELETE CASCADE hacia paquetes/laptops respectivamente — hay que vaciar
    // esas referencias (lote_reparto, paquete_items) y borrar las laptops ANTES de borrar
    // paquetes/lotes, o la fila padre queda huérfana sin que el delete falle de forma
    // visible (supabase-js no lanza si no se revisa `.error`).
    if (loteId) {
      await admin.from('lote_reparto').delete().eq('lote_id', loteId);
      await admin.from('lote_partes_encontradas').delete().eq('lote_id', loteId);
    }
    if (paqueteId) {
      await admin.from('paquete_items').delete().eq('paquete_id', paqueteId);
      await admin.from('costo_lineas').delete().eq('ambito', 'paquete').eq('ambito_id', paqueteId);
    }
    if (parteBateriaId) {
      await admin.from('partes_stock').delete().eq('parte_id', parteBateriaId);
      await admin.from('partes_compras').delete().eq('parte_id', parteBateriaId);
      await admin.from('partes_catalogo').delete().eq('id', parteBateriaId);
    }

    const idsLaptops = [laptopAId, laptopBId].filter(Boolean) as string[];
    if (idsLaptops.length) await admin.from('laptops').delete().in('id', idsLaptops);

    if (paqueteId) await admin.from('paquetes').delete().eq('id', paqueteId);

    if (loteId) {
      await admin.from('costo_lineas').delete().eq('ambito', 'lote').eq('ambito_id', loteId);
      await admin.from('lotes').delete().eq('id', loteId);
    }
  }
});
