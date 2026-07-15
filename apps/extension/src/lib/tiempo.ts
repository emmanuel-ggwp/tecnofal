// Ayuda para decidir cuándo corregir el fechaFinSubasta de un listing ya guardado, comparando
// el countdown recién scrapeado de la página contra lo que ya está en la base local — compartido
// entre search.ts (grilla de resultados) y watchlist.ts (Mis artículos observados).

/** umbral para no generar una escritura por cada scroll/tick cuando el countdown ronda el mismo minuto */
export const UMBRAL_ACTUALIZAR_TIEMPO_MS = 2 * 60_000;

/** chrome.runtime.sendMessage serializa `Date` a string ISO — `EstadoVisto.fechaFinSubasta`
 *  llega degradado a string aunque el tipo lo tipe `Date | null`. */
export function aFecha(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(v);
}

/** Countdown recién scrapeado vs. el fechaFinSubasta ya guardado: si divergen lo suficiente (o
 *  el guardado no tiene), hay que corregir — solo tiene sentido para listings YA guardados (§26). */
export function tiempoDiverge(nuevo: Date | null, guardado: Date | string | null | undefined): boolean {
  if (nuevo == null) return false;
  const guardadoFecha = aFecha(guardado);
  if (guardadoFecha == null) return true;
  return Math.abs(nuevo.getTime() - guardadoFecha.getTime()) > UMBRAL_ACTUALIZAR_TIEMPO_MS;
}
