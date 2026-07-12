// §25: semáforo con ganancia en resultados de búsqueda de eBay.
// Evaluación provisional pesimista (§20) por título; se resuelve "ya visto"/confirmado por lote (§16).
// Incremental por viewport (IntersectionObserver) para no trabar el scroll en búsquedas largas.
import { badgeDeResultado, colorDeMargen, type Badge } from '@tecnofal/core';
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
  return { el, tituloEl, titulo, subtitulo, precio, envio, itemId };
}

function tooltipDe(badge: Badge, provisional: boolean, bloqueos: string[] = [], alertas: string[] = []): string {
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
  return lineas.join('\n');
}

function renderBadge(
  item: Item,
  badge: Badge | null,
  visto: EstadoVisto | undefined,
  motivo?: string,
  bloqueos: string[] = [],
  alertas: string[] = [],
) {
  item.el.classList.toggle('tf-item--visto', !!visto);

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
  let tooltip = tooltipDe(badgeTooltip, provisional, bloqueos, alertas);
  if (visto) tooltip += `\n👁 Ya visto (${visto.estado})`;
  el.title = tooltip;
}

// gradiente reutilizado con parámetros por defecto cuando solo tenemos el margen guardado (sin recomputar)
let PARAMETROS_ACTUALES: Catalogo['parametros'] | null = null;
function colorDeMargenSeguro(margen: number | null): string {
  if (!PARAMETROS_ACTUALES) return 'hsl(0, 0%, 60%)';
  return colorDeMargen(margen, PARAMETROS_ACTUALES);
}

function evaluarYPintar(item: Item, catalogo: Catalogo, vistos: Map<string, EstadoVisto>) {
  const visto = item.itemId ? vistos.get(item.itemId) : undefined;
  if (item.precio == null) {
    renderBadge(item, null, visto, 'no se pudo leer el precio');
    return;
  }
  // el subtítulo (condición: "Para repuestos solamente"…) también alimenta el parser
  const textoEval = item.subtitulo ? `${item.titulo} · ${item.subtitulo}` : item.titulo;
  const { resultado, specs } = evaluarListado(textoEval, item.precio, item.envio, catalogo);
  const badge = badgeDeResultado(resultado, specs, catalogo.parametros);
  renderBadge(
    item, badge, visto,
    resultado.margen == null ? resultado.advertencias[0] : undefined,
    specs.bloqueos, specs.alertas,
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
