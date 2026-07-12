// Repositorio de Inventario — único punto de acceso a datos para /inventario.
// Los valores derivados (precio sugerido, costos, desviaciones) se leen SIEMPRE de las
// vistas SQL (v_laptop_precio_sugerido, v_laptop_costos, v_laptop_desviacion,
// v_sugerencia_partes_completas) — nunca se recalculan aquí.
import { clienteSupabase } from './cliente';

export type LaptopEstado =
  | 'evaluando'
  | 'comprada'
  | 'en_transito'
  | 'en_revision'
  | 'falta_partes'
  | 'lista_para_venta'
  | 'reservada'
  | 'vendida'
  | 'para_repuestos';

export type PaqueteEstado =
  | 'generada'
  | 'factura'
  | 'aduana_usa'
  | 'transito_internacional'
  | 'aduana_venezuela'
  | 'central_caracas'
  | 'transito_nacional'
  | 'listo_para_entregar'
  | 'recibido';

export type CpuTipo = 'i3' | 'i5' | 'i7' | 'ryzen3' | 'ryzen5' | 'ryzen7' | 'otro';
export type CondicionEstado = 'ok' | 'detalle' | 'malo';
export type PantallaCondicion = 'ok' | 'manchas' | 'lineas' | 'rota';
export type CostoTipo =
  | 'subasta'
  | 'envio_usa'
  | 'impuesto_ebay'
  | 'seguro'
  | 'envio_vzla'
  | 'flete_nacional'
  | 'revision'
  | 'parte'
  | 'reparacion'
  | 'otro';

export const ESTADO_ETIQUETAS: Record<LaptopEstado, string> = {
  evaluando: 'Evaluando',
  comprada: 'Comprada',
  en_transito: 'En tránsito',
  en_revision: 'En revisión',
  falta_partes: 'Falta partes',
  lista_para_venta: 'Lista para venta',
  reservada: 'Reservada',
  vendida: 'Vendida',
  para_repuestos: 'Para repuestos',
};

/** Tono de Chip sugerido por estado (solo UI; no es un valor de negocio). */
export const ESTADO_TONOS: Record<LaptopEstado, 'verde' | 'amarillo' | 'rojo' | 'azul' | 'gris'> = {
  evaluando: 'gris',
  comprada: 'azul',
  en_transito: 'azul',
  en_revision: 'amarillo',
  falta_partes: 'amarillo',
  lista_para_venta: 'verde',
  reservada: 'verde',
  vendida: 'gris',
  para_repuestos: 'rojo',
};

export const TIPO_COSTO_ETIQUETAS: Record<CostoTipo, string> = {
  subasta: 'Subasta',
  envio_usa: 'Envío USA',
  impuesto_ebay: 'Impuesto eBay',
  seguro: 'Seguro',
  envio_vzla: 'Envío Vzla.',
  flete_nacional: 'Flete nacional',
  revision: 'Revisión',
  parte: 'Parte',
  reparacion: 'Reparación',
  otro: 'Otro',
};

export const PAQUETE_ETIQUETAS: Record<PaqueteEstado, string> = {
  generada: 'Generada',
  factura: 'Factura',
  aduana_usa: 'Aduana USA',
  transito_internacional: 'Tránsito internacional',
  aduana_venezuela: 'Aduana Venezuela',
  central_caracas: 'Central Caracas',
  transito_nacional: 'Tránsito nacional',
  listo_para_entregar: 'Listo para entregar',
  recibido: 'Recibido',
};

/**
 * Transiciones manuales permitidas desde esta pantalla (§ contexto del plan-03).
 * Vender (→ vendida) y recibir paquete se gestionan en otros planes.
 */
export const TRANSICIONES_VALIDAS: Record<LaptopEstado, LaptopEstado[]> = {
  evaluando: ['para_repuestos'],
  comprada: ['para_repuestos'],
  en_transito: ['para_repuestos'],
  en_revision: ['falta_partes', 'lista_para_venta', 'para_repuestos'],
  falta_partes: ['lista_para_venta', 'para_repuestos'],
  lista_para_venta: ['reservada', 'para_repuestos'],
  reservada: ['lista_para_venta', 'para_repuestos'],
  vendida: ['para_repuestos'],
  para_repuestos: ['en_revision'],
};

