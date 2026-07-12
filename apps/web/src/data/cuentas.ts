// Repositorio de datos del dominio "Cuentas" (plan-07). Único punto que las páginas de
// /cuentas usan para hablar con Supabase — consume `clienteSupabase()` de src/data/cliente.ts,
// nunca importa @supabase/supabase-js directamente (regla del kit: solo cliente.ts lo hace).
import { clienteSupabase } from './cliente';

export type Moneda = 'USD' | 'VES';
export type TipoMovimiento = 'ingreso' | 'egreso';
export type CategoriaMovimiento = 'negocio' | 'personal';
export type TipoTasa = 'bcv' | 'paralelo' | 'usdt' | 'paypal';
export type EstadoDeuda = 'pendiente' | 'parcial' | 'saldada';

export interface Cuenta {
  id: string;
  nombre: string;
  moneda: Moneda;
}

export interface SaldoCuenta {
  cuenta_id: string;
  nombre: string;
  moneda: Moneda;
  saldo: number;
}

export interface Movimiento {
  id: string;
  cuenta_id: string;
  fecha: string;
  tipo: TipoMovimiento;
  monto: number;
  categoria: CategoriaMovimiento;
  concepto: string | null;
  venta_id: string | null;
  lote_id: string | null;
  costo_linea_id: string | null;
}

export interface FiltrosLibro {
  desde?: string;
  hasta?: string;
  categoria?: CategoriaMovimiento;
  tipo?: TipoMovimiento;
}

export interface PaginaMovimientos {
  filas: Movimiento[];
  total: number;
}

export interface NuevoMovimiento {
  cuenta_id: string;
  fecha: string;
  tipo: TipoMovimiento;
  monto: number;
  categoria: CategoriaMovimiento;
  concepto?: string;
}

export interface ConversionDetalle {
  id: string;
  fecha: string;
  monto_origen: number;
  monto_destino: number;
  nota: string | null;
  tasa_implicita: number;
  cuenta_origen_id: string;
  cuenta_origen_nombre: string;
  cuenta_destino_id: string;
  cuenta_destino_nombre: string;
}

export interface ResultadoCambiario {
  mes: string;
  cuenta_origen: string;
  cuenta_destino: string;
  moneda_origen: Moneda;
  moneda_destino: Moneda;
  operaciones: number;
  total_origen: number;
  total_destino: number;
  resultado: number;
  tasa_implicita_promedio: number;
}

export interface TasaDia {
  fecha: string;
  tipo: TipoTasa;
  valor: number;
}

export interface Deuda {
  id: string;
  persona: string;
  monto: number;
  moneda: Moneda;
  fecha: string;
  estado: EstadoDeuda;
  abonado: number;
  notas: string | null;
}

/** Cuentas del usuario (plantilla sembrada: Binance, Zinli, Efectivo USD, Efectivo Bs, PayPal). */
export async function listarCuentas(): Promise<Cuenta[]> {
  const { data, error } = await clienteSupabase().from('cuentas').select('id, nombre, moneda').order('nombre');
  if (error) throw error;
  return data ?? [];
}

/** Alta de una cuenta nueva. */
export async function crearCuenta(datos: { nombre: string; moneda: Moneda }): Promise<Cuenta> {
  const { data, error } = await clienteSupabase().from('cuentas').insert(datos).select('id, nombre, moneda').single();
  if (error) throw error;
  return data;
}

/** Renombra una cuenta existente. */
export async function renombrarCuenta(id: string, nombre: string): Promise<void> {
  const { error } = await clienteSupabase().from('cuentas').update({ nombre }).eq('id', id);
  if (error) throw error;
}

/** Saldos por cuenta (vista v_cuentas_saldos = Σ ingresos − Σ egresos). */
export async function obtenerSaldos(): Promise<SaldoCuenta[]> {
  const { data, error } = await clienteSupabase().from('v_cuentas_saldos').select('*').order('nombre');
  if (error) throw error;
  return data ?? [];
}

