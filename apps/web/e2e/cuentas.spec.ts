// Specs del plan-07: /cuentas (saldos, libro, movimiento manual personal/negocio),
// conversión vía el modal global (atajo Ctrl+Shift+C desde cualquier pantalla, RPC
// registrar_conversion), resultado cambiario, tasas del día, y por cobrar/por pagar con abonos.
//
// Las cuentas (Binance, Zinli, Efectivo USD, Efectivo Bs) son la plantilla sembrada del
// usuario e2e y las comparten TODOS los planes del grupo B (advertencia de config compartida).
// Por eso cada test aquí calcula su propio DELTA (saldo antes/después) en vez de asumir un
// saldo absoluto, y siembra/limpia sus propias filas (movimientos, conversión, deuda) — ningún
// test depende de mutaciones hechas por otro test de este archivo (aislamiento entre tests).
import { expect, test } from '@playwright/test';
import { clienteAdmin, comoUsuario } from './helpers/db';

const FORMATO_USD = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  currencyDisplay: 'narrowSymbol',
});

function formatoDinero(monto: number, moneda: 'USD' | 'VES') {
  return new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda, currencyDisplay: 'narrowSymbol' }).format(
    monto,
  );
}

async function saldoActual(admin: ReturnType<typeof clienteAdmin>, cuentaId: string): Promise<number> {
  const { data, error } = await admin.from('movimientos').select('tipo, monto').eq('cuenta_id', cuentaId);
  if (error) throw error;
  return (data ?? []).reduce((acc, m) => acc + (m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)), 0);
}

let userId: string;
let cuentaBinanceId: string;
let cuentaZinliId: string;
let cuentaUsdId: string;
let cuentaVesId: string;
let monedaBinance: 'USD' | 'VES';
let monedaZinli: 'USD' | 'VES';

