// Mismo overlay de search.ts (badge de semáforo, chip de batería, avisos de vendedor, marca de
// "ya visto/evaluado/comprado/descartado") pero sobre las tarjetas de la Watchlist de eBay
// (.m-item-3-col), NO sobre resultados de búsqueda. A propósito NO aplica el atenuado/grayscale
// de "ya visto" (tf-item--visto): casi todo lo que está en la watchlist ya fue abierto como
// listing al menos una vez (así es como normalmente se agrega), así que esa señal atenuaría
// prácticamente toda la página en vez de destacar lo nuevo.
import { badgeDeResultado, parsearTiempoRestante } from '@tecnofal/core';
import { catalogoConReintento, enviar, type Catalogo, type EstadoVisto } from '../lib/mensajes';
import { evaluarListado } from '../lib/eval';
import { parsearEnvio, parsearPrecio } from '../lib/precios';
import { inyectarCssOverlay, renderBadge, type ItemOverlay } from '../lib/overlay';
import { tiempoDiverge } from '../lib/tiempo';

interface Item extends ItemOverlay {
  titulo: string;
  /** condición ("Used", "For parts or not working"…) — también alimenta el parser */
  subtitulo: string;
  precio: number | null;
  envio: number;
  itemId: string | null;
  vendedor: string | null;
  vendedorPctPositivo: number | null;
  vendedorTotalVentas: number | null;
  /** cantidad de ofertas (bids). null = Buy It Now (sin subasta) o no capturado. */
  cantidadOfertas: number | null;
}

/** A diferencia de search.ts, la Watchlist trae el % positivo/ventas como "99.80% (41500)" —
 *  sin la palabra "positive" en medio. El nombre del vendedor va envuelto en un
 *  <span class="PSEUDOLINK"> con un span oculto (".clipped") anidado y concatenado
 *  ("bruincomputer user ID") — por eso se toma solo el primer nodo de texto de ESE span en
 *  vez del textContent completo del link. */
function vendedorDeFila(el: Element): { vendedor: string | null; vendedorPctPositivo: number | null; vendedorTotalVentas: number | null; filaEl: Element | null } {
  const fila = el.querySelector('[data-testid="seller-info"]');
  const enlaces = fila ? [...fila.querySelectorAll('.m-text a')] : [];
  const vendedor = enlaces[0]?.querySelector('.PSEUDOLINK')?.childNodes[0]?.textContent?.trim() || null;
  const m = enlaces[1]?.textContent?.match(/(\d+(?:\.\d+)?)\s*%\s*\((\d+)\)/);
  return {
    vendedor,
    vendedorPctPositivo: m ? parseFloat(m[1]) : null,
    vendedorTotalVentas: m ? parseInt(m[2], 10) : null,
    filaEl: fila,
  };
}

function cantidadOfertasDeFila(el: Element): number | null {
  const texto = el.querySelector('[data-testid="bid-count"]')?.textContent?.trim();
  const m = texto?.match(/^(\d+)\s+bids?$/i);
  return m ? parseInt(m[1], 10) : null;
}

function tiempoRestanteDeFila(el: Element): string | null {
  return el.querySelector('[data-testid="time-left"]')?.textContent?.trim() || null;
}

/** A diferencia del "Quedan 13m" de search.ts, el countdown de la Watchlist viene SIN palabra
 *  disparadora ("22m 35s", "2h 46m", "1d 7h") — parsearTiempoRestante() de @tecnofal/core exige
 *  un disparador ("Quedan"/"left"/"Ends in"/etc.) para no confundir números sueltos de otras
 *  partes de la página con una duración, así que acá se le agrega " left" antes de delegar. */
function parsearFechaFinWatchlist(texto: string | null): Date | null {
  return texto ? parsearTiempoRestante(`${texto} left`) : null;
}

