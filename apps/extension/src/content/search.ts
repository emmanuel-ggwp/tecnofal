// §25: semáforo con ganancia en resultados de búsqueda de eBay.
// Evaluación provisional pesimista (§20) por título; se resuelve "ya visto"/confirmado por lote (§16).
// Incremental por viewport (IntersectionObserver) para no trabar el scroll en búsquedas largas.
import { badgeDeResultado, parsearTiempoRestante } from '@tecnofal/core';
import { catalogoConReintento, enviar, type Catalogo, type EstadoVisto } from '../lib/mensajes';
import { evaluarListado } from '../lib/eval';
import { parsearEnvio, parsearPrecio } from '../lib/precios';
import { inyectarCssOverlay, renderBadge, type ItemOverlay } from '../lib/overlay';
import { tiempoDiverge } from '../lib/tiempo';

interface Item extends ItemOverlay {
  titulo: string;
  /** subtítulo/condición ("Para repuestos solamente", "De segunda mano") — también se parsea */
  subtitulo: string;
  precio: number | null;
  envio: number;
  itemId: string | null;
  /** texto crudo del countdown de la grilla ("Quedan 13m") — null si no hay o no es subasta */
  tiempoRestanteTexto: string | null;
  vendedor: string | null;
  vendedorPctPositivo: number | null;
  vendedorTotalVentas: number | null;
  /** cantidad de ofertas (bids). null = Buy It Now (sin subasta) o no capturado. */
  cantidadOfertas: number | null;
}

/** Tarjeta del vendedor: SOLO vive en .su-card-container__attributes__secondary — la tarjeta
 *  tiene VARIAS .s-card__attribute-row (precio, ofertas+tiempo, "or Best Offer", envío,
 *  ubicación) en __primary, así que hay que acotar o se agarra la fila equivocada (el precio). */
function vendedorDeCard(el: Element): { vendedor: string | null; vendedorPctPositivo: number | null; vendedorTotalVentas: number | null; filaEl: Element | null } {
  const fila = el.querySelector('.su-card-container__attributes__secondary .s-card__attribute-row');
  const spans = fila ? [...fila.querySelectorAll('span')] : [];
  // cubre tanto "100% positive (9)" como "0% positive (0)" — mismo patrón, sin caso especial
  const m = spans[1]?.textContent?.match(/(\d+(?:\.\d+)?)\s*%\s*positive\s*\((\d+)\)/i);
  return {
    vendedor: spans[0]?.textContent?.trim() || null,
    vendedorPctPositivo: m ? parseFloat(m[1]) : null,
    vendedorTotalVentas: m ? parseInt(m[2], 10) : null,
    filaEl: fila,
  };
}

/** Escanea toda la tarjeta por texto "N bid(s)" en vez de depender de una clase (genérica,
 *  compartida con "or Best Offer"/envío/ubicación) — Buy It Now sin ofertas degrada a null. */
function cantidadOfertasDeCard(el: Element): number | null {
  for (const span of el.querySelectorAll('span')) {
    const m = span.textContent?.trim().match(/^(\d+)\s+bids?$/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function extraerItem(el: Element): Item | null {
  const tituloEl = el.querySelector('.s-item__title, .s-card__title, [role="heading"]');
  const titulo = tituloEl?.textContent?.trim() ?? '';
  if (!tituloEl || !titulo || /shop on ebay/i.test(titulo)) return null;
  const href = el.querySelector<HTMLAnchorElement>('a[href*="/itm/"]')?.href ?? '';
  const itemId = href.match(/itm\/(\d+)/)?.[1] ?? null;
  const precio = parsearPrecio(el.querySelector('.s-item__price, .s-card__price')?.textContent);
  const envio = parsearEnvio(el.querySelector('.s-item__shipping, .s-item__logisticsCost, .s-card__shipping')?.textContent);
  const subtitulo = [...el.querySelectorAll('.s-item__subtitle, .s-card__subtitle')]
    .map((s) => s.textContent?.trim())
    .filter(Boolean)
    .join(' · ');
  const tiempoRestanteTexto = el.querySelector('.s-card__time-left, .s-item__time-left')?.textContent?.trim() ?? null;
  const { vendedor, vendedorPctPositivo, vendedorTotalVentas, filaEl } = vendedorDeCard(el);
  const cantidadOfertas = cantidadOfertasDeCard(el);
  return { el, tituloEl, titulo, subtitulo, precio, envio, itemId, tiempoRestanteTexto, vendedor, vendedorPctPositivo, vendedorTotalVentas, vendedorFilaEl: filaEl, cantidadOfertas };
}

// evita reenviar el mismo vendedor en cada re-render/scroll dentro de esta sesión de la pestaña
const vendedoresBateriaNotificados = new Set<string>();

function evaluarYPintar(item: Item, catalogo: Catalogo, vistos: Map<string, EstadoVisto>) {
  const visto = item.itemId ? vistos.get(item.itemId) : undefined;
  if (item.precio == null) {
    renderBadge(item, null, visto, catalogo.parametros, 'no se pudo leer el precio');
    return;
  }
  // el subtítulo (condición: "Para repuestos solamente"…) también alimenta el parser
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
        // el primer item de la lista basta: todos comparten el mismo itemId/countdown
        const conTiempo = items.find((it) => it.tiempoRestanteTexto != null);
        if (conTiempo) {
          const fechaFinSubasta = parsearTiempoRestante(conTiempo.tiempoRestanteTexto);
          if (tiempoDiverge(fechaFinSubasta, visto.fechaFinSubasta)) {
            void enviar({ tipo: 'listings:actualizarTiempo', ebayItemId: id, fechaFinSubasta }).catch(() => {});
          }
        }
      }
    }
  } catch { /* modo degradado sin ✓/confirmación */ }
}

let io: IntersectionObserver | null = null;

/** SOLO se fija en si el badge sigue en el DOM ahora mismo — un WeakSet de "ya procesado" por
 *  elemento raíz haría que, si eBay re-renderiza el contenido interno de una tarjeta (ej. la
 *  Watchlist con countdowns en vivo) y borra lo que inyectamos, nunca se vuelva a pintar,
 *  porque la raíz no cambia de identidad aunque su contenido interno sí. onIntersect() siempre
 *  hace unobserve() al disparar, así que volver a observar un elemento que ya intersecta
 *  dispara el callback casi de inmediato. */
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
  const nodos = document.querySelectorAll('li.s-item, li.s-card, div.s-item');
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
}

void main();
