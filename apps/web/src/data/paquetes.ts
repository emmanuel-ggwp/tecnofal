// Repositorio de datos para /lotes/paquetes (plan-04). Único punto de acceso a
// paquetes / paquete_items / la vista paquete_costos. Todo lo transaccional pasa
// por las RPC existentes (avanzar_paquete, recibir_paquete) — nunca inserts sueltos.
import { clienteSupabase } from './cliente';

export type PaqueteMetodo = 'barco' | 'avion_zoom';
export type PaqueteItemTipo = 'laptop' | 'parte' | 'personal';

export const SECUENCIA_PAQUETE_ESTADO = [
  'generada',
  'factura',
  'aduana_usa',
  'transito_internacional',
  'aduana_venezuela',
  'central_caracas',
  'transito_nacional',
  'listo_para_entregar',
  'recibido',
] as const;
export type PaqueteEstado = (typeof SECUENCIA_PAQUETE_ESTADO)[number];

export interface PaqueteResumen {
  id: string;
  courier: string | null;
  guia: string | null;
  metodo: PaqueteMetodo;
  estado: PaqueteEstado;
  fecha_recibido: string | null;
}

export interface PaqueteDetalle extends PaqueteResumen {
  volumen_estimado_pie3: number | null;
  peso_estimado_kg: number | null;
  flete_estimado: number | null;
  seguro_estimado: number | null;
  revision_estimada: number | null;
}

export interface PaqueteItem {
  id: string;
  tipo: PaqueteItemTipo;
  ref_id: string | null;
  descripcion: string | null;
  laptop_alias: string | null;
  volumen_pie3: number;
  valor_declarado: number;
  flete_prorrateado: number | null;
  seguro_prorrateado: number | null;
  revision_prorrateado: number | null;
}

export interface LaptopDisponible {
  id: string;
  alias: string | null;
  service_tag: string | null;
}

export interface PaqueteCostos {
  paquete_id: string;
  flete_real: number | null;
  seguro_real: number | null;
  revision_real: number | null;
  flete_estimado_lineas: number | null;
  seguro_estimado_lineas: number | null;
  revision_estimada_lineas: number | null;
}

