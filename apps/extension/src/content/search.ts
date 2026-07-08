// Badges 🟢🟡🔴 + ✓ "ya visto" en resultados de búsqueda de eBay (§5.2)
import { enviar, type Catalogo, type EstadoVisto } from '../lib/mensajes';
import { evaluarListado } from '../lib/eval';

const EMOJI: Record<string, string> = { verde: '🟢', amarillo: '🟡', rojo: '🔴' };

function parsearPrecio(texto: string | null | undefined): number | null {
  const m = texto?.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function parsearEnvio(texto: string | null | undefined): number {
  if (!texto) return 0;
  if (/free/i.test(texto)) return 0;
  return parsearPrecio(texto) ?? 0;
}

interface Item {
  el: Element;
  tituloEl: Element;
  titulo: string;
  precio: number | null;
  envio: number;
  itemId: string | null;
}

function extraerItems(): Item[] {
  const nodos = document.querySelectorAll('li.s-item, li.s-card, div.s-item');
  const items: Item[] = [];
  for (const el of nodos) {
    if (el.querySelector('.tf-badge')) continue;
    const tituloEl = el.querySelector('.s-item__title, .s-card__title, [role="heading"]');
    const titulo = tituloEl?.textContent?.trim() ?? '';
    if (!tituloEl || !titulo || /shop on ebay/i.test(titulo)) continue;
    const href = el.querySelector<HTMLAnchorElement>('a[href*="/itm/"]')?.href ?? '';
    const itemId = href.match(/itm\/(\d+)/)?.[1] ?? null;
    const precio = parsearPrecio(el.querySelector('.s-item__price, .s-card__price')?.textContent);
    const envio = parsearEnvio(el.querySelector('.s-item__shipping, .s-item__logisticsCost, .s-card__shipping')?.textContent);
    items.push({ el, tituloEl, titulo, precio, envio, itemId });
  }
  return items;
}

function ponerBadge(item: Item, catalogo: Catalogo, vistos: Map<string, EstadoVisto>) {
  const badge = document.createElement('span');
  badge.className = 'tf-badge';
  badge.style.cssText = 'margin-right:6px;font-size:14px;cursor:default;';

  const visto = item.itemId ? vistos.get(item.itemId) : undefined;
  let emoji = '⚪';
  let tooltip = 'TecnoFal: sin datos suficientes';

  if (item.precio != null) {
    const { resultado, specs } = evaluarListado(item.titulo, item.precio, item.envio, catalogo);
    if (resultado.semaforo) {
      emoji = EMOJI[resultado.semaforo];
      const partes = [
        resultado.valorEsperado != null ? `Valor esperado: $${resultado.valorEsperado.toFixed(0)}` : null,
        `Costo est.: $${resultado.cadena.total.toFixed(0)}`,
        resultado.margen != null ? `Margen: ${(resultado.margen * 100).toFixed(0)}%` : null,
        resultado.sDecente != null ? `S_decente: $${resultado.sDecente.toFixed(0)}` : null,
        resultado.sMax != null ? `S_max: $${resultado.sMax.toFixed(0)}` : null,
        ...specs.bloqueos.map((b) => `⛔ ${b}`),
        ...specs.alertas,
      ].filter(Boolean);
      tooltip = `TecnoFal\n${partes.join('\n')}`;
    }
  }
  if (visto) {
    emoji = `${visto.semaforo ? EMOJI[visto.semaforo] : emoji}✓`;
    tooltip += `\n✓ Ya visto (${visto.estado})`;
  }
  badge.textContent = emoji;
  badge.title = tooltip;
  item.tituloEl.prepend(badge);
}

let procesando = false;
async function escanear(catalogo: Catalogo) {
  if (procesando) return;
  procesando = true;
  try {
    const items = extraerItems();
    if (items.length === 0) return;
    const ids = items.map((i) => i.itemId).filter((x): x is string => !!x);
    let vistos = new Map<string, EstadoVisto>();
    try {
      const res = await enviar<EstadoVisto[]>({ tipo: 'listings:check', ids });
      if (Array.isArray(res)) vistos = new Map(res.map((v) => [v.ebayItemId, v]));
    } catch { /* modo degradado sin ✓ */ }
    for (const item of items) ponerBadge(item, catalogo, vistos);
  } finally {
    procesando = false;
  }
}

async function main() {
  let catalogo: Catalogo;
  try {
    catalogo = await enviar<Catalogo>({ tipo: 'catalogo' });
  } catch {
    return;
  }
  if (!catalogo || (catalogo as unknown as { error?: string }).error) return;
  await escanear(catalogo);
  let timer: number | undefined;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void escanear(catalogo), 400);
  }).observe(document.body, { childList: true, subtree: true });
}

void main();