test.describe('Cuentas', () => {
  test.beforeAll(async () => {
    const admin = clienteAdmin();
    userId = await comoUsuario();
    const { data: cuentas, error } = await admin.from('cuentas').select('id, nombre, moneda').eq('user_id', userId);
    if (error) throw error;
    const porNombre = (n: string) => cuentas?.find((c) => c.nombre === n);
    const binance = porNombre('Binance');
    const zinli = porNombre('Zinli');
    const usd = porNombre('Efectivo USD');
    const ves = porNombre('Efectivo Bs');
    if (!binance) throw new Error('No se encontró la cuenta "Binance" sembrada por la plantilla del usuario.');
    if (!zinli) throw new Error('No se encontró la cuenta "Zinli" sembrada por la plantilla del usuario.');
    if (!usd) throw new Error('No se encontró la cuenta "Efectivo USD" sembrada por la plantilla del usuario.');
    if (!ves) throw new Error('No se encontró la cuenta "Efectivo Bs" sembrada por la plantilla del usuario.');
    cuentaBinanceId = binance.id;
    cuentaZinliId = zinli.id;
    cuentaUsdId = usd.id;
    cuentaVesId = ves.id;
    monedaBinance = binance.moneda;
    monedaZinli = zinli.moneda;
  });

  test('movimiento manual ingreso $100 en Binance sube el saldo de la tarjeta en 100', async ({ page }) => {
    const admin = clienteAdmin();
    const marca = `E2E cuentas ingreso ${Date.now()}`;
    const baseline = await saldoActual(admin, cuentaBinanceId);

    try {
      await page.goto('/cuentas');
      await page.getByLabel('Cuenta', { exact: true }).selectOption(cuentaBinanceId);
      await page.getByLabel('Tipo', { exact: true }).selectOption('ingreso');
      await page.getByLabel('Monto', { exact: true }).fill('100');
      await page.getByLabel('Categoría', { exact: true }).selectOption('negocio');
      await page.getByLabel('Concepto', { exact: true }).fill(marca);
      await page.getByRole('button', { name: 'Registrar movimiento' }).click();

      const tarjeta = page.getByTestId(`saldo-${cuentaBinanceId}`);
      await expect(tarjeta).toContainText(formatoDinero(baseline + 100, monedaBinance));
    } finally {
      await admin.from('movimientos').delete().eq('cuenta_id', cuentaBinanceId).eq('concepto', marca);
    }
  });

  test('conversión Zinli→Binance 100→98 desde el modal global (atajo desde /inventario): dos movimientos, tasa 1.0204, resultado cambiario -2', async ({
    page,
  }) => {
    const admin = clienteAdmin();
    const nota = `E2E conversion ${Date.now()}`;
    const mesActual = new Date().toISOString().slice(0, 7); // YYYY-MM

    // v_resultado_cambiario expone cuenta_origen/cuenta_destino como NOMBRE (no uuid) —
    // ver Bitácora del plan (el plan no lo aclaraba).
    const { data: filasPrevias, error: errPrev } = await admin
      .from('v_resultado_cambiario')
      .select('mes, resultado')
      .eq('cuenta_origen', 'Zinli')
      .eq('cuenta_destino', 'Binance');
    if (errPrev) throw errPrev;
    const filaPrevia = (filasPrevias ?? []).find((r) => String(r.mes).startsWith(mesActual));
    const resultadoBase = filaPrevia ? Number(filaPrevia.resultado) : 0;

    let movimientoOrigenId: string | undefined;
    let movimientoDestinoId: string | undefined;
    let conversionId: string | undefined;

    try {
      await page.goto('/inventario');
      // Espera a que el layout (y con él <ConversionRapida/>, que registra el atajo) esté
      // hidratado antes de disparar el shortcut — la primera visita a la ruta puede tardar
      // en compilar/hidratar en dev. La visibilidad del sidebar no basta por sí sola (visto
      // flaky en corridas reales: el useEffect que registra el listener puede correr después),
      // así que reintenta el keypress hasta que el modal aparezca.
      await expect(page.getByRole('complementary', { name: 'Navegación principal' })).toBeVisible();
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

      const { data: conversion, error: errConv } = await admin
        .from('conversiones')
        .select('id, movimiento_origen_id, movimiento_destino_id, monto_origen, monto_destino')
        .eq('nota', nota)
        .single();
      if (errConv) throw errConv;
      conversionId = conversion.id;
      movimientoOrigenId = conversion.movimiento_origen_id;
      movimientoDestinoId = conversion.movimiento_destino_id;
      expect(Number(conversion.monto_origen)).toBe(100);
      expect(Number(conversion.monto_destino)).toBe(98);

      const { data: movs, error: errMovs } = await admin
        .from('movimientos')
        .select('id, tipo, monto, cuenta_id')
        .in('id', [movimientoOrigenId, movimientoDestinoId]);
      if (errMovs) throw errMovs;
      const movOrigen = movs?.find((m) => m.id === movimientoOrigenId);
      const movDestino = movs?.find((m) => m.id === movimientoDestinoId);
      expect(movOrigen?.tipo).toBe('egreso');
      expect(Number(movOrigen?.monto)).toBe(100);
      expect(movOrigen?.cuenta_id).toBe(cuentaZinliId);
      expect(movDestino?.tipo).toBe('ingreso');
      expect(Number(movDestino?.monto)).toBe(98);
      expect(movDestino?.cuenta_id).toBe(cuentaBinanceId);

      const { data: filaResultado, error: errRes } = await admin
        .from('v_resultado_cambiario')
        .select('mes, resultado, moneda_destino')
        .eq('cuenta_origen', 'Zinli')
        .eq('cuenta_destino', 'Binance');
      if (errRes) throw errRes;
      const filaActual = (filaResultado ?? []).find((r) => String(r.mes).startsWith(mesActual));
      expect(filaActual).toBeTruthy();
      const resultadoNuevo = Number(filaActual?.resultado);
      expect(resultadoNuevo - resultadoBase).toBeCloseTo(-2, 5);

      await page.goto('/cuentas');
      const filaTabla = page
        .getByTestId('tabla-resultado-cambiario')
        .locator('tr')
        .filter({ hasText: 'Zinli' })
        .filter({ hasText: 'Binance' })
        .first();
      await expect(filaTabla).toBeVisible();
      await expect(filaTabla).toContainText(formatoDinero(resultadoNuevo, (filaActual?.moneda_destino ?? monedaZinli) as 'USD' | 'VES'));
    } finally {
      if (conversionId) await admin.from('conversiones').delete().eq('id', conversionId);
      if (movimientoOrigenId) await admin.from('movimientos').delete().eq('id', movimientoOrigenId);
      if (movimientoDestinoId) await admin.from('movimientos').delete().eq('id', movimientoDestinoId);
    }
  });

  test('movimiento personal egreso baja el saldo y el Chip lo marca "Personal"', async ({ page }) => {
    const admin = clienteAdmin();
    const marca = `E2E cuentas personal ${Date.now()}`;
    const baseline = await saldoActual(admin, cuentaUsdId);

    try {
      await page.goto('/cuentas');
      await page.getByTestId(`saldo-${cuentaUsdId}`).click();
      await page.getByLabel('Cuenta', { exact: true }).selectOption(cuentaUsdId);
      await page.getByLabel('Tipo', { exact: true }).selectOption('egreso');
      await page.getByLabel('Monto', { exact: true }).fill('30');
      await page.getByLabel('Categoría', { exact: true }).selectOption('personal');
      await page.getByLabel('Concepto', { exact: true }).fill(marca);
      await page.getByRole('button', { name: 'Registrar movimiento' }).click();

      const tarjeta = page.getByTestId(`saldo-${cuentaUsdId}`);
      await expect(tarjeta).toContainText(formatoDinero(baseline - 30, 'USD'));

      const filaLibro = page.locator('tr', { hasText: marca });
      await expect(filaLibro).toBeVisible();
      await expect(filaLibro.getByText('Personal', { exact: true })).toBeVisible();
    } finally {
      await admin.from('movimientos').delete().eq('cuenta_id', cuentaUsdId).eq('concepto', marca);
    }
  });

  test('tasa del día usdt=62: el saldo de Efectivo Bs se muestra también en USD /62', async ({ page }) => {
    const admin = clienteAdmin();

    await page.goto('/cuentas');
    await page.getByLabel('Tipo de tasa', { exact: true }).selectOption('usdt');
    await page.getByLabel('Valor', { exact: true }).fill('62');
    await page.getByRole('button', { name: 'Registrar tasa' }).click();

    await page.getByLabel('Tasa para valorar Bs').selectOption('usdt');

    const saldoVes = await saldoActual(admin, cuentaVesId);
    const equivalenteEsperado = saldoVes / 62;

    const equivalente = page.getByTestId(`equivalente-usd-${cuentaVesId}`);
    await expect(equivalente).toContainText(formatoDinero(equivalenteEsperado, 'USD'));
  });

  test('por cobrar $50: abono de $20 -> parcial (ingreso 20), abono de $30 -> saldada', async ({ page }) => {
    const admin = clienteAdmin();
    const persona = `E2E deudor ${Date.now()}`;
    let porCobrarId: string | undefined;
    let movimientoAbono1Id: string | undefined;
    let movimientoAbono2Id: string | undefined;

    try {
      await page.goto('/cuentas');
      await page.getByRole('button', { name: '＋ Por cobrar' }).click();
      const modalAlta = page.getByRole('dialog', { name: 'Nuevo por cobrar' });
      await expect(modalAlta).toBeVisible();
      // Los campos del modal se acotan al diálogo: la sección de movimiento manual, siempre
      // montada en la misma página, también tiene campos "Monto"/"Fecha"/"Moneda"-like.
      await modalAlta.getByLabel('Persona').fill(persona);
      await modalAlta.getByLabel('Monto').fill('50');
      await modalAlta.getByLabel('Moneda').selectOption('USD');
      await modalAlta.getByRole('button', { name: 'Crear' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      const { data: creada, error: errCreada } = await admin
        .from('por_cobrar')
        .select('id')
        .eq('user_id', userId)
        .eq('persona', persona)
        .single();
      if (errCreada) throw errCreada;
      porCobrarId = creada.id;

      const fila = page.locator('tr', { hasText: persona });
      await expect(fila).toBeVisible();

      // Primer abono: $20 -> parcial.
      await fila.getByRole('button', { name: 'Abonar' }).click();
      const modalAbono1 = page.getByRole('dialog', { name: `Abonar a ${persona}` });
      await expect(modalAbono1).toBeVisible();
      await modalAbono1.getByLabel('Monto del abono').fill('20');
      await modalAbono1.getByLabel('Cuenta').selectOption(cuentaUsdId);
      await modalAbono1.getByRole('button', { name: 'Confirmar abono' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await expect(fila.getByText('Parcial', { exact: true })).toBeVisible();
      await expect(fila).toContainText(FORMATO_USD.format(20));

      const { data: mov1, error: errMov1 } = await admin
        .from('movimientos')
        .select('id, tipo, monto, cuenta_id')
        .eq('cuenta_id', cuentaUsdId)
        .eq('concepto', `Abono de ${persona}`)
        .single();
      if (errMov1) throw errMov1;
      movimientoAbono1Id = mov1.id;
      expect(mov1.tipo).toBe('ingreso');
      expect(Number(mov1.monto)).toBe(20);

      // Verifica también la fila de la deuda directamente en BD (no solo lo que pinta la UI):
      // el RPC debe haber dejado abonado=20 y estado='parcial'.
      const { data: deuda1, error: errDeuda1 } = await admin
        .from('por_cobrar')
        .select('abonado, estado')
        .eq('id', porCobrarId)
        .single();
      if (errDeuda1) throw errDeuda1;
      expect(Number(deuda1.abonado)).toBe(20);
      expect(deuda1.estado).toBe('parcial');

      // Segundo abono: $30 -> saldada (abonado total 50).
      await fila.getByRole('button', { name: 'Abonar' }).click();
      const modalAbono2 = page.getByRole('dialog', { name: `Abonar a ${persona}` });
      await expect(modalAbono2).toBeVisible();
      await modalAbono2.getByLabel('Monto del abono').fill('30');
      await modalAbono2.getByLabel('Cuenta').selectOption(cuentaUsdId);
      await modalAbono2.getByRole('button', { name: 'Confirmar abono' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await expect(fila.getByText('Saldada', { exact: true })).toBeVisible();
      await expect(fila).toContainText(FORMATO_USD.format(50));
      await expect(fila.getByRole('button', { name: 'Abonar' })).toHaveCount(0);

      const { data: movs2, error: errMovs2 } = await admin
        .from('movimientos')
        .select('id, tipo, monto')
        .eq('cuenta_id', cuentaUsdId)
        .eq('concepto', `Abono de ${persona}`);
      if (errMovs2) throw errMovs2;
      expect(movs2?.length).toBe(2);
      movimientoAbono2Id = movs2?.find((m) => Number(m.monto) === 30)?.id;
      expect(movimientoAbono2Id).toBeTruthy();

      // Y la fila de la deuda en BD debe quedar abonado=50 (monto total) y estado='saldada'.
      const { data: deuda2, error: errDeuda2 } = await admin
        .from('por_cobrar')
        .select('abonado, estado')
        .eq('id', porCobrarId)
        .single();
      if (errDeuda2) throw errDeuda2;
      expect(Number(deuda2.abonado)).toBe(50);
      expect(deuda2.estado).toBe('saldada');
    } finally {
      if (movimientoAbono1Id) await admin.from('movimientos').delete().eq('id', movimientoAbono1Id);
      if (movimientoAbono2Id) await admin.from('movimientos').delete().eq('id', movimientoAbono2Id);
      if (porCobrarId) await admin.from('por_cobrar').delete().eq('id', porCobrarId);
    }
  });

  test('por pagar $40: abono de $40 -> saldada (egreso 40, concepto "Abono a")', async ({ page }) => {
    // Cubre la rama por_pagar del RPC registrar_abono, que el test de "por cobrar" de arriba
    // no ejercita: tipo debe ser 'egreso' (no 'ingreso') y el concepto usa "Abono a" (no "Abono
    // de"). Un RPC que confundiera ambas ramas pasaría el test de por_cobrar sin problema.
    const admin = clienteAdmin();
    const persona = `E2E acreedor ${Date.now()}`;
    let porPagarId: string | undefined;
    let movimientoAbonoId: string | undefined;

    try {
      await page.goto('/cuentas');
      await page.getByRole('button', { name: '＋ Por pagar' }).click();
      const modalAlta = page.getByRole('dialog', { name: 'Nuevo por pagar' });
      await expect(modalAlta).toBeVisible();
      await modalAlta.getByLabel('Persona').fill(persona);
      await modalAlta.getByLabel('Monto').fill('40');
      await modalAlta.getByLabel('Moneda').selectOption('USD');
      await modalAlta.getByRole('button', { name: 'Crear' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      const { data: creada, error: errCreada } = await admin
        .from('por_pagar')
        .select('id')
        .eq('user_id', userId)
        .eq('persona', persona)
        .single();
      if (errCreada) throw errCreada;
      porPagarId = creada.id;

      const fila = page.locator('tr', { hasText: persona });
      await expect(fila).toBeVisible();

      await fila.getByRole('button', { name: 'Abonar' }).click();
      const modalAbono = page.getByRole('dialog', { name: `Abonar a ${persona}` });
      await expect(modalAbono).toBeVisible();
      await modalAbono.getByLabel('Monto del abono').fill('40');
      await modalAbono.getByLabel('Cuenta').selectOption(cuentaUsdId);
      await modalAbono.getByRole('button', { name: 'Confirmar abono' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await expect(fila.getByText('Saldada', { exact: true })).toBeVisible();
      await expect(fila).toContainText(FORMATO_USD.format(40));
      await expect(fila.getByRole('button', { name: 'Abonar' })).toHaveCount(0);

      const { data: mov, error: errMov } = await admin
        .from('movimientos')
        .select('id, tipo, monto, cuenta_id, concepto')
        .eq('cuenta_id', cuentaUsdId)
        .eq('concepto', `Abono a ${persona}`)
        .single();
      if (errMov) throw errMov;
      movimientoAbonoId = mov.id;
      expect(mov.tipo).toBe('egreso');
      expect(Number(mov.monto)).toBe(40);
      expect(mov.cuenta_id).toBe(cuentaUsdId);

      const { data: deuda, error: errDeuda } = await admin
        .from('por_pagar')
        .select('abonado, estado')
        .eq('id', porPagarId)
        .single();
      if (errDeuda) throw errDeuda;
      expect(Number(deuda.abonado)).toBe(40);
      expect(deuda.estado).toBe('saldada');
    } finally {
      if (movimientoAbonoId) await admin.from('movimientos').delete().eq('id', movimientoAbonoId);
      if (porPagarId) await admin.from('por_pagar').delete().eq('id', porPagarId);
    }
  });
});