/** Libro paginado de una cuenta, con filtros de fecha/categoría/tipo. */
export async function listarMovimientos(
  cuentaId: string,
  filtros: FiltrosLibro = {},
  pagina = 1,
  porPagina = 20,
): Promise<PaginaMovimientos> {
  let consulta = clienteSupabase()
    .from('movimientos')
    .select('*', { count: 'exact' })
    .eq('cuenta_id', cuentaId);
  if (filtros.desde) consulta = consulta.gte('fecha', filtros.desde);
  if (filtros.hasta) consulta = consulta.lte('fecha', filtros.hasta);
  if (filtros.categoria) consulta = consulta.eq('categoria', filtros.categoria);
  if (filtros.tipo) consulta = consulta.eq('tipo', filtros.tipo);
  const desde = (pagina - 1) * porPagina;
  const { data, error, count } = await consulta.order('fecha', { ascending: false }).range(desde, desde + porPagina - 1);
  if (error) throw error;
  return { filas: data ?? [], total: count ?? 0 };
}

/** Movimiento manual (incluida categoría personal — cuadra saldos sin ensuciar la ganancia). */
export async function crearMovimiento(datos: NuevoMovimiento): Promise<Movimiento> {
  const { data, error } = await clienteSupabase().from('movimientos').insert(datos).select('*').single();
  if (error) throw error;
  return data;
}

/** Conversión entre cuentas: SIEMPRE vía el RPC transaccional (nunca inserts sueltos). */
export async function registrarConversion(datos: {
  cuenta_origen: string;
  cuenta_destino: string;
  monto_origen: number;
  monto_destino: number;
  fecha: string;
  nota?: string;
}): Promise<string> {
  const { data, error } = await clienteSupabase().rpc('registrar_conversion', {
    p_cuenta_origen: datos.cuenta_origen,
    p_cuenta_destino: datos.cuenta_destino,
    p_monto_origen: datos.monto_origen,
    p_monto_destino: datos.monto_destino,
    p_fecha: datos.fecha,
    p_nota: datos.nota ?? null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Historial de conversiones con nombre de cuenta origen/destino y tasa implícita.
 * `conversiones` solo guarda los ids de movimiento; se resuelven aquí en dos consultas
 * adicionales en vez de depender del nombre de las FK (fuera del contexto permitido de este plan).
 */
export async function listarConversiones(limite = 50): Promise<ConversionDetalle[]> {
  const cli = clienteSupabase();
  const { data: conversiones, error } = await cli
    .from('conversiones')
    .select('id, fecha, movimiento_origen_id, movimiento_destino_id, monto_origen, monto_destino, nota')
    .order('fecha', { ascending: false })
    .limit(limite);
  if (error) throw error;
  if (!conversiones || conversiones.length === 0) return [];

  const idsMovimientos = Array.from(
    new Set(conversiones.flatMap((c) => [c.movimiento_origen_id, c.movimiento_destino_id])),
  );
  const { data: movimientos, error: errMov } = await cli
    .from('movimientos')
    .select('id, cuenta_id')
    .in('id', idsMovimientos);
  if (errMov) throw errMov;
  const cuentaPorMovimiento = new Map((movimientos ?? []).map((m) => [m.id, m.cuenta_id]));

  const idsCuentas = Array.from(new Set(Array.from(cuentaPorMovimiento.values())));
  const { data: cuentas, error: errCuentas } = await cli.from('cuentas').select('id, nombre, moneda').in('id', idsCuentas);
  if (errCuentas) throw errCuentas;
  const cuentaPorId = new Map((cuentas ?? []).map((c) => [c.id, c]));

  return conversiones.map((c) => {
    const cuentaOrigenId = cuentaPorMovimiento.get(c.movimiento_origen_id) ?? '';
    const cuentaDestinoId = cuentaPorMovimiento.get(c.movimiento_destino_id) ?? '';
    return {
      id: c.id,
      fecha: c.fecha,
      monto_origen: Number(c.monto_origen),
      monto_destino: Number(c.monto_destino),
      nota: c.nota,
      tasa_implicita: Number(c.monto_origen) / Number(c.monto_destino),
      cuenta_origen_id: cuentaOrigenId,
      cuenta_origen_nombre: cuentaPorId.get(cuentaOrigenId)?.nombre ?? '—',
      cuenta_destino_id: cuentaDestinoId,
      cuenta_destino_nombre: cuentaPorId.get(cuentaDestinoId)?.nombre ?? '—',
    };
  });
}

/** Resultado cambiario acumulado por mes/par (vista) — línea separada de la ganancia por laptops. */
export async function obtenerResultadoCambiario(): Promise<ResultadoCambiario[]> {
  const { data, error } = await clienteSupabase()
    .from('v_resultado_cambiario')
    .select('*')
    .order('mes', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    operaciones: Number(r.operaciones),
    total_origen: Number(r.total_origen),
    total_destino: Number(r.total_destino),
    resultado: Number(r.resultado),
    tasa_implicita_promedio: Number(r.tasa_implicita_promedio),
  }));
}

/** Últimos N días de tasas (por defecto 30). */
export async function listarTasas(dias = 30): Promise<TasaDia[]> {
  const { data, error } = await clienteSupabase()
    .from('tasas_dia')
    .select('fecha, tipo, valor')
    .order('fecha', { ascending: false })
    .limit(dias * 4); // hasta 4 tipos por día
  if (error) throw error;
  return (data ?? []).map((t) => ({ ...t, valor: Number(t.valor) }));
}

/** Última tasa capturada de un tipo dado (para valorar saldos Bs), o null si no hay ninguna. */
export async function obtenerUltimaTasa(tipo: TipoTasa): Promise<TasaDia | null> {
  const { data, error } = await clienteSupabase()
    .from('tasas_dia')
    .select('fecha, tipo, valor')
    .eq('tipo', tipo)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, valor: Number(data.valor) } : null;
}

