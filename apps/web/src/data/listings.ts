// Repositorio de datos para /listings — único punto de acceso a la tabla `listings` para esa
// pantalla. "Finalizada" es derivado de fecha_fin_subasta < now(), no un valor de `estado`
// (ver plan aprobado). Ningún componente importa @supabase/supabase-js directamente (§7b).
import { clienteSupabase } from './cliente';

export type ListingEstado = 'visto' | 'evaluado' | 'comprado' | 'descartado';
export type ListingSemaforo = 'verde' | 'amarillo' | 'rojo';

export const ESTADO_ETIQUETAS: Record<ListingEstado, string> = {
  visto: 'Visto',
  evaluado: 'Evaluado',
  comprado: 'Comprado',
  descartado: 'Descartado',
};

/** Tono de Chip sugerido por estado (solo UI; no es un valor de negocio). */
export const ESTADO_TONOS: Record<ListingEstado, 'verde' | 'amarillo' | 'rojo' | 'azul' | 'gris'> = {
  visto: 'gris',
  evaluado: 'azul',
  comprado: 'verde',
  descartado: 'rojo',
};

export interface ListingListado {
  id: string;
  ebayItemId: string;
  url: string | null;
  titulo: string | null;
  semaforo: ListingSemaforo | null;
  precioVisto: number | null;
  precioPujaDecente: number | null;
  fechaFinSubasta: string | null;
  estado: ListingEstado;
  fechaVisto: string;
}

export interface FiltrosListings {
  /** default: false — oculta listings con fecha_fin_subasta en el pasado. Los que tienen
   *  fecha_fin_subasta null (ej. evaluaciones manuales de la Calculadora) NUNCA se ocultan
   *  por este filtro, solo ordenan al final. */
  incluirFinalizadas?: boolean;
  /** default: ['visto', 'evaluado'] */
  estados?: ListingEstado[];
}

const ESTADOS_DEFAULT: ListingEstado[] = ['visto', 'evaluado'];

/** Listado de listings para /listings, ordenado por fecha_fin_subasta ASC NULLS LAST. */
export async function listarListings(filtros: FiltrosListings = {}): Promise<ListingListado[]> {
  const { incluirFinalizadas = false, estados = ESTADOS_DEFAULT } = filtros;
  const cli = clienteSupabase();
  let query = cli
    .from('listings')
    .select('id, ebay_item_id, url, titulo, semaforo, precio_visto, precio_puja_decente, fecha_fin_subasta, estado, fecha_visto')
    .in('estado', estados)
    .order('fecha_fin_subasta', { ascending: true, nullsFirst: false });

  if (!incluirFinalizadas) {
    query = query.or(`fecha_fin_subasta.is.null,fecha_fin_subasta.gte.${new Date().toISOString()}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((f) => ({
    id: f.id,
    ebayItemId: f.ebay_item_id,
    url: f.url,
    titulo: f.titulo,
    semaforo: f.semaforo,
    precioVisto: f.precio_visto,
    precioPujaDecente: f.precio_puja_decente,
    fechaFinSubasta: f.fecha_fin_subasta,
    estado: f.estado,
    fechaVisto: f.fecha_visto,
  }));
}
