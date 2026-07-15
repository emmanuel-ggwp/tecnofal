// §25: semáforo con ganancia en resultados de búsqueda de eBay.
// Evaluación provisional pesimista (§20) por título; se resuelve "ya visto"/confirmado por lote (§16).
// Incremental por viewport (IntersectionObserver) para no trabar el scroll en búsquedas largas.
import { badgeDeResultado, colorDeMargen, parsearTiempoRestante, type Badge } from '@tecnofal/core';
import { catalogoConReintento, enviar, type Catalogo, type EstadoVisto } from '../lib/mensajes';
import { evaluarListado } from '../lib/eval';
import { esGratis, parsearPrecio } from '../lib/precios';

const CSS = `
.tf-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 18px; padding: 0 5px; margin-right: 6px;
  border-radius: 9px; font: 700 11px/1 system-ui, sans-serif; color: #fff;
  cursor: default; vertical-align: middle; box-sizing: border-box;
}
.tf-badge--provisional { opacity: .65; border: 1.5px dashed rgba(255,255,255,.9); }
.tf-badge--sinDatos { background: #9ca3af !important; }
.tf-bateria {
  display: inline-flex; align-items: center; justify-content: center;
  height: 18px; padding: 0 5px; margin-right: 6px;
  border-radius: 9px; font: 700 11px/1 system-ui, sans-serif; color: #fff;
  cursor: default; vertical-align: middle; box-sizing: border-box;
}
.tf-visto {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  background: #2563eb; margin-right: 4px; vertical-align: middle;
}
.tf-estado {
  display: inline-block; margin-right: 4px; padding: 0 5px; border-radius: 8px;
  font: 600 10px/1.5 system-ui, sans-serif; vertical-align: middle;
}
.tf-estado--evaluado { background: #dbeafe; color: #1e40af; }
.tf-estado--comprado { background: #dcfce7; color: #166534; }
.tf-estado--descartado { background: #fee2e2; color: #991b1b; }
.tf-item--visto { opacity: .55; }
.tf-item--visto img { filter: grayscale(.7); }
`;

function inyectarCss() {
  if (document.getElementById('tf-badge-css')) return;
  const style = document.createElement('style');
  style.id = 'tf-badge-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function parsearEnvio(texto: string | null | undefined): number {
  if (!texto) return 0;
  if (esGratis(texto)) return 0;
  return parsearPrecio(texto) ?? 0;
}

