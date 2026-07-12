// Repositorio de Ventas — único punto de acceso a datos para /ventas.
// Los flujos transaccionales (vender, devolución por garantía) SIEMPRE pasan por las RPC
// registrar_venta / devolver_garantia (migración 0014) — nunca inserts multi-tabla sueltos.
// Las ganancias SIEMPRE se leen de v_ventas_ganancia — nunca se calculan aquí.
import { clienteSupabase } from './cliente';

export type Moneda = 'USD' | 'VES';
export type VentaEstado = 'activa' | 'devuelta_garantia';

export const ESTADO_VENTA_ETIQUETAS: Record<VentaEstado, string> = {
  activa: 'Activa',
  devuelta_garantia: 'Devuelta (garantía)',
};

/** Tono de Chip sugerido por estado (solo UI; no es un valor de negocio). */
export const ESTADO_VENTA_TONOS: Record<VentaEstado, 'verde' | 'amarillo' | 'rojo' | 'azul' | 'gris'> = {
  activa: 'verde',
  devuelta_garantia: 'rojo',
};

// ---------------------------------------------------------------------------
// Listado de ventas (con ganancia desde v_ventas_ganancia)
// ---------------------------------------------------------------------------

export interface VentaListado {
  id: string;
  fecha: string;
  laptopId: string;
  alias: string;
  modeloNombre: string;
  compradorId: string;
  compradorNombre: string;
  precioVenta: number;
  moneda: Moneda;
  montoVes: number | null;
  tasaImplicita: number | null;
  estado: VentaEstado;
  garantiaHasta: string;
  costoDirecto: number | null;
  costoFinal: number | null;
  gananciaBruta: number | null;
  gananciaNeta: number | null;
}

export interface FiltrosVentas {
  estado?: VentaEstado;
  desde?: string;
  hasta?: string;
  compradorId?: string;
}

interface FilaVentaBase {
  id: string;
  fecha: string;
  laptop_id: string;
  comprador_id: string;
  precio_venta: number;
  moneda: Moneda;
  monto_ves: number | null;
  tasa_implicita: number | null;
  estado: VentaEstado;
  garantia_hasta: string;
  laptops: { alias: string | null; modelos: { marca: string; modelo: string } | null } | null;
  compradores: { nombre: string } | null;
}

interface FilaGanancia {
  venta_id: string;
  costo_directo: number | null;
  costo_final: number | null;
  ganancia_bruta: number | null;
  ganancia_neta: number | null;
}

/** Listado de ventas con datos de laptop/comprador (tabla `ventas`) + ganancia (vista
 * `v_ventas_ganancia`, nunca calculada aquí). Filtra por estado, rango de fechas y comprador. */
