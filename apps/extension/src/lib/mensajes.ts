import type { AjustesConfig, ModeloInfo, Parametros, PrecioIdeal, Semaforo, SpecsParseadas } from '@tecnofal/core';

export interface DetalleCat {
  id: string;
  nombre: string;
  deduccionBase: number;
}

export interface Catalogo {
  parametros: Parametros;
  precios: PrecioIdeal[];
  ajustes: AjustesConfig;
  modelos: ModeloInfo[];
  /** nombre de parte → precio_referencia */
  partesRef: Record<string, number>;
  detalles: DetalleCat[];
  /** false = modo degradado con semillas (sin sesión o sin conexión) */
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
  evaluacionManual: unknown;
  estado: 'visto' | 'evaluado' | 'comprado' | 'descartado';
}

export interface CompraDatos {
  listing: ListingGuardar;
  envioUsa: number;
  cantidad: number;
  modeloId: string | null;
  cpuTipo: string | null;
  cpuGen: number | null;
  ramGb: number | null;
  ssdGb: number | null;
  pantallaPulgadas: number | null;
  pantallaTactil: boolean;
  valorEsperado: number | null;
  /** cadena estimada congelada al comprar */
  cadena: {
    base: number; conZinli: number; conEbay: number;
    extras: number; seguro: number; envioVzla: number; revision: number; total: number;
  };
}

export interface EstadoVisto {
  ebayItemId: string;
  semaforo: Semaforo | null;
  estado: string;
}

export interface Cuenta {
  id: string;
  nombre: string;
  moneda: string;
}

/** §13: acción rápida global — registrar conversión entre cuentas */
export interface ConversionDatos {
  cuentaOrigenId: string;
  cuentaDestinoId: string;
  montoOrigen: number;
  montoDestino: number;
  fecha?: string; // default hoy
  nota?: string;
}

export type Solicitud =
  | { tipo: 'catalogo' }
  | { tipo: 'cuentas:listar' }
  | { tipo: 'conversion:registrar'; datos: ConversionDatos }
  | { tipo: 'auth:estado' }
  | { tipo: 'auth:login'; email: string; password: string }
  | { tipo: 'auth:logout' }
  | { tipo: 'listings:check'; ids: string[] }
  | { tipo: 'listings:guardar'; listing: ListingGuardar }
  | { tipo: 'comprar'; datos: CompraDatos };

export function enviar<T>(msg: Solicitud): Promise<T> {
  return chrome.runtime.sendMessage(msg);
}
