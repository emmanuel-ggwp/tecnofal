// Repositorio de datos para /lotes (plan-04). Único punto de acceso a las tablas
// lotes / costo_lineas (ámbito lote) / lote_partes_encontradas / lote_reparto / partes_catalogo.
// Ningún componente importa @supabase/supabase-js directamente (§7b) — todo pasa por aquí.
import { clienteSupabase } from './cliente';

export type OrigenCompra = 'ebay' | 'local' | 'otro';
export type MetodoEstimado = 'barco' | 'avion_zoom';
export type CpuTipo = 'i3' | 'i5' | 'i7' | 'ryzen3' | 'ryzen5' | 'ryzen7' | 'otro';

/** Specs mínimas para crear una laptop desde /lotes (alta local o eBay manual). */
export interface NuevaLaptopSpec {
  service_tag?: string;
  cpu_tipo?: CpuTipo;
  cpu_gen?: number;
  ram_gb?: number;
  ssd_gb?: number;
  tiene_hdd?: boolean;
  pantalla_pulgadas?: number;
  pantalla_tactil?: boolean;
}

export interface LoteResumen {
  id: string;
  fecha_compra: string;
  origen: OrigenCompra;
  vendedor: string | null;
  costo_proyectado_total: number | null;
  costo_actual: number;
  num_laptops: number;
}

export interface LoteDetalle {
  id: string;
  fecha_compra: string;
  origen: OrigenCompra;
  url_ebay: string | null;
  vendedor: string | null;
  precio_subasta: number;
  envio_usa: number;
  costo_proyectado_total: number | null;
  metodo_estimado: MetodoEstimado | null;
}

export interface CostoLinea {
  id: string;
  tipo: string;
  monto_estimado: number | null;
  monto_real: number | null;
  descripcion: string | null;
}

export interface LaptopDeLote {
  id: string;
  alias: string | null;
  estado: string;
  cpu_tipo: string | null;
  cpu_gen: number | null;
  ram_gb: number | null;
  ssd_gb: number | null;
}

export interface ParteCatalogo {
  id: string;
  nombre: string;
  valor_nominal: number | null;
}

export interface ParteEncontrada {
  id: string;
  parte_id: string;
  parte_nombre: string;
  cantidad: number;
  valor_nominal_aplicado: number;
  en_stock: boolean;
}

export interface RepartoFila {
  laptop_id: string;
  alias: string | null;
  valor_esperado_al_comprar: number;
  proporcion: number;
  costo_asignado: number;
}

/** Listado resumido de lotes: proyectado congelado vs. Σ líneas (real donde exista). */
export async function listarLotes(): Promise<LoteResumen[]> {
  const cliente = clienteSupabase();
  const { data: lotes, error } = await cliente
    .from('lotes')
    .select('id, fecha_compra, origen, vendedor, costo_proyectado_total')
    .order('fecha_compra', { ascending: false });
  if (error) throw new Error(error.message);
  const filas = lotes ?? [];
  const ids = filas.map((l) => l.id as string);
  if (ids.length === 0) return [];

  const [{ data: lineas, error: errLineas }, { data: laptops, error: errLap }] = await Promise.all([
    cliente.from('costo_lineas').select('ambito_id, monto_estimado, monto_real').eq('ambito', 'lote').in('ambito_id', ids),
    cliente.from('laptops').select('id, lote_id').in('lote_id', ids),
  ]);
  if (errLineas) throw new Error(errLineas.message);
  if (errLap) throw new Error(errLap.message);

  const actualPorLote = new Map<string, number>();
  for (const l of lineas ?? []) {
    const monto = l.monto_real ?? l.monto_estimado ?? 0;
    actualPorLote.set(l.ambito_id, (actualPorLote.get(l.ambito_id) ?? 0) + Number(monto));
  }
  const laptopsPorLote = new Map<string, number>();
  for (const l of laptops ?? []) {
    if (!l.lote_id) continue;
    laptopsPorLote.set(l.lote_id, (laptopsPorLote.get(l.lote_id) ?? 0) + 1);
  }

  return filas.map((l) => ({
    id: l.id,
    fecha_compra: l.fecha_compra,
    origen: l.origen,
    vendedor: l.vendedor,
    costo_proyectado_total: l.costo_proyectado_total,
    costo_actual: actualPorLote.get(l.id) ?? 0,
    num_laptops: laptopsPorLote.get(l.id) ?? 0,
  }));
}