export async function listarVentas(filtros: FiltrosVentas = {}): Promise<VentaListado[]> {
  const sb = clienteSupabase();
  let query = sb
    .from('ventas')
    .select(
      `id, fecha, laptop_id, comprador_id, precio_venta, moneda, monto_ves, tasa_implicita, estado, garantia_hasta,
       laptops ( alias, modelos ( marca, modelo ) ),
       compradores ( nombre )`,
    )
    .order('fecha', { ascending: false });

  if (filtros.estado) query = query.eq('estado', filtros.estado);
  if (filtros.desde) query = query.gte('fecha', filtros.desde);
  if (filtros.hasta) query = query.lte('fecha', filtros.hasta);
  if (filtros.compradorId) query = query.eq('comprador_id', filtros.compradorId);

  const { data, error } = await query;
  if (error) throw error;
  const filas = (data ?? []) as unknown as FilaVentaBase[];

  const ids = filas.map((f) => f.id);
  const { data: ganancias, error: errG } = ids.length
    ? await sb
        .from('v_ventas_ganancia')
        .select('venta_id, costo_directo, costo_final, ganancia_bruta, ganancia_neta')
        .in('venta_id', ids)
    : { data: [] as FilaGanancia[], error: null };
  if (errG) throw errG;

  const mapaGanancia = new Map<string, FilaGanancia>((ganancias ?? []).map((g: any) => [g.venta_id as string, g]));

  return filas.map((f) => {
    const g = mapaGanancia.get(f.id);
    const modelo = f.laptops?.modelos ?? null;
    return {
      id: f.id,
      fecha: f.fecha,
      laptopId: f.laptop_id,
      alias: f.laptops?.alias ?? '—',
      modeloNombre: modelo ? `${modelo.marca} ${modelo.modelo}` : '—',
      compradorId: f.comprador_id,
      compradorNombre: f.compradores?.nombre ?? '—',
      precioVenta: Number(f.precio_venta),
      moneda: f.moneda,
      montoVes: f.monto_ves != null ? Number(f.monto_ves) : null,
      tasaImplicita: f.tasa_implicita != null ? Number(f.tasa_implicita) : null,
      estado: f.estado,
      garantiaHasta: f.garantia_hasta,
      costoDirecto: g?.costo_directo ?? null,
      costoFinal: g?.costo_final ?? null,
      gananciaBruta: g?.ganancia_bruta ?? null,
      gananciaNeta: g?.ganancia_neta ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Registrar venta (RPC registrar_venta)
// ---------------------------------------------------------------------------

export interface LaptopVendible {
  id: string;
  alias: string;
  modeloNombre: string;
}

/** Laptops elegibles para vender (`lista_para_venta` o `reservada` — igual que valida el RPC). */
export async function listarLaptopsVendibles(): Promise<LaptopVendible[]> {
  const { data, error } = await clienteSupabase()
    .from('laptops')
    .select('id, alias, modelos ( marca, modelo )')
    .in('estado', ['lista_para_venta', 'reservada'])
    .order('alias');
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id as string,
    alias: (l.alias as string | null) ?? '—',
    modeloNombre: l.modelos ? `${l.modelos.marca} ${l.modelos.modelo}` : '—',
  }));
}

export interface CuentaOpcion {
  id: string;
  nombre: string;
  moneda: Moneda;
}

/** Cuentas disponibles como destino/origen de movimientos; filtra por moneda si se indica
 * (la RPC exige que la moneda de la cuenta coincida con la de la venta/reembolso). */
export async function listarCuentas(moneda?: Moneda): Promise<CuentaOpcion[]> {
  let query = clienteSupabase().from('cuentas').select('id, nombre, moneda').order('nombre');
  if (moneda) query = query.eq('moneda', moneda);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CuentaOpcion[];
}

/** Tasa sugerida del día (editable): prefiere `tipo = 'paralelo'`; si no hay tasa para la
 * fecha exacta, usa la más reciente disponible. Devuelve null si no hay ninguna. */
export async function tasaSugerida(fecha: string): Promise<number | null> {
  const sb = clienteSupabase();
  const { data, error } = await sb.from('tasas_dia').select('valor, tipo').eq('fecha', fecha);
  if (error) throw error;
  if (data && data.length > 0) {
    const preferida = data.find((d: any) => d.tipo === 'paralelo') ?? data[0];
    return Number(preferida.valor);
  }
  const { data: ultima, error: errU } = await sb
    .from('tasas_dia')
    .select('valor')
    .order('fecha', { ascending: false })
    .limit(1);
  if (errU) throw errU;
  return ultima && ultima.length > 0 ? Number(ultima[0].valor) : null;
}

export interface RegistrarVentaInput {
  laptopId: string;
  compradorId: string;
  /** Precio en USD-equivalente: si la venta es en VES, ya debe venir calculado (monto_ves / tasa). */
  precio: number;
  moneda: Moneda;
  montoVes: number | null;
  tasa: number | null;
  cuentaId: string;
  fecha: string;
}

/** Registra la venta vía RPC `registrar_venta` (transaccional): crea la venta, el movimiento
 * de ingreso en la cuenta elegida y pasa la laptop a `vendida`. Devuelve el id de la venta. */
export async function registrarVenta(input: RegistrarVentaInput): Promise<string> {
  const { data, error } = await clienteSupabase().rpc('registrar_venta', {
    p_laptop: input.laptopId,
    p_comprador: input.compradorId,
    p_precio: input.precio,
    p_moneda: input.moneda,
    p_monto_ves: input.montoVes,
    p_tasa: input.tasa,
    p_cuenta: input.cuentaId,
    p_fecha: input.fecha,
  });
  if (error) throw error;
  return data as string;
}

// ---------------------------------------------------------------------------
// Garantías vigentes + devolución (RPC devolver_garantia)
// ---------------------------------------------------------------------------

export interface GarantiaVigente {
  ventaId: string;
  laptopId: string;
  alias: string;
  comprador: string;
  fecha: string;
  garantiaHasta: string;
  diasRestantes: number;
  /** Traídos de `ventas` (la vista no los incluye) para prellenar el monto de reembolso
   * y filtrar la cuenta de reembolso por moneda. */
  precioVenta: number;
  moneda: Moneda;
}

/** Ventas activas con garantía vigente (vista `v_garantias_vigentes`, plan-01) + precio/moneda
 * de la tabla `ventas` para la acción de devolución. */
export async function listarGarantiasVigentes(): Promise<GarantiaVigente[]> {
  const sb = clienteSupabase();
  const { data, error } = await sb
    .from('v_garantias_vigentes')
    .select('venta_id, laptop_id, alias, comprador, fecha, garantia_hasta, dias_restantes')
    .order('dias_restantes', { ascending: true });
  if (error) throw error;
  const filas = data ?? [];

  const ids = filas.map((f: any) => f.venta_id as string);
  const { data: ventasData, error: errV } = ids.length
    ? await sb.from('ventas').select('id, precio_venta, moneda').in('id', ids)
    : { data: [] as { id: string; precio_venta: number; moneda: Moneda }[], error: null };
  if (errV) throw errV;
  const mapa = new Map((ventasData ?? []).map((v: any) => [v.id as string, v]));

  return filas.map((f: any) => {
    const v = mapa.get(f.venta_id);
    return {
      ventaId: f.venta_id,
      laptopId: f.laptop_id,
      alias: f.alias,
      comprador: f.comprador,
      fecha: f.fecha,
      garantiaHasta: f.garantia_hasta,
      diasRestantes: Number(f.dias_restantes),
      precioVenta: v ? Number(v.precio_venta) : 0,
      moneda: v ? (v.moneda as Moneda) : 'USD',
    };
  });
}

/** Devuelve una venta por garantía vía RPC `devolver_garantia`: valida vigencia, la venta
 * pasa a `devuelta_garantia`, se registra el egreso de reembolso y la laptop → `para_repuestos`. */
export async function devolverGarantia(ventaId: string, cuentaId: string, montoReembolso: number): Promise<void> {
  const { error } = await clienteSupabase().rpc('devolver_garantia', {
    p_venta: ventaId,
    p_cuenta: cuentaId,
    p_monto_reembolso: montoReembolso,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Compradores (CRUD + historial)
// ---------------------------------------------------------------------------

export interface Comprador {
  id: string;
  nombre: string;
  telefono: string | null;
  notas: string | null;
}

/** Lista de compradores, opcionalmente filtrada por nombre (búsqueda para el modal de venta). */
export async function listarCompradores(busqueda?: string): Promise<Comprador[]> {
  const sb = clienteSupabase();
  let query = sb.from('compradores').select('id, nombre, telefono, notas').order('nombre');
  if (busqueda) query = query.ilike('nombre', `%${busqueda}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Comprador[];
}

export interface NuevoComprador {
  nombre: string;
  telefono?: string | null;
  notas?: string | null;
}

export async function crearComprador(input: NuevoComprador): Promise<Comprador> {
  const { data, error } = await clienteSupabase()
    .from('compradores')
    .insert({ nombre: input.nombre, telefono: input.telefono ?? null, notas: input.notas ?? null })
    .select('id, nombre, telefono, notas')
    .single();
  if (error) throw error;
  return data as Comprador;
}

export async function actualizarComprador(
  id: string,
  cambios: { nombre?: string; telefono?: string | null; notas?: string | null },
): Promise<void> {
  const { error } = await clienteSupabase().from('compradores').update(cambios).eq('id', id);
  if (error) throw error;
}
