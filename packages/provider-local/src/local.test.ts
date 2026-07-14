import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProveedorLocal } from './index.js';
import type { CompraDatos, ListingGuardar } from '@tecnofal/core';

const listing = (id: string): ListingGuardar => ({
  ebayItemId: id, url: 'u', titulo: 't', precioVisto: 100, semaforo: 'verde', specs: null,
  precioMaxPuja: 50, precioPujaDecente: 40, cantidadLaptops: 1,
  costoEstimadoTotal: 150, valorEsperadoTotal: 220, evaluacionManual: {}, estado: 'evaluado',
  fechaFinSubasta: null,
});

let n = 0;
let p: ProveedorLocal;
beforeEach(() => { p = new ProveedorLocal(`test-${++n}`); });

describe('provider-local (§22)', () => {
  it('seeds empaquetados: funcional sin backend desde la primera instalación', async () => {
    const c = await p.cargarCatalogo();
    expect(c.online).toBe(true);
    expect(c.precios.length).toBe(5);
    expect(c.modelos.length).toBeGreaterThan(70);
    expect(c.detalles.length).toBe(17);
    expect(c.parametros.envioVzlaPorLaptop).toBe(12);
  });

  it('aplicarConfigRemota persiste vendedoresConocidos (meta); cargarCatalogo lo devuelve', async () => {
    const antes = await p.cargarCatalogo();
    expect(antes.vendedoresConocidos).toEqual([]);
    await p.aplicarConfigRemota({ ...antes, vendedoresConocidos: ['sam-74545', 'otro'] });
    expect((await p.cargarCatalogo()).vendedoresConocidos).toEqual(['sam-74545', 'otro']);
  });

  it('guardar listing → dirty + manual; check lo encuentra', async () => {
    await p.guardarListing(listing('111'));
    const vistos = await p.checkListings(['111', '222']);
    expect(vistos).toHaveLength(1);
    expect(vistos[0].estado).toBe('evaluado');
    expect(await p.pendientes()).toBe(1);
    expect((await p.listingsSucios())[0].manual).toBe(1);
  });

  it('comprar → cola local pendiente + listing comprado', async () => {
    const d = { listing: listing('333'), envioUsa: 10, cantidad: 1, metodo: 'barco', faltantes: [], modeloId: null, cpuTipo: 'i5', cpuGen: 8, ramGb: 8, ssdGb: 256, pantallaPulgadas: 14, pantallaTactil: false, valorEsperado: 220, cadena: { base: 110, conZinli: 115.5, conEbay: 123.6, extras: 0, seguro: 5.5, envioVzla: 12, revision: 5, total: 146.6 } } as CompraDatos;
    const { loteId } = await p.comprar(d);
    expect(loteId.startsWith('local:')).toBe(true);
    expect(await p.comprasPendientes()).toHaveLength(1);
    expect((await p.checkListings(['333']))[0].estado).toBe('comprado');
    await p.marcarCompraSincronizada(loteId, 'uuid-remoto');
    expect(await p.comprasPendientes()).toHaveLength(0);
  });

  it('config editable + export/import', async () => {
    await p.guardarParametro('ganancia_decente', 0.8);
    expect((await p.cargarCatalogo()).parametros.gananciaDecente).toBe(0.8);
    const json = await p.exportarJSON();
    const p2 = new ProveedorLocal(`test-imp-${n}`);
    await p2.importarJSON(json);
    expect((await p2.cargarCatalogo()).parametros.gananciaDecente).toBe(0.8);
  });

  it('§23: marcar modelo/familia crea avisos y modelos faltantes', async () => {
    const r = await p.marcarModelo({
      marca: 'Dell', modelos: ['Latitude 3520', 'Latitude 3521'],
      tipoClave: null, tipoNuevoNombre: 'Bisagras frágiles v2',
      severidad: 'bloquea', motivo: 'Se parten las bisagras',
    });
    expect(r.tipoClave).toBe('bisagras_fragiles_v2');
    expect(r.modelosAfectados).toHaveLength(2);
    const cat = await p.cargarCatalogo();
    const m = cat.modelos.find((x) => x.modelo === 'Latitude 3520');
    expect(m?.avisos?.[0]).toEqual({ tipo: 'bisagras_fragiles_v2', severidad: 'bloquea', motivo: 'Se parten las bisagras' });
    expect(cat.tiposAviso?.some((x) => x.clave === 'bisagras_fragiles_v2')).toBe(true);
    expect(await p.avisosSucios()).toHaveLength(2);
    expect(await p.tiposSucios()).toHaveLength(1);
  });

  it('config local editada NO se pisa con el pull remoto (dirty gana)', async () => {
    await p.guardarParametro('ganancia_decente', 0.9);
    const remoto = await new ProveedorLocal(`test-rem-${n}`).cargarCatalogo(); // semilla: 0.7
    await p.aplicarConfigRemota(remoto);
    expect((await p.cargarCatalogo()).parametros.gananciaDecente).toBe(0.9);
  });

  it('pull remoto con secciones VACÍAS no borra la config local (espejo sin sembrar)', async () => {
    const antes = await p.cargarCatalogo();
    await p.aplicarConfigRemota({
      ...antes, precios: [], ajustes: {}, detalles: [], modelos: [],
    });
    const despues = await p.cargarCatalogo();
    expect(despues.precios.length).toBe(antes.precios.length);
    expect(Object.keys(despues.ajustes).length).toBe(Object.keys(antes.ajustes).length);
    expect(despues.detalles.length).toBe(antes.detalles.length);
    expect(despues.modelos.length).toBe(antes.modelos.length);
  });

  it('auto-recuperación: una sección de config vaciada se re-siembra al cargar', async () => {
    await p.cargarCatalogo(); // inicializa
    const db = (p as unknown as { db: { precios: { clear(): Promise<void>; count(): Promise<number> } } }).db;
    await db.precios.clear(); // estado roto dejado por el bug del pull
    const c = await p.cargarCatalogo();
    expect(c.precios.length).toBe(5); // re-sembrado; toda evaluación vuelve a tener precio ideal
  });

  it('inicializar es idempotente: una segunda carga no duplica seeds', async () => {
    const a = await p.cargarCatalogo();
    const b = await p.cargarCatalogo();
    expect(b.precios.length).toBe(a.precios.length);
    expect(b.detalles.length).toBe(a.detalles.length);
    expect(b.modelos.length).toBe(a.modelos.length);
  });

  it("'comprado' es terminal: el auto-registro de 'visto' no lo pisa", async () => {
    await p.guardarListing({ ...listing('444'), estado: 'comprado' });
    await p.guardarListing({ ...listing('444'), estado: 'visto' }); // al reabrir la página
    expect((await p.checkListings(['444']))[0].estado).toBe('comprado');
    // otros estados explícitos sí actualizan (re-evaluación)
    await p.guardarListing({ ...listing('444'), estado: 'evaluado' });
    expect((await p.checkListings(['444']))[0].estado).toBe('evaluado');
  });

  it('reemplazarSeccion rechaza una lista vacía (no deja la sección en cero)', async () => {
    await p.cargarCatalogo();
    await expect(p.reemplazarSeccion('precios', [])).rejects.toThrow(/vacía/);
    expect((await p.cargarCatalogo()).precios.length).toBe(5); // intacto
  });

  it('reemplazarSeccion con filas sí reemplaza y marca config dirty', async () => {
    await p.cargarCatalogo();
    await p.reemplazarSeccion('precios', [{ cpuTipo: 'i5', genDesde: 4, genHasta: 11, precioBase: 200 }]);
    const c = await p.cargarCatalogo();
    expect(c.precios).toEqual([{ cpuTipo: 'i5', genDesde: 4, genHasta: 11, precioBase: 200 }]);
    expect(await p.configDirty()).toBe(true); // el pull LWW ya no puede pisarlo
  });

  it('importarJSON inválido o incompleto no borra nada', async () => {
    await p.cargarCatalogo();
    await expect(p.importarJSON('{"hola": 1}')).rejects.toThrow(/Respaldo inválido/);
    const truncado = JSON.stringify({ config: { parametros: [], precios: [], ajustes: [], detalles: [], modelos: [], partesRef: [] } });
    await expect(p.importarJSON(truncado)).rejects.toThrow(/incompleto/);
    await expect(p.importarJSON('no-es-json')).rejects.toThrow();
    expect((await p.cargarCatalogo()).precios.length).toBe(5); // intacto tras los 3 intentos
  });

  it('importarJSON válido restaura el respaldo completo (round-trip)', async () => {
    await p.guardarParametro('ganancia_minima', 0.6);
    await p.guardarListing(listing('555'));
    const respaldo = await p.exportarJSON();
    const p2 = new ProveedorLocal(`test-rt-${n}`);
    await p2.importarJSON(respaldo);
    expect((await p2.cargarCatalogo()).parametros.gananciaMinima).toBe(0.6);
    expect((await p2.checkListings(['555']))[0].estado).toBe('evaluado');
  });

  it('marcarConfigLimpio reabre el pull tras un push exitoso (el flag dirty ya no bloquea)', async () => {
    const remoto = await new ProveedorLocal(`test-rem3-${n}`).cargarCatalogo(); // semilla: 0.7
    await p.guardarParametro('ganancia_decente', 0.9); // dirty → el pull quedaría bloqueado
    await p.marcarConfigLimpio();                       // simula un push exitoso al espejo
    expect(await p.configDirty()).toBe(false);
    await p.aplicarConfigRemota(remoto);               // ahora SÍ aplica (compuerta reabierta)
    expect((await p.cargarCatalogo()).parametros.gananciaDecente).toBe(0.7);
  });

  it('crearDetalle marca dirty y el pull remoto no lo pisa', async () => {
    const remoto = await new ProveedorLocal(`test-rem2-${n}`).cargarCatalogo();
    await p.crearDetalle({ categoria: 'puertos', nombre: 'Puerto carga flojo', deduccionBase: 12 });
    await p.aplicarConfigRemota(remoto); // dirty → no-op
    const c = await p.cargarCatalogo();
    expect(c.detalles.some((d) => d.nombre === 'Puerto carga flojo')).toBe(true);
  });
});