interface Item {
  el: Element;
  tituloEl: Element;
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
function vendedorDeCard(el: Element): { vendedor: string | null; vendedorPctPositivo: number | null; vendedorTotalVentas: number | null } {
  const fila = el.querySelector('.su-card-container__attributes__secondary .s-card__attribute-row');
  const spans = fila ? [...fila.querySelectorAll('span')] : [];
  // cubre tanto "100% positive (9)" como "0% positive (0)" — mismo patrón, sin caso especial
  const m = spans[1]?.textContent?.match(/(\d+(?:\.\d+)?)\s*%\s*positive\s*\((\d+)\)/i);
  return {
    vendedor: spans[0]?.textContent?.trim() || null,
    vendedorPctPositivo: m ? parseFloat(m[1]) : null,
    vendedorTotalVentas: m ? parseInt(m[2], 10) : null,
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
  const { vendedor, vendedorPctPositivo, vendedorTotalVentas } = vendedorDeCard(el);
  const cantidadOfertas = cantidadOfertasDeCard(el);
  return { el, tituloEl, titulo, subtitulo, precio, envio, itemId, tiempoRestanteTexto, vendedor, vendedorPctPositivo, vendedorTotalVentas, cantidadOfertas };
}

function tooltipDe(
  badge: Badge, provisional: boolean, bloqueos: string[] = [], alertas: string[] = [],
  vendedor?: { nombre: string | null; pctPositivo: number | null; totalVentas: number | null } | null,
  cantidadOfertas?: number | null,
  bateriaPct?: number | null,
  vendedorMuestraBateria?: boolean,
): string {
  const lineas: string[] = [];
  if (badge.margen == null) {
    lineas.push('TecnoFal: sin datos suficientes');
  } else {
    const pct = `${(badge.margen * 100).toFixed(0)}%`;
    const ganancia = badge.ganancia != null ? `${badge.ganancia >= 0 ? '+' : '−'}$${Math.abs(badge.ganancia).toFixed(0)}` : '?';
    const costo = badge.costo != null ? badge.costo.toFixed(0) : '?';
    const valor = badge.valorEsperado != null ? badge.valorEsperado.toFixed(0) : '?';
    lineas.push(`TecnoFal · ${provisional ? '~' : ''}${pct} · ${ganancia} · costo $${costo} / valor $${valor}`);
    if (provisional) lineas.push('(provisional: abre el listing para confirmar specs)');
  }
  lineas.push(...bloqueos.map((b) => `⛔ ${b}`));
  lineas.push(...alertas.slice(0, 3).map((a) => (a.startsWith('⚠') ? a : `⚠ ${a}`)));
  if (bateriaPct != null) lineas.push(`🔋 Batería: ${bateriaPct}%`);
  if (vendedorMuestraBateria) lineas.push('🔋 Vendedor conocido por indicar el % de batería');
  if (vendedor?.nombre) {
    const p = vendedor.pctPositivo != null ? `${vendedor.pctPositivo}%` : '?';
    const tot = vendedor.totalVentas != null ? ` (${vendedor.totalVentas})` : '';
    lineas.push(`Vendedor: ${vendedor.nombre} · ${p} positivo${tot}`);
  }
  if (cantidadOfertas != null) lineas.push(`Ofertas: ${cantidadOfertas}`);
  return lineas.join('\n');
}

function renderBadge(
  item: Item,
  badge: Badge | null,
  visto: EstadoVisto | undefined,
  motivo?: string,
  bloqueos: string[] = [],
  alertas: string[] = [],
  bateriaPct?: number | null,
  vendedorMuestraBateria?: boolean,
) {
  item.el.classList.toggle('tf-item--visto', !!visto);

  // % de batería — mini-badge visible, independiente del resultado de la evaluación
  item.el.querySelector('.tf-bateria')?.remove();
  if (bateriaPct != null) {
    const umbral = PARAMETROS_ACTUALES?.bateriaPctUmbral ?? 70;
    const chip = document.createElement('span');
    chip.className = 'tf-bateria';
    chip.textContent = `🔋${bateriaPct}%`;
    chip.style.background = bateriaPct > umbral ? '#16a34a' : '#d97706';
    chip.title = bateriaPct > umbral ? 'No hace falta cambiar la batería' : `≤${umbral}%: conviene presupuestar batería nueva`;
    item.tituloEl.prepend(chip);
  }

  // marca de "ya visto/guardado" — SIEMPRE, incluso cuando el badge queda en "?"
  item.el.querySelector('.tf-visto')?.remove();
  item.el.querySelector('.tf-estado')?.remove();
  if (visto) {
    const marca = document.createElement('span');
    if (visto.estado === 'visto') {
      marca.className = 'tf-visto';
      marca.title = 'Ya visto (sin guardar)';
    } else {
      marca.className = `tf-estado tf-estado--${visto.estado}`;
      marca.textContent = visto.estado;
      marca.title = `Guardado: ${visto.estado}`;
    }
    item.tituloEl.prepend(marca);
  }

  let el = item.el.querySelector<HTMLSpanElement>('.tf-badge');
  if (!el) {
    el = document.createElement('span');
    el.className = 'tf-badge';
    item.tituloEl.prepend(el);
  }
  // descartada (con o sin motivo, o con el legado "bloqueada"): manda sobre todo lo demás
  const rechazada = visto?.estado === 'descartado' || visto?.motivoDescarte != null;
  if (rechazada) {
    el.textContent = '✗';
    el.style.background = '#dc2626';
    el.className = 'tf-badge';
    el.title = `TecnoFal · 🚫 Descartada por ti${visto?.motivoDescarte ? `: ${visto.motivoDescarte}` : ''}`;
    return;
  }
  if (!badge || badge.nivel == null) {
    el.textContent = '?';
    el.title = `TecnoFal: ${motivo ?? 'sin datos suficientes'}`;
    el.style.background = '';
    el.className = 'tf-badge tf-badge--sinDatos';
    return;
  }
  const confirmadoPorVisto = visto?.margen != null;
  const provisional = !confirmadoPorVisto && badge.provisional;
  const margen = confirmadoPorVisto ? visto!.margen : badge.margen;
  const color = confirmadoPorVisto ? colorDeMargenSeguro(margen) : badge.color;
  const glifo = badge.check ? '✓' : '✗';
  el.textContent = provisional ? `~${glifo}` : glifo;
  el.style.background = color;
  el.className = `tf-badge${provisional ? ' tf-badge--provisional' : ''}`;
  const badgeTooltip: Badge = confirmadoPorVisto
    ? { ...badge, margen: visto!.margen, ganancia: visto!.ganancia, costo: visto!.costo }
    : badge;
  let tooltip = tooltipDe(
    badgeTooltip, provisional, bloqueos, alertas,
    { nombre: item.vendedor, pctPositivo: item.vendedorPctPositivo, totalVentas: item.vendedorTotalVentas },
    item.cantidadOfertas, bateriaPct, vendedorMuestraBateria,
  );
  if (visto) tooltip += `\n👁 Ya visto (${visto.estado})`;
  el.title = tooltip;
}

// gradiente reutilizado con parámetros por defecto cuando solo tenemos el margen guardado (sin recomputar)
let PARAMETROS_ACTUALES: Catalogo['parametros'] | null = null;
function colorDeMargenSeguro(margen: number | null): string {
  if (!PARAMETROS_ACTUALES) return 'hsl(0, 0%, 60%)';
  return colorDeMargen(margen, PARAMETROS_ACTUALES);
}

// evita reenviar el mismo vendedor en cada re-render/scroll dentro de esta sesión de la pestaña
const vendedoresBateriaNotificados = new Set<string>();

function evaluarYPintar(item: Item, catalogo: Catalogo, vistos: Map<string, EstadoVisto>) {
  const visto = item.itemId ? vistos.get(item.itemId) : undefined;
  if (item.precio == null) {
    renderBadge(item, null, visto, 'no se pudo leer el precio');
    return;
  }
  // el subtítulo (condición: "Para repuestos solamente"…) también alimenta el parser
  const textoEval = item.subtitulo ? `${item.titulo} · ${item.subtitulo}` : item.titulo;
  const { resultado, specs } = evaluarListado(textoEval, item.precio, item.envio, catalogo, undefined, item.vendedor);
  const badge = badgeDeResultado(resultado, specs, catalogo.parametros);
  renderBadge(
    item, badge, visto,
    resultado.margen == null ? resultado.advertencias[0] : undefined,
    specs.bloqueos, specs.alertas, specs.bateriaPct.valor, specs.vendedorMuestraBateria,
  );
  if (specs.bateriaPct.valor != null && item.vendedor) {
    const vNorm = item.vendedor.trim().toLowerCase();
    if (vNorm && !vendedoresBateriaNotificados.has(vNorm)) {
      vendedoresBateriaNotificados.add(vNorm);
      void enviar({ tipo: 'vendedor:marcarBateria', vendedor: item.vendedor }).catch(() => {});
    }
  }
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

// umbral para no generar una escritura por cada scroll cuando el countdown ronda el mismo minuto
const UMBRAL_ACTUALIZAR_TIEMPO_MS = 2 * 60_000;

/** chrome.runtime.sendMessage serializa `Date` a string ISO — `visto.fechaFinSubasta` llega
 *  degradado a string aunque EstadoVisto lo tipe `Date | null`. */
function aFecha(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(v);
}

/** Countdown de la grilla vs. el fechaFinSubasta ya guardado: si divergen lo suficiente (o
 *  el guardado no tiene), empuja la corrección — solo para listings YA guardados (§26). */
function tiempoDiverge(nuevo: Date | null, guardado: Date | null): boolean {
  if (nuevo == null) return false;
  const guardadoFecha = aFecha(guardado);
  if (guardadoFecha == null) return true;
  return Math.abs(nuevo.getTime() - guardadoFecha.getTime()) > UMBRAL_ACTUALIZAR_TIEMPO_MS;
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

const observados = new WeakSet<Element>();
let io: IntersectionObserver | null = null;

function procesarNodo(el: Element) {
  if (observados.has(el) || el.querySelector('.tf-badge')) return;
  observados.add(el);
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
  PARAMETROS_ACTUALES = catalogo.parametros;
  inyectarCss();

  io = new IntersectionObserver(onIntersect, { rootMargin: '300px 0px' });
  escanearNuevos();

  let timer: number | undefined;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(escanearNuevos, 200);
  }).observe(document.body, { childList: true, subtree: true });
}

void main();
