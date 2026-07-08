import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  AJUSTES_SEMILLA, PARAMETROS_DEFAULT, PARTES_REF_SEMILLA, PRECIOS_IDEALES_SEMILLA,
  type AjustesConfig, type ModeloInfo, type Parametros, type PrecioIdeal,
} from '@tecnofal/core';
import type { Catalogo, CompraDatos, ConversionDatos, Cuenta, EstadoVisto, ListingGuardar, Solicitud } from '../lib/mensajes';

// ---------- Cliente Supabase (SOLO en el service worker; sesión en chrome.storage.local) ----------
// Los content scripts NUNCA hablan con Supabase directo ni ven tokens: piden por sendMessage.
const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const almacen = {
  getItem: async (k: string) => ((await chrome.storage.local.get(k))[k] as string | undefined) ?? null,
  setItem: async (k: string, v: string) => chrome.storage.local.set({ [k]: v }),
  removeItem: async (k: string) => chrome.storage.local.remove(k),
};

const supabase: SupabaseClient | null =
  URL_SUPABASE && ANON_KEY
    ? createClient(URL_SUPABASE, ANON_KEY, {
        auth: { storage: almacen, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;

// ---------- Catálogo (cache 10 min) ----------
const CATALOGO_FALLBACK: Catalogo = {
  parametros: PARAMETROS_DEFAULT,
  precios: PRECIOS_IDEALES_SEMILLA,
  ajustes: AJUSTES_SEMILLA,
  modelos: [],
  partesRef: {
    'Cargador 65W punta fina': PARTES_REF_SEMILLA.cargador,
    'Batería (genérica por familia)': PARTES_REF_SEMILLA.bateria,
    'SSD 256GB': PARTES_REF_SEMILLA.ssd_256,
    'RAM 8GB DDR4': PARTES_REF_SEMILLA.ram_8,
  },
  detalles: [],
  online: false,
};

let cacheCatalogo: { datos: Catalogo; hasta: number } | null = null;

async function cargarCatalogo(): Promise<Catalogo> {
  if (cacheCatalogo && Date.now() < cacheCatalogo.hasta) return cacheCatalogo.datos;
  if (!supabase) return CATALOGO_FALLBACK;
  try {
    const [params, precios, ajustes, modelos, partes, detalles] = await Promise.all([
      supabase.from('parametros').select('clave, valor'),
      supabase.from('precios_ideales').select('cpu_tipo, gen_desde, gen_hasta, precio_base'),
      supabase.from('ajustes_config').select('clave, delta'),
      supabase.from('modelos').select('id, marca, modelo, cpu_tipo, ram_soldada, ssd_soldado, regla_compra, motivo_regla'),
      supabase.from('partes_catalogo').select('nombre, precio_referencia'),
      supabase.from('detalles_catalogo').select('id, nombre, deduccion_base'),
    ]);
    if (params.error || precios.error || ajustes.error || modelos.error || partes.error || detalles.error) {
      return CATALOGO_FALLBACK; // sin sesión (RLS) o sin conexión → modo degradado
    }
    const p: Record<string, number | null> = {};
    for (const r of params.data ?? []) p[r.clave] = r.valor;
    const parametros: Parametros = {
      impuestoEbay: p['impuesto_ebay'] ?? PARAMETROS_DEFAULT.impuestoEbay,
      seguroValorDeclarado: p['seguro_valor_declarado'] ?? PARAMETROS_DEFAULT.seguroValorDeclarado,
      seguroZoom: p['seguro_zoom'] ?? PARAMETROS_DEFAULT.seguroZoom,
      comisionZinliEstimada: p['comision_zinli_estimada'] ?? PARAMETROS_DEFAULT.comisionZinliEstimada,
      costoRevision: p['costo_revision'] ?? PARAMETROS_DEFAULT.costoRevision,
      gananciaMinima: p['ganancia_minima'] ?? PARAMETROS_DEFAULT.gananciaMinima,
      gananciaDecente: p['ganancia_decente'] ?? PARAMETROS_DEFAULT.gananciaDecente,
      tarifaBarcoPorPie3: p['tarifa_barco_por_pie3'] ?? null,
      tarifaAvionZoomPorKg: p['tarifa_avion_zoom_por_kg'] ?? null,
    };
    const catalogo: Catalogo = {
      parametros,
      precios: (precios.data ?? []).map((r): PrecioIdeal => ({
        cpuTipo: r.cpu_tipo, genDesde: r.gen_desde, genHasta: r.gen_hasta, precioBase: Number(r.precio_base),
      })),
      ajustes: Object.fromEntries((ajustes.data ?? []).map((r) => [r.clave, Number(r.delta)])) as AjustesConfig,
      modelos: (modelos.data ?? []).map((r): ModeloInfo => ({
        id: r.id, marca: r.marca, modelo: r.modelo, cpuTipo: r.cpu_tipo,
        ramSoldada: r.ram_soldada, ssdSoldado: r.ssd_soldado,
        reglaCompra: r.regla_compra, motivoRegla: r.motivo_regla,
      })),
      partesRef: Object.fromEntries(
        (partes.data ?? []).filter((r) => r.precio_referencia != null).map((r) => [r.nombre, Number(r.precio_referencia)]),
      ),
      detalles: (detalles.data ?? []).map((r) => ({ id: r.id, nombre: r.nombre, deduccionBase: Number(r.deduccion_base) })),
      online: true,
    };
    cacheCatalogo = { datos: catalogo, hasta: Date.now() + 10 * 60_000 };
    return catalogo;
  } catch {
    return CATALOGO_FALLBACK;
  }
}

// ---------- Persistencia de listings ----------
// user_id NO se maneja aquí: lo estampa el trigger BEFORE INSERT y lo filtra RLS.
function aFila(l: ListingGuardar) {
  return {
    ebay_item_id: l.ebayItemId,
    url: l.url,
    titulo: l.titulo,
    precio_visto: l.precioVisto,
    fecha_visto: new Date().toISOString(),
    semaforo: l.semaforo,
    specs_parseadas: l.specs as unknown as object,
    precio_max_puja: l.precioMaxPuja,
    precio_puja_decente: l.precioPujaDecente,
    evaluacion_manual: l.evaluacionManual as object,
    estado: l.estado,
  };
}

async function guardarListing(l: ListingGuardar) {
  if (!supabase) throw new Error('Sin conexión con Supabase (configura .env)');
  const { error } = await supabase.from('listings').upsert(aFila(l), { onConflict: 'user_id,ebay_item_id' });
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function checkListings(ids: string[]): Promise<EstadoVisto[]> {
  if (!supabase || ids.length === 0) return [];
  const { data, error } = await supabase
    .from('listings').select('ebay_item_id, semaforo, estado').in('ebay_item_id', ids);
  if (error) return []; // sesión expirada → los listings no se marcan
  return (data ?? []).map((r) => ({ ebayItemId: r.ebay_item_id, semaforo: r.semaforo, estado: r.estado }));
}

// ---------- Botón "Comprada": lote + laptops + estimado congelado + reparto fijo ----------
async function comprar(d: CompraDatos) {
  if (!supabase) throw new Error('Sin conexión con Supabase (configura .env)');
  const ahora = new Date().toISOString();

  // §13: proyectado SIN colchón Zinli (el colchón es solo de la calculadora)
  const c = d.cadena;
  const impuestoEbaySinZinli = c.conZinli !== 0 ? c.base * (c.conEbay / c.conZinli - 1) : 0;
  const proyectado = (d.listing.precioVisto ?? 0) + d.envioUsa + impuestoEbaySinZinli
    + c.extras + c.seguro + c.envioVzla + c.revision;

  const { data: lote, error: eLote } = await supabase
    .from('lotes')
    .insert({
      origen: 'ebay',
      url_ebay: d.listing.url,
      precio_subasta: d.listing.precioVisto,
      envio_usa: d.envioUsa,
      costo_proyectado_total: proyectado,
    })
    .select('id').single();
  if (eLote) throw new Error(eLote.message);

  const laptops = Array.from({ length: d.cantidad }, () => ({
    lote_id: lote.id,
    modelo_id: d.modeloId,
    cpu_tipo: d.cpuTipo,
    cpu_gen: d.cpuGen,
    ram_gb: d.ramGb,
    ssd_gb: d.ssdGb,
    pantalla_pulgadas: d.pantallaPulgadas,
    pantalla_tactil: d.pantallaTactil,
    estado: 'comprada',
  }));
  const { data: creadas, error: eLap } = await supabase.from('laptops').insert(laptops).select('id');
  if (eLap) throw new Error(eLap.message);

  // Estimado congelado al comprar (§2.5) — ámbito lote
  // §13: SIN línea comision_zinli — el impuesto eBay se congela sobre la base real (sin
  // el colchón Zinli, que es solo conservadurismo de la calculadora)
  const linea = (tipo: string, monto: number) => ({
    ambito: 'lote', ambito_id: lote.id, tipo, monto_estimado: monto, estimado_congelado_at: ahora,
  });
  const impuestoEbay = impuestoEbaySinZinli;
  const lineas = [
    linea('subasta', d.listing.precioVisto ?? 0),
    linea('envio_usa', d.envioUsa),
    linea('impuesto_ebay', impuestoEbay),
    linea('parte', c.extras),
    linea('seguro', c.seguro),
    linea('envio_vzla', c.envioVzla),
    linea('revision', c.revision),
  ].filter((l) => l.monto_estimado !== 0);
  const { error: eLineas } = await supabase.from('costo_lineas').insert(lineas);
  if (eLineas) throw new Error(eLineas.message);

  // El reparto FIJO del lote NO se crea aquí: se congela al completar la revisión física
  // (función SQL congelar_reparto_lote, §2.6) — descuenta partes encontradas a valor nominal.
  void creadas;

  await supabase.from('listings').upsert(
    { ...aFila({ ...d.listing, estado: 'comprado' }), lote_id: lote.id },
    { onConflict: 'user_id,ebay_item_id' },
  );
  return { ok: true, loteId: lote.id };
}

// ---------- §13: conversiones entre cuentas (acción rápida global) ----------
async function listarCuentas(): Promise<Cuenta[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('cuentas').select('id, nombre, moneda').order('nombre');
  if (error) throw new Error(error.message);
  return (data ?? []) as Cuenta[];
}

async function registrarConversion(d: ConversionDatos) {
  if (!supabase) throw new Error('Sin conexión con Supabase (configura .env)');
  const fecha = d.fecha ?? new Date().toISOString().slice(0, 10);
  const { data: movs, error: eMov } = await supabase.from('movimientos').insert([
    { cuenta_id: d.cuentaOrigenId, fecha, tipo: 'egreso', monto: d.montoOrigen, concepto: d.nota ?? 'Conversión' },
    { cuenta_id: d.cuentaDestinoId, fecha, tipo: 'ingreso', monto: d.montoDestino, concepto: d.nota ?? 'Conversión' },
  ]).select('id');
  if (eMov) throw new Error(eMov.message);
  const { error: eConv } = await supabase.from('conversiones').insert({
    fecha,
    movimiento_origen_id: movs![0].id,
    movimiento_destino_id: movs![1].id,
    monto_origen: d.montoOrigen,
    monto_destino: d.montoDestino,
    nota: d.nota ?? null,
  });
  if (eConv) throw new Error(eConv.message);
  return { ok: true, tasaImplicita: d.montoOrigen / d.montoDestino };
}

// ---------- Auth ----------
async function authEstado() {
  if (!supabase) return { configurado: false, email: null };
  const { data } = await supabase.auth.getSession();
  return { configurado: true, email: data.session?.user.email ?? null };
}

// ---------- Router de mensajes ----------
async function manejar(msg: Solicitud): Promise<unknown> {
  switch (msg.tipo) {
    case 'catalogo': return cargarCatalogo();
    case 'auth:estado': return authEstado();
    case 'auth:login': {
      if (!supabase) throw new Error('Configura VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env');
      const { error } = await supabase.auth.signInWithPassword({ email: msg.email, password: msg.password });
      if (error) throw new Error(error.message);
      cacheCatalogo = null;
      return authEstado();
    }
    case 'auth:logout': {
      await supabase?.auth.signOut();
      cacheCatalogo = null;
      return { ok: true };
    }
    case 'listings:check': return checkListings(msg.ids);
    case 'listings:guardar': return guardarListing(msg.listing);
    case 'comprar': return comprar(msg.datos);
    case 'cuentas:listar': return listarCuentas();
    case 'conversion:registrar': return registrarConversion(msg.datos);
  }
}

chrome.runtime.onMessage.addListener((msg: Solicitud, _sender, sendResponse) => {
  manejar(msg)
    .then(sendResponse)
    .catch((e: unknown) => sendResponse({ error: e instanceof Error ? e.message : String(e) }));
  return true; // respuesta asíncrona
});