/** Captura manual diaria de una tasa — upsert por (fecha, tipo) resuelto en dos pasos. */
export async function registrarTasa(datos: { tipo: TipoTasa; valor: number; fecha: string }): Promise<void> {
  const cli = clienteSupabase();
  const { data: existente, error: errBusca } = await cli
    .from('tasas_dia')
    .select('fecha, tipo')
    .eq('fecha', datos.fecha)
    .eq('tipo', datos.tipo)
    .maybeSingle();
  if (errBusca) throw errBusca;
  if (existente) {
    const { error } = await cli.from('tasas_dia').update({ valor: datos.valor }).eq('fecha', datos.fecha).eq('tipo', datos.tipo);
    if (error) throw error;
  } else {
    const { error } = await cli.from('tasas_dia').insert(datos);
    if (error) throw error;
  }
}

async function listarDeudas(tabla: 'por_cobrar' | 'por_pagar'): Promise<Deuda[]> {
  const { data, error } = await clienteSupabase().from(tabla).select('*').order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => ({ ...d, monto: Number(d.monto), abonado: Number(d.abonado) }));
}

export const listarPorCobrar = () => listarDeudas('por_cobrar');
export const listarPorPagar = () => listarDeudas('por_pagar');

async function crearDeuda(
  tabla: 'por_cobrar' | 'por_pagar',
  datos: { persona: string; monto: number; moneda: Moneda; fecha: string; notas?: string },
): Promise<Deuda> {
  const { data, error } = await clienteSupabase()
    .from(tabla)
    .insert({ ...datos, estado: 'pendiente', abonado: 0 })
    .select('*')
    .single();
  if (error) throw error;
  return { ...data, monto: Number(data.monto), abonado: Number(data.abonado) };
}

export const crearPorCobrar = (datos: { persona: string; monto: number; moneda: Moneda; fecha: string; notas?: string }) =>
  crearDeuda('por_cobrar', datos);
export const crearPorPagar = (datos: { persona: string; monto: number; moneda: Moneda; fecha: string; notas?: string }) =>
  crearDeuda('por_pagar', datos);

/**
 * Abona a una deuda: incrementa `abonado`, recalcula `estado`, y genera el movimiento
 * correspondiente (ingreso si por_cobrar, egreso si por_pagar) en la cuenta elegida.
 * Atómico vía RPC `registrar_abono` (migración 0022) — antes eran 2 escrituras separadas
 * desde el cliente, sin garantía de todo-o-nada.
 */
export async function abonar(
  tabla: 'por_cobrar' | 'por_pagar',
  deuda: Pick<Deuda, 'id' | 'persona' | 'monto' | 'abonado'>,
  montoAbono: number,
  cuentaId: string,
  fecha: string,
): Promise<EstadoDeuda> {
  const { data, error } = await clienteSupabase().rpc('registrar_abono', {
    p_tabla: tabla,
    p_id: deuda.id,
    p_monto_abono: montoAbono,
    p_cuenta_id: cuentaId,
    p_fecha: fecha,
  });
  if (error) throw new Error(error.message);
  return data as EstadoDeuda;
}
