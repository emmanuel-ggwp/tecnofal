// Repositorio de la calculadora — carga config (parámetros/precios/ajustes/catálogos),
// guarda evaluaciones (listings) y convierte una evaluación en lote (lotes + costo_lineas + laptops).
// Ningún cálculo de negocio vive aquí: todo pasa por @tecnofal/core (evaluar, lineasDeCompra, filasLaptops…).
import {
  PARAMETROS_DEFAULT,
  listingAFila,
  lineasDeCompra,
  filasLaptops,
  type AjustesConfig,
  type CompraDatos,
  type CpuTipo,
  type DetalleCat,
  type EntradaEvaluacion,
  type ListingGuardar,
  type Parametros,
  type PrecioIdeal,
  type ResultadoEvaluacion,
} from '@tecnofal/core';
import { clienteSupabase } from './cliente';

export interface ParteRef {
  id: string;
  nombre: string;
  precioReferencia: number;
}

export interface ConfiguracionCalculadora {
  parametros: Parametros;
  precios: PrecioIdeal[];
  ajustes: AjustesConfig;
  detalles: DetalleCat[];
  partes: ParteRef[];
}

/** snake_case → camelCase (claves de `parametros` coinciden 1:1 con los campos de `Parametros`). */
function aCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Carga la configuración del usuario (una vez); rellena con PARAMETROS_DEFAULT lo que falte. */
export async function cargarConfiguracion(): Promise<ConfiguracionCalculadora> {
  const cli = clienteSupabase();
  const [paramRes, precioRes, ajusteRes, detalleRes, parteRes] = await Promise.all([
    cli.from('parametros').select('clave, valor'),
    cli.from('precios_ideales').select('cpu_tipo, gen_desde, gen_hasta, precio_base'),
    cli.from('ajustes_config').select('clave, delta'),
    cli.from('detalles_catalogo').select('id, nombre, deduccion_base, categoria').order('categoria').order('nombre'),
    cli.from('partes_catalogo').select('id, nombre, precio_referencia').order('nombre'),
  ]);
  const primerError = paramRes.error ?? precioRes.error ?? ajusteRes.error ?? detalleRes.error ?? parteRes.error;
  if (primerError) throw new Error(`No se pudo cargar la configuración: ${primerError.message}`);

  const parametros: Parametros = { ...PARAMETROS_DEFAULT };
  for (const fila of paramRes.data ?? []) {
    const campo = aCamel(fila.clave) as keyof Parametros;
    if (campo in parametros && fila.valor != null) {
      (parametros as unknown as Record<string, number>)[campo] = Number(fila.valor);
    }
  }

  const precios: PrecioIdeal[] = (precioRes.data ?? []).map((r) => ({
    cpuTipo: r.cpu_tipo as CpuTipo,
    genDesde: r.gen_desde,
    genHasta: r.gen_hasta,
    precioBase: Number(r.precio_base),
  }));

  const ajustes: AjustesConfig = {};
  for (const r of ajusteRes.data ?? []) ajustes[r.clave] = Number(r.delta);

  const detalles: DetalleCat[] = (detalleRes.data ?? []).map((r) => ({
    id: r.id,
    categoria: r.categoria,
    nombre: r.nombre,
    deduccionBase: Number(r.deduccion_base),
  }));

  const partes: ParteRef[] = (parteRes.data ?? []).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    precioReferencia: Number(r.precio_referencia ?? 0),
  }));

  return { parametros, precios, ajustes, detalles, partes };
}

/** Extrae el item id de una URL de eBay (`/itm/(\d+)/`) sin hacer scraping. */
export function ebayItemIdDeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/itm\/(\d+)/);
  return m ? m[1] : null;
}

export interface ItemFaltante {
  nombre: string;
  precio: number;
  cantidad: number;
}

export interface ItemDeduccion {
  nombre: string;
  monto: number;
  cantidad: number;
}

export interface GuardarEvaluacionInput {
  entrada: EntradaEvaluacion;
  resultado: ResultadoEvaluacion;
  titulo: string;
  url?: string | null;
  faltantes: ItemFaltante[];
  deducciones: ItemDeduccion[];
}