export async function obtenerLote(id: string): Promise<LoteDetalle | null> {
  const cliente = clienteSupabase();
  const { data, error } = await cliente.from('lotes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as LoteDetalle | null;
}

export async function listarLineasLote(loteId: string): Promise<CostoLinea[]> {
  const cliente = clienteSupabase();
  const { data, error } = await cliente
    .from('costo_lineas')
    .select('id, tipo, monto_estimado, monto_real, descripcion')
    .eq('ambito', 'lote')
    .eq('ambito_id', loteId)
    .order('tipo');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listarLaptopsDeLote(loteId: string): Promise<LaptopDeLote[]> {
  const cliente = clienteSupabase();
  const { data, error } = await cliente
    .from('laptops')
    .select('id, alias, estado, cpu_tipo, cpu_gen, ram_gb, ssd_gb')
    .eq('lote_id', loteId)
    .order('alias');
  if (error) throw new Error(error.message);
  return data ?? [];
}

function laptopSpecAJson(specs: NuevaLaptopSpec, estado: string): Record<string, unknown> {
  return {
    service_tag: specs.service_tag || null,
    cpu_tipo: specs.cpu_tipo || null,
    cpu_gen: specs.cpu_gen ?? null,
    ram_gb: specs.ram_gb ?? null,
    ssd_gb: specs.ssd_gb ?? null,
    tiene_hdd: specs.tiene_hdd ?? false,
    pantalla_pulgadas: specs.pantalla_pulgadas ?? null,
    pantalla_tactil: specs.pantalla_tactil ?? false,
    estado,
  };
}

/**
 * Alta de compra local: SIN url_ebay/envio_usa/impuesto/seguro/envio_vzla; laptops →
 * en_revision directo. Atómico vía RPC `registrar_compra_lote` (migración 0022) — antes
 * eran 3+N escrituras separadas desde el cliente (lote, líneas, total, una laptop a la vez).
 */
export async function crearLoteLocal(datos: {
  fecha_compra: string;
  precio_compra: number;
  flete_nacional?: number;
  revision?: number;
  laptops: NuevaLaptopSpec[];
  /** clave estable reusada entre reintentos del mismo submit → el RPC no duplica el lote */
  idempotencyKey?: string;
}): Promise<string> {
  const ahora = new Date().toISOString();
  // Regla: nunca crear líneas en cero. Compra local = dinero ya gastado en el momento del
  // alta: se registra como estimado congelado y real a la vez (ambos "ocurren" ahora).
  const lineas: Array<Record<string, unknown>> = [
    { tipo: 'subasta', monto_estimado: datos.precio_compra, monto_real: datos.precio_compra, estimado_congelado_at: ahora, fecha_real: ahora },
  ];
  if (datos.flete_nacional) {
    lineas.push({ tipo: 'flete_nacional', monto_estimado: datos.flete_nacional, monto_real: datos.flete_nacional, estimado_congelado_at: ahora, fecha_real: ahora });
  }
  if (datos.revision) {
    lineas.push({ tipo: 'revision', monto_estimado: datos.revision, monto_real: datos.revision, estimado_congelado_at: ahora, fecha_real: ahora });
  }
  const totalProyectado = lineas.reduce((acc, l) => acc + (l.monto_estimado as number), 0);

  const { data, error } = await clienteSupabase().rpc('registrar_compra_lote', {
    p_lote: { fecha_compra: datos.fecha_compra, origen: 'local', precio_subasta: datos.precio_compra, costo_proyectado_total: totalProyectado },
    p_lineas: lineas,
    p_laptops: datos.laptops.map((s) => laptopSpecAJson(s, 'en_revision')),
    p_idempotency_key: datos.idempotencyKey ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Alta manual eBay (mismo shape que la extensión): líneas estimadas congeladas + laptops
 * en `comprada`. Atómico vía RPC `registrar_compra_lote` (migración 0022).
 */
export async function crearLoteEbay(datos: {
  fecha_compra: string;
  url_ebay?: string;
  vendedor?: string;
  precio_subasta: number;
  envio_usa?: number;
  impuesto_ebay?: number;
  seguro?: number;
  metodo_estimado?: MetodoEstimado;
  laptops: NuevaLaptopSpec[];
  /** clave estable reusada entre reintentos del mismo submit → el RPC no duplica el lote */
  idempotencyKey?: string;
}): Promise<string> {
  const ahora = new Date().toISOString();
  const montos: Array<{ tipo: string; monto: number }> = [{ tipo: 'subasta', monto: datos.precio_subasta }];
  if (datos.envio_usa) montos.push({ tipo: 'envio_usa', monto: datos.envio_usa });
  if (datos.impuesto_ebay) montos.push({ tipo: 'impuesto_ebay', monto: datos.impuesto_ebay });
  if (datos.seguro) montos.push({ tipo: 'seguro', monto: datos.seguro });
  const lineas = montos.map((m) => ({ tipo: m.tipo, monto_estimado: m.monto, estimado_congelado_at: ahora }));
  const totalProyectado = montos.reduce((acc, m) => acc + m.monto, 0);

  const { data, error } = await clienteSupabase().rpc('registrar_compra_lote', {
    p_lote: {
      fecha_compra: datos.fecha_compra,
      origen: 'ebay',
      url_ebay: datos.url_ebay || null,
      vendedor: datos.vendedor || null,
      precio_subasta: datos.precio_subasta,
      envio_usa: datos.envio_usa ?? 0,
      metodo_estimado: datos.metodo_estimado ?? null,
      costo_proyectado_total: totalProyectado,
    },
    p_lineas: lineas,
    p_laptops: datos.laptops.map((s) => laptopSpecAJson(s, 'comprada')),
    p_idempotency_key: datos.idempotencyKey ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Registrar/actualizar el monto real de una línea de costo del lote (0 y negativos permitidos).
 *  Atómico e idempotente vía RPC `registrar_costo_real_lote` (0034): INSERT ... ON CONFLICT
 *  DO UPDATE por (user_id, ambito, ambito_id, tipo) — reemplaza el select-then-insert que ante
 *  dos pestañas/reintento creaba dos líneas 'real' del mismo (lote, tipo). */
export async function registrarCostoRealLote(loteId: string, tipo: string, montoReal: number): Promise<void> {
  const { error } = await clienteSupabase().rpc('registrar_costo_real_lote', {
    p_lote: loteId,
    p_tipo: tipo,
    p_monto: montoReal,
  });
  if (error) throw new Error(error.message);
}

export async function listarPartesCatalogo(): Promise<ParteCatalogo[]> {
  const cliente = clienteSupabase();
  const { data, error } = await cliente.from('partes_catalogo').select('id, nombre, valor_nominal').order('nombre');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listarPartesEncontradas(loteId: string): Promise<ParteEncontrada[]> {
  const cliente = clienteSupabase();
  const { data, error } = await cliente
    .from('lote_partes_encontradas')
    .select('id, parte_id, cantidad, valor_nominal_aplicado, en_stock, partes_catalogo(nombre)')
    .eq('lote_id', loteId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => {
    const catalogo = f.partes_catalogo as unknown as { nombre: string } | { nombre: string }[] | null;
    const nombre = Array.isArray(catalogo) ? catalogo[0]?.nombre : catalogo?.nombre;
    return {
      id: f.id,
      parte_id: f.parte_id,
      parte_nombre: nombre ?? '—',
      cantidad: Number(f.cantidad),
      valor_nominal_aplicado: Number(f.valor_nominal_aplicado),
      en_stock: f.en_stock,
    };
  });
}

export async function agregarParteEncontrada(
  loteId: string,
  parteId: string,
  cantidad: number,
  valorNominalAplicado: number,
): Promise<void> {
  // upsert por clave natural (lote_id, parte_id): re-agregar la misma parte al lote reemplaza
  // en vez de duplicar (0034) — antes un doble-submit/reintento inflaba v_nominales del reparto.
  const cliente = clienteSupabase();
  const { error } = await cliente.from('lote_partes_encontradas').upsert(
    { lote_id: loteId, parte_id: parteId, cantidad, valor_nominal_aplicado: valorNominalAplicado },
    { onConflict: 'lote_id,parte_id' },
  );
  if (error) throw new Error(error.message);
}

export async function yaTieneReparto(loteId: string): Promise<boolean> {
  const cliente = clienteSupabase();
  const { count, error } = await cliente
    .from('lote_reparto')
    .select('*', { count: 'exact', head: true })
    .eq('lote_id', loteId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function listarReparto(loteId: string): Promise<RepartoFila[]> {
  const cliente = clienteSupabase();
  const { data, error } = await cliente
    .from('lote_reparto')
    .select('laptop_id, valor_esperado_al_comprar, proporcion, costo_asignado, laptops(alias)')
    .eq('lote_id', loteId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => {
    const laptop = f.laptops as unknown as { alias: string | null } | { alias: string | null }[] | null;
    const alias = Array.isArray(laptop) ? laptop[0]?.alias : laptop?.alias;
    return {
      laptop_id: f.laptop_id,
      alias: alias ?? null,
      valor_esperado_al_comprar: Number(f.valor_esperado_al_comprar),
      proporcion: Number(f.proporcion),
      costo_asignado: Number(f.costo_asignado),
    };
  });
}

/** RPC congelar_reparto_lote: reparto FIJO e inmutable — llamar solo si !yaTieneReparto(loteId). */
export async function congelarReparto(loteId: string): Promise<void> {
  const cliente = clienteSupabase();
  const { error } = await cliente.rpc('congelar_reparto_lote', { p_lote: loteId });
  if (error) throw new Error(error.message);
}
