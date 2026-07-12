// Specs del plan-04 (pantalla /lotes y /lotes/paquetes). Cada test siembra y limpia sus
// propios datos vía el cliente service_role de e2e/helpers/db.ts — no depende de datos de
// otra spec. El catálogo de partes se comparte por usuario e2e: usamos nombres únicos por
// timestamp para no chocar con otras specs que también puedan tocar partes_catalogo.
import { expect, test } from '@playwright/test';
import { clienteAdmin, comoUsuario } from './helpers/db';

test.describe.configure({ mode: 'serial' });

test.describe('Lotes y paquetes', () => {
  test('alta de compra local con 1 laptop crea líneas subasta+flete_nacional sin ceros y laptop en_revision', async ({
    page,
  }) => {
    const userId = await comoUsuario();
    const admin = clienteAdmin();
    const serviceTag = `E2ELOCAL${Date.now()}`.slice(-12);
    let loteId: string | undefined;

    try {
      await page.goto('/lotes');
      await page.getByTestId('boton-nueva-compra-local').click();

      await page.getByTestId('lote-local-precio').fill('200');
      await page.getByTestId('lote-local-flete').fill('15');
      // Revisión se deja vacía a propósito: no debe crear línea en cero.
      await page.getByTestId('lote-local-laptop-0-service_tag').fill(serviceTag);
      await page.getByTestId('lote-local-laptop-0-ram_gb').fill('8');
      await page.getByTestId('lote-local-laptop-0-ssd_gb').fill('256');
      await page.getByTestId('lote-local-guardar').click();

      await expect(page.getByTestId('lote-local-guardar')).not.toBeVisible();

      // Localizar el lote recién creado por el service_tag de su laptop.
      const { data: laptop, error: errLap } = await admin
        .from('laptops')
        .select('id, lote_id, estado')
        .eq('user_id', userId)
        .eq('service_tag', serviceTag)
        .maybeSingle();
      expect(errLap).toBeNull();
      expect(laptop).not.toBeNull();
      expect(laptop!.estado).toBe('en_revision');
      loteId = laptop!.lote_id as string;
      expect(loteId).toBeTruthy();

      const { data: lineas, error: errLineas } = await admin
        .from('costo_lineas')
        .select('tipo, monto_estimado, monto_real')
        .eq('ambito', 'lote')
        .eq('ambito_id', loteId);
      expect(errLineas).toBeNull();
      const tipos = (lineas ?? []).map((l) => l.tipo).sort();
      expect(tipos).toEqual(['flete_nacional', 'subasta']);
      for (const l of lineas ?? []) {
        expect(Number(l.monto_estimado)).not.toBe(0);
        // Compra local: el dinero ya se gastó al momento del alta, así que monto_real debe
        // quedar igual al estimado (no solo el estimado congelado, como en eBay).
        expect(l.monto_real).not.toBeNull();
        expect(Number(l.monto_real)).toBe(Number(l.monto_estimado));
      }

      // El total proyectado y precio_subasta (sincronizado por el trigger de la migración 0023
      // desde costo_lineas) deben reflejar la compra completa: 200 (subasta) + 15 (flete_nacional).
      const { data: loteRow, error: errLoteRow } = await admin
        .from('lotes')
        .select('costo_proyectado_total, precio_subasta')
        .eq('id', loteId)
        .single();
      expect(errLoteRow).toBeNull();
      expect(Number(loteRow!.costo_proyectado_total)).toBe(215);
      expect(Number(loteRow!.precio_subasta)).toBe(200);

      await page.goto(`/lotes/${loteId}`);
      await expect(page.getByText('subasta')).toBeVisible();
      await expect(page.getByText('flete_nacional')).toBeVisible();
      await expect(page.getByTestId(`laptop-link-${laptop!.id}`)).toBeVisible();
    } finally {
      if (loteId) {
        await admin.from('laptops').delete().eq('lote_id', loteId);
        await admin.from('costo_lineas').delete().eq('ambito', 'lote').eq('ambito_id', loteId);
        await admin.from('lotes').delete().eq('id', loteId);
      }
    }
  });

  test('paquete: agregar laptops + ítem personal, avanzar en orden (rechaza fuera de orden), recibir y prorratear', async ({
    page,
  }) => {
    const userId = await comoUsuario();
    const admin = clienteAdmin();
    const tsPaq = Date.now();
    const tagA = `E2EPQ${tsPaq}A`;
    const tagB = `E2EPQ${tsPaq}B`;
    let paqueteId: string | undefined;
    let laptopIdA: string | undefined;
    let laptopIdB: string | undefined;

    try {
      const { data: laptops, error: errSeed } = await admin
        .from('laptops')
        .insert([
          { user_id: userId, service_tag: tagA, estado: 'comprada' },
          { user_id: userId, service_tag: tagB, estado: 'comprada' },
        ])
        .select('id, alias');
      expect(errSeed).toBeNull();
      laptopIdA = laptops![0].id as string;
      laptopIdB = laptops![1].id as string;
      const aliasA = laptops![0].alias as string;
      const aliasB = laptops![1].alias as string;

      const guia = `E2EGUIA${Date.now()}`;
      await page.goto('/lotes/paquetes');
      await page.getByTestId('boton-nuevo-paquete').click();
      await page.getByTestId('paquete-courier').fill('E2E Courier');
      await page.getByTestId('paquete-guia').fill(guia);
      await page.getByTestId('paquete-guardar').click();
      await expect(page.getByTestId('paquete-guardar')).not.toBeVisible();

      const { data: paquete, error: errPaq } = await admin
        .from('paquetes')
        .select('id')
        .eq('user_id', userId)
        .eq('guia', guia)
        .maybeSingle();
      expect(errPaq).toBeNull();
      paqueteId = paquete!.id as string;

      await page.goto(`/lotes/paquetes/${paqueteId}`);

      // Agregar 2 laptops (volúmenes 2 y 3 → total 5 pie³) + 1 ítem personal (volumen 1 → total 6).
      await page.getByTestId('item-laptop-select').selectOption(laptopIdA);
      await page.getByTestId('item-laptop-volumen').fill('2');
      await page.getByTestId('item-laptop-valor').fill('300');
      await page.getByTestId('item-laptop-agregar').click();
      await expect(page.getByText(aliasA)).toBeVisible();

      await page.getByTestId('item-laptop-select').selectOption(laptopIdB);
      await page.getByTestId('item-laptop-volumen').fill('3');
      await page.getByTestId('item-laptop-valor').fill('400');
      await page.getByTestId('item-laptop-agregar').click();
      await expect(page.getByText(aliasB)).toBeVisible();

      await page.getByTestId('item-personal-descripcion').fill('Regalo personal');
      await page.getByTestId('item-personal-volumen').fill('1');
      await page.getByTestId('item-personal-valor').fill('50');
      await page.getByTestId('item-personal-agregar').click();
      await expect(page.getByText('Regalo personal')).toBeVisible();

      // El RPC agregar_item_laptop_paquete debe haber marcado ambas laptops en_transito con
      // este paquete (antes eran 2 escrituras separadas desde el cliente: podían quedar a medias).
      const { data: enTransito, error: errTransito } = await admin
        .from('laptops')
        .select('id, estado, paquete_id')
        .in('id', [laptopIdA, laptopIdB]);
      expect(errTransito).toBeNull();
      for (const l of enTransito ?? []) {
        expect(l.estado).toBe('en_transito');
        expect(l.paquete_id).toBe(paqueteId);
      }

      // Nuevo en el RPC (no existía antes de hoy): rechaza asignar una laptop que ya está
      // en OTRO paquete. Se prueba llamando el RPC directo porque el <select> del UI ya
      // filtra las laptops disponibles y no deja reproducir este camino desde la pantalla.
      const { data: paqueteOtro, error: errPaqueteOtro } = await admin
        .from('paquetes')
        .insert({ user_id: userId, courier: 'E2E Otro Paquete', metodo: 'barco' })
        .select('id')
        .single();
      expect(errPaqueteOtro).toBeNull();
      const paqueteIdOtro = paqueteOtro!.id as string;
      try {
        const { error: errDuplicado } = await admin.rpc('agregar_item_laptop_paquete', {
          p_paquete_id: paqueteIdOtro,
          p_laptop_id: laptopIdA,
          p_volumen_pie3: 1,
          p_valor_declarado: 100,
        });
        expect(errDuplicado).not.toBeNull();
        const { data: laptopTrasRechazo, error: errTrasRechazo } = await admin
          .from('laptops')
          .select('paquete_id, estado')
          .eq('id', laptopIdA)
          .single();
        expect(errTrasRechazo).toBeNull();
        expect(laptopTrasRechazo!.paquete_id).toBe(paqueteId);
        expect(laptopTrasRechazo!.estado).toBe('en_transito');
      } finally {
        await admin.from('paquetes').delete().eq('id', paqueteIdOtro);
      }

      // Fuera de orden: generada → aduana_usa (salto de 2) debe ser rechazado.
      await page.getByTestId('paquete-avanzar-aduana_usa').click();
      await expect(page.getByTestId('paquete-error')).toBeVisible();
      const { data: tras } = await admin.from('paquetes').select('estado').eq('id', paqueteId).single();
      expect(tras!.estado).toBe('generada');
      await expect(page.getByTestId('paquete-estado-actual')).toHaveText('generada');

      // Secuencia correcta.
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
      const { data: previoRecibir } = await admin.from('paquetes').select('estado').eq('id', paqueteId).single();
      expect(previoRecibir!.estado).toBe('listo_para_entregar');

      await page.getByTestId('boton-recibido').click();
      await page.getByTestId('recibido-flete').fill('100');
      await page.getByTestId('recibido-seguro').fill('10');
      await page.getByTestId('recibido-revision').fill('0');
      await page.getByTestId('recibido-confirmar').click();
      await expect(page.getByTestId('paquete-estado-actual')).toHaveText('recibido');

      const { data: laptopsFinal, error: errFinal } = await admin
        .from('laptops')
        .select('id, estado')
        .in('id', [laptopIdA, laptopIdB]);
      expect(errFinal).toBeNull();
      for (const l of laptopsFinal ?? []) {
        expect(l.estado).toBe('en_revision');
      }

      const { data: itemsFinal, error: errItems } = await admin
        .from('paquete_items')
        .select('flete_prorrateado, seguro_prorrateado')
        .eq('paquete_id', paqueteId);
      expect(errItems).toBeNull();
      const sumaFlete = (itemsFinal ?? []).reduce((acc, i) => acc + Number(i.flete_prorrateado ?? 0), 0);
      const sumaSeguro = (itemsFinal ?? []).reduce((acc, i) => acc + Number(i.seguro_prorrateado ?? 0), 0);
      expect(Math.abs(sumaFlete - 100)).toBeLessThan(0.01);
      expect(Math.abs(sumaSeguro - 10)).toBeLessThan(0.01);

      // El prorrateo también debe verse en la UI tras recargar.
      await page.reload();
      await expect(page.getByText('Flete real:')).toBeVisible();
    } finally {
      if (paqueteId) {
        await admin.from('costo_lineas').delete().eq('ambito', 'paquete').eq('ambito_id', paqueteId);
        await admin.from('paquete_items').delete().eq('paquete_id', paqueteId);
        await admin.from('paquetes').delete().eq('id', paqueteId);
      }
      const idsLaptops = [laptopIdA, laptopIdB].filter(Boolean) as string[];
      if (idsLaptops.length) {
        await admin.from('laptops').delete().in('id', idsLaptops);
      }
    }
  });

  test('lote eBay con 2 laptops + batería encontrada: congelar reparto reparte costo−nominal y bloquea segundo intento', async ({
    page,
  }) => {
    const userId = await comoUsuario();
    const admin = clienteAdmin();
    const tsRep = Date.now();
    const tagA = `E2ERP${tsRep}A`;
    const tagB = `E2ERP${tsRep}B`;
    const nombreParte = `E2EBateria${Date.now()}`;
    let loteId: string | undefined;
    let parteId: string | undefined;
    const laptopIds: string[] = [];

    try {
      const { data: parte, error: errParte } = await admin
        .from('partes_catalogo')
        .insert({ user_id: userId, nombre: nombreParte, valor_nominal: 3 })
        .select('id')
        .single();
      expect(errParte).toBeNull();
      parteId = parte!.id as string;

      await page.goto('/lotes');
      await page.getByTestId('boton-nueva-compra-ebay').click();
      await page.getByTestId('lote-ebay-precio').fill('500');
      await page.getByTestId('lote-ebay-laptop-0-service_tag').fill(tagA);
      await page.getByTestId('lote-ebay-agregar-laptop').click();
      await page.getByTestId('lote-ebay-laptop-1-service_tag').fill(tagB);
      await page.getByTestId('lote-ebay-guardar').click();
      await expect(page.getByTestId('lote-ebay-guardar')).not.toBeVisible();

      const { data: laptops, error: errLap } = await admin
        .from('laptops')
        .select('id, lote_id')
        .eq('user_id', userId)
        .in('service_tag', [tagA, tagB]);
      expect(errLap).toBeNull();
      expect(laptops).toHaveLength(2);
      loteId = laptops![0].lote_id as string;
      laptopIds.push(...(laptops ?? []).map((l) => l.id as string));

      // El total proyectado y precio_subasta (sincronizado por el trigger de la migración 0023)
      // deben reflejar los 500 de subasta declarados en el alta eBay.
      const { data: loteRow, error: errLoteRow } = await admin
        .from('lotes')
        .select('costo_proyectado_total, precio_subasta')
        .eq('id', loteId)
        .single();
      expect(errLoteRow).toBeNull();
      expect(Number(loteRow!.costo_proyectado_total)).toBe(500);
      expect(Number(loteRow!.precio_subasta)).toBe(500);

      const { data: lineasEbay, error: errLineasEbay } = await admin
        .from('costo_lineas')
        .select('tipo, monto_estimado, monto_real')
        .eq('ambito', 'lote')
        .eq('ambito_id', loteId);
      expect(errLineasEbay).toBeNull();
      expect((lineasEbay ?? []).map((l) => l.tipo)).toEqual(['subasta']);
      expect(Number(lineasEbay![0].monto_estimado)).toBe(500);
      // eBay: solo estimado congelado — el real llega después con la recepción del paquete,
      // no debe inventarse un monto_real al momento del alta.
      expect(lineasEbay![0].monto_real).toBeNull();

      await page.goto(`/lotes/${loteId}`);
      await page.getByTestId('parte-select').selectOption(parteId);
      await page.getByTestId('parte-cantidad').fill('1');
      await page.getByTestId('parte-agregar').click();
      await expect(page.getByRole('cell', { name: nombreParte, exact: true })).toBeVisible();

      page.once('dialog', (d) => void d.accept());
      await page.getByTestId('boton-congelar-reparto').click();
      await expect(page.getByTestId('boton-congelar-reparto')).not.toBeVisible({ timeout: 10_000 });

      const { data: reparto, error: errReparto } = await admin
        .from('lote_reparto')
        .select('laptop_id, costo_asignado')
        .eq('lote_id', loteId);
      expect(errReparto).toBeNull();
      expect(reparto).toHaveLength(2);
      const suma = (reparto ?? []).reduce((acc, r) => acc + Number(r.costo_asignado), 0);
      expect(Math.abs(suma - (500 - 3))).toBeLessThan(0.01);

      // Segundo intento bloqueado por la UI: el botón de congelar ya no existe, solo la vista de lectura.
      await expect(page.getByTestId('boton-congelar-reparto')).toHaveCount(0);
      for (const l of laptopIds) {
        await expect(page.getByTestId(`fila-reparto-${l}`)).toBeVisible();
      }
    } finally {
      if (loteId) {
        await admin.from('lote_reparto').delete().eq('lote_id', loteId);
        await admin.from('lote_partes_encontradas').delete().eq('lote_id', loteId);
        await admin.from('laptops').delete().eq('lote_id', loteId);
        await admin.from('costo_lineas').delete().eq('ambito', 'lote').eq('ambito_id', loteId);
        await admin.from('lotes').delete().eq('id', loteId);
      }
      if (parteId) {
        await admin.from('partes_compras').delete().eq('parte_id', parteId);
        await admin.from('partes_catalogo').delete().eq('id', parteId);
      }
    }
  });
});