/** Guarda la evaluación actual como fila en `listings` (estado 'evaluado'). */
export async function guardarEvaluacion(
  input: GuardarEvaluacionInput,
): Promise<{ id: string; ebayItemId: string }> {
  const { entrada, resultado, titulo, url, faltantes, deducciones } = input;
  const ebayItemId = ebayItemIdDeUrl(url) ?? `calc-${crypto.randomUUID()}`;
  const listing: ListingGuardar = {
    ebayItemId,
    url: url ?? '',
    titulo,
    precioVisto: entrada.precioSubasta,
    semaforo: resultado.semaforo,
    specs: null,
    precioMaxPuja: resultado.sMax,
    precioPujaDecente: resultado.sDecente,
    cantidadLaptops: entrada.cantidadLaptops,
    costoEstimadoTotal: resultado.cadena.total,
    valorEsperadoTotal: resultado.valorEsperado,
    evaluacionManual: { entrada, faltantes, deducciones },
    estado: 'evaluado',
    fechaFinSubasta: null,
  };
  const { data, error } = await clienteSupabase()
    .from('listings')
    .insert(listingAFila(listing))
    .select('id')
    .single();
  if (error) throw new Error(`No se pudo guardar la evaluación: ${error.message}`);
  return { id: data.id as string, ebayItemId };
}

export interface CrearLoteInput {
  entrada: EntradaEvaluacion;
  resultado: ResultadoEvaluacion;
  titulo: string;
  url?: string | null;
  faltantes: ItemFaltante[];
  /** clave estable reusada entre reintentos del mismo submit → el RPC no duplica el lote */
  idempotencyKey?: string;
}

/** Convierte la evaluación actual en un lote real: `lotes` + `costo_lineas` (ámbito lote,
 *  estimados congelados) + N `laptops` (mismo shape de compra que usa la extensión). */
export async function crearLote(input: CrearLoteInput): Promise<{ loteId: string }> {
  const { entrada, resultado, titulo, url, faltantes, idempotencyKey } = input;
  const n = Math.max(entrada.cantidadLaptops, 1);
  const esLocal = entrada.origen === 'local';

  const listing: ListingGuardar = {
    ebayItemId: ebayItemIdDeUrl(url) ?? `calc-${crypto.randomUUID()}`,
    url: url ?? '',
    titulo,
    precioVisto: entrada.precioSubasta,
    semaforo: resultado.semaforo,
    specs: null,
    precioMaxPuja: resultado.sMax,
    precioPujaDecente: resultado.sDecente,
    cantidadLaptops: n,
    costoEstimadoTotal: resultado.cadena.total,
    valorEsperadoTotal: resultado.valorEsperado,
    evaluacionManual: { entrada, faltantes },
    estado: 'comprado',
    fechaFinSubasta: null,
  };

  const compra: CompraDatos = {
    listing,
    envioUsa: esLocal ? 0 : entrada.envioUsa,
    cantidad: n,
    metodo: entrada.metodo,
    faltantes,
    modeloId: null,
    cpuTipo: entrada.cpuTipo,
    cpuGen: entrada.cpuGen,
    ramGb: entrada.ramGb,
    ssdGb: entrada.ssdGb,
    pantallaPulgadas: entrada.pantallaPulgadas,
    pantallaTactil: entrada.pantallaTactil,
    valorEsperado: resultado.valorEsperado,
    cadena: resultado.cadena,
    origen: entrada.origen,
  };

  // Atómico vía RPC `registrar_compra_lote` (migración 0022): antes eran 3 escrituras
  // separadas (lote, líneas, laptops) desde el cliente, sin garantía de todo-o-nada.
  const ahora = new Date().toISOString();
  const lineas = lineasDeCompra(compra, 'pendiente', ahora) as Array<Record<string, unknown>>;

  let filas = filasLaptops(compra, 'pendiente') as Array<Record<string, unknown>>;
  // Lotes mixtos (buckets de pantalla): asigna pantalla_pulgadas por unidad — unidades sin
  // asignar → 14" (base), igual criterio que usa evaluar() para el valor esperado.
  if (entrada.pantallas && entrada.pantallas.length > 0) {
    const tam: number[] = [];
    for (const b of entrada.pantallas) for (let i = 0; i < b.cantidad; i++) tam.push(b.pulgadas);
    while (tam.length < n) tam.push(14);
    filas = filas.map((f, i) => ({ ...f, pantalla_pulgadas: tam[i] ?? f.pantalla_pulgadas }));
  }

  const { data: loteId, error } = await clienteSupabase().rpc('registrar_compra_lote', {
    p_lote: {
      origen: entrada.origen ?? 'ebay',
      precio_subasta: entrada.precioSubasta,
      envio_usa: compra.envioUsa,
      url_ebay: url || null,
      costo_proyectado_total: resultado.cadena.total,
      metodo_estimado: esLocal ? null : entrada.metodo,
    },
    p_lineas: lineas,
    p_laptops: filas,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw new Error(`No se pudo crear el lote: ${error.message}`);

  return { loteId: loteId as string };
}
