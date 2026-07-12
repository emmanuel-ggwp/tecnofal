// Specs del plan-08: cálculo en vivo (verificado contra @tecnofal/core, no aproximado),
// guardar evaluación y convertir en lote.
import { expect, test, type Page } from '@playwright/test';
import {
  evaluar,
  lineasDeCompra,
  PARAMETROS_DEFAULT,
  type AjustesConfig,
  type CompraDatos,
  type CpuTipo,
  type EntradaEvaluacion,
  type ListingGuardar,
  type Parametros,
  type PrecioIdeal,
} from '@tecnofal/core';
import { clienteAdmin, comoUsuario } from './helpers/db';

const DINERO = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' });
function fmt(v: number | null): string {
  return v == null || Number.isNaN(v) ? '—' : DINERO.format(v);
}

/** snake_case → camelCase (mismo mapeo que src/data/calculadora.ts). */
function aCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Carga la config REAL del usuario e2e (parametros/precios_ideales/ajustes_config) vía
 * service_role, en vez de asumir que coincide con PARAMETROS_DEFAULT/*_SEMILLA del core:
 * el usuario e2e es compartido por todas las specs del Grupo B, así que otro dominio
 * (p.ej. plan-02-configuracion) puede haber modificado sus parámetros. Sin esto, comparar
 * contra `evaluar()` con constantes hardcodeadas produce falsos negativos por contaminación
 * cruzada, no por un bug de la calculadora.
 */
async function cargarConfigReal(): Promise<{ parametros: Parametros; precios: PrecioIdeal[]; ajustes: AjustesConfig }> {
  const userId = await comoUsuario();
  const admin = clienteAdmin();
  const [pRes, prRes, aRes] = await Promise.all([
    admin.from('parametros').select('clave, valor').eq('user_id', userId),
    admin.from('precios_ideales').select('cpu_tipo, gen_desde, gen_hasta, precio_base').eq('user_id', userId),
    admin.from('ajustes_config').select('clave, delta').eq('user_id', userId),
  ]);
  const parametros: Parametros = { ...PARAMETROS_DEFAULT };
  for (const fila of pRes.data ?? []) {
    const campo = aCamel(fila.clave) as keyof Parametros;
    if (campo in parametros && fila.valor != null) {
      (parametros as unknown as Record<string, number>)[campo] = Number(fila.valor);
    }
  }
  const precios: PrecioIdeal[] = (prRes.data ?? []).map((r) => ({
    cpuTipo: r.cpu_tipo as CpuTipo,
    genDesde: r.gen_desde,
    genHasta: r.gen_hasta,
    precioBase: Number(r.precio_base),
  }));
  const ajustes: AjustesConfig = {};
  for (const r of aRes.data ?? []) ajustes[r.clave] = Number(r.delta);
  return { parametros, precios, ajustes };
}

async function irACalculadora(page: Page) {
  await page.goto('/calculadora');
  await expect(page.getByLabel('Precio subasta')).toBeVisible();
}

async function elegirOrigen(page: Page, origen: 'ebay' | 'local') {
  await page.getByRole('radio', { name: origen === 'ebay' ? 'eBay' : 'Local' }).check();
}

