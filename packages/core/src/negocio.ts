// Tipos de negocio + interfaces de proveedor (§21): la lógica de negocio depende
// SOLO de estas interfaces. nhost-js y supabase-js viven en packages/provider-*.
import type { AjustesConfig, ModeloInfo, Parametros, PrecioIdeal, Semaforo, SpecsParseadas } from './types.js';

export interface DetalleCat {
  id: string;
  /** agrupador del selector: Puerto, Carcasa, Batería, Pantalla, Teclado, Audio, Otro… */
  categoria: string;
  /** descripción del defecto (ej. "Puerto de carga defectuoso") */
  nombre: string;
  deduccionBase: number;
}

export interface Catalogo {
  parametros: Parametros;
  precios: PrecioIdeal[];
  ajustes: AjustesConfig;
  modelos: ModeloInfo[];
  partesRef: Record<string, number>;
  detalles: DetalleCat[];
  /** §23: catálogo extensible de tipos de aviso */
  tiposAviso?: { clave: string; nombre: string }[];
  online: boolean;
}

export interface ListingGuardar {
  ebayItemId: string;
  url: string;
  titulo: string;
  precioVisto: number | null;
  semaforo: Semaforo | null;
  specs: SpecsParseadas | null;
  precioMaxPuja: number | null;
  precioPujaDecente: number | null;
  cantidadLaptops: number;
  costoEstimadoTotal: number | null;
  valorEsperadoTotal: number | null;
  evaluacionManual: unknown;
  estado: 'visto' | 'evaluado' | 'comprado' | 'descartado';
}

export interface CompraDatos {
  listing: ListingGuardar;
  envioUsa: number;
  cantidad: number;
  metodo: string;
  faltantes: { nombre: string; precio: number; cantidad: number }[];
  /** origen de la compra (§12): local → línea 'flete_nacional' + laptops en 'en_revision'. default: 'ebay' */
  origen?: 'ebay' | 'local';
  modeloId: string | null;
  cpuTipo: string | null;
  cpuGen: number | null;
  ramGb: number | null;
  ssdGb: number | null;
  pantallaPulgadas: number | null;
  pantallaTactil: boolean;
  valorEsperado: number | null;
  cadena: {
    base: number; conZinli: number; conEbay: number;
    extras: number; seguro: number; envioVzla: number; revision: number; total: number;
  };
}

export interface EstadoVisto {
  ebayItemId: string;
  semaforo: Semaforo | null;
  estado: string;
  /** §25: evaluación guardada (specs confirmadas al abrir el listing) — badge sólido en vez de provisional */
  margen: number | null;
  ganancia: number | null;
  costo: number | null;
  /** motivo del descarte/rechazo por publicación (vive en evaluacionManual.motivoDescarte) */
  motivoDescarte: string | null;
}

/** extrae el motivo de descarte del JSON evaluacion_manual sin asumir su forma
 *  (lee también la clave legada bloqueoManual del antiguo botón Bloquear) */
export function motivoDescarteDe(evaluacionManual: unknown): string | null {
  const em = evaluacionManual as { motivoDescarte?: unknown; bloqueoManual?: unknown } | null | undefined;
  const b = em?.motivoDescarte ?? em?.bloqueoManual;
  return typeof b === 'string' && b.trim() ? b : null;
}

export interface Cuenta {
  id: string;
  nombre: string;
  moneda: string;
}

export interface ConversionDatos {
  cuentaOrigenId: string;
  cuentaDestinoId: string;
  montoOrigen: number;
  montoDestino: number;
  fecha?: string;
  nota?: string;
}

export interface SesionInfo {
  email: string | null;
}

/** storage clave/valor (chrome.storage.local en la extensión; expo-secure-store en Android) */
export interface AlmacenKV {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<unknown>;
  removeItem(k: string): Promise<unknown>;
}

export interface AuthProvider {
  signIn(email: string, password: string): Promise<SesionInfo>;
  signOut(): Promise<void>;
  getSession(): Promise<SesionInfo>;
}

export interface DataProvider {
  /** null → el consumidor usa el catálogo semilla (modo degradado) */
  cargarCatalogo(): Promise<Catalogo | null>;
  checkListings(ids: string[]): Promise<EstadoVisto[]>;
  guardarListing(l: ListingGuardar): Promise<void>;
  comprar(d: CompraDatos): Promise<{ loteId: string }>;
  listarCuentas(): Promise<Cuenta[]>;
  registrarConversion(d: ConversionDatos): Promise<{ tasaImplicita: number }>;
  /** §23 (opcional): publica tipos y avisos de modelo al espejo (globales/compartidos) */
  publicarAvisos?(
    tipos: { clave: string; nombre: string }[],
    avisos: { marca: string; modelo: string; tipoClave: string; severidad: string; motivo: string | null }[],
  ): Promise<void>;
}

export type Proveedor = AuthProvider & DataProvider;

/** fila listings en snake_case (compartida por ambos adaptadores) */
export function listingAFila(l: ListingGuardar) {
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
    cantidad_laptops: l.cantidadLaptops,
    costo_estimado_total: l.costoEstimadoTotal,
    valor_esperado_total: l.valorEsperadoTotal,
    evaluacion_manual: l.evaluacionManual as object,
    estado: l.estado,
  };
}

/** líneas de costo congeladas al comprar (§13: sin comision_zinli) */
export function lineasDeCompra(d: CompraDatos, loteId: string, ahora: string) {
  const c = d.cadena;
  const impuesto = c.conZinli !== 0 ? c.base * (c.conEbay / c.conZinli - 1) : 0;
  const linea = (tipo: string, monto: number, descripcion?: string) => ({
    ambito: 'lote', ambito_id: loteId, tipo, monto_estimado: monto,
    estimado_congelado_at: ahora, descripcion: descripcion ?? null,
  });
  return [
    linea('subasta', d.listing.precioVisto ?? 0),
    linea('envio_usa', d.envioUsa),
    linea('impuesto_ebay', impuesto),
    ...d.faltantes.map((f) => linea('parte', f.precio * f.cantidad, `${f.nombre} × ${f.cantidad}`)),
    linea('seguro', c.seguro),
    linea(d.origen === 'local' ? 'flete_nacional' : 'envio_vzla', c.envioVzla),
    linea('revision', c.revision),
  ].filter((l) => l.monto_estimado !== 0);
}

export function proyectadoDeCompra(d: CompraDatos): number {
  const c = d.cadena;
  const impuesto = c.conZinli !== 0 ? c.base * (c.conEbay / c.conZinli - 1) : 0;
  return (d.listing.precioVisto ?? 0) + d.envioUsa + impuesto + c.extras + c.seguro + c.envioVzla + c.revision;
}

export function filasLaptops(d: CompraDatos, loteId: string) {
  return Array.from({ length: d.cantidad }, () => ({
    lote_id: loteId,
    modelo_id: d.modeloId,
    cpu_tipo: d.cpuTipo,
    cpu_gen: d.cpuGen,
    ram_gb: d.ramGb,
    ssd_gb: d.ssdGb,
    pantalla_pulgadas: d.pantallaPulgadas,
    pantalla_tactil: d.pantallaTactil,
    estado: d.origen === 'local' ? 'en_revision' : 'comprada',
  }));
}