function extraerItem(el: Element): Item | null {
  const tituloEl = el.querySelector('h3.m-item-3-col__title');
  const titulo = tituloEl?.querySelector('a')?.textContent?.trim() ?? '';
  const itemId = el.querySelector<HTMLInputElement>('input.checkbox__control')?.getAttribute('data-itemid') ?? null;
  if (!tituloEl || !titulo || !itemId) return null;

  const precio = parsearPrecio(el.querySelector('[data-testid="price"]')?.textContent);
  const envio = parsearEnvio(el.querySelector('[data-testid="logistics-cost"]')?.textContent);
  const subtitulo = [...el.querySelectorAll('[data-testid="variations"] .m-item-3-col__text')]
    .map((s) => s.textContent?.trim())
    .filter(Boolean)
    .join(' · ');
  const { vendedor, vendedorPctPositivo, vendedorTotalVentas, filaEl } = vendedorDeFila(el);
  const cantidadOfertas = cantidadOfertasDeFila(el);
  return { el, tituloEl, titulo, subtitulo, precio, envio, itemId, vendedor, vendedorPctPositivo, vendedorTotalVentas, vendedorFilaEl: filaEl, cantidadOfertas };
}

// evita reenviar el mismo vendedor en cada re-render/scroll dentro de esta sesión de la pestaña
const vendedoresBateriaNotificados = new Set<string>();

function evaluarYPintar(item: Item, catalogo: Catalogo, vistos: Map<string, EstadoVisto>) {
  const visto = item.itemId ? vistos.get(item.itemId) : undefined;
  if (item.precio == null) {
    renderBadge(item, null, visto, catalogo.parametros, 'no se pudo leer el precio', [], [], undefined, [], { aplicarGrisVisto: false, flotanteVendorFloat: true });
    return;
  }
  const textoEval = item.subtitulo ? `${item.titulo} · ${item.subtitulo}` : item.titulo;
  let { resultado, specs, avisosVendedor } = evaluarListado(
    textoEval, item.precio, item.envio, catalogo, undefined,
    item.vendedor, item.vendedorPctPositivo, item.vendedorTotalVentas, item.cantidadOfertas,
  );
  if (specs.bateriaPct.valor != null && item.vendedor) {
    const vNorm = item.vendedor.trim().toLowerCase();
    if (vNorm && !vendedoresBateriaNotificados.has(vNorm)) {
      vendedoresBateriaNotificados.add(vNorm);
      // optimista: refleja el aviso ya en este mismo listado y en otros del mismo vendedor
      // en esta página, sin esperar a recargar (mismo criterio que Panel.tsx)
      if (!catalogo.vendedoresBateria?.includes(vNorm)) {
        catalogo.vendedoresBateria = [...(catalogo.vendedoresBateria ?? []), vNorm];
        ({ resultado, specs, avisosVendedor } = evaluarListado(
          textoEval, item.precio, item.envio, catalogo, undefined,
          item.vendedor, item.vendedorPctPositivo, item.vendedorTotalVentas, item.cantidadOfertas,
        ));
      }
      void enviar({ tipo: 'vendedor:marcarBateria', vendedor: item.vendedor }).catch(() => {});
    }
  }
  const badge = badgeDeResultado(resultado, specs, catalogo.parametros);
  renderBadge(
    item, badge, visto, catalogo.parametros,
    resultado.margen == null ? resultado.advertencias[0] : undefined,
    specs.bloqueos, specs.alertas, specs.bateriaPct.valor, avisosVendedor,
    { aplicarGrisVisto: false, flotanteVendorFloat: true },
  );
}

const idAItems = new Map<string, Item[]>();
let flushTimer: number | undefined;
let catalogoGlobal: Catalogo | null = null;

function encolarCheck(item: Item) {
  if (!item.itemId) return;
  const lista = idAItems.get(item.itemId) ?? [];
  lista.push(item);
  idAItems.set(item.itemId, lista);
  clearTimeout(flushTimer);
  if (idAItems.size >= 25) {
    void flushCola();
  } else {
    flushTimer = window.setTimeout(() => void flushCola(), 150);
  }
}

async function flushCola() {
  if (idAItems.size === 0 || !catalogoGlobal) return;
  const ids = [...idAItems.keys()];
  const pendientes = new Map(idAItems);
  idAItems.clear();
  try {
    const res = await enviar<EstadoVisto[]>({ tipo: 'listings:check', ids });
    if (Array.isArray(res)) {
      const vistos = new Map(res.map((v) => [v.ebayItemId, v]));
      for (const [id, items] of pendientes) {
        const visto = vistos.get(id);
        if (!visto) continue;
        for (const item of items) evaluarYPintar(item, catalogoGlobal, new Map([[id, visto]]));
      }
    }
  } catch { /* modo degradado sin ✓/confirmación */ }
}

