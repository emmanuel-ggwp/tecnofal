// Specs del plan-02 (pantalla /configuracion). Cada test siembra y limpia sus propios datos
// vía el cliente service_role de e2e/helpers/db.ts — no depende de datos de otra spec.
import { expect, test } from '@playwright/test';
import { clienteAdmin, comoUsuario } from './helpers/db';

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

test.describe.configure({ mode: 'serial' });

test.describe('Configuración', () => {
  test('editar ganancia_minima y persiste tras recargar', async ({ page }) => {
    await page.goto('/configuracion');

    const celda = page.getByTestId('param-valor-ganancia_minima');
    await celda.click();
    const input = page.getByTestId('param-valor-ganancia_minima');
    await input.fill('0.55');
    await input.press('Enter');

    // Vuelve a modo lectura con el valor formateado a 2 decimales.
    await expect(page.getByTestId('param-valor-ganancia_minima')).toHaveText('0.55');

    await page.reload();
    await expect(page.getByTestId('param-valor-ganancia_minima')).toHaveText('0.55');
  });

  test('crear un detalle en categoría specs, verlo agrupado, editarlo y borrarlo', async ({ page }) => {
    const userId = await comoUsuario();
    const nombre = `E2EDetalleSpecs${Date.now()}`;
    const idSlug = slug(nombre);

    try {
      await page.goto('/configuracion');

      await page.getByTestId('detalle-nuevo-nombre').fill(nombre);
      await page.getByTestId('detalle-nuevo-categoria').selectOption('specs');
      await page.getByTestId('detalle-nuevo-deduccion').fill('12.5');
      await page.getByTestId('detalle-nuevo-guardar').click();

      const grupo = page.getByTestId('detalle-grupo-specs');
      await expect(grupo).toContainText(nombre);

      const fila = page.getByTestId(`detalle-fila-${idSlug}`);
      await expect(fila).toBeVisible();

      const deduccion = page.getByTestId(`detalle-deduccion-${idSlug}`);
      await deduccion.click();
      await page.getByTestId(`detalle-deduccion-${idSlug}`).fill('20');
      await page.getByTestId(`detalle-deduccion-${idSlug}`).press('Enter');
      await expect(page.getByTestId(`detalle-deduccion-${idSlug}`)).toHaveText('20.00');

      page.once('dialog', (d) => void d.accept());
      await page.getByTestId(`detalle-borrar-${idSlug}`).click();
      await expect(page.getByTestId(`detalle-fila-${idSlug}`)).toHaveCount(0);
    } finally {
      // Red de seguridad: si la aserción falló antes del borrado en UI, limpia igual.
      await clienteAdmin().from('detalles_catalogo').delete().eq('user_id', userId).eq('nombre', nombre);
    }
  });

  test('detecta solape de precios ideales al agregar i5 12-13', async ({ page }) => {
    const userId = await comoUsuario();
    const admin = clienteAdmin();

    // Estado limpio y conocido: solo el rango "existente" i5 11-12 antes de empezar.
    await admin.from('precios_ideales').delete().eq('user_id', userId).eq('cpu_tipo', 'i5').in('gen_desde', [11, 12]);
    const { error: errSiembra } = await admin
      .from('precios_ideales')
      .insert({ user_id: userId, cpu_tipo: 'i5', gen_desde: 11, gen_hasta: 12, precio_base: 300 });
    expect(errSiembra).toBeNull();

    try {
      await page.goto('/configuracion');

      await page.getByTestId('precio-nuevo-cpu').selectOption('i5');
      await page.getByTestId('precio-nuevo-desde').fill('12');
      await page.getByTestId('precio-nuevo-hasta').fill('13');
      await page.getByTestId('precio-nuevo-base').fill('320');
      await page.getByTestId('precio-nuevo-guardar').click();

      const filaExistente = page.getByTestId('precio-fila-i5-11-12');
      const filaNueva = page.getByTestId('precio-fila-i5-12-13');
      await expect(filaNueva).toBeVisible();
      await expect(filaExistente.getByTestId('precio-advertencia')).toBeVisible();
      await expect(filaNueva.getByTestId('precio-advertencia')).toBeVisible();
    } finally {
      await admin.from('precios_ideales').delete().eq('user_id', userId).eq('cpu_tipo', 'i5').in('gen_desde', [11, 12]);
    }
  });

  test('busca "XPS 13 9360" en modelos, cambia regla a condicional y persiste', async ({ page }) => {
    const admin = clienteAdmin();
    const NOMBRE_MODELO = 'XPS 13 9360';

    // Estado conocido antes de empezar (no depender de una corrida anterior de esta misma spec).
    await admin.from('modelos').update({ regla_compra: 'normal' }).eq('modelo', NOMBRE_MODELO);

    try {
      await page.goto('/configuracion');
      await page.getByTestId('modelos-buscador').fill(NOMBRE_MODELO);

      const fila = page.locator('tr').filter({ hasText: NOMBRE_MODELO });
      await expect(fila).toHaveCount(1);
      await fila.getByTestId('modelo-regla-select').selectOption('condicional');

      await page.reload();
      await page.getByTestId('modelos-buscador').fill(NOMBRE_MODELO);
      const filaTrasRecarga = page.locator('tr').filter({ hasText: NOMBRE_MODELO });
      await expect(filaTrasRecarga.getByTestId('modelo-regla-select')).toHaveValue('condicional');
    } finally {
      await admin.from('modelos').update({ regla_compra: 'normal' }).eq('modelo', NOMBRE_MODELO);
    }
  });

  test('agrega un aviso "bloquea" a un modelo y lo lista con su motivo', async ({ page }) => {
    const admin = clienteAdmin();
    const marca = 'ZZTestE2E';
    const modeloNombre = `AvisoTest${Date.now()}`;
    const motivo = 'Motivo E2E de bloqueo';

    const { data: modelo, error: errModelo } = await admin
      .from('modelos')
      .insert({
        marca,
        modelo: modeloNombre,
        ram_soldada: 'revisar',
        ssd_soldado: false,
        regla_compra: 'normal',
      })
      .select('id')
      .single();
    expect(errModelo).toBeNull();
    const modeloId = modelo!.id as string;

    try {
      await page.goto('/configuracion');
      await page.getByTestId('modelos-buscador').fill(modeloNombre);

      await page.getByTestId(`modelo-avisos-toggle-${modeloId}`).click();
      const panel = page.getByTestId(`panel-avisos-${modeloId}`);
      await expect(panel).toBeVisible();

      await panel.getByTestId('aviso-nuevo-severidad').selectOption('bloquea');
      await panel.getByTestId('aviso-nuevo-motivo').fill(motivo);
      await panel.getByTestId('aviso-nuevo-guardar').click();

      const listaAvisos = panel.locator('ul');
      await expect(listaAvisos.getByText(motivo)).toBeVisible();
      await expect(listaAvisos.getByText('bloquea', { exact: true })).toBeVisible();
    } finally {
      await admin.from('modelo_avisos').delete().eq('modelo_id', modeloId);
      await admin.from('modelos').delete().eq('id', modeloId);
    }
  });
});