export async function listarPaquetes(): Promise<PaqueteResumen[]> {
  const cliente = clienteSupabase();
  const { data, error } = await cliente
    .from('paquetes')
    .select('id, courier, guia, metodo, estado, fecha_recibido')
    .order('fecha_recibido', { ascending: false, nullsFirst: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function obtenerPaquete(id: string): Promise<PaqueteDetalle | null> {
  const cliente = clienteSupabase();
  const { data, error } = await cliente.from('paquetes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as PaqueteDetalle | null;
}

export async function crearPaquete(datos: {
  courier?: string;
  guia?: string;
  metodo: PaqueteMetodo;
  volumen_estimado_pie3?: number;
  peso_estimado_kg?: number;
  flete_estimado?: number;
  seguro_estimado?: number;
  revision_estimada?: number;
}): Promise<string> {
  const cliente = clienteSupabase();
  const { data, error } = await cliente
    .from('paquetes')
    .insert({
      courier: datos.courier || null,
      guia: datos.guia || null,
      metodo: datos.metodo,
      volumen_estimado_pie3: datos.volumen_estimado_pie3 ?? null,
      peso_estimado_kg: datos.peso_estimado_kg ?? null,
      flete_estimado: datos.flete_estimado ?? null,
      seguro_estimado: datos.seguro_estimado ?? null,
      revision_estimada: datos.revision_estimada ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function listarItemsPaquete(paqueteId: string): Promise<PaqueteItem[]> {
  const cliente = clienteSupabase();
  const { data, error } = await cliente
    .from('paquete_items')
    .select(
      'id, tipo, ref_id, descripcion, volumen_pie3, valor_declarado, flete_prorrateado, seguro_prorrateado, revision_prorrateado',
    )
    .eq('paquete_id', paqueteId);
  if (error) throw new Error(error.message);
  const items = data ?? [];

  const idsLaptop = items.filter((i) => i.tipo === 'laptop' && i.ref_id).map((i) => i.ref_id as string);
  let aliasPorLaptop = new Map<string, string | null>();
  if (idsLaptop.length > 0) {
    const { data: laptops, error: errLap } = await cliente.from('laptops').select('id, alias').in('id', idsLaptop);
    if (errLap) throw new Error(errLap.message);
    aliasPorLaptop = new Map((laptops ?? []).map((l) => [l.id as string, l.alias as string | null]));
  }

  return items.map((i) => ({
    id: i.id,
    tipo: i.tipo,
    ref_id: i.ref_id,
    descripcion: i.descripcion,
    laptop_alias: i.tipo === 'laptop' && i.ref_id ? aliasPorLaptop.get(i.ref_id) ?? null : null,
    volumen_pie3: Number(i.volumen_pie3),
    valor_declarado: Number(i.valor_declarado),
    flete_prorrateado: i.flete_prorrateado != null ? Number(i.flete_prorrateado) : null,
    seguro_prorrateado: i.seguro_prorrateado != null ? Number(i.seguro_prorrateado) : null,
    revision_prorrateado: i.revision_prorrateado != null ? Number(i.revision_prorrateado) : null,
  }));
}

/** Laptops candidatas a agregar a un paquete: solo `comprada` y sin paquete asignado. */
export async function laptopsDisponibles(): Promise<LaptopDisponible[]> {
  const cliente = clienteSupabase();
  const { data, error } = await cliente
    .from('laptops')
    .select('id, alias, service_tag')
    .eq('estado', 'comprada')
    .is('paquete_id', null)
    .order('alias');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Agrega una laptop al paquete: paquete_items + laptops.paquete_id/estado → en_transito.
 * Atómico vía RPC `agregar_item_laptop_paquete` (migración 0022) — antes eran 2 escrituras
 * separadas desde el cliente.
 */
export async function agregarItemLaptop(
  paqueteId: string,
  laptopId: string,
  volumenPie3: number,
  valorDeclarado: number,
): Promise<void> {
  const { error } = await clienteSupabase().rpc('agregar_item_laptop_paquete', {
    p_paquete_id: paqueteId,
    p_laptop_id: laptopId,
    p_volumen_pie3: volumenPie3,
    p_valor_declarado: valorDeclarado,
  });
  if (error) throw new Error(error.message);
}

export async function agregarItemParte(
  paqueteId: string,
  descripcion: string,
  volumenPie3: number,
  valorDeclarado: number,
): Promise<void> {
  const cliente = clienteSupabase();
  const { error } = await cliente.from('paquete_items').insert({
    paquete_id: paqueteId,
    tipo: 'parte',
    descripcion,
    volumen_pie3: volumenPie3,
    valor_declarado: valorDeclarado,
  });
  if (error) throw new Error(error.message);
}

/** Ítem personal: participa del prorrateo pero su costo va a gastos personales, no a laptops. */
export async function agregarItemPersonal(
  paqueteId: string,
  descripcion: string,
  volumenPie3: number,
  valorDeclarado: number,
): Promise<void> {
  const cliente = clienteSupabase();
  const { error } = await cliente.from('paquete_items').insert({
    paquete_id: paqueteId,
    tipo: 'personal',
    descripcion,
    volumen_pie3: volumenPie3,
    valor_declarado: valorDeclarado,
  });
  if (error) throw new Error(error.message);
}

/** RPC avanzar_paquete: valida la secuencia (siguiente, mismo o retroceso de 1); 'recibido' vía recibirPaquete(). */
export async function avanzarEstado(paqueteId: string, estado: PaqueteEstado): Promise<void> {
  const cliente = clienteSupabase();
  const { error } = await cliente.rpc('avanzar_paquete', { p_paquete: paqueteId, p_estado: estado });
  if (error) throw new Error(error.message);
}

/** RPC recibir_paquete: factura real (0 permitido) → recibido + prorrateo + laptops en_revision. */
export async function recibirPaquete(
  paqueteId: string,
  fleteReal: number,
  seguroReal: number,
  revisionReal: number,
): Promise<void> {
  const cliente = clienteSupabase();
  const { error } = await cliente.rpc('recibir_paquete', {
    p_paquete: paqueteId,
    p_flete_real: fleteReal,
    p_seguro_real: seguroReal,
    p_revision_real: revisionReal,
  });
  if (error) throw new Error(error.message);
}

export async function obtenerCostosPaquete(paqueteId: string): Promise<PaqueteCostos | null> {
  const cliente = clienteSupabase();
  const { data, error } = await cliente.from('paquete_costos').select('*').eq('paquete_id', paqueteId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as PaqueteCostos | null;
}
