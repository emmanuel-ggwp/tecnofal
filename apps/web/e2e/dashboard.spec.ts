// Specs del plan-09 (Dashboard). Autocontenidas: cada test siembra su propio "mini-negocio"
// con nombres/alias únicos (sufijo aleatorio) y limpia todo al terminar — el usuario e2e es
// compartido con las demás specs del Grupo B, así que NUNCA se asumen totales absolutos:
// se lee el estado REAL de las vistas antes de sembrar (línea base) y se compara la
// diferencia esperada (línea base + delta conocido), tal como exige la Bitácora del plan.
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { clienteAdmin, comoUsuario } from './helpers/db';

function slug(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function leerValor(page: Page, testid: string): Promise<number> {
  const attr = await page.getByTestId(testid).getAttribute('data-valor');
  return attr == null || attr === '' ? Number.NaN : Number(attr);
}

test('dashboard: cifras de un mini-negocio sembrado cuadran con las vistas (delta sobre la línea base)', async ({
  page,
}) => {
  const admin = clienteAdmin();
  const userId = await comoUsuario();
  const sufijo = randomUUID().slice(0, 8);
  const hoy = new Date().toISOString().slice(0, 10);

  const nombreBinance = `E2E Dash Binance ${sufijo}`;
  const nombreBs = `E2E Dash Bs ${sufijo}`;
  const slugBinance = slug(nombreBinance);
  const slugBs = slug(nombreBs);

  // ---------- línea base (ANTES de sembrar nada) ----------
  await page.goto('/');
  await expect(page.getByTestId('card-ganancia-bruta')).toBeVisible();

  const base = {
    gananciaBruta: await leerValor(page, 'card-ganancia-bruta'),
    gananciaNeta: await leerValor(page, 'card-ganancia-neta'),
    totalInvertido: await leerValor(page, 'card-total-invertido'),
    valorInventario: await leerValor(page, 'card-valor-inventario'),
    porCobrar: await leerValor(page, 'card-por-cobrar'),
    resultadoMes: await leerValor(page, 'resultado-cambiario-mes'),
    resultadoTotal: await leerValor(page, 'resultado-cambiario-total'),
    listaParaVenta: await leerValor(page, 'chip-estado-lista_para_venta'),
    vendida: await leerValor(page, 'chip-estado-vendida'),
  };

  async function crear<T = { id: string }>(tabla: string, valores: Record<string, unknown>): Promise<T> {
    const { data, error } = await admin.from(tabla).insert(valores).select().single();
    if (error) throw new Error(`No se pudo crear en ${tabla}: ${error.message}`);
    return data as T;
  }

  let tasaOriginal: number | null = null;
  let huboTasaOriginal = false;

  try {
    // ---------- sembrado del mini-negocio ----------
    const lote = await crear<{ id: string }>('lotes', {
      user_id: userId,
      precio_subasta: 300,
      envio_usa: 0,
    });

    const laptopA = await crear<{ id: string }>('laptops', {
      user_id: userId,
      lote_id: lote.id,
      service_tag: `E2EDASHA${sufijo}`,
      cpu_tipo: 'i5',
      cpu_gen: 10,
      ram_gb: 8,
      ssd_gb: 256,
      pantalla_pulgadas: 14,
      estado: 'lista_para_venta',
    });
    const laptopB = await crear<{ id: string }>('laptops', {
      user_id: userId,
      lote_id: lote.id,
      service_tag: `E2EDASHB${sufijo}`,
      cpu_tipo: 'i5',
      cpu_gen: 10,
      ram_gb: 8,
      ssd_gb: 256,
      pantalla_pulgadas: 14,
      estado: 'vendida',
    });

    const { error: eReparto } = await admin.from('lote_reparto').insert([
      { lote_id: lote.id, laptop_id: laptopA.id, user_id: userId, valor_esperado_al_comprar: 150, proporcion: 0.5, costo_asignado: 150 },
      { lote_id: lote.id, laptop_id: laptopB.id, user_id: userId, valor_esperado_al_comprar: 150, proporcion: 0.5, costo_asignado: 150 },
    ]);
    if (eReparto) throw new Error(`No se pudo crear lote_reparto: ${eReparto.message}`);

    const comprador = await crear<{ id: string }>('compradores', {
      user_id: userId,
      nombre: `Comprador E2E Dash ${sufijo}`,
    });

    const venta = await crear<{ id: string }>('ventas', {
      user_id: userId,
      laptop_id: laptopB.id,
      comprador_id: comprador.id,
      fecha: hoy,
      precio_venta: 400,
      moneda: 'USD',
      estado: 'activa',
    });

    const cuentaBinance = await crear<{ id: string }>('cuentas', { user_id: userId, nombre: nombreBinance, moneda: 'USD' });
    const cuentaBs = await crear<{ id: string }>('cuentas', { user_id: userId, nombre: nombreBs, moneda: 'VES' });

    await crear('movimientos', {
      user_id: userId,
      cuenta_id: cuentaBinance.id,
      fecha: hoy,
      tipo: 'ingreso',
      monto: 400,
      categoria: 'negocio',
      venta_id: venta.id,
      concepto: 'Venta laptop E2E dashboard',
    });
    const movEgresoConv = await crear<{ id: string }>('movimientos', {
      user_id: userId,
      cuenta_id: cuentaBinance.id,
      fecha: hoy,
      tipo: 'egreso',
      monto: 100,
      categoria: 'negocio',
      concepto: 'Conversión E2E dashboard (origen)',
    });
    const movIngresoConv = await crear<{ id: string }>('movimientos', {
      user_id: userId,
      cuenta_id: cuentaBinance.id,
      fecha: hoy,
      tipo: 'ingreso',
      monto: 98,
      categoria: 'negocio',
      concepto: 'Conversión E2E dashboard (destino)',
    });
    await crear('conversiones', {
      user_id: userId,
      fecha: hoy,
      movimiento_origen_id: movEgresoConv.id,
      movimiento_destino_id: movIngresoConv.id,
      monto_origen: 100,
      monto_destino: 98,
    });
    await crear('movimientos', {
      user_id: userId,
      cuenta_id: cuentaBs.id,
      fecha: hoy,
      tipo: 'ingreso',
      monto: 6200,
      categoria: 'negocio',
      concepto: 'Fondeo E2E dashboard',
    });

    const { data: tasaExistente } = await admin
      .from('tasas_dia')
      .select('valor')
      .eq('user_id', userId)
      .eq('fecha', hoy)
      .eq('tipo', 'usdt')
      .maybeSingle();
    huboTasaOriginal = !!tasaExistente;
    tasaOriginal = tasaExistente?.valor ?? null;
    const { error: eTasa } = await admin
      .from('tasas_dia')
      .upsert({ user_id: userId, fecha: hoy, tipo: 'usdt', valor: 62 }, { onConflict: 'user_id,fecha,tipo' });
    if (eTasa) throw new Error(`No se pudo sembrar tasas_dia: ${eTasa.message}`);

    await crear('por_cobrar', {
      user_id: userId,
      persona: `E2E Dash ${sufijo}`,
      monto: 50,
      moneda: 'USD',
      estado: 'pendiente',
      abonado: 0,
    });

    // ---------- cifras esperadas, leídas de las MISMAS vistas (nunca hardcodeadas) ----------
    const { data: precioA } = await admin
      .from('v_laptop_precio_sugerido')
      .select('precio_sugerido')
      .eq('laptop_id', laptopA.id)
      .maybeSingle();
    const precioSugeridoA = precioA?.precio_sugerido ?? 0;

    const { data: costosA } = await admin
      .from('v_laptop_costos')
      .select('costo_proyectado')
      .eq('laptop_id', laptopA.id)
      .maybeSingle();
    const costoProyectadoA = costosA?.costo_proyectado ?? 0;

    const { data: costosB } = await admin
      .from('v_laptop_costos')
      .select('costo_directo, costo_final')
      .eq('laptop_id', laptopB.id)
      .maybeSingle();
    // Determinista por construcción (lote_reparto=150, sin costo_lineas de la laptop): 150.
    expect(costosB?.costo_directo).toBeCloseTo(150, 2);

    const gananciaBrutaDelta = 400 - (costosB?.costo_directo ?? 0);
    const gananciaNetaDelta = 400 - (costosB?.costo_final ?? 0);

    const esperado = {
      gananciaBruta: base.gananciaBruta + gananciaBrutaDelta,
      gananciaNeta: base.gananciaNeta + gananciaNetaDelta,
      totalInvertido: base.totalInvertido + costoProyectadoA,
      valorInventario: base.valorInventario + precioSugeridoA,
      porCobrar: base.porCobrar + 50,
      resultadoMes: base.resultadoMes + -2,
      resultadoTotal: base.resultadoTotal + -2,
      listaParaVenta: base.listaParaVenta + 1,
      vendida: base.vendida + 1,
    };

    // ---------- recargar el dashboard y comparar ----------
    await page.reload();
    await expect(page.getByTestId('card-ganancia-bruta')).toBeVisible();

    await expect
      .poll(async () => leerValor(page, 'card-ganancia-bruta'), { timeout: 15_000 })
      .toBeCloseTo(esperado.gananciaBruta, 2);
    await expect.poll(async () => leerValor(page, 'card-ganancia-neta')).toBeCloseTo(esperado.gananciaNeta, 2);
    await expect.poll(async () => leerValor(page, 'card-total-invertido')).toBeCloseTo(esperado.totalInvertido, 2);
    await expect.poll(async () => leerValor(page, 'card-valor-inventario')).toBeCloseTo(esperado.valorInventario, 2);
    await expect.poll(async () => leerValor(page, 'card-por-cobrar')).toBeCloseTo(esperado.porCobrar, 2);
    await expect
      .poll(async () => leerValor(page, 'resultado-cambiario-mes'))
      .toBeCloseTo(esperado.resultadoMes, 2);
    await expect
      .poll(async () => leerValor(page, 'resultado-cambiario-total'))
      .toBeCloseTo(esperado.resultadoTotal, 2);
    await expect
      .poll(async () => leerValor(page, 'chip-estado-lista_para_venta'))
      .toBe(esperado.listaParaVenta);
    await expect.poll(async () => leerValor(page, 'chip-estado-vendida')).toBe(esperado.vendida);

    // Colores según signo (resultado cambiario total es -2 + base, casi seguro negativo si base es 0;
    // si la base ya trae operaciones positivas podría no serlo — solo afirmamos el signo cuando es negativo).
    if (esperado.resultadoTotal < 0) {
      await expect(page.getByTestId('resultado-cambiario-total')).toHaveClass(/text-red-700/);
    }

    // ---------- saldo Bs con doble denominación (selector de tasa) ----------
    await page.getByTestId('selector-tasa').selectOption('usdt');
    await expect.poll(async () => leerValor(page, `cuenta-saldo-${slugBs}`)).toBeCloseTo(6200, 2);
    await expect.poll(async () => leerValor(page, `cuenta-saldo-usd-${slugBs}`)).toBeCloseTo(100, 2);
    // La cuenta Binance también debe existir (USD, sin doble denominación).
    await expect(page.getByTestId(`cuenta-saldo-${slugBinance}`)).toBeVisible();

    // ---------- navegación cruzada: el chip de estado enlaza a /inventario filtrado ----------
    await expect(page.getByTestId('chip-estado-vendida')).toHaveAttribute('href', '/inventario?estado=vendida');
    await page.getByTestId('chip-estado-vendida').click();
    await page.waitForURL((url) => url.pathname === '/inventario');
    expect(new URL(page.url()).searchParams.get('estado')).toBe('vendida');
  } finally {
    // ---------- limpieza (best-effort; no debe interferir con otras specs) ----------
    const { data: conv } = await admin
      .from('conversiones')
      .select('id, movimiento_origen_id, movimiento_destino_id')
      .eq('user_id', userId)
      .eq('monto_origen', 100)
      .eq('monto_destino', 98)
      .eq('fecha', hoy);
    const movIds = new Set<string>();
    for (const c of conv ?? []) {
      movIds.add(c.movimiento_origen_id);
      movIds.add(c.movimiento_destino_id);
      await admin.from('conversiones').delete().eq('id', c.id);
    }
    const { data: cuentaBinanceFila } = await admin
      .from('cuentas')
      .select('id')
      .eq('user_id', userId)
      .eq('nombre', nombreBinance)
      .maybeSingle();
    const { data: cuentaBsFila } = await admin
      .from('cuentas')
      .select('id')
      .eq('user_id', userId)
      .eq('nombre', nombreBs)
      .maybeSingle();
    if (cuentaBinanceFila) await admin.from('movimientos').delete().eq('cuenta_id', cuentaBinanceFila.id);
    if (cuentaBsFila) await admin.from('movimientos').delete().eq('cuenta_id', cuentaBsFila.id);

    await admin.from('por_cobrar').delete().eq('user_id', userId).eq('persona', `E2E Dash ${sufijo}`);

    const { data: ventasFilas } = await admin
      .from('ventas')
      .select('id, laptop_id')
      .eq('user_id', userId)
      .eq('precio_venta', 400)
      .eq('fecha', hoy);
    const laptopIds = new Set<string>();
    for (const v of ventasFilas ?? []) {
      if (v.laptop_id) laptopIds.add(v.laptop_id);
      await admin.from('ventas').delete().eq('id', v.id);
    }

    const { data: laptopsFilas } = await admin
      .from('laptops')
      .select('id, lote_id')
      .eq('user_id', userId)
      .in('service_tag', [`E2EDASHA${sufijo}`, `E2EDASHB${sufijo}`]);
    const loteIds = new Set<string>();
    for (const l of laptopsFilas ?? []) {
      if (l.lote_id) loteIds.add(l.lote_id);
      laptopIds.add(l.id);
    }

    for (const loteId of loteIds) {
      await admin.from('lote_reparto').delete().eq('lote_id', loteId);
    }
    for (const laptopId of laptopIds) {
      await admin.from('laptops').delete().eq('id', laptopId);
    }
    for (const loteId of loteIds) {
      await admin.from('lotes').delete().eq('id', loteId);
    }

    if (cuentaBinanceFila) await admin.from('cuentas').delete().eq('id', cuentaBinanceFila.id);
    if (cuentaBsFila) await admin.from('cuentas').delete().eq('id', cuentaBsFila.id);

    await admin.from('compradores').delete().eq('user_id', userId).eq('nombre', `Comprador E2E Dash ${sufijo}`);

    if (huboTasaOriginal) {
      await admin
        .from('tasas_dia')
        .update({ valor: tasaOriginal })
        .eq('user_id', userId)
        .eq('fecha', hoy)
        .eq('tipo', 'usdt');
    } else {
      await admin.from('tasas_dia').delete().eq('user_id', userId).eq('fecha', hoy).eq('tipo', 'usdt');
    }
  }
});

test('dashboard: usuario nuevo sin datos muestra ceros y no lanza errores', async ({ browser }) => {
  const admin = clienteAdmin();
  const sufijo = randomUUID().slice(0, 8);
  const email = `dash-vacio-${sufijo}@tecnofal.test`;
  const password = 'tecnofal-e2e-vacio-1234';

  const { data: creado, error: eCrear } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (eCrear || !creado.user) throw new Error(`No se pudo crear el usuario auxiliar: ${eCrear?.message}`);
  const userId = creado.user.id;

  // Contexto de navegador aparte (no contamina el storageState compartido del usuario e2e).
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const erroresConsola: string[] = [];
  page.on('pageerror', (e) => erroresConsola.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') erroresConsola.push(msg.text());
  });

  try {
    await page.goto('/login');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('complementary', { name: 'Navegación principal' })).toBeVisible();

    await expect(page.getByTestId('card-ganancia-bruta')).toBeVisible();
    for (const testid of [
      'card-total-invertido',
      'card-valor-inventario',
      'card-ganancia-bruta',
      'card-ganancia-neta',
      'card-por-cobrar',
      'card-por-pagar',
      'resultado-cambiario-mes',
      'resultado-cambiario-total',
    ]) {
      await expect(page.getByTestId(testid)).toHaveAttribute('data-valor', '0');
    }
    await expect(page.getByTestId('chip-estado-lista_para_venta')).toHaveAttribute('data-valor', '0');
    await expect(page.getByTestId('chip-estado-vendida')).toHaveAttribute('data-valor', '0');
    await expect(page.getByTestId('banner-sin-datos')).toBeVisible();

    expect(erroresConsola, `errores de consola inesperados: ${erroresConsola.join(' | ')}`).toEqual([]);
  } finally {
    await context.close();
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  }
});