test.describe('cálculo en vivo', () => {
  test('caso verde eBay: costo y margen coinciden con el motor', async ({ page }) => {
    const { parametros, precios, ajustes } = await cargarConfigReal();
    await irACalculadora(page);
    await page.getByLabel('Precio subasta').fill('100');
    await page.getByLabel('Envío USA').fill('20');
    await page.getByLabel('Método').selectOption('barco');
    await page.getByLabel('Envío Vzla por unidad').fill('12');
    await page.getByLabel('CPU tipo').selectOption('i5');
    await page.getByLabel('Generación CPU').fill('8');
    await page.getByLabel('RAM (GB)').fill('8');
    await page.getByLabel('SSD (GB)').fill('256');
    await page.getByLabel('Pantalla (pulgadas)').fill('14');

    const entrada: EntradaEvaluacion = {
      origen: 'ebay',
      precioSubasta: 100,
      envioUsa: 20,
      extrasPartes: 0,
      deducciones: 0,
      metodo: 'barco',
      envioVzlaPorUnidad: 12,
      volumenPie3: 0,
      pesoKg: 0,
      cantidadLaptops: 1,
      cpuTipo: 'i5',
      cpuGen: 8,
      ramGb: 8,
      ssdGb: 256,
      pantallaPulgadas: 14,
      pantallaTactil: false,
      bloqueado: false,
    };
    const esperado = evaluar(entrada, parametros, precios, ajustes);

    // costo = ((120×1)×(1+comisionZinliEstimada)×impuestoEbay) + valorDeclarado×tasaSeguro
    //         + envioVzla + costoRevision, con los parámetros REALES del usuario e2e.
    const base = 120;
    const conZinli = base * (1 + parametros.comisionZinliEstimada);
    const conEbay = conZinli * parametros.impuestoEbay;
    const seguro = base * parametros.seguroValorDeclarado;
    expect(esperado.cadena.total).toBeCloseTo(conEbay + seguro + 12 + parametros.costoRevision, 6);

    await expect(page.getByRole('cell', { name: fmt(esperado.cadena.total), exact: true })).toBeVisible();
    await expect(page.getByTestId('valor-esperado-total')).toContainText(fmt(esperado.valorEsperado));
    await expect(page.getByTestId('margen')).toContainText(`${(esperado.margen! * 100).toFixed(1)}%`);
    await expect(page.getByTestId('semaforo')).toContainText(esperado.semaforo ?? '—');
    await expect(page.getByTestId('s-decente-max')).toContainText(fmt(esperado.sDecente));
    await expect(page.getByTestId('s-decente-max')).toContainText(fmt(esperado.sMax));
  });

  test('modo local: cadena corta (sin Zinli/eBay/seguro)', async ({ page }) => {
    const { parametros, precios, ajustes } = await cargarConfigReal();
    await irACalculadora(page);
    await elegirOrigen(page, 'local');
    await page.getByLabel('Precio compra').fill('150');
    await page.getByLabel('Flete nacional').fill('10');

    const entrada: EntradaEvaluacion = {
      origen: 'local',
      fleteNacional: 10,
      precioSubasta: 150,
      envioUsa: 0,
      extrasPartes: 0,
      deducciones: 0,
      metodo: 'barco',
      volumenPie3: 0,
      pesoKg: 0,
      cantidadLaptops: 1,
      cpuTipo: null,
      cpuGen: null,
      ramGb: null,
      ssdGb: null,
      pantallaPulgadas: null,
      pantallaTactil: false,
      bloqueado: false,
    };
    const esperado = evaluar(entrada, parametros, precios, ajustes);
    expect(esperado.cadena.total).toBeCloseTo(150 + 10 + parametros.costoRevision, 6);
    expect(esperado.cadena.conZinli).toBe(esperado.cadena.base);
    expect(esperado.cadena.conEbay).toBe(esperado.cadena.base);
    expect(esperado.cadena.seguro).toBe(0);

    // "cadena corta": no aparecen las filas de Zinli/impuesto eBay/seguro.
    await expect(page.getByRole('cell', { name: 'Con Zinli' })).toHaveCount(0);
    await expect(page.getByRole('cell', { name: 'Con impuesto eBay' })).toHaveCount(0);
    await expect(page.getByRole('cell', { name: 'Seguro' })).toHaveCount(0);
    await expect(page.getByRole('cell', { name: 'Flete nacional' })).toBeVisible();
    await expect(page.getByRole('cell', { name: fmt(esperado.cadena.total), exact: true })).toBeVisible();
  });

  test('lote mixto (buckets de pantalla): valor esperado por unidad no es uniforme', async ({ page }) => {
    const { parametros, precios, ajustes } = await cargarConfigReal();
    await irACalculadora(page);
    await page.getByLabel('Precio subasta').fill('100');
    await page.getByLabel('Envío USA').fill('0');
    await page.getByLabel('CPU tipo').selectOption('i5');
    await page.getByLabel('Generación CPU').fill('8');
    await page.getByLabel('RAM (GB)').fill('8');
    await page.getByLabel('SSD (GB)').fill('256');
    await page.getByLabel('Cantidad de laptops').fill('3');
    await expect(page.getByTestId('buckets-pantalla')).toBeVisible();
    await page.getByLabel('15.6"').fill('2');
    await page.getByLabel('14"').fill('1');

    const entrada: EntradaEvaluacion = {
      origen: 'ebay',
      precioSubasta: 100,
      envioUsa: 0,
      extrasPartes: 0,
      deducciones: 0,
      metodo: 'barco',
      envioVzlaPorUnidad: parametros.envioVzlaPorLaptop,
      volumenPie3: 0,
      pesoKg: 0,
      cantidadLaptops: 3,
      cpuTipo: 'i5',
      cpuGen: 8,
      ramGb: 8,
      ssdGb: 256,
      pantallaPulgadas: 14,
      pantallas: [{ pulgadas: 15.6, cantidad: 2 }, { pulgadas: 14, cantidad: 1 }],
      pantallaTactil: false,
      bloqueado: false,
    };
    const esperado = evaluar(entrada, parametros, precios, ajustes);

    // el lote es mixto: el valor por unidad no coincide con total/n de forma "plana" uniforme
    // salvo que se recalcule con los mismos pesos — comprobamos igualdad exacta contra el motor.
    expect(esperado.valorEsperadoUnidad).toBeCloseTo(esperado.valorEsperado! / 3, 6);
    // pero el total en sí refleja el ajuste de pantalla_grande (15.6") en 2 de las 3 unidades,
    // distinto de asumir las 3 a 14" (base).
    const uniformeTodoA14 = (esperado.precioBase ?? 0) * 3 - entrada.deducciones;
    expect(esperado.valorEsperado).not.toBeCloseTo(uniformeTodoA14, 6);

    await expect(page.getByTestId('valor-esperado-total')).toContainText(fmt(esperado.valorEsperado));
    await expect(page.getByTestId('valor-esperado-unidad')).toContainText(fmt(esperado.valorEsperadoUnidad));
  });
});

