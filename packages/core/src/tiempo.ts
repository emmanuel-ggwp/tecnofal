// Tiempo restante de subastas eBay: texto relativo → Date absoluta (captura, extensión)
// y Date absoluta → texto para la UI (pantalla /listings del panel web). Puras y
// testeables sin DOM — los selectores que extraen el texto del DOM viven en
// apps/extension/src/content/*.ts (etapa 2, no responsabilidad de este paquete).
//
// Formatos CONFIRMADOS reales contra eBay (usuario pegó el markup real, eBay en
// español): "Quedan 13m" (grilla de resultados de búsqueda) y "Finaliza en 12 min 31 s"
// (página de listing individual, incluye "min" completo con 3 letras, no solo "m").
// Se agregan alias en inglés ("2d 3h left", "Ends in 5h 23m") como red de seguridad
// por si el navegador del usuario alguna vez ve eBay en otro locale.

const PATRON_DISPARADOR = /\b(?:quedan|finaliza\s*en|termina(?:n)?\s*en|left|ends?\s*in)\b/i;
// intenta "min" antes que "m" suelto para no cortar "min" a la mitad
const PATRON_UNIDAD = /(\d+)\s*(d\b|h\b|min\b|m\b|s\b)/gi;

/**
 * Convierte texto relativo de eBay a una fecha absoluta de fin de subasta. Devuelve
 * null (nunca lanza) si el texto no matchea — el llamador decide qué significa eso.
 *
 * FUERA DE ALCANCE (documentar como mejora futura, no implementar):
 *  - el hint absoluto "(Today 10:48 PM)" que a veces acompaña al texto relativo en la
 *    grilla — la duración relativa ya alcanza, no hace falta parsear reloj/timezone.
 *  - "Ends today/tomorrow" sin duración explícita.
 *  - locales fuera de en/es.
 */
export function parsearTiempoRestante(texto: string | null | undefined, ahora: Date = new Date()): Date | null {
  if (!texto) return null;
  const t = texto.trim();
  if (!PATRON_DISPARADOR.test(t)) return null;

  let ms = 0;
  let matcheo = false;
  for (const m of t.matchAll(PATRON_UNIDAD)) {
    matcheo = true;
    const n = parseInt(m[1], 10);
    const unidad = m[2].toLowerCase();
    if (unidad === 'd') ms += n * 86_400_000;
    else if (unidad === 'h') ms += n * 3_600_000;
    else if (unidad === 'min' || unidad === 'm') ms += n * 60_000;
    else if (unidad === 's') ms += n * 1_000;
  }
  if (!matcheo || ms <= 0) return null;
  return new Date(ahora.getTime() + ms);
}

export interface TiempoRestanteTexto {
  texto: string;
  finalizada: boolean;
}

/** Formatea una fecha absoluta como texto grueso para la UI ("2d 3h", "45m", "Finalizada").
 *  Granularidad de minutos: no hace falta más precisión que el refresco de 5 min de /listings. */
export function formatearTiempoRestante(
  fechaFin: Date | string | null,
  ahora: Date = new Date(),
): TiempoRestanteTexto | null {
  if (!fechaFin) return null;
  const fin = typeof fechaFin === 'string' ? new Date(fechaFin) : fechaFin;
  if (Number.isNaN(fin.getTime())) return null;
  const ms = fin.getTime() - ahora.getTime();
  if (ms <= 0) return { texto: 'Finalizada', finalizada: true };
  const minutos = Math.floor(ms / 60_000);
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const mins = minutos % 60;
  const partes: string[] = [];
  if (dias > 0) partes.push(`${dias}d`);
  if (dias > 0 || horas > 0) partes.push(`${horas}h`);
  if (dias === 0) partes.push(`${mins}m`);
  return { texto: partes.join(' '), finalizada: false };
}