export interface LaptopListado {
  id: string;
  alias: string;
  serviceTag: string | null;
  modeloId: string | null;
  modeloNombre: string;
  cpuTipo: CpuTipo | null;
  cpuGen: number | null;
  ramGb: number | null;
  ssdGb: number | null;
  pantallaPulgadas: number | null;
  pantallaTactil: boolean;
  estado: LaptopEstado;
  estadoMostrado: string;
  esDonante: boolean;
  tieneDetalles: boolean;
  bateriaHoras: number | null;
  precioSugerido: number | null;
  costoActual: number | null;
  gananciaPotencial: number | null;
}

export interface FiltrosInventario {
  estado?: LaptopEstado;
  modeloId?: string;
  cpuGen?: number;
  conDetalles?: boolean;
  bateriaMin?: number;
  esDonante?: boolean;
  busqueda?: string;
}

interface FilaLaptopBase {
  id: string;
  service_tag: string | null;
  alias: string | null;
  cpu_tipo: CpuTipo | null;
  cpu_gen: number | null;
  ram_gb: number | null;
  ssd_gb: number | null;
  pantalla_pulgadas: number | null;
  pantalla_tactil: boolean;
  estado: LaptopEstado;
  es_donante: boolean;
  paquete_id: string | null;
  modelos: { id: string; marca: string; modelo: string; cpu_tipo: CpuTipo | null; cpu_gen: number | null } | null;
  paquetes: { estado: PaqueteEstado } | null;
  laptop_condicion: { bateria_horas: number | null }[] | null;
  laptop_detalles: { id: string }[] | null;
}

/** Listado de laptops con specs, estado efectivo y valores derivados (vistas). Filtra en cliente
 * lo que no es práctico filtrar en el servidor (generación efectiva, detalles, batería). */
