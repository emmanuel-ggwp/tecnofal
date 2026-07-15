// Repositorio de Partes — único punto de acceso a datos para /partes.
// Stock a costo promedio: SOLO LECTURA salvo dos mecanismos:
//   (a) insert en partes_compras (cantidad > 0) — el trigger fn_partes_promedio recalcula
//       cantidad y costo_promedio ponderado;
//   (b) instalar una parte commodity — UPDATE directo de partes_stock.cantidad -= 1 (nunca
//       toca costo_promedio, nunca inserta en partes_compras con cantidad negativa: el check
//       de la tabla lo prohíbe).
import { clienteSupabase } from './cliente';

export type ParteEspecificaOrigen = 'compra' | 'cosechada';

export interface ParteCatalogo {
  id: string;
  nombre: string;
  precioReferencia: number;
  valorNominal: number | null;
  volumenPie3: number | null;
  pesoKg: number | null;
}

export interface StockFila {
  parteId: string;
  parteNombre: string;
  cantidad: number;
  costoPromedio: number;
  valorTotal: number;
}

export interface ParteEspecifica {
  id: string;
  parteId: string;
  parteNombre: string;
  identificador: string | null;
  costoReal: number;
  laptopAsignadaId: string | null;
  laptopAsignadaAlias: string | null;
  origen: ParteEspecificaOrigen;
  cosechadaDeLaptopId: string | null;
}

export interface OrdenPartes {
  id: string;
  fecha: string;
  origen: string | null;
  fuente: string | null;
  envioUsa: number;
  fees: number;
  notas: string | null;
  totalItems: number;
  recibida: boolean;
}

export interface OrdenPartesItem {
  id: string;
  ordenId: string;
  parteId: string;
  parteNombre: string;
  cantidad: number;
  precioUnitario: number;
  prorrateo: number | null;
  prorrateoManual: boolean;
  recibido: boolean;
}

export interface LaptopOpcion {
  id: string;
  alias: string;
  estado: string;
  cpuTipo: string | null;
  cpuGen: number | null;
  ramGb: number | null;
  ssdGb: number | null;
}

/**
 * Identificador legible para mostrar en listas de selección (InstalarModal/CosecharModal).
 * `alias` (columna generada de `service_tag`) queda null para laptops creadas por
 * Calculadora → "Convertir en lote" hasta que alguien fije su service_tag en la ficha de
 * inventario — sin este fallback, dos o más laptops así en el mismo estado son
 * indistinguibles en el modal (fila de texto en blanco) y un click equivocado puede
 * instalar/cosechar la laptop incorrecta. Ver Hallazgos de plan-10b/plan-10c.
 */
