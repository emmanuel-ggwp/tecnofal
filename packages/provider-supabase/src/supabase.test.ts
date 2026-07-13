// Pruebas de los flujos que ESCRIBEN o alimentan escrituras (incidente 2026-07-10:
// sesión vencida → RLS devuelve 0 filas sin error → catálogo "vacío pero exitoso"
// → el pull barrió la config local). El SDK se mockea; se verifica el contrato:
// nunca devolver un catálogo dudoso, nunca continuar una escritura tras un error.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalogo, CompraDatos, ListingGuardar } from '@tecnofal/core';

// ---------- mock de @supabase/supabase-js ----------
type Resp = { data?: unknown; error?: { message: string } | null };
let cola: Record<string, Resp[]> = {};            // respuestas por tabla (FIFO)
let llamadas: { tabla: string; op: string; arg?: unknown; opts?: unknown }[] = [];
let usuarioValido = true;

function builder(tabla: string) {
  const b: Record<string, unknown> = {};
  // 'delete' incluido para poder AFIRMAR que guardarConfig jamás lo llama (garantía de no-borrado)
  for (const op of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'order', 'single']) {
    b[op] = (arg?: unknown, opts?: unknown) => { llamadas.push({ tabla, op, arg, opts }); return b; };
  }
  (b as { then: unknown }).then = (res: (v: Resp) => unknown, rej: (e: unknown) => unknown) => {
    const r = cola[tabla]?.shift() ?? { data: [], error: null };
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(res, rej);
  };
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => (usuarioValido
        ? { data: { user: { id: 'u1', email: 'e@e.com' } }, error: null }
        : { data: { user: null }, error: { message: 'invalid JWT' } }),
      getSession: async () => ({ data: { session: usuarioValido ? { user: { email: 'e@e.com' } } : null } }),
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({}),
    },
    from: (t: string) => builder(t),
  }),
}));

const { ProveedorSupabase } = await import('./index.js');

const almacen = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
const listing = (id: string): ListingGuardar => ({
  ebayItemId: id, url: 'u', titulo: 't', precioVisto: 100, semaforo: 'verde', specs: null,
  precioMaxPuja: 50, precioPujaDecente: 40, cantidadLaptops: 1,
  costoEstimadoTotal: 150, valorEsperadoTotal: 220, evaluacionManual: {}, estado: 'evaluado',
});
const compra = (): CompraDatos => ({
  listing: listing('777'), envioUsa: 10, cantidad: 1, metodo: 'barco', faltantes: [],
  modeloId: null, cpuTipo: 'i5', cpuGen: 8, ramGb: 8, ssdGb: 256, pantallaPulgadas: 14,
  pantallaTactil: false, valorEsperado: 220,
  cadena: { base: 110, conZinli: 110, conEbay: 117.7, extras: 0, seguro: 5.5, envioVzla: 12, revision: 5, total: 140.2 },
});

let p: InstanceType<typeof ProveedorSupabase>;
beforeEach(() => {
  cola = {}; llamadas = []; usuarioValido = true;
  p = new ProveedorSupabase('https://x.supabase.co', 'anon', almacen);
});

describe('provider-supabase: catálogo (alimenta el pull que REEMPLAZA config local)', () => {
  it('INCIDENTE: sesión inválida → null y CERO consultas (jamás un catálogo vacío-exitoso)', async () => {
    usuarioValido = false;
    expect(await p.cargarCatalogo()).toBeNull();
    expect(llamadas).toHaveLength(0); // ni siquiera intenta leer tablas
  });

  it('cualquier consulta con error (ej. columna cpu_gen inexistente en el cloud) → null', async () => {
    cola.modelos = [{ error: { message: 'column modelos.cpu_gen does not exist' } }];
    expect(await p.cargarCatalogo()).toBeNull();
  });

  it('con sesión y data válidas devuelve el catálogo mapeado', async () => {
    cola.parametros = [{ data: [{ clave: 'ganancia_minima', valor: 0.55 }] }];
    cola.precios_ideales = [{ data: [{ cpu_tipo: 'i5', gen_desde: 10, gen_hasta: 10, precio_base: 240 }] }];
    cola.modelos = [{ data: [{ id: 'm1', marca: 'Dell', modelo: 'Latitude 5490', cpu_tipo: 'i5', cpu_gen: 8, ram_soldada: 'no', ssd_soldado: false, regla_compra: 'normal', motivo_regla: null }] }];
    const c = await p.cargarCatalogo();
    expect(c?.precios).toEqual([{ cpuTipo: 'i5', genDesde: 10, genHasta: 10, precioBase: 240 }]);
    expect(c?.parametros.gananciaMinima).toBe(0.55);
    expect(c?.parametros.impuestoEbay).toBe(1.07); // default cuando el remoto no lo trae
    expect(c?.modelos[0]?.cpuGen).toBe(8);
  });
});