test.describe('guardar evaluación', () => {
  const idsCreados: string[] = [];

  test.afterEach(async () => {
    if (idsCreados.length === 0) return;
    await clienteAdmin().from('listings').delete().in('id', idsCreados);
    idsCreados.length = 0;
  });

  test('guarda una fila en listings con estado evaluado y totales', async ({ page }) => {
    const { parametros } = await cargarConfigReal();
    await irACalculadora(page);
    const titulo = `Calc test ${Date.now()}`;
    await page.getByLabel('Precio subasta').fill('100');
    await page.getByLabel('Envío USA').fill('20');
    await page.getByLabel('Envío Vzla por unidad').fill('12');
    await page.getByLabel('CPU tipo').selectOption('i5');
    await page.getByLabel('Generación CPU').fill('8');
    await page.getByLabel('RAM (GB)').fill('8');
    await page.getByLabel('SSD (GB)').fill('256');
    await page.getByLabel('Título').fill(titulo);

    await page.getByRole('button', { name: 'Guardar evaluación' }).click();
    await expect(page.getByTestId('toast')).toContainText('guardad');

    const userId = await comoUsuario();
    const { data, error } = await clienteAdmin()
      .from('listings')
      .select('id, estado, titulo, costo_estimado_total, valor_esperado_total, ebay_item_id')
      .eq('user_id', userId)
      .eq('titulo', titulo)
      .single();
    expect(error).toBeNull();
    expect(data?.estado).toBe('evaluado');
    expect(data?.ebay_item_id).toMatch(/^calc-/);
    const conEbay = (100 + 20) * (1 + parametros.comisionZinliEstimada) * parametros.impuestoEbay;
    const seguro = 120 * parametros.seguroValorDeclarado;
    expect(Number(data?.costo_estimado_total)).toBeCloseTo(conEbay + seguro + 12 + parametros.costoRevision, 6);
    if (data?.id) idsCreados.push(data.id as string);
  });
});