export function etiquetaLaptop(o: LaptopOpcion): string {
  if (o.alias) return o.alias;
  const specs = [o.cpuTipo?.toUpperCase(), o.cpuGen ? `gen ${o.cpuGen}` : null].filter(Boolean).join(' ');
  const ram = o.ramGb != null ? `${o.ramGb}GB` : null;
  const ssd = o.ssdGb != null ? `${o.ssdGb}GB` : null;
  const memoria = [ram, ssd].filter(Boolean).join('/');
  const resumen = [specs, memoria].filter(Boolean).join(' · ');
  return resumen || `#${o.id.slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Catálogo (CRUD)
// ---------------------------------------------------------------------------

export async function listarCatalogo(): Promise<ParteCatalogo[]> {
  const { data, error } = await clienteSupabase()
    .from('partes_catalogo')
    .select('id, nombre, precio_referencia, valor_nominal, volumen_pie3, peso_kg')
    .order('nombre');
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id as string,
    nombre: p.nombre as string,
    precioReferencia: Number(p.precio_referencia),
    valorNominal: p.valor_nominal != null ? Number(p.valor_nominal) : null,
    volumenPie3: p.volumen_pie3 != null ? Number(p.volumen_pie3) : null,
    pesoKg: p.peso_kg != null ? Number(p.peso_kg) : null,
  }));
}

export interface ParteCatalogoInput {
  nombre: string;
  precioReferencia: number;
  valorNominal?: number | null;
  volumenPie3?: number | null;
  pesoKg?: number | null;
}

export async function crearParteCatalogo(input: ParteCatalogoInput): Promise<string> {
  const { data, error } = await clienteSupabase()
    .from('partes_catalogo')
    .insert({
      nombre: input.nombre,
      precio_referencia: input.precioReferencia,
      valor_nominal: input.valorNominal ?? null,
      volumen_pie3: input.volumenPie3 ?? null,
      peso_kg: input.pesoKg ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function actualizarParteCatalogo(id: string, cambios: Partial<ParteCatalogoInput>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) patch.nombre = cambios.nombre;
  if (cambios.precioReferencia !== undefined) patch.precio_referencia = cambios.precioReferencia;
  if (cambios.valorNominal !== undefined) patch.valor_nominal = cambios.valorNominal;
  if (cambios.volumenPie3 !== undefined) patch.volumen_pie3 = cambios.volumenPie3;
  if (cambios.pesoKg !== undefined) patch.peso_kg = cambios.pesoKg;
  if (Object.keys(patch).length === 0) return;
  const { error } = await clienteSupabase().from('partes_catalogo').update(patch).eq('id', id);
  if (error) throw error;
}

export async function eliminarParteCatalogo(id: string): Promise<void> {
  const { error } = await clienteSupabase().from('partes_catalogo').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Stock (solo lectura salvo compra rápida)
// ---------------------------------------------------------------------------

/**
 * Se parte de `partes_catalogo` (no de `partes_stock`): una parte recién creada en el
 * catálogo NO tiene fila en partes_stock hasta su primera compra — el trigger
 * fn_partes_promedio hace upsert en el primer insert de partes_compras (confirmado:
 * antes de la primera compra `select * from partes_stock where parte_id = X` no devuelve
 * filas). Left-join vía el embed reverso de PostgREST; cantidad/costo_promedio en 0 si aún
 * no hay compras.
 */
export async function listarStock(): Promise<StockFila[]> {
  const { data, error } = await clienteSupabase()
    .from('partes_catalogo')
    .select('id, nombre, partes_stock ( cantidad, costo_promedio )')
    .order('nombre');
  if (error) throw error;
  return (data ?? []).map((p: any) => {
    const cantidad = p.partes_stock?.cantidad != null ? Number(p.partes_stock.cantidad) : 0;
    const costoPromedio = p.partes_stock?.costo_promedio != null ? Number(p.partes_stock.costo_promedio) : 0;
    return {
      parteId: p.id as string,
      parteNombre: p.nombre as string,
      cantidad,
      costoPromedio,
      valorTotal: cantidad * costoPromedio,
    };
  });
}

/** Compra rápida inline: insert en partes_compras — el trigger recalcula el promedio ponderado.
 *  idempotencyKey (estable entre reintentos del mismo submit): con onConflict do-nothing, un
 *  reintento tras falso error de red NO reinserta ni corrompe el promedio/stock (0032). */
export async function registrarCompraStock(
  parteId: string,
  cantidad: number,
  costoUnitario: number,
  fecha?: string,
  idempotencyKey?: string,
): Promise<void> {
  const fila = {
    parte_id: parteId,
    cantidad,
    costo_unitario: costoUnitario,
    fecha: fecha ?? new Date().toISOString().slice(0, 10),
  };
  const cliente = clienteSupabase();
  const { error } = idempotencyKey
    ? await cliente.from('partes_compras').upsert(
        { ...fila, idempotency_key: idempotencyKey },
        { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true },
      )
    : await cliente.from('partes_compras').insert(fila);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Partes específicas
// ---------------------------------------------------------------------------

export async function listarEspecificas(): Promise<ParteEspecifica[]> {
  const { data, error } = await clienteSupabase()
    .from('partes_especificas')
    .select(
      `id, parte_id, identificador, costo_real, laptop_asignada_id, origen, cosechada_de_laptop_id,
       partes_catalogo ( nombre ), laptops!laptop_asignada_id ( alias )`,
    )
    .order('identificador');
  if (error) throw error;
  return (data ?? []).map((e: any) => ({
    id: e.id as string,
    parteId: e.parte_id as string,
    parteNombre: e.partes_catalogo?.nombre ?? '—',
    identificador: e.identificador,
    costoReal: Number(e.costo_real),
    laptopAsignadaId: e.laptop_asignada_id,
    laptopAsignadaAlias: e.laptops?.alias ?? null,
    origen: e.origen as ParteEspecificaOrigen,
    cosechadaDeLaptopId: e.cosechada_de_laptop_id,
  }));
}

export interface ParteEspecificaInput {
  parteId: string;
  identificador: string;
  costoReal: number;
}

export async function crearEspecifica(input: ParteEspecificaInput, idempotencyKey?: string): Promise<string> {
  const fila = { parte_id: input.parteId, identificador: input.identificador, costo_real: input.costoReal, origen: 'compra' };
  const cliente = clienteSupabase();
  const { data, error } = idempotencyKey
    ? await cliente.from('partes_especificas').upsert(
        { ...fila, idempotency_key: idempotencyKey },
        { onConflict: 'user_id,idempotency_key' },
      ).select('id').single()
    : await cliente.from('partes_especificas').insert(fila).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function actualizarEspecifica(
  id: string,
  cambios: { identificador?: string; costoReal?: number },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (cambios.identificador !== undefined) patch.identificador = cambios.identificador;
  if (cambios.costoReal !== undefined) patch.costo_real = cambios.costoReal;
  if (Object.keys(patch).length === 0) return;
  const { error } = await clienteSupabase().from('partes_especificas').update(patch).eq('id', id);
  if (error) throw error;
}

/** Cosecha de donante: crea una parte específica origen 'cosechada'. */
export async function cosecharParte(
  donanteLaptopId: string,
  parteId: string,
  identificador: string,
  costoReal = 0,
  idempotencyKey?: string,
): Promise<string> {
  const fila = { parte_id: parteId, identificador, costo_real: costoReal, origen: 'cosechada', cosechada_de_laptop_id: donanteLaptopId };
  const cliente = clienteSupabase();
  const { data, error } = idempotencyKey
    ? await cliente.from('partes_especificas').upsert(
        { ...fila, idempotency_key: idempotencyKey },
        { onConflict: 'user_id,idempotency_key' },
      ).select('id').single()
    : await cliente.from('partes_especificas').insert(fila).select('id').single();
  if (error) throw error;
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Instalación en laptop (commodity o específica) — consume stock/específica y crea
// laptop_partes + costo_linea. Único mecanismo de descuento (decisión de diseño del plan).
// ---------------------------------------------------------------------------

export async function listarLaptopsInstalables(busqueda = ''): Promise<LaptopOpcion[]> {
  let query = clienteSupabase()
    .from('laptops')
    .select('id, alias, estado, cpu_tipo, cpu_gen, ram_gb, ssd_gb')
    .in('estado', ['en_revision', 'falta_partes'])
    .order('alias');
  if (busqueda) query = query.ilike('alias', `%${busqueda}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id as string,
    alias: l.alias ?? '',
    estado: l.estado as string,
    cpuTipo: l.cpu_tipo ?? null,
    cpuGen: l.cpu_gen ?? null,
    ramGb: l.ram_gb ?? null,
    ssdGb: l.ssd_gb ?? null,
  }));
}

