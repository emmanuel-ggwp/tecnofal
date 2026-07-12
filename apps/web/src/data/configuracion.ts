// Repositorio de Configuración — parámetros, precios ideales, ajustes, catálogo de detalles,
// modelos/reglas de compra y avisos de modelo. Reemplaza a Supabase Studio para esta sección
// (principio nº 5). Único punto de contacto con las tablas; los componentes NO importan
// @supabase/supabase-js directamente, solo consumen estas funciones.
import { clienteSupabase } from './cliente';

export type CpuTipo = 'i3' | 'i5' | 'i7' | 'ryzen3' | 'ryzen5' | 'ryzen7' | 'otro';
export const CPU_TIPOS: CpuTipo[] = ['i3', 'i5', 'i7', 'ryzen3', 'ryzen5', 'ryzen7', 'otro'];

export type CategoriaDetalle =
  | 'specs'
  | 'carcasa'
  | 'pantalla'
  | 'puertos'
  | 'bateria'
  | 'teclado'
  | 'touchpad'
  | 'audio'
  | 'otro';
export const CATEGORIAS_DETALLE: CategoriaDetalle[] = [
  'specs',
  'carcasa',
  'pantalla',
  'puertos',
  'bateria',
  'teclado',
  'touchpad',
  'audio',
  'otro',
];

export type RamSoldada = 'no' | 'parcial' | 'total' | 'revisar';
export const RAM_SOLDADA: RamSoldada[] = ['no', 'parcial', 'total', 'revisar'];

export type ReglaCompra = 'normal' | 'condicional' | 'bloqueada';
export const REGLAS_COMPRA: ReglaCompra[] = ['normal', 'condicional', 'bloqueada'];

export type SeveridadAviso = 'bloquea' | 'condiciona' | 'advierte' | 'nota';
export const SEVERIDADES_AVISO: SeveridadAviso[] = ['bloquea', 'condiciona', 'advierte', 'nota'];

export interface Parametro {
  clave: string;
  valor: number | null;
  descripcion: string | null;
}

export interface PrecioIdeal {
  id: string;
  cpuTipo: CpuTipo;
  genDesde: number;
  genHasta: number;
  precioBase: number;
}

export interface AjusteConfig {
  clave: string;
  delta: number;
  nota: string | null;
}

export interface DetalleCatalogo {
  id: string;
  nombre: string;
  deduccionBase: number;
  categoria: CategoriaDetalle;
}

export interface Modelo {
  id: string;
  marca: string;
  modelo: string;
  cpuTipo: CpuTipo | null;
  cpuGen: number | null;
  ramSoldada: RamSoldada;
  ssdSoldado: boolean;
  reglaCompra: ReglaCompra;
  motivoRegla: string | null;
  notas: string | null;
}

export interface TipoAviso {
  id: string;
  clave: string;
  nombre: string;
}

export interface ModeloAviso {
  id: string;
  modeloId: string;
  tipoAvisoId: string;
  severidad: SeveridadAviso;
  motivo: string | null;
  origen: 'seed' | 'usuario';
  creadoAt: string;
}

// ---------------------------------------------------------------------------
// Parámetros
// ---------------------------------------------------------------------------

export async function listarParametros(): Promise<Parametro[]> {
  const { data, error } = await clienteSupabase()
    .from('parametros')
    .select('clave, valor, descripcion')
    .order('clave');
  if (error) throw new Error(`listarParametros: ${error.message}`);
  return data ?? [];
}

