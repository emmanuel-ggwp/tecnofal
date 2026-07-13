// Panel lateral de evaluación en la página del listing (§5.2)
import { createRoot } from 'react-dom/client';
import { parsearTiempoRestante } from '@tecnofal/core';
import { catalogoConReintento, enviar, type Catalogo, type EstadoVisto, type ListingGuardar } from '../lib/mensajes';
import { esGratis, parsearPrecio } from '../lib/precios';
import { evaluarListado } from '../lib/eval';
import { Panel } from './Panel';

function texto(sel: string): string {
  return document.querySelector(sel)?.textContent?.trim() ?? '';
}

/** Costo de envío: eBay cambia de layout seguido — se prueban candidatos hasta que uno tenga precio (o diga gratis). */
function envioDePagina(): number {
  const candidatos: string[] = [
    // fila "Envío:" del layout actual — texto COMPLETO de los valores ("US $15.45 delivery in 2–4 days...")
    texto('.ux-labels-values--shipping .ux-labels-values__values'),
    texto('.ux-labels-values--shipping .ux-textspans--BOLD'),
    texto('#fshippingCost'),
  ];
  for (const fila of document.querySelectorAll('[class*="ux-labels-values"]')) {
    const etiqueta = fila.querySelector('[class*="ux-labels-values__labels"]')?.textContent ?? '';
    if (!/env[ií]o|shipping/i.test(etiqueta)) continue;
    candidatos.push(fila.querySelector('[class*="ux-labels-values__values"]')?.textContent ?? '');
  }
  const m = document.body.textContent?.match(/(?:US\s*)?\$\s*[\d,]+(?:\.\d+)?\s*(?:delivery|shipping)/i);
  if (m) candidatos.push(m[0]);

  for (const txt of candidatos) {
    if (!txt) continue;
    if (esGratis(txt)) return 0;
    const precio = parsearPrecio(txt);
    if (precio != null) return precio;
  }
  return 0;
}

/** Countdown de la página individual: "Finaliza en 12 min 31 s" → fecha absoluta de cierre */
function fechaFinDePagina(): Date | null {
  const txt = texto('[data-testid="ux-timer_timer"], .ux-timer__text') || null;
  return parsearTiempoRestante(txt);
}

function extraerPagina() {
  const itemId = location.pathname.match(/\/itm\/(\d+)/)?.[1] ?? location.href.match(/itm\/(\d+)/)?.[1] ?? null;
  const titulo =
    texto('h1.x-item-title__mainTitle') ||
    texto('[data-testid="x-item-title"]') ||
    document.title.replace(/\s*\|\s*eBay.*$/i, '');
  const precio =
    parsearPrecio(texto('.x-price-primary')) ??
    parsearPrecio(texto('[data-testid="x-price-primary"]')) ??
    parsearPrecio(texto('#prcIsum'));
  const envio = envioDePagina();

  // Item specifics → texto extra para el parser
  const specifics = [...document.querySelectorAll('.ux-labels-values__labels, .ux-labels-values__values')]
    .map((e) => e.textContent?.trim())
    .filter(Boolean)
    .join(' · ');

  return { itemId, titulo, precio, envio, textoCompleto: `${titulo} · ${specifics}` };
}

// §16/§25: abrir el listing lo registra como 'visto' (si no estaba ya guardado),
// para que en los resultados de búsqueda aparezca atenuado como "ya lo vi".
async function marcarVisto(pagina: ReturnType<typeof extraerPagina>, catalogo: Catalogo) {
  if (!pagina.itemId || !pagina.titulo) return;
  try {
    const ev = pagina.precio != null ? evaluarListado(pagina.titulo, pagina.precio, pagina.envio, catalogo) : null;
    const listing: ListingGuardar = {
      ebayItemId: pagina.itemId,
      url: location.href.split('?')[0],
      titulo: pagina.titulo,
      precioVisto: pagina.precio,
      semaforo: ev?.resultado.semaforo ?? null,
      specs: ev?.specs ?? null,
      precioMaxPuja: ev?.resultado.sMax ?? null,
      precioPujaDecente: ev?.resultado.sDecente ?? null,
      cantidadLaptops: ev?.specs.cantidadLote && ev.specs.cantidadLote > 1 ? ev.specs.cantidadLote : 1,
      costoEstimadoTotal: ev?.resultado.cadena.total ?? null,
      valorEsperadoTotal: ev?.resultado.valorEsperado ?? null,
      evaluacionManual: null,
      estado: 'visto',
      fechaFinSubasta: fechaFinDePagina(),
    };
    await enviar({ tipo: 'listings:guardar', listing });
  } catch { /* modo degradado: sin registro de vistos */ }
}

type Pagina = ReturnType<typeof extraerPagina> & { itemId: string; titulo: string };

/** eBay a veces hidrata el título/precio tarde (esqueleto de carga): esperar en vez de rendirse */
async function esperarPagina(maxMs = 15000): Promise<Pagina | null> {
  const inicio = Date.now();
  for (;;) {
    const p = extraerPagina();
    if (p.itemId && p.titulo) return p as Pagina;
    if (!p.itemId) return null; // no es una página /itm/ — no insistir
    if (Date.now() - inicio > maxMs) return null;
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main() {
  if (document.getElementById('tecnofal-panel-host')) return; // ya montado
  const pagina = await esperarPagina();
  if (!pagina) return;

  const catalogo = await catalogoConReintento();
  if (!catalogo) return;

  // una sola consulta: distingue nuevo / visto / guardado, y evita la carrera con el auto-registro
  let previo: EstadoVisto | null = null;
  try {
    const ya = await enviar<EstadoVisto[]>({ tipo: 'listings:check', ids: [pagina.itemId] });
    previo = Array.isArray(ya) && ya[0] ? ya[0] : null;
  } catch { /* modo degradado */ }
  if (!previo) void marcarVisto(pagina, catalogo);

  // evaluación completa guardada → el panel restaura partes, deducciones, specs corregidas, etc.
  let guardado: ListingGuardar | null = null;
  if (previo) {
    try {
      guardado = await enviar<ListingGuardar | null>({ tipo: 'listings:obtener', id: pagina.itemId });
    } catch { /* sin restauración */ }
  }

  const host = document.createElement('div');
  host.id = 'tecnofal-panel-host';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const raiz = document.createElement('div');
  shadow.appendChild(raiz);

  createRoot(raiz).render(
    <Panel
      key={pagina.itemId}
      itemId={pagina.itemId}
      url={location.href.split('?')[0]}
      titulo={pagina.titulo}
      textoCompleto={pagina.textoCompleto}
      precioInicial={pagina.precio}
      envioInicial={pagina.envio}
      catalogo={catalogo}
      estadoPrevio={previo?.estado ?? null}
      motivoDescartePrevio={previo?.motivoDescarte ?? null}
      guardado={guardado}
    />,
  );
}

void main();
