// Avisos de vendedor: señales curadas a partir de datos scrapeados de la página (no del
// título/descripción del listing, por eso viven aparte de parser.ts). Nunca muestran el
// nombre/%/ventas en crudo — solo el aviso resultante, con su severidad.
export interface AvisoVendedor {
  texto: string;
  tipo: 'bloquea' | 'advierte' | 'positivo';
}

export interface InfoVendedor {
  vendedor?: string | null;
  vendedorPctPositivo?: number | null;
  vendedorTotalVentas?: number | null;
  cantidadOfertas?: number | null;
  /** eBay usernames normalizados (trim+lowercase) del historial de compras (lotes.vendedor) */
  vendedoresConocidos?: string[];
  /** eBay usernames normalizados (trim+lowercase) conocidos por indicar el % de batería */
  vendedoresBateria?: string[];
}

const VENTAS_MIN = 15;
const PCT_POSITIVO_MIN = 80;
const OFERTAS_POCAS = 5;

function normalizado(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

function enLista(vendedor: string | null | undefined, lista: string[] | undefined): boolean {
  const vNorm = normalizado(vendedor);
  return !!vNorm && !!lista && lista.length > 0 && lista.includes(vNorm);
}

export function avisosDeVendedor(info: InfoVendedor): AvisoVendedor[] {
  const avisos: AvisoVendedor[] = [];

  if (info.vendedorTotalVentas != null && info.vendedorTotalVentas < VENTAS_MIN) {
    avisos.push({ texto: `Menos de ${VENTAS_MIN} ventas (${info.vendedorTotalVentas})`, tipo: 'advierte' });
  }
  if (info.vendedorPctPositivo != null && info.vendedorPctPositivo < PCT_POSITIVO_MIN) {
    avisos.push({ texto: `${info.vendedorPctPositivo}% positivo — debajo de ${PCT_POSITIVO_MIN}%`, tipo: 'bloquea' });
  }
  if (info.cantidadOfertas != null && info.cantidadOfertas < OFERTAS_POCAS) {
    avisos.push({ texto: `Solo ${info.cantidadOfertas} oferta${info.cantidadOfertas === 1 ? '' : 's'} — poca competencia`, tipo: 'positivo' });
  }
  if (enLista(info.vendedor, info.vendedoresConocidos)) {
    avisos.push({ texto: 'Ya le has comprado antes', tipo: 'positivo' });
  }
  if (enLista(info.vendedor, info.vendedoresBateria)) {
    avisos.push({ texto: 'Indica el % de batería en sus publicaciones', tipo: 'positivo' });
  }

  return avisos;
}