test.describe('convertir en lote', () => {
  const lotesCreados: string[] = [];

  test.afterEach(async () => {
    if (lotesCreados.length === 0) return;
    const admin = clienteAdmin();
    for (const loteId of lotesCreados) {
      await admin.from('laptops').delete().eq('lote_id', loteId);
      await admin.from('costo_lineas').delete().eq('ambito', 'lote').eq('ambito_id', loteId);
      await admin.from('lotes').delete().eq('id', loteId);
    }
    lotesCreados.length = 0;
  });

  test('eBay: lote con líneas congeladas (ninguna en 0) y 3 laptops comprada', async ({ page }) => {
    const { parametros, precios, ajustes } = await cargarConfigReal();
    await irACalculadora(page);
    await page.getByLabel('Precio subasta').fill('100');
    await page.getByLabel('Envío USA').fill('20');
    await page.getByLabel('CPU tipo').selectOption('i5');
    await page.getByLabel('Generación CPU').fill('8');
    await page.getByLabel('RAM (GB)').fill('8');
    await page.getByLabel('SSD (GB)').fill('256');
    await page.getByLabel('Cantidad de laptops').fill('3');

    await page.getByRole('button', { name: 'Convertir en lote' }).click();
    await page.getByRole('button', { name: 'Confirmar conversión' }).click();
    await expect(page.getByTestId('lote-creado')).toBeVisible();

    // Réplica exacta de lo que crearLote() manda al RPC: reusamos lineasDeCompra() (el mismo
    // helper de @tecnofal/core que usa src/data/calculadora.ts, sin duplicar su fórmula) para
    // derivar los montos esperados por tipo — así detectamos líneas faltantes/sobrantes y
    // montos incorrectos, no solo "algo distinto de 0". No se llenó "Envío Vzla por unidad":
    // el form la precarga con parametros.envioVzlaPorLaptop al cargar la config.
    const entrada: EntradaEvaluacion = {
      origen: 'ebay',
      precioSubasta: 100,
      envioUsa: 20,
      extrasPartes: 0,
      deducciones: 0,
      metodo: 'barco',
      envioVzlaPorUnidad: parametros.envioVzlaPorLaptop,
      volumenPie3: 0,
      pesoKg: 0,
      cantidadLaptops: 3,
      cpuTipo: 'i5',
      cpuGen: 8,
      ramGb: 8,
      ssdGb: 256,
      pantallaPulgadas: 14,
      pantallaTactil: false,
      bloqueado: false,
    };
    const resultado = evaluar(entrada, parametros, precios, ajustes);
    const compra: CompraDatos = {
      listing: { precioVisto: entrada.precioSubasta } as unknown as ListingGuardar,
      envioUsa: entrada.envioUsa,
      cantidad: entrada.cantidadLaptops,
      metodo: entrada.metodo,
      faltantes: [],
      modeloId: null,
      cpuTipo: entrada.cpuTipo,
      cpuGen: entrada.cpuGen,
      ramGb: entrada.ramGb,
      ssdGb: entrada.ssdGb,
      pantallaPulgadas: entrada.pantallaPulgadas,
      pantallaTactil: entrada.pantallaTactil,
      valorEsperado: resultado.valorEsperado,
      cadena: resultado.cadena,
    };
    const lineasEsperadas = lineasDeCompra(compra, 'x', new Date().toISOString());

    const userId = await comoUsuario();
    const admin = clienteAdmin();
    const { data: lote, error: eLote } = await admin
      .from('lotes')
      .select('id, origen, precio_subasta, envio_usa, metodo_estimado, costo_proyectado_total')
      .eq('user_id', userId)
      .eq('precio_subasta', 100)
      .eq('envio_usa', 20)
      .order('fecha_compra', { ascending: false })
      .limit(1)
      .single();
    expect(eLote).toBeNull();
    expect(lote?.origen).toBe('ebay');
    // migración 0023: el trigger sincroniza lotes.precio_subasta/envio_usa desde costo_lineas
    // (tipos 'subasta'/'envio_usa') — deben seguir reflejando lo ingresado, no solo el valor
    // que ya presupone el filtro de arriba.
    expect(Number(lote?.envio_usa)).toBeCloseTo(20, 6);
    expect(Number(lote?.costo_proyectado_total)).toBeCloseTo(resultado.cadena.total, 6);
    const loteId = lote?.id as string;
    lotesCreados.push(loteId);

    const { data: lineas } = await admin.from('costo_lineas').select('tipo, monto_estimado, estimado_congelado_at').eq('ambito', 'lote').eq('ambito_id', loteId);
    const montoPorTipo = new Map((lineas ?? []).map((l) => [l.tipo, Number(l.monto_estimado)]));
    expect(montoPorTipo.size).toBe(lineasEsperadas.length);
    for (const le of lineasEsperadas) {
      expect(montoPorTipo.get(le.tipo)).toBeCloseTo(le.monto_estimado, 6);
    }
    for (const l of lineas ?? []) expect(l.estimado_congelado_at).not.toBeNull();

    const { data: laptops } = await admin.from('laptops').select('estado').eq('lote_id', loteId);
    expect(laptops?.length).toBe(3);
    for (const l of laptops ?? []) expect(l.estado).toBe('comprada');
  });

  test('local: laptops en_revision y línea flete_nacional', async ({ page }) => {
    const { parametros, precios, ajustes } = await cargarConfigReal();
    await irACalculadora(page);
    await elegirOrigen(page, 'local');
    await page.getByLabel('Precio compra').fill('150');
    await page.getByLabel('Flete nacional').fill('10');
    await page.getByLabel('Cantidad de laptops').fill('2');

    await page.getByRole('button', { name: 'Convertir en lote' }).click();
    await page.getByRole('button', { name: 'Confirmar conversión' }).click();
    await expect(page.getByTestId('lote-creado')).toBeVisible();

    const entrada: EntradaEvaluacion = {
      origen: 'local',
      fleteNacional: 10,
      precioSubasta: 150,
      envioUsa: 0,
      extrasPartes: 0,
      deducciones: 0,
      metodo: 'barco',
      volumenPie3: 0,
      pesoKg: 0,
      cantidadLaptops: 2,
      cpuTipo: null,
      cpuGen: null,
      ramGb: null,
      ssdGb: null,
      pantallaPulgadas: null,
      pantallaTactil: false,
      bloqueado: false,
    };
    const resultado = evaluar(entrada, parametros, precios, ajustes);
    const compra: CompraDatos = {
      listing: { precioVisto: entrada.precioSubasta } as unknown as ListingGuardar,
      envioUsa: 0,
      cantidad: entrada.cantidadLaptops,
      metodo: entrada.metodo,
      faltantes: [],
      modeloId: null,
      cpuTipo: entrada.cpuTipo,
      cpuGen: entrada.cpuGen,
      ramGb: entrada.ramGb,
      ssdGb: entrada.ssdGb,
      pantallaPulgadas: entrada.pantallaPulgadas,
      pantallaTactil: entrada.pantallaTactil,
      valorEsperado: resultado.valorEsperado,
      cadena: resultado.cadena,
    };
    // mismo remapeo que crearLote(): en modo local, cadenaCostos() reutiliza el campo
    // envioVzla para el flete nacional, así que lineasDeCompra() emite tipo 'envio_vzla' y
    // calculadora.ts lo remapea a 'flete_nacional' antes de mandarlo al RPC.
    const lineasEsperadas = lineasDeCompra(compra, 'x', new Date().toISOString()).map((l) =>
      l.tipo === 'envio_vzla' ? { ...l, tipo: 'flete_nacional' } : l,
    );

    const userId = await comoUsuario();
    const admin = clienteAdmin();
    const { data: lote, error: eLote } = await admin
      .from('lotes')
      .select('id, origen, metodo_estimado, envio_usa, costo_proyectado_total')
      .eq('user_id', userId)
      .eq('precio_subasta', 150)
      .order('fecha_compra', { ascending: false })
      .limit(1)
      .single();
    expect(eLote).toBeNull();
    expect(lote?.origen).toBe('local');
    expect(lote?.metodo_estimado).toBeNull();
    // en modo local crearLote() fuerza envioUsa a 0 — no hay línea 'envio_usa' que el trigger
    // de la migración 0023 pueda sincronizar, así que la columna debe quedar en su default.
    expect(Number(lote?.envio_usa)).toBe(0);
    expect(Number(lote?.costo_proyectado_total)).toBeCloseTo(resultado.cadena.total, 6);
    const loteId = lote?.id as string;
    lotesCreados.push(loteId);

    const { data: lineas } = await admin.from('costo_lineas').select('tipo, monto_estimado').eq('ambito', 'lote').eq('ambito_id', loteId);
    const tipos = (lineas ?? []).map((l) => l.tipo);
    expect(tipos).toContain('flete_nacional');
    expect(tipos).not.toContain('envio_vzla');
    expect(tipos).not.toContain('seguro');
    expect(tipos).not.toContain('impuesto_ebay');
    const montoPorTipo = new Map((lineas ?? []).map((l) => [l.tipo, Number(l.monto_estimado)]));
    expect(montoPorTipo.size).toBe(lineasEsperadas.length);
    for (const le of lineasEsperadas) {
      expect(montoPorTipo.get(le.tipo)).toBeCloseTo(le.monto_estimado, 6);
    }

    const { data: laptops } = await admin.from('laptops').select('estado').eq('lote_id', loteId);
    expect(laptops?.length).toBe(2);
    for (const l of laptops ?? []) expect(l.estado).toBe('en_revision');
  });

  test('lote mixto: pantalla_pulgadas asignada por unidad (buckets)', async ({ page }) => {
    await irACalculadora(page);
    await page.getByLabel('Precio subasta').fill('133');
    await page.getByLabel('Envío USA').fill('0');
    await page.getByLabel('CPU tipo').selectOption('i5');
    await page.getByLabel('Generación CPU').fill('8');
    await page.getByLabel('RAM (GB)').fill('8');
    await page.getByLabel('SSD (GB)').fill('256');
    await page.getByLabel('Cantidad de laptops').fill('3');
    await expect(page.getByTestId('buckets-pantalla')).toBeVisible();
    await page.getByLabel('15.6"').fill('2');
    await page.getByLabel('14"').fill('1');

    await page.getByRole('button', { name: 'Convertir en lote' }).click();
    await page.getByRole('button', { name: 'Confirmar conversión' }).click();
    await expect(page.getByTestId('lote-creado')).toBeVisible();

    const userId = await comoUsuario();
    const admin = clienteAdmin();
    const { data: lote, error: eLote } = await admin
      .from('lotes')
      .select('id')
      .eq('user_id', userId)
      .eq('precio_subasta', 133)
      .order('fecha_compra', { ascending: false })
      .limit(1)
      .single();
    expect(eLote).toBeNull();
    const loteId = lote?.id as string;
    lotesCreados.push(loteId);

    // el lote es mixto (2×15.6" + 1×14"): crearLote() asigna pantalla_pulgadas por unidad
    // según los buckets, no un único valor para las 3 laptops. El describe "cálculo en vivo"
    // solo verificaba el valor esperado en pantalla — esto cubre la conversión real a filas.
    const { data: laptops } = await admin.from('laptops').select('pantalla_pulgadas, estado').eq('lote_id', loteId);
    expect(laptops?.length).toBe(3);
    const pulgadas = (laptops ?? []).map((l) => Number(l.pantalla_pulgadas)).sort((a, b) => a - b);
    expect(pulgadas).toEqual([14, 15.6, 15.6]);
    for (const l of laptops ?? []) expect(l.estado).toBe('comprada');
  });
});
