// Overlay compartido (badge de semáforo, chip de batería, avisos de vendedor curados,
// marcador de "ya visto/evaluado/comprado/descartado") reutilizado por los content scripts
// que pintan sobre tarjetas de listado de eBay (search.ts, watchlist.ts). El escaneo de DOM
// (selectores, extracción de campos, MutationObserver/IntersectionObserver) es específico de
// cada página y vive en cada content script — acá solo la parte 100% presentacional.
import { colorDeMargen, type AvisoVendedor, type Badge } from '@tecnofal/core';
import type { Catalogo, EstadoVisto } from './mensajes';

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
.tf-vendor-float {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 4px; margin-top: 4px; min-width: 220px; max-width: 260px;
  font: 12px/1.4 system-ui, sans-serif;
}
/* Watchlist: flota en el espacio en blanco a la derecha de la fila del vendedor en vez de
   empujar el alto de la tarjeta — se ancla a vendedorFilaEl (position:relative por JS). */
.tf-vendor-float--flotante {
  position: absolute; top: 0; left: 100%; margin-top: 0; margin-left: 8px; z-index: 10;
}
.tf-vendor-float .tf-av-row { padding: 4px 8px; border-radius: 4px; margin: 2px 0; }
.tf-av-bloquea { background: #fee2e2; color: #991b1b; }
.tf-av-advierte { background: #fef9c3; color: #854d0e; }
.tf-av-positivo { background: #dcfce7; color: #166534; }
`;

export function inyectarCssOverlay() {
  if (document.getElementById('tf-badge-css')) return;
  const style = document.createElement('style');
  style.id = 'tf-badge-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Forma mínima que necesita el overlay para pintar sobre una tarjeta — cada content script
 *  define su propio `Item` (con los campos que además usa para evaluar) que cumple esta forma. */
export interface ItemOverlay {
  el: Element;
  tituloEl: Element;
  /** fila DOM del vendedor — ancla para la tabla flotante de avisos; null si no se encontró */
  vendedorFilaEl: Element | null;
}

export const GLIFO_AVISO: Record<AvisoVendedor['tipo'], string> = { bloquea: '⛔', advierte: '⚠', positivo: '✓' };

export function tooltipDe(
  badge: Badge, provisional: boolean, bloqueos: string[] = [], alertas: string[] = [],
  avisosVendedor: AvisoVendedor[] = [],
  bateriaPct?: number | null,
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
  lineas.push(...avisosVendedor.map((a) => `${GLIFO_AVISO[a.tipo]} ${a.texto}`));
  return lineas.join('\n');
}

// gradiente reutilizado con parámetros por defecto cuando solo tenemos el margen guardado (sin recomputar)
function colorDeMargenSeguro(margen: number | null, parametros: Catalogo['parametros'] | null): string {
  if (!parametros) return 'hsl(0, 0%, 60%)';
  return colorDeMargen(margen, parametros);
}

export interface RenderBadgeOpts {
  /** Atenúa (opacity + grayscale) la tarjeta completa cuando el item ya está guardado en
   *  TecnoFal. Default true (comportamiento histórico en resultados de búsqueda). Se desactiva
   *  en páginas donde casi todo ya está guardado (ej. Watchlist), donde atenuaría casi todo. */
  aplicarGrisVisto?: boolean;
  /** Flota el aviso de vendedor en el espacio en blanco a la derecha de la fila del vendedor
   *  (position: absolute, ver .tf-vendor-float--flotante) en vez de empujar el alto de la
   *  tarjeta como una fila normal. Default false (comportamiento histórico en búsqueda). */
  flotanteVendorFloat?: boolean;
}

export function renderBadge<T extends ItemOverlay>(
  item: T,
  badge: Badge | null,
  visto: EstadoVisto | undefined,
  parametros: Catalogo['parametros'] | null,
  motivo?: string,
  bloqueos: string[] = [],
  alertas: string[] = [],
  bateriaPct?: number | null,
  avisosVendedor: AvisoVendedor[] = [],
  opts: RenderBadgeOpts = {},
) {
  if (opts.aplicarGrisVisto ?? true) {
    item.el.classList.toggle('tf-item--visto', !!visto);
  }

  // % de batería — mini-badge visible, independiente del resultado de la evaluación
  item.el.querySelector('.tf-bateria')?.remove();
  if (bateriaPct != null) {
    const umbral = parametros?.bateriaPctUmbral ?? 70;
    const chip = document.createElement('span');
    chip.className = 'tf-bateria';
    chip.textContent = `🔋${bateriaPct}%`;
    chip.style.background = bateriaPct > umbral ? '#16a34a' : '#d97706';
    chip.title = bateriaPct > umbral ? 'No hace falta cambiar la batería' : `≤${umbral}%: conviene presupuestar batería nueva`;
    item.tituloEl.prepend(chip);
  }

  // avisos de vendedor — siempre visibles cerca de la fila del vendedor (sin nombre/%/ventas en crudo)
  item.el.querySelector('.tf-vendor-float')?.remove();
  if (avisosVendedor.length > 0 && item.vendedorFilaEl) {
    const float = document.createElement('div');
    float.className = opts.flotanteVendorFloat ? 'tf-vendor-float tf-vendor-float--flotante' : 'tf-vendor-float';
    for (const a of avisosVendedor) {
      const fila = document.createElement('div');
      fila.className = `tf-av-row tf-av-${a.tipo}`;
      fila.textContent = `${GLIFO_AVISO[a.tipo]} ${a.texto}`;
      float.appendChild(fila);
    }
    if (opts.flotanteVendorFloat) {
      // ancla de posicionamiento para el position:absolute de arriba
      (item.vendedorFilaEl as HTMLElement).style.position = 'relative';
      item.vendedorFilaEl.appendChild(float);
    } else {
      item.vendedorFilaEl.insertAdjacentElement('afterend', float);
    }
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
  const color = confirmadoPorVisto ? colorDeMargenSeguro(margen, parametros) : badge.color;
  const glifo = badge.check ? '✓' : '✗';
  el.textContent = provisional ? `~${glifo}` : glifo;
  el.style.background = color;
  el.className = `tf-badge${provisional ? ' tf-badge--provisional' : ''}`;
  const badgeTooltip: Badge = confirmadoPorVisto
    ? { ...badge, margen: visto!.margen, ganancia: visto!.ganancia, costo: visto!.costo }
    : badge;
  let tooltip = tooltipDe(badgeTooltip, provisional, bloqueos, alertas, avisosVendedor, bateriaPct);
  if (visto) tooltip += `\n👁 Ya visto (${visto.estado})`;
  el.title = tooltip;
}
