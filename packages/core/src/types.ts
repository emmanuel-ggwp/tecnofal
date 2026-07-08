export type Confianza = 'confirmado' | 'posible' | 'no_mencionado';
export type Semaforo = 'verde' | 'amarillo' | 'rojo';
export type CpuTipo = 'i3' | 'i5' | 'i7' | 'ryzen3' | 'ryzen5' | 'ryzen7' | 'otro';
export type RamSoldada = 'no' | 'parcial' | 'total' | 'revisar';
export type ReglaCompra = 'normal' | 'condicional' | 'bloqueada';
export type MetodoEnvio = 'barco' | 'avion_zoom';

/** Un valor extraído del listing con su nivel de confianza (§5.1) */
export interface Spec<T> {
  valor: T | null;
  confianza: Confianza;
}

export interface ModeloInfo {
  id?: string;
  marca: string;
  modelo: string;
  cpuTipo?: CpuTipo | null;
  ramSoldada: RamSoldada;
  ssdSoldado?: boolean;
  reglaCompra: ReglaCompra;
  motivoRegla?: string | null;
}

export interface SpecsParseadas {
  cpuTipo: Spec<CpuTipo>;
  cpuGen: Spec<number>;
  ramGb: Spec<number>;
  ssdGb: Spec<number>;
  esHdd: Spec<boolean>;
  pantallaPulgadas: Spec<number>;
  pantallaTactil: Spec<boolean>;
  cargadorIncluido: Spec<boolean>;
  bateriaIncluida: Spec<boolean>;
  sinOs: boolean;
  modeloDetectado: ModeloInfo | null;
  /** Advertencias no bloqueantes (⚠ revisar RAM, condicional, etc.) */
  alertas: string[];
  /** Motivos de bloqueo (for parts, celeron, RAM soldada total, regla bloqueada) */
  bloqueos: string[];
}

/** Parámetros de negocio — SIEMPRE leídos de la tabla `parametros`, nunca hardcodeados */
export interface Parametros {
  impuestoEbay: number;
  seguroValorDeclarado: number;
  seguroZoom: number;
  comisionZinliEstimada: number;
  costoRevision: number;
  gananciaMinima: number;
  gananciaDecente: number;
  tarifaBarcoPorPie3: number | null;
  tarifaAvionZoomPorKg: number | null;
}

/** Semillas documentadas (§2.1) — la extensión funciona en modo degradado sin sesión */
export const PARAMETROS_DEFAULT: Parametros = {
  impuestoEbay: 1.07,
  seguroValorDeclarado: 0.05,
  seguroZoom: 0.01,
  comisionZinliEstimada: 0.05,
  costoRevision: 5,
  gananciaMinima: 0.5,
  gananciaDecente: 0.7,
  tarifaBarcoPorPie3: null,
  tarifaAvionZoomPorKg: null,
};

export interface PrecioIdeal {
  cpuTipo: CpuTipo;
  genDesde: number;
  genHasta: number;
  precioBase: number;
}

/** clave → delta (tabla ajustes_config) */
export type AjustesConfig = Record<string, number>;

export interface EntradaEvaluacion {
  /** §12: 'local' = cadena corta (sin Zinli/eBay/seguro/envío Vzla; delivery nacional) */
  origen?: 'ebay' | 'local';
  /** §12: flete/delivery nacional para compras locales */
  fleteNacional?: number;
  precioSubasta: number;
  envioUsa: number;
  /** Σ partes faltantes a precio_referencia */
  extrasPartes: number;
  /** Σ deducciones estimadas por detalles */
  deducciones: number;
  metodo: MetodoEnvio;
  volumenPie3: number;
  pesoKg: number;
  cantidadLaptops: number;
  /** default: precioSubasta + envioUsa */
  valorDeclarado?: number;
  /** specs para valor esperado */
  cpuTipo: CpuTipo | null;
  cpuGen: number | null;
  ramGb: number | null;
  ssdGb: number | null;
  pantallaPulgadas: number | null;
  pantallaTactil: boolean;
  bloqueado: boolean;
}

export interface CadenaCostos {
  base: number;
  conZinli: number;
  conEbay: number;
  extras: number;
  seguro: number;
  envioVzla: number;
  revision: number;
  total: number;
}

export interface ResultadoEvaluacion {
  cadena: CadenaCostos;
  precioBase: number | null;
  ajustes: number;
  valorEsperado: number | null;
  margen: number | null;
  semaforo: Semaforo | null;
  /** S(ganancia_decente): hasta aquí verde */
  sDecente: number | null;
  /** S(ganancia_minima): entre ambos amarillo; por encima rojo */
  sMax: number | null;
  advertencias: string[];
}
