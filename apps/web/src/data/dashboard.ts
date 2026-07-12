// Repositorio de datos del Dashboard (`/`). Todas las cifras vienen de vistas SQL
// (0013_vistas_dashboard.sql + las de 0001 reutilizadas por el dashboard) — este archivo
// NUNCA calcula negocio, solo trae filas y las tipa. Único consumidor: src/app/(panel)/page.tsx.
import { clienteSupabase } from './cliente';

export type EstadoLaptop =
  | 'evaluando'
  | 'comprada'
  | 'en_transito'
  | 'en_revision'
  | 'falta_partes'
  | 'lista_para_venta'
  | 'reservada'
  | 'vendida'
  | 'para_repuestos';

/** Orden de exhibición de los 9 estados posibles (§ contexto esencial del plan). */
export const ESTADOS_LAPTOP: EstadoLaptop[] = [
  'evaluando',
  'comprada',
  'en_transito',
  'en_revision',
  'falta_partes',
  'lista_para_venta',
  'reservada',
  'vendida',
  'para_repuestos',
];

export type Moneda = 'USD' | 'VES';
export type TipoTasa = 'bcv' | 'paralelo' | 'usdt' | 'paypal';

/** v_dashboard_totales — una fila (subconsultas escalares; ver Bitácora sobre "vacía"). */
export interface DashboardTotales {
  total_invertido: number;
  valor_inventario: number;
  ganancia_bruta_acum: number;
  ganancia_neta_acum: number;
  por_cobrar_pendiente: number;
  por_pagar_pendiente: number;
}

const TOTALES_VACIOS: DashboardTotales = {
  total_invertido: 0,
  valor_inventario: 0,
  ganancia_bruta_acum: 0,
  ganancia_neta_acum: 0,
  por_cobrar_pendiente: 0,
  por_pagar_pendiente: 0,
};

/** v_laptops_por_estado — solo trae filas de estados con al menos una laptop. */
export interface LaptopPorEstado {
  estado: EstadoLaptop;
  cantidad: number;
}

/** v_cuentas_saldos */
export interface CuentaSaldo {
  cuenta_id: string;
  nombre: string;
  moneda: Moneda;
  saldo: number;
}

/** v_resultado_cambiario (0001) — una fila por (mes, cuenta_origen, cuenta_destino). */
export interface ResultadoCambiarioFila {
  mes: string;
  cuenta_origen: string;
  cuenta_destino: string;
  moneda_origen: Moneda;
  moneda_destino: Moneda;
  operaciones: number;
  total_origen: number;
  total_destino: number;
  resultado: number | null;
  tasa_implicita_promedio: number | null;
}

/** v_garantias_vigentes */
export interface GarantiaVigente {
  venta_id: string;
  laptop_id: string;
  alias: string | null;
  comprador: string | null;
  fecha: string;
  garantia_hasta: string;
  dias_restantes: number;
}

/** v_sugerencia_partes_completas (0001) */
export interface SugerenciaParteCompleta {
  laptop_id: string;
  alias: string | null;
}

/** tasas_dia (tabla, no vista) — para el selector bcv/paralelo/usdt del dashboard. */
export interface TasaDia {
  fecha: string;
  tipo: TipoTasa;
  valor: number;
}

export interface DashboardData {
  totales: DashboardTotales;
  porEstado: LaptopPorEstado[];
  cuentas: CuentaSaldo[];
  resultadoCambiario: ResultadoCambiarioFila[];
  garantias: GarantiaVigente[];
  sugerenciasPartes: SugerenciaParteCompleta[];
  /** Más reciente primero; la fila [0] es la tasa por defecto del selector. */
  tasas: TasaDia[];
}

/** Trae todo el dashboard en paralelo. Ninguna cifra se calcula aquí: solo se tipa lo que
 * devuelven las vistas. */
export async function cargarDashboard(): Promise<DashboardData> {
  const cli = clienteSupabase();

  const [totalesRes, porEstadoRes, cuentasRes, resultadoRes, garantiasRes, sugerenciasRes, tasasRes] =
    await Promise.all([
      cli.from('v_dashboard_totales').select('*').maybeSingle(),
      cli.from('v_laptops_por_estado').select('*'),
      cli.from('v_cuentas_saldos').select('*').order('nombre'),
      cli.from('v_resultado_cambiario').select('*').order('mes', { ascending: false }),
      cli.from('v_garantias_vigentes').select('*').order('dias_restantes', { ascending: true }).limit(5),
      cli.from('v_sugerencia_partes_completas').select('*'),
      cli.from('tasas_dia').select('fecha,tipo,valor').order('fecha', { ascending: false }).limit(50),
    ]);

  const respuestas = {
    totales: totalesRes,
    porEstado: porEstadoRes,
    cuentas: cuentasRes,
    resultadoCambiario: resultadoRes,
    garantias: garantiasRes,
    sugerenciasPartes: sugerenciasRes,
    tasas: tasasRes,
  };
  for (const [nombre, res] of Object.entries(respuestas)) {
    if (res.error) throw new Error(`Dashboard: error cargando ${nombre}: ${res.error.message}`);
  }

  return {
    totales: (totalesRes.data as DashboardTotales | null) ?? TOTALES_VACIOS,
    porEstado: (porEstadoRes.data ?? []) as LaptopPorEstado[],
    cuentas: (cuentasRes.data ?? []) as CuentaSaldo[],
    resultadoCambiario: (resultadoRes.data ?? []) as ResultadoCambiarioFila[],
    garantias: (garantiasRes.data ?? []) as GarantiaVigente[],
    sugerenciasPartes: (sugerenciasRes.data ?? []) as SugerenciaParteCompleta[],
    tasas: (tasasRes.data ?? []) as TasaDia[],
  };
}

/** Suma de `resultado` (ignora null: conversiones entre monedas distintas no aportan). */
export function sumaResultadoCambiario(filas: ResultadoCambiarioFila[]): number {
  return filas.reduce((acc, f) => acc + (f.resultado ?? 0), 0);
}

/** Primer día del mes actual en 'YYYY-MM-DD', igual truncamiento que date_trunc('month', …). */
export function mesActualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Convierte un saldo en Bs a USD con una tasa dada (división simple; null si no hay tasa). */
export function convertirVesAUsd(saldoVes: number, tasa: number | null | undefined): number | null {
  if (!tasa) return null;
  return saldoVes / tasa;
}