describe('provider-supabase: escrituras en la nube', () => {
  it('comprar: si falla el lote → throw y NO inserta laptops ni líneas ni listing', async () => {
    cola.lotes = [{ error: { message: 'RLS: new row violates policy' } }];
    await expect(p.comprar(compra())).rejects.toThrow(/violates/);
    expect(llamadas.filter((l) => l.tabla === 'laptops' || l.tabla === 'costo_lineas')).toHaveLength(0);
    expect(llamadas.filter((l) => l.tabla === 'listings' && l.op === 'upsert')).toHaveLength(0);
  });

  it('comprar feliz: lote → laptops → costo_lineas → listing queda "comprado" con lote_id', async () => {
    cola.lotes = [{ data: { id: 'L1' } }];
    const { loteId } = await p.comprar(compra());
    expect(loteId).toBe('L1');
    const tablasEscritas = llamadas.filter((l) => ['insert', 'upsert'].includes(l.op)).map((l) => l.tabla);
    expect(tablasEscritas).toEqual(['lotes', 'laptops', 'costo_lineas', 'listings']);
    const up = llamadas.find((l) => l.tabla === 'listings' && l.op === 'upsert')?.arg as { estado: string; lote_id: string };
    expect(up.estado).toBe('comprado');
    expect(up.lote_id).toBe('L1');
  });

  it('guardarListing propaga el error (el sync NO debe marcarlo limpio)', async () => {
    cola.listings = [{ error: { message: 'JWT expired' } }];
    await expect(p.guardarListing(listing('888'))).rejects.toThrow(/expired/);
  });

  it('registrarConversion: dos movimientos + conversión enlazada, tasa exacta', async () => {
    cola.movimientos = [{ data: [{ id: 'mo1' }, { id: 'mo2' }] }];
    const r = await p.registrarConversion({ cuentaOrigenId: 'a', cuentaDestinoId: 'b', montoOrigen: 100, montoDestino: 98 });
    expect(r.tasaImplicita).toBeCloseTo(100 / 98);
    const conv = llamadas.find((l) => l.tabla === 'conversiones' && l.op === 'insert')?.arg as { movimiento_origen_id: string; movimiento_destino_id: string };
    expect(conv.movimiento_origen_id).toBe('mo1');
    expect(conv.movimiento_destino_id).toBe('mo2');
  });

  it('registrarConversion: si fallan los movimientos → throw sin tocar conversiones', async () => {
    cola.movimientos = [{ error: { message: 'RLS' } }];
    await expect(p.registrarConversion({ cuentaOrigenId: 'a', cuentaDestinoId: 'b', montoOrigen: 100, montoDestino: 98 })).rejects.toThrow();
    expect(llamadas.filter((l) => l.tabla === 'conversiones')).toHaveLength(0);
  });
});

// ---------- push de config (guardarConfig): ADITIVO Y SEGURO ----------
// El contrato inverso al incidente 2026-07-10: así como el pull nunca debe barrer la config
// LOCAL, el push nunca debe borrar/corromper la config del ESPEJO.
function cat(over: Partial<Catalogo> = {}): Catalogo {
  return {
    parametros: {
      impuestoEbay: 1.07, seguroValorDeclarado: 0.02, seguroZoom: 3, comisionZinliEstimada: 0.05,
      costoRevision: 5, gananciaMinima: 0.5, gananciaDecente: 0.7,
      tarifaBarcoPorPie3: null, tarifaAvionZoomPorKg: null, envioVzlaPorLaptop: 12,
    },
    precios: [{ cpuTipo: 'i5', genDesde: 8, genHasta: 9, precioBase: 220 }],
    ajustes: { ram_por_8gb: 15 },
    modelos: [{ marca: 'Dell', modelo: 'Latitude 7490', ramSoldada: 'no', reglaCompra: 'normal', cpuTipo: null, motivoRegla: null }],
    partesRef: { Cargador: 12 },
    detalles: [{ id: 'd1', nombre: 'Solo 4GB RAM', deduccionBase: 15, categoria: 'specs' }],
    online: true,
    ...over,
  };
}

