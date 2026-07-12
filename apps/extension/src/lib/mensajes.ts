// Tipos de negocio viven en @tecnofal/core (§21); aquí solo el protocolo de mensajes MV3.
import type { Catalogo, CompraDatos, ConversionDatos, ListingGuardar } from '@tecnofal/core';
import type { MarcarModeloDatos } from '@tecnofal/provider-local';

export type { MarcarModeloDatos };

export type {
  Catalogo, DetalleCat, ListingGuardar, CompraDatos, EstadoVisto, Cuenta, ConversionDatos,
} from '@tecnofal/core';

/** §22: estado del espejo remoto para el indicador del popup */
export interface SyncEstado {
  modo: 'sincronizado' | 'pendientes' | 'solo_local';
  pendientes: number;
  ultimo: number | null;
  espejo: string; // nhost | supabase | ninguno
}

export type Solicitud =
  | { tipo: 'catalogo' }
  | { tipo: 'cuentas:listar' }
  | { tipo: 'conversion:registrar'; datos: ConversionDatos }
  | { tipo: 'auth:estado' }
  | { tipo: 'auth:login'; email: string; password: string }
  | { tipo: 'auth:logout' }
  | { tipo: 'listings:check'; ids: string[] }
  | { tipo: 'listings:obtener'; id: string }
  | { tipo: 'listings:guardar'; listing: ListingGuardar }
  | { tipo: 'comprar'; datos: CompraDatos }
  | { tipo: 'config:leer' }
  | { tipo: 'config:parametro'; clave: string; valor: number | null }
  | { tipo: 'config:seccion'; seccion: 'precios' | 'ajustes' | 'detalles' | 'modelos' | 'partesRef'; filas: unknown[] }
  | { tipo: 'config:exportar' }
  | { tipo: 'config:importar'; json: string }
  | { tipo: 'modelo:marcar'; datos: MarcarModeloDatos }
  | { tipo: 'detalle:crear'; detalle: { categoria: string; nombre: string; deduccionBase: number } }
  | { tipo: 'sync:estado' }
  | { tipo: 'sync:ahora' };

export function enviar<T>(msg: Solicitud): Promise<T> {
  return chrome.runtime.sendMessage(msg);
}

/** Catálogo con reintentos: el service worker MV3 puede estar dormido (frío tras un rato
 *  sin usar eBay) y fallar o tardar mientras despierta e inicializa IndexedDB. */
export async function catalogoConReintento(intentos = 4): Promise<Catalogo | null> {
  for (let i = 0; i < intentos; i++) {
    try {
      const c = await enviar<Catalogo>({ tipo: 'catalogo' });
      if (c && !(c as unknown as { error?: string }).error) return c;
    } catch { /* SW despertando — reintentar */ }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return null;
}