export async function listarLaptopsDonantes(busqueda = ''): Promise<LaptopOpcion[]> {
  let query = clienteSupabase()
    .from('laptops')
    .select('id, alias, estado, es_donante, cpu_tipo, cpu_gen, ram_gb, ssd_gb')
    .or('es_donante.eq.true,estado.eq.para_repuestos')
    .order('alias');
  if (busqueda) query = query.ilike('alias', `%${busqueda}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id as string,
    alias: l.alias ?? '',
    estado: l.estado as string,
    cpuTipo: l.cpu_tipo ?? null,
    cpuGen: l.cpu_gen ?? null,
    ramGb: l.ram_gb ?? null,
    ssdGb: l.ssd_gb ?? null,
  }));
}

/**
 * Instala una parte commodity desde stock. Atómico vía RPC `instalar_parte` (migración
 * 0022): descuenta partes_stock + crea laptop_partes + costo_lineas en una transacción
 * (antes eran 3 escrituras separadas desde el cliente, sin garantía de todo-o-nada).
 */
export async function instalarParteCommodity(laptopId: string, parteId: string, idempotencyKey?: string): Promise<void> {
  const { error } = await clienteSupabase().rpc('instalar_parte', {
    p_laptop_id: laptopId,
    p_parte_id: parteId,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Instala una parte específica: laptop_asignada_id = laptop, costo_aplicado = costo_real.
 * Atómico vía RPC `instalar_parte` (mismo mecanismo que la variante commodity).
 */
export async function instalarParteEspecifica(laptopId: string, especificaId: string, idempotencyKey?: string): Promise<void> {
  const { error } = await clienteSupabase().rpc('instalar_parte', {
    p_laptop_id: laptopId,
    p_especifica_id: especificaId,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Órdenes de partes
// ---------------------------------------------------------------------------

export async function listarOrdenes(): Promise<OrdenPartes[]> {
  const { data, error } = await clienteSupabase()
    .from('ordenes_partes')
    .select('id, fecha, origen, fuente, envio_usa, fees, notas, orden_partes_items ( recibido )')
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((o: any) => {
    const items = (o.orden_partes_items ?? []) as { recibido: boolean }[];
    return {
      id: o.id as string,
      fecha: o.fecha as string,
      origen: o.origen,
      fuente: o.fuente,
      envioUsa: Number(o.envio_usa),
      fees: Number(o.fees),
      notas: o.notas,
      totalItems: items.length,
      recibida: items.length > 0 && items.every((it) => it.recibido),
    };
  });
}

export interface OrdenPartesInput {
  fecha: string;
  /** NOT NULL en ordenes_partes (hallazgo real: ver Bitácora del plan). */
  origen: string;
  fuente?: string | null;
  envioUsa: number;
  fees: number;
  notas?: string | null;
}

export async function crearOrden(input: OrdenPartesInput): Promise<string> {
  const { data, error } = await clienteSupabase()
    .from('ordenes_partes')
    .insert({
      fecha: input.fecha,
      origen: input.origen,
      fuente: input.fuente ?? null,
      envio_usa: input.envioUsa,
      fees: input.fees,
      notas: input.notas ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function obtenerOrden(id: string): Promise<OrdenPartes | null> {
  const { data, error } = await clienteSupabase()
    .from('ordenes_partes')
    .select('id, fecha, origen, fuente, envio_usa, fees, notas, orden_partes_items ( recibido )')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const items = ((data as any).orden_partes_items ?? []) as { recibido: boolean }[];
  return {
    id: data.id as string,
    fecha: data.fecha as string,
    origen: (data as any).origen,
    fuente: (data as any).fuente,
    envioUsa: Number((data as any).envio_usa),
    fees: Number((data as any).fees),
    notas: (data as any).notas,
    totalItems: items.length,
    recibida: items.length > 0 && items.every((it) => it.recibido),
  };
}

export async function listarItemsOrden(ordenId: string): Promise<OrdenPartesItem[]> {
  const { data, error } = await clienteSupabase()
    .from('orden_partes_items')
    .select('id, orden_id, parte_id, cantidad, precio_unitario, prorrateo, prorrateo_manual, recibido, partes_catalogo ( nombre )')
    .eq('orden_id', ordenId)
    .order('parte_id');
  if (error) throw error;
  return (data ?? []).map((it: any) => ({
    id: it.id as string,
    ordenId: it.orden_id as string,
    parteId: it.parte_id as string,
    parteNombre: it.partes_catalogo?.nombre ?? '—',
    cantidad: Number(it.cantidad),
    precioUnitario: Number(it.precio_unitario),
    prorrateo: it.prorrateo != null ? Number(it.prorrateo) : null,
    prorrateoManual: it.prorrateo_manual as boolean,
    recibido: it.recibido as boolean,
  }));
}

export async function agregarItemOrden(
  ordenId: string,
  parteId: string,
  cantidad: number,
  precioUnitario: number,
): Promise<void> {
  const { error } = await clienteSupabase().from('orden_partes_items').insert({
    orden_id: ordenId,
    parte_id: parteId,
    cantidad,
    precio_unitario: precioUnitario,
  });
  if (error) throw error;
}

/** Botón "Prorratear": distribuye envío+fees por valor entre los ítems no manuales. */
export async function prorratearOrden(ordenId: string): Promise<void> {
  const { error } = await clienteSupabase().rpc('prorratear_orden_partes', { p_orden: ordenId });
  if (error) throw error;
}

/**
 * Edición manual de un ítem: fija su prorrateo y marca prorrateo_manual=true, luego
 * re-prorratea el resto (los no manuales se reparten lo que sobra del envío+fees).
 */
export async function fijarProrrateoManual(ordenId: string, itemId: string, prorrateo: number): Promise<void> {
  const sb = clienteSupabase();
  const { error: errUpdate } = await sb
    .from('orden_partes_items')
    .update({ prorrateo, prorrateo_manual: true })
    .eq('id', itemId);
  if (errUpdate) throw errUpdate;
  await prorratearOrden(ordenId);
}

/** Botón "Recibir": entra a stock a costo aterrizado (precio + prorrateo/cantidad). */
export async function recibirOrden(ordenId: string): Promise<void> {
  const { error } = await clienteSupabase().rpc('recibir_orden_partes', { p_orden: ordenId });
  if (error) throw error;
}