export async function listarLaptops(filtros: FiltrosInventario = {}): Promise<LaptopListado[]> {
  const sb = clienteSupabase();
  let query = sb
    .from('laptops')
    .select(
      `id, service_tag, alias, cpu_tipo, cpu_gen, ram_gb, ssd_gb, pantalla_pulgadas, pantalla_tactil,
       estado, es_donante, paquete_id,
       modelos ( id, marca, modelo, cpu_tipo, cpu_gen ),
       paquetes ( estado ),
       laptop_condicion ( bateria_horas ),
       laptop_detalles ( id )`,
    )
    .order('alias', { ascending: true });

  if (filtros.estado) query = query.eq('estado', filtros.estado);
  if (filtros.modeloId) query = query.eq('modelo_id', filtros.modeloId);
  if (typeof filtros.esDonante === 'boolean') query = query.eq('es_donante', filtros.esDonante);
  if (filtros.busqueda) query = query.ilike('alias', `%${filtros.busqueda}%`);

  const { data, error } = await query;
  if (error) throw error;
  const filas = (data ?? []) as unknown as FilaLaptopBase[];

  const ids = filas.map((f) => f.id);
  const [precios, costos] = await Promise.all([
    ids.length
      ? sb.from('v_laptop_precio_sugerido').select('laptop_id, precio_sugerido').in('laptop_id', ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? sb.from('v_laptop_costos').select('laptop_id, costo_final').in('laptop_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (precios.error) throw precios.error;
  if (costos.error) throw costos.error;

  const mapaPrecio = new Map<string, number | null>(
    (precios.data ?? []).map((r: any) => [r.laptop_id as string, r.precio_sugerido as number | null]),
  );
  const mapaCosto = new Map<string, number | null>(
    (costos.data ?? []).map((r: any) => [r.laptop_id as string, r.costo_final as number | null]),
  );

  let resultado: LaptopListado[] = filas.map((f) => {
    const modelo = f.modelos;
    const cpuGenEfectiva = f.cpu_gen ?? modelo?.cpu_gen ?? null;
    const cpuTipoEfectivo = f.cpu_tipo ?? modelo?.cpu_tipo ?? null;
    const bateriaHoras = f.laptop_condicion?.[0]?.bateria_horas ?? null;
    const precioSugerido = mapaPrecio.get(f.id) ?? null;
    const costoActual = mapaCosto.get(f.id) ?? null;
    return {
      id: f.id,
      alias: f.alias ?? '',
      serviceTag: f.service_tag,
      modeloId: modelo?.id ?? null,
      modeloNombre: modelo ? `${modelo.marca} ${modelo.modelo}` : '—',
      cpuTipo: cpuTipoEfectivo,
      cpuGen: cpuGenEfectiva,
      ramGb: f.ram_gb,
      ssdGb: f.ssd_gb,
      pantallaPulgadas: f.pantalla_pulgadas,
      pantallaTactil: f.pantalla_tactil,
      estado: f.estado,
      estadoMostrado:
        f.estado === 'en_transito' && f.paquetes ? PAQUETE_ETIQUETAS[f.paquetes.estado] : ESTADO_ETIQUETAS[f.estado],
      esDonante: f.es_donante,
      tieneDetalles: (f.laptop_detalles?.length ?? 0) > 0,
      bateriaHoras,
      precioSugerido,
      costoActual,
      gananciaPotencial: precioSugerido != null && costoActual != null ? precioSugerido - costoActual : null,
    };
  });

  if (filtros.cpuGen != null) resultado = resultado.filter((r) => r.cpuGen === filtros.cpuGen);
  if (typeof filtros.conDetalles === 'boolean') {
    resultado = resultado.filter((r) => r.tieneDetalles === filtros.conDetalles);
  }
  if (filtros.bateriaMin != null) {
    resultado = resultado.filter((r) => r.bateriaHoras != null && r.bateriaHoras >= filtros.bateriaMin!);
  }
  return resultado;
}

export interface ModeloOpcion {
  id: string;
  etiqueta: string;
}

/** Modelos existentes (para el filtro marca/modelo). */
export async function listarModelosParaFiltro(): Promise<ModeloOpcion[]> {
  const { data, error } = await clienteSupabase().from('modelos').select('id, marca, modelo').order('marca');
  if (error) throw error;
  return (data ?? []).map((m) => ({ id: m.id as string, etiqueta: `${m.marca} ${m.modelo}` }));
}

// ---------------------------------------------------------------------------
// Ficha de laptop
// ---------------------------------------------------------------------------

export interface CondicionLaptop {
  bateriaHoras: number | null;
  pantalla: PantallaCondicion;
  puertosMalos: Record<string, boolean>;
  teclado: CondicionEstado;
  touchpad: CondicionEstado;
  bisagras: CondicionEstado;
  carcasa: CondicionEstado;
  audio: CondicionEstado;
  notas: string | null;
}

export interface DetalleAplicado {
  id: string;
  detalleId: string;
  nombre: string;
  deduccionAplicada: number;
  notas: string | null;
}

export interface ParteInstalada {
  id: string;
  parteNombre: string;
  identificador: string | null;
  costoAplicado: number;
  fecha: string;
}

export interface LineaCosto {
  id: string;
  tipo: CostoTipo;
  montoEstimado: number | null;
  montoReal: number | null;
  fechaReal: string | null;
  descripcion: string | null;
}

export interface DesviacionTipo {
  tipo: CostoTipo;
  estimado: number | null;
  real: number | null;
  desviacion: number | null;
}

export interface LaptopFicha {
  id: string;
  alias: string;
  serviceTag: string | null;
  loteId: string | null;
  modeloNombre: string;
  cpuTipo: CpuTipo | null;
  cpuGen: number | null;
  ramGb: number | null;
  ssdGb: number | null;
  tieneHdd: boolean;
  pantallaPulgadas: number | null;
  pantallaTactil: boolean;
  estado: LaptopEstado;
  estadoMostrado: string;
  esDonante: boolean;
  fotos: string[];
  precioBase: number | null;
  precioSugerido: number | null;
  deduccionesTotal: number;
  costos: {
    costoLote: number | null;
    prorrateoPaquete: number | null;
    lineasEstimado: number | null;
    lineasActual: number | null;
    partesActual: number | null;
    costoDirecto: number | null;
    costoProyectado: number | null;
    costoFinal: number | null;
  } | null;
  desviaciones: DesviacionTipo[];
  lineasCosto: LineaCosto[];
  condicion: CondicionLaptop | null;
  detalles: DetalleAplicado[];
  partes: ParteInstalada[];
  sugerenciaPartesCompletas: boolean;
}

/** Ficha completa de una laptop; null si no existe (o no pertenece al usuario). */
export async function obtenerFicha(id: string): Promise<LaptopFicha | null> {
  const sb = clienteSupabase();

  const { data: base, error: errBase } = await sb
    .from('laptops')
    .select(
      `id, service_tag, alias, cpu_tipo, cpu_gen, ram_gb, ssd_gb, tiene_hdd, pantalla_pulgadas, pantalla_tactil,
       estado, es_donante, fotos, paquete_id, lote_id,
       modelos ( marca, modelo, cpu_tipo, cpu_gen ),
       paquetes ( estado )`,
    )
    .eq('id', id)
    .maybeSingle();
  if (errBase) throw errBase;
  if (!base) return null;

  const modelo = (base as any).modelos as { marca: string; modelo: string; cpu_tipo: CpuTipo | null; cpu_gen: number | null } | null;
  const paquete = (base as any).paquetes as { estado: PaqueteEstado } | null;
  const estado = (base as any).estado as LaptopEstado;

  const [precio, costos, desviaciones, condicion, detalles, partes, lineas, sugerencia] = await Promise.all([
    sb.from('v_laptop_precio_sugerido').select('precio_base, precio_sugerido').eq('laptop_id', id).maybeSingle(),
    sb
      .from('v_laptop_costos')
      .select('costo_lote, prorrateo_paquete, lineas_estimado, lineas_actual, partes_actual, costo_directo, costo_proyectado, costo_final')
      .eq('laptop_id', id)
      .maybeSingle(),
    sb.from('v_laptop_desviacion').select('tipo, estimado, real, desviacion').eq('laptop_id', id).order('tipo'),
    sb
      .from('laptop_condicion')
      .select('bateria_horas, pantalla, puertos_malos, teclado, touchpad, bisagras, carcasa, audio, notas')
      .eq('laptop_id', id)
      .maybeSingle(),
    sb
      .from('laptop_detalles')
      .select('id, detalle_id, deduccion_aplicada, notas, detalles_catalogo ( nombre )')
      .eq('laptop_id', id),
    sb
      .from('laptop_partes')
      .select('id, costo_aplicado, fecha, partes_catalogo ( nombre ), partes_especificas ( identificador )')
      .eq('laptop_id', id)
      .order('fecha', { ascending: false }),
    sb
      .from('costo_lineas')
      .select('id, tipo, monto_estimado, monto_real, fecha_real, descripcion')
      .eq('ambito', 'laptop')
      .eq('ambito_id', id)
      .order('tipo'),
    sb.from('v_sugerencia_partes_completas').select('laptop_id').eq('laptop_id', id).maybeSingle(),
  ]);

  if (precio.error) throw precio.error;
  if (costos.error) throw costos.error;
  if (desviaciones.error) throw desviaciones.error;
  if (condicion.error) throw condicion.error;
  if (detalles.error) throw detalles.error;
  if (partes.error) throw partes.error;
  if (lineas.error) throw lineas.error;
  if (sugerencia.error) throw sugerencia.error;

  const detallesAplicados: DetalleAplicado[] = (detalles.data ?? []).map((d: any) => ({
    id: d.id,
    detalleId: d.detalle_id,
    nombre: d.detalles_catalogo?.nombre ?? '—',
    deduccionAplicada: Number(d.deduccion_aplicada),
    notas: d.notas,
  }));
  const deduccionesTotal = detallesAplicados.reduce((acc, d) => acc + d.deduccionAplicada, 0);

  const condData = condicion.data as any;

  return {
    id: base.id,
    alias: (base as any).alias ?? '',
    serviceTag: (base as any).service_tag,
    loteId: (base as any).lote_id ?? null,
    modeloNombre: modelo ? `${modelo.marca} ${modelo.modelo}` : '—',
    cpuTipo: (base as any).cpu_tipo ?? modelo?.cpu_tipo ?? null,
    cpuGen: (base as any).cpu_gen ?? modelo?.cpu_gen ?? null,
    ramGb: (base as any).ram_gb,
    ssdGb: (base as any).ssd_gb,
    tieneHdd: (base as any).tiene_hdd,
    pantallaPulgadas: (base as any).pantalla_pulgadas,
    pantallaTactil: (base as any).pantalla_tactil,
    estado,
    estadoMostrado: estado === 'en_transito' && paquete ? PAQUETE_ETIQUETAS[paquete.estado] : ESTADO_ETIQUETAS[estado],
    esDonante: (base as any).es_donante,
    fotos: (base as any).fotos ?? [],
    precioBase: precio.data?.precio_base ?? null,
    precioSugerido: precio.data?.precio_sugerido ?? null,
    deduccionesTotal,
    costos: costos.data
      ? {
          costoLote: costos.data.costo_lote,
          prorrateoPaquete: costos.data.prorrateo_paquete,
          lineasEstimado: costos.data.lineas_estimado,
          lineasActual: costos.data.lineas_actual,
          partesActual: costos.data.partes_actual,
          costoDirecto: costos.data.costo_directo,
          costoProyectado: costos.data.costo_proyectado,
          costoFinal: costos.data.costo_final,
        }
      : null,
    desviaciones: (desviaciones.data ?? []).map((d: any) => ({
      tipo: d.tipo,
      estimado: d.estimado,
      real: d.real,
      desviacion: d.desviacion,
    })),
    lineasCosto: (lineas.data ?? []).map((l: any) => ({
      id: l.id,
      tipo: l.tipo,
      montoEstimado: l.monto_estimado,
      montoReal: l.monto_real,
      fechaReal: l.fecha_real,
      descripcion: l.descripcion,
    })),
    condicion: condData
      ? {
          bateriaHoras: condData.bateria_horas,
          pantalla: condData.pantalla,
          puertosMalos: condData.puertos_malos ?? {},
          teclado: condData.teclado,
          touchpad: condData.touchpad,
          bisagras: condData.bisagras,
          carcasa: condData.carcasa,
          audio: condData.audio,
          notas: condData.notas,
        }
      : null,
    detalles: detallesAplicados,
    partes: (partes.data ?? []).map((p: any) => ({
      id: p.id,
      parteNombre: p.partes_catalogo?.nombre ?? '—',
      identificador: p.partes_especificas?.identificador ?? null,
      costoAplicado: Number(p.costo_aplicado),
      fecha: p.fecha,
    })),
    sugerenciaPartesCompletas: !!sugerencia.data,
  };
}

/** Actualiza specs editables tras un upgrade (ram/ssd). */
export async function actualizarSpecs(id: string, cambios: { ramGb?: number; ssdGb?: number }): Promise<void> {
  const patch: Record<string, number> = {};
  if (cambios.ramGb != null) patch.ram_gb = cambios.ramGb;
  if (cambios.ssdGb != null) patch.ssd_gb = cambios.ssdGb;
  if (Object.keys(patch).length === 0) return;
  const { error } = await clienteSupabase().from('laptops').update(patch).eq('id', id);
  if (error) throw error;
}

/**
 * Fija/edita el `service_tag` (etiqueta física de la laptop). `alias` es una columna
 * generada (`right(service_tag, 4)`) que se recalcula sola al guardar — necesario sobre
 * todo para laptops creadas por Calculadora → "Convertir en lote", que nacen sin
 * service_tag y por tanto sin alias (ver Hallazgos de plan-10b/plan-10c).
 */
export async function actualizarServiceTag(id: string, serviceTag: string): Promise<void> {
  const valor = serviceTag.trim();
  const { error } = await clienteSupabase()
    .from('laptops')
    .update({ service_tag: valor || null })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Transición de estado manual con validación de origen; falla si el estado ya cambió
 * (guarda `.eq('estado', desde)` para evitar condiciones de carrera).
 */
export async function transicionarEstado(id: string, desde: LaptopEstado, hasta: LaptopEstado): Promise<void> {
  if (!TRANSICIONES_VALIDAS[desde]?.includes(hasta)) {
    throw new Error(`Transición no permitida: ${ESTADO_ETIQUETAS[desde]} → ${ESTADO_ETIQUETAS[hasta]}`);
  }
  const { data, error } = await clienteSupabase()
    .from('laptops')
    .update({ estado: hasta })
    .eq('id', id)
    .eq('estado', desde)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('El estado cambió mientras tanto; recarga la ficha e intenta de nuevo.');
  }
}

/** Checklist de condición — upsert (crea o actualiza la fila única por laptop). */
export async function guardarCondicion(laptopId: string, condicion: CondicionLaptop): Promise<void> {
  const { error } = await clienteSupabase()
    .from('laptop_condicion')
    .upsert(
      {
        laptop_id: laptopId,
        bateria_horas: condicion.bateriaHoras,
        pantalla: condicion.pantalla,
        puertos_malos: condicion.puertosMalos,
        teclado: condicion.teclado,
        touchpad: condicion.touchpad,
        bisagras: condicion.bisagras,
        carcasa: condicion.carcasa,
        audio: condicion.audio,
        notas: condicion.notas,
      },
      { onConflict: 'laptop_id' },
    );
  if (error) throw error;
}

export interface DetalleCatalogo {
  id: string;
  nombre: string;
  deduccionBase: number;
  categoria: string;
}

/** Catálogo de detalles disponible para dar de alta en la ficha. */
export async function listarCatalogoDetalles(): Promise<DetalleCatalogo[]> {
  const { data, error } = await clienteSupabase()
    .from('detalles_catalogo')
    .select('id, nombre, deduccion_base, categoria')
    .order('nombre');
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id,
    nombre: d.nombre,
    deduccionBase: Number(d.deduccion_base),
    categoria: d.categoria,
  }));
}

/** Agrega un detalle aplicado (deducción prellenada editable por el llamador). */
export async function agregarDetalle(
  laptopId: string,
  detalleId: string,
  deduccionAplicada: number,
  notas?: string,
): Promise<void> {
  const { error } = await clienteSupabase()
    .from('laptop_detalles')
    .insert({ laptop_id: laptopId, detalle_id: detalleId, deduccion_aplicada: deduccionAplicada, notas: notas ?? null });
  if (error) throw error;
}

/** Quita un detalle aplicado. */
export async function quitarDetalle(laptopDetalleId: string): Promise<void> {
  const { error } = await clienteSupabase().from('laptop_detalles').delete().eq('id', laptopDetalleId);
  if (error) throw error;
}

/** Registra el monto real (y fecha) de una línea de costo estimada. Admite 0 y negativos. */
export async function registrarMontoReal(lineaId: string, montoReal: number, fechaReal: string): Promise<void> {
  const { error } = await clienteSupabase()
    .from('costo_lineas')
    .update({ monto_real: montoReal, fecha_real: fechaReal })
    .eq('id', lineaId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Fotos (Supabase Storage)
// ---------------------------------------------------------------------------

const BUCKET_FOTOS = 'laptops';
let bucketAsegurado = false;

/** Crea el bucket `laptops` si no existe (idempotente). No falla si ya existe. */
export async function asegurarBucketFotos(): Promise<void> {
  if (bucketAsegurado) return;
  const { error } = await clienteSupabase().storage.createBucket(BUCKET_FOTOS, { public: true });
  if (error && !/already exists|ya existe|duplicate/i.test(error.message)) {
    // No relanzamos como fatal: puede ser una restricción de permisos (ver Bitácora del plan-03).
    throw error;
  }
  bucketAsegurado = true;
}

/** URL pública de una foto a partir de su path guardado en `laptops.fotos[]`. */
export function urlFoto(path: string): string {
  return clienteSupabase().storage.from(BUCKET_FOTOS).getPublicUrl(path).data.publicUrl;
}

/** Sube una foto y la agrega a `fotos[]`; devuelve el path guardado. */
export async function subirFoto(laptopId: string, archivo: File): Promise<string> {
  await asegurarBucketFotos();
  const sb = clienteSupabase();
  const path = `${laptopId}/${Date.now()}-${archivo.name}`;
  const { error: errSubida } = await sb.storage.from(BUCKET_FOTOS).upload(path, archivo, { upsert: true });
  if (errSubida) throw errSubida;

  const { data: laptop, error: errGet } = await sb.from('laptops').select('fotos').eq('id', laptopId).single();
  if (errGet) throw errGet;
  const fotos = [...((laptop?.fotos as string[]) ?? []), path];
  const { error: errUpdate } = await sb.from('laptops').update({ fotos }).eq('id', laptopId);
  if (errUpdate) throw errUpdate;
  return path;
}

/** Elimina una foto del storage y de `fotos[]`. */
export async function eliminarFoto(laptopId: string, path: string): Promise<void> {
  const sb = clienteSupabase();
  const { error: errRemove } = await sb.storage.from(BUCKET_FOTOS).remove([path]);
  if (errRemove) throw errRemove;
  const { data: laptop, error: errGet } = await sb.from('laptops').select('fotos').eq('id', laptopId).single();
  if (errGet) throw errGet;
  const fotos = ((laptop?.fotos as string[]) ?? []).filter((p) => p !== path);
  const { error: errUpdate } = await sb.from('laptops').update({ fotos }).eq('id', laptopId);
  if (errUpdate) throw errUpdate;
}