describe('provider-supabase: guardarConfig (push aditivo local → espejo)', () => {
  const ups = (tabla: string) => llamadas.filter((l) => l.tabla === tabla && l.op === 'upsert');

  it('sube las 5 tablas por-usuario con upsert; NUNCA toca modelos (global/compartida)', async () => {
    await p.guardarConfig(cat());
    const tablasUpsert = new Set(llamadas.filter((l) => l.op === 'upsert').map((l) => l.tabla));
    expect(tablasUpsert).toEqual(new Set(['parametros', 'precios_ideales', 'ajustes_config', 'detalles_catalogo', 'partes_catalogo']));
    expect(llamadas.filter((l) => l.tabla === 'modelos')).toHaveLength(0); // el push jamás toca modelos
  });

  it('INVERSO DEL BUG: una sección local vacía se SALTA (jamás sube vacío → jamás barre el espejo)', async () => {
    await p.guardarConfig(cat({ precios: [], detalles: [], partesRef: {}, ajustes: {} }));
    expect(ups('precios_ideales')).toHaveLength(0);
    expect(ups('detalles_catalogo')).toHaveLength(0);
    expect(ups('partes_catalogo')).toHaveLength(0);
    expect(ups('ajustes_config')).toHaveLength(0);
    // parametros no vacío → sí se sube
    expect(ups('parametros')).toHaveLength(1);
  });

  it('CERO DELETE en cualquier caso: garantía dura de no pérdida de datos', async () => {
    await p.guardarConfig(cat());
    expect(llamadas.filter((l) => l.op === 'delete')).toHaveLength(0);
  });

  it('NUNCA envía user_id en el payload (lo estampa el trigger)', async () => {
    await p.guardarConfig(cat());
    for (const l of llamadas.filter((l) => l.op === 'upsert')) {
      const filas = Array.isArray(l.arg) ? l.arg : [l.arg];
      for (const f of filas) expect(Object.keys(f as object)).not.toContain('user_id');
    }
  });

  it('onConflict correcto por tabla (precios_ideales usa la clave natural de 0027)', async () => {
    await p.guardarConfig(cat());
    const oc = (t: string) => (ups(t)[0]?.opts as { onConflict?: string } | undefined)?.onConflict;
    expect(oc('parametros')).toBe('user_id,clave');
    expect(oc('ajustes_config')).toBe('user_id,clave');
    expect(oc('precios_ideales')).toBe('user_id,cpu_tipo,gen_desde,gen_hasta');
    expect(oc('detalles_catalogo')).toBe('user_id,nombre');
    expect(oc('partes_catalogo')).toBe('user_id,nombre');
  });

  it('parametros: omite los de valor null (no pisa un valor remoto con "sin valor vigente")', async () => {
    await p.guardarConfig(cat());
    const claves = ((ups('parametros')[0]?.arg as { clave: string }[]) ?? []).map((f) => f.clave);
    expect(claves).toContain('ganancia_minima');
    expect(claves).not.toContain('tarifa_barco_por_pie3'); // null → no se sube
    expect(claves).not.toContain('tarifa_avion_zoom_por_kg');
  });

  it('detalles: categoria fuera del enum se normaliza a un valor válido (fallback otro)', async () => {
    await p.guardarConfig(cat({ detalles: [
      { id: 'd1', nombre: 'Cosa rara', deduccionBase: 5, categoria: 'InventadoXYZ' },
      { id: 'd2', nombre: 'Otro defecto', deduccionBase: 5, categoria: 'Otro' }, // mayúscula → 'otro'
    ] }));
    const filas = ups('detalles_catalogo')[0]?.arg as { nombre: string; categoria: string }[];
    expect(filas.find((f) => f.nombre === 'Cosa rara')?.categoria).toBe('otro');
    expect(filas.find((f) => f.nombre === 'Otro defecto')?.categoria).toBe('otro');
  });

  it('error propaga: si un upsert falla → throw (el sync NO limpia el flag dirty)', async () => {
    cola.precios_ideales = [{ error: { message: 'RLS: violates policy' } }];
    await expect(p.guardarConfig(cat())).rejects.toThrow(/violates/);
  });

  it('idempotente: dos pushes seguidos solo hacen upsert (nunca insert que duplique)', async () => {
    await p.guardarConfig(cat());
    await p.guardarConfig(cat());
    expect(llamadas.filter((l) => l.op === 'insert')).toHaveLength(0);
  });
});