const INTERVALO_ACTUALIZAR_TIEMPOS_MS = 5 * 60_000;

/** Corrige fechaFinSubasta de los listings YA guardados que están visibles ahora mismo en la
 *  Watchlist, comparando contra el countdown recién scrapeado — independiente del pintado de
 *  badges (encolarCheck/flushCola), que solo corre cuando una tarjeta pasa por el
 *  IntersectionObserver por primera vez. La Watchlist se suele dejar abierta en una pestaña por
 *  horas, así que esto se re-corre cada 5 min (además de una vez al cargar) para que el tiempo
 *  restante no se quede desactualizado mientras la pestaña sigue abierta. */
async function actualizarTiempos() {
  const tiempoPorId = new Map<string, string>();
  for (const el of document.querySelectorAll('div.m-item-3-col')) {
    const itemId = el.querySelector<HTMLInputElement>('input.checkbox__control')?.getAttribute('data-itemid');
    const tiempoTexto = tiempoRestanteDeFila(el);
    if (itemId && tiempoTexto) tiempoPorId.set(itemId, tiempoTexto);
  }
  if (tiempoPorId.size === 0) return;
  try {
    const res = await enviar<EstadoVisto[]>({ tipo: 'listings:check', ids: [...tiempoPorId.keys()] });
    if (!Array.isArray(res)) return;
    for (const visto of res) {
      const tiempoTexto = tiempoPorId.get(visto.ebayItemId);
      if (!tiempoTexto) continue;
      const fechaFinSubasta = parsearFechaFinWatchlist(tiempoTexto);
      if (tiempoDiverge(fechaFinSubasta, visto.fechaFinSubasta)) {
        void enviar({ tipo: 'listings:actualizarTiempo', ebayItemId: visto.ebayItemId, fechaFinSubasta }).catch(() => {});
      }
    }
  } catch { /* modo degradado — se reintenta en el próximo intervalo */ }
}

let io: IntersectionObserver | null = null;

/** SOLO se fija en si el badge sigue en el DOM ahora mismo — la Watchlist tiene countdowns que
 *  tickean en vivo (eBay re-renderiza el contenido de la tarjeta periódicamente), lo que borra
 *  lo que inyectamos sin avisar. Un WeakSet de "ya procesado" por elemento raíz haría que nunca
 *  se vuelva a pintar tras ese borrado, porque la raíz `.m-item-3-col` no cambia de identidad
 *  aunque su contenido interno sí. onIntersect() siempre hace unobserve() al disparar, así que
 *  volver a observar un elemento que ya intersecta dispara el callback casi de inmediato. */
function procesarNodo(el: Element) {
  if (el.querySelector('.tf-badge')) return;
  io?.observe(el);
}

function onIntersect(entries: IntersectionObserverEntry[]) {
  if (!catalogoGlobal) return;
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    io?.unobserve(entry.target);
    const item = extraerItem(entry.target);
    if (!item) continue;
    evaluarYPintar(item, catalogoGlobal, new Map());
    encolarCheck(item);
  }
}

function escanearNuevos() {
  // .m-item-3-col excluye naturalmente el <li> de "Crea una lista nueva" (.m-product-tour)
  // y el carrusel de "Sponsored items similar to what you've watched" (usa clases x-i7/iptN).
  const nodos = document.querySelectorAll('div.m-item-3-col');
  for (const el of nodos) procesarNodo(el);
}

async function main() {
  const catalogo = await catalogoConReintento();
  if (!catalogo) return;
  catalogoGlobal = catalogo;
  inyectarCssOverlay();

  io = new IntersectionObserver(onIntersect, { rootMargin: '300px 0px' });
  escanearNuevos();

  let timer: number | undefined;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(escanearNuevos, 200);
  }).observe(document.body, { childList: true, subtree: true });

  void actualizarTiempos();
  window.setInterval(() => void actualizarTiempos(), INTERVALO_ACTUALIZAR_TIEMPOS_MS);
}

void main();