export async function actualizarParametro(clave: string, valor: number | null): Promise<void> {
  const { error } = await clienteSupabase().from('parametros').update({ valor }).eq('clave', clave);
  if (error) throw new Error(`actualizarParametro: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Precios ideales
// ---------------------------------------------------------------------------

interface FilaPrecioIdeal {
  id: string;
  cpu_tipo: CpuTipo;
  gen_desde: number;
  gen_hasta: number;
  precio_base: number;
}

function mapPrecioIdeal(f: FilaPrecioIdeal): PrecioIdeal {
  return { id: f.id, cpuTipo: f.cpu_tipo, genDesde: f.gen_desde, genHasta: f.gen_hasta, precioBase: f.precio_base };
}

export async function listarPreciosIdeales(): Promise<PrecioIdeal[]> {
  const { data, error } = await clienteSupabase()
    .from('precios_ideales')
    .select('id, cpu_tipo, gen_desde, gen_hasta, precio_base')
    .order('cpu_tipo')
    .order('gen_desde');
  if (error) throw new Error(`listarPreciosIdeales: ${error.message}`);
  return (data ?? []).map(mapPrecioIdeal);
}

export async function crearPrecioIdeal(p: Omit<PrecioIdeal, 'id'>): Promise<PrecioIdeal> {
  const { data, error } = await clienteSupabase()
    .from('precios_ideales')
    .insert({ cpu_tipo: p.cpuTipo, gen_desde: p.genDesde, gen_hasta: p.genHasta, precio_base: p.precioBase })
    .select('id, cpu_tipo, gen_desde, gen_hasta, precio_base')
    .single();
  if (error) throw new Error(`crearPrecioIdeal: ${error.message}`);
  return mapPrecioIdeal(data);
}

export async function actualizarPrecioIdeal(id: string, cambios: Partial<Omit<PrecioIdeal, 'id'>>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (cambios.cpuTipo !== undefined) payload.cpu_tipo = cambios.cpuTipo;
  if (cambios.genDesde !== undefined) payload.gen_desde = cambios.genDesde;
  if (cambios.genHasta !== undefined) payload.gen_hasta = cambios.genHasta;
  if (cambios.precioBase !== undefined) payload.precio_base = cambios.precioBase;
  const { error } = await clienteSupabase().from('precios_ideales').update(payload).eq('id', id);
  if (error) throw new Error(`actualizarPrecioIdeal: ${error.message}`);
}

export async function eliminarPrecioIdeal(id: string): Promise<void> {
  const { error } = await clienteSupabase().from('precios_ideales').delete().eq('id', id);
  if (error) throw new Error(`eliminarPrecioIdeal: ${error.message}`);
}

/**
 * Detecta solapes de rango (gen_desde..gen_hasta) entre precios ideales del MISMO cpu_tipo.
 * Es solo advertencia de UI (el plan no pide bloquear el guardado). Devuelve el conjunto de
 * ids involucrados en al menos un solape.
 */
export function detectarSolapes(precios: PrecioIdeal[]): Set<string> {
  const solapados = new Set<string>();
  for (let i = 0; i < precios.length; i++) {
    for (let j = i + 1; j < precios.length; j++) {
      const a = precios[i];
      const b = precios[j];
      if (a.cpuTipo !== b.cpuTipo) continue;
      if (a.genDesde <= b.genHasta && b.genDesde <= a.genHasta) {
        solapados.add(a.id);
        solapados.add(b.id);
      }
    }
  }
  return solapados;
}

// ---------------------------------------------------------------------------
// Ajustes de configuración
// ---------------------------------------------------------------------------

export async function listarAjustes(): Promise<AjusteConfig[]> {
  const { data, error } = await clienteSupabase().from('ajustes_config').select('clave, delta, nota').order('clave');
  if (error) throw new Error(`listarAjustes: ${error.message}`);
  return data ?? [];
}

export async function actualizarAjuste(clave: string, cambios: { delta?: number; nota?: string | null }): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (cambios.delta !== undefined) payload.delta = cambios.delta;
  if (cambios.nota !== undefined) payload.nota = cambios.nota;
  const { error } = await clienteSupabase().from('ajustes_config').update(payload).eq('clave', clave);
  if (error) throw new Error(`actualizarAjuste: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Detalles / catálogo
// ---------------------------------------------------------------------------

interface FilaDetalle {
  id: string;
  nombre: string;
  deduccion_base: number;
  categoria: CategoriaDetalle;
}

function mapDetalle(f: FilaDetalle): DetalleCatalogo {
  return { id: f.id, nombre: f.nombre, deduccionBase: f.deduccion_base, categoria: f.categoria };
}

export async function listarDetalles(): Promise<DetalleCatalogo[]> {
  const { data, error } = await clienteSupabase()
    .from('detalles_catalogo')
    .select('id, nombre, deduccion_base, categoria')
    .order('categoria')
    .order('nombre');
  if (error) throw new Error(`listarDetalles: ${error.message}`);
  return (data ?? []).map(mapDetalle);
}

export async function crearDetalle(d: Omit<DetalleCatalogo, 'id'>): Promise<DetalleCatalogo> {
  const { data, error } = await clienteSupabase()
    .from('detalles_catalogo')
    .insert({ nombre: d.nombre, deduccion_base: d.deduccionBase, categoria: d.categoria })
    .select('id, nombre, deduccion_base, categoria')
    .single();
  if (error) throw new Error(`crearDetalle: ${error.message}`);
  return mapDetalle(data);
}

export async function actualizarDetalle(id: string, cambios: Partial<Omit<DetalleCatalogo, 'id'>>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) payload.nombre = cambios.nombre;
  if (cambios.deduccionBase !== undefined) payload.deduccion_base = cambios.deduccionBase;
  if (cambios.categoria !== undefined) payload.categoria = cambios.categoria;
  const { error } = await clienteSupabase().from('detalles_catalogo').update(payload).eq('id', id);
  if (error) throw new Error(`actualizarDetalle: ${error.message}`);
}

export async function eliminarDetalle(id: string): Promise<void> {
  const { error } = await clienteSupabase().from('detalles_catalogo').delete().eq('id', id);
  if (error) throw new Error(`eliminarDetalle: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Modelos (GLOBAL)
// ---------------------------------------------------------------------------

interface FilaModelo {
  id: string;
  marca: string;
  modelo: string;
  cpu_tipo: CpuTipo | null;
  cpu_gen: number | null;
  ram_soldada: RamSoldada;
  ssd_soldado: boolean;
  regla_compra: ReglaCompra;
  motivo_regla: string | null;
  notas: string | null;
}

function mapModelo(f: FilaModelo): Modelo {
  return {
    id: f.id,
    marca: f.marca,
    modelo: f.modelo,
    cpuTipo: f.cpu_tipo,
    cpuGen: f.cpu_gen,
    ramSoldada: f.ram_soldada,
    ssdSoldado: f.ssd_soldado,
    reglaCompra: f.regla_compra,
    motivoRegla: f.motivo_regla,
    notas: f.notas,
  };
}

export interface FiltrosModelos {
  texto?: string;
  marca?: string;
  reglaCompra?: ReglaCompra;
  ramSoldada?: RamSoldada;
}

const SELECT_MODELO = 'id, marca, modelo, cpu_tipo, cpu_gen, ram_soldada, ssd_soldado, regla_compra, motivo_regla, notas';

export async function listarModelos(filtros: FiltrosModelos = {}): Promise<Modelo[]> {
  let query = clienteSupabase().from('modelos').select(SELECT_MODELO).order('marca').order('modelo');
  if (filtros.marca) query = query.eq('marca', filtros.marca);
  if (filtros.reglaCompra) query = query.eq('regla_compra', filtros.reglaCompra);
  if (filtros.ramSoldada) query = query.eq('ram_soldada', filtros.ramSoldada);
  if (filtros.texto) {
    const t = filtros.texto.replace(/[%,]/g, '');
    query = query.or(`marca.ilike.%${t}%,modelo.ilike.%${t}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`listarModelos: ${error.message}`);
  return (data ?? []).map(mapModelo);
}

export async function crearModelo(m: Omit<Modelo, 'id'>): Promise<Modelo> {
  const { data, error } = await clienteSupabase()
    .from('modelos')
    .insert({
      marca: m.marca,
      modelo: m.modelo,
      cpu_tipo: m.cpuTipo,
      cpu_gen: m.cpuGen,
      ram_soldada: m.ramSoldada,
      ssd_soldado: m.ssdSoldado,
      regla_compra: m.reglaCompra,
      motivo_regla: m.motivoRegla,
      notas: m.notas,
    })
    .select(SELECT_MODELO)
    .single();
  if (error) throw new Error(`crearModelo: ${error.message}`);
  return mapModelo(data);
}

export async function actualizarModelo(id: string, cambios: Partial<Omit<Modelo, 'id'>>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (cambios.marca !== undefined) payload.marca = cambios.marca;
  if (cambios.modelo !== undefined) payload.modelo = cambios.modelo;
  if (cambios.cpuTipo !== undefined) payload.cpu_tipo = cambios.cpuTipo;
  if (cambios.cpuGen !== undefined) payload.cpu_gen = cambios.cpuGen;
  if (cambios.ramSoldada !== undefined) payload.ram_soldada = cambios.ramSoldada;
  if (cambios.ssdSoldado !== undefined) payload.ssd_soldado = cambios.ssdSoldado;
  if (cambios.reglaCompra !== undefined) payload.regla_compra = cambios.reglaCompra;
  if (cambios.motivoRegla !== undefined) payload.motivo_regla = cambios.motivoRegla;
  if (cambios.notas !== undefined) payload.notas = cambios.notas;
  const { error } = await clienteSupabase().from('modelos').update(payload).eq('id', id);
  if (error) throw new Error(`actualizarModelo: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Tipos de aviso (GLOBAL, catálogo fijo — sin CRUD desde esta pantalla)
// ---------------------------------------------------------------------------

export async function listarTiposAviso(): Promise<TipoAviso[]> {
  const { data, error } = await clienteSupabase().from('tipos_aviso').select('id, clave, nombre').order('nombre');
  if (error) throw new Error(`listarTiposAviso: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Avisos de modelo (GLOBAL)
// ---------------------------------------------------------------------------
// Nota: el esquema real difiere del descrito en el plan (ver Bitácora de
// planes/plan-02-configuracion.md): la FK a tipos_aviso es `tipo_aviso_id` (uuid, no
// `tipo_clave`), no hay columna `autor` (hay `user_id`, estampada sola por el trigger
// `trg_autor`/`fn_set_user_id()` — la app nunca la envía) y la fecha es `created_at`
// (no `creado_at`).

interface FilaModeloAviso {
  id: string;
  modelo_id: string;
  tipo_aviso_id: string;
  severidad: SeveridadAviso;
  motivo: string | null;
  origen: 'seed' | 'usuario';
  created_at: string;
}

function mapAviso(f: FilaModeloAviso): ModeloAviso {
  return {
    id: f.id,
    modeloId: f.modelo_id,
    tipoAvisoId: f.tipo_aviso_id,
    severidad: f.severidad,
    motivo: f.motivo,
    origen: f.origen,
    creadoAt: f.created_at,
  };
}

const SELECT_AVISO = 'id, modelo_id, tipo_aviso_id, severidad, motivo, origen, created_at';

export async function listarAvisosPorModelo(modeloId: string): Promise<ModeloAviso[]> {
  const { data, error } = await clienteSupabase()
    .from('modelo_avisos')
    .select(SELECT_AVISO)
    .eq('modelo_id', modeloId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listarAvisosPorModelo: ${error.message}`);
  return (data ?? []).map(mapAviso);
}

export async function crearAviso(a: {
  modeloId: string;
  tipoAvisoId: string;
  severidad: SeveridadAviso;
  motivo: string | null;
}): Promise<ModeloAviso> {
  const { data, error } = await clienteSupabase()
    .from('modelo_avisos')
    .insert({
      modelo_id: a.modeloId,
      tipo_aviso_id: a.tipoAvisoId,
      severidad: a.severidad,
      motivo: a.motivo,
      origen: 'usuario',
    })
    .select(SELECT_AVISO)
    .single();
  if (error) throw new Error(`crearAviso: ${error.message}`);
  return mapAviso(data);
}

export async function eliminarAviso(id: string): Promise<void> {
  const { error } = await clienteSupabase().from('modelo_avisos').delete().eq('id', id);
  if (error) throw new Error(`eliminarAviso: ${error.message}`);
}
