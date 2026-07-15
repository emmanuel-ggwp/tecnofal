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

// Descripción del vendedor: vive en un iframe cross-origin (ver src/content/descripcion.ts)
// que nos la manda por postMessage — no se puede leer con document.querySelector desde acá.
let descripcionExterna: string | null = null;
window.addEventListener('message', (ev) => {
  let host = '';
  try { host = new URL(ev.origin).hostname; } catch { return; }
  if (!host.endsWith('.ebaydesc.com')) return;
  if (ev.data?.tecnofal === true && ev.data.tipo === 'descripcion' && typeof ev.data.texto === 'string') {
    descripcionExterna = ev.data.texto;
  }
});

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

/** Cantidad de ofertas (bids) de la subasta. null = Buy It Now (sin subasta) o no capturado. */
function cantidadOfertasDePagina(): number | null {
  const m = texto('[data-testid="x-bid-count"], .x-bid-count').match(/(\d+)\s*bids?/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Tarjeta del vendedor: username + % feedback positivo + total de feedback/ventas. */
function vendedorDePagina(): { vendedor: string | null; vendedorPctPositivo: number | null; vendedorTotalVentas: number | null } {
  const vendedor = texto('.x-sellercard-atf__about-seller-item--seller-name') || null;
  const totalTxt = texto('[data-testid="x-sellercard-atf__about-seller"]');
  const total = totalTxt ? parseInt(totalTxt.replace(/[^\d]/g, ''), 10) : NaN;
  const vendedorTotalVentas = Number.isNaN(total) ? null : total;
  let vendedorPctPositivo: number | null = null;
  for (const el of document.querySelectorAll('[data-testid="x-sellercard-atf__data-item"]')) {
    const m = el.textContent?.match(/(\d+(?:\.\d+)?)\s*%\s*positive/i);
    if (m) { vendedorPctPositivo = parseFloat(m[1]); break; }
  }
  // Con 0 reseñas, el widget del vendedor de la página individual no muestra "X% positive"
  // (nada que calcular) — a diferencia de la grilla de búsqueda, que sí renderiza "0% positive
  // (0)". 0 reseñas ⇒ 0 positivas: mismo criterio que ya usa la grilla, para no perder el aviso.
  if (vendedorPctPositivo == null && vendedorTotalVentas === 0) vendedorPctPositivo = 0;
  return { vendedor, vendedorPctPositivo, vendedorTotalVentas };
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

  // Condición / "Notas del vendedor": frases tipo "SSD slot is broken" viven aquí, no en el título
  const condicion = texto('.x-item-condition-text') || texto('[data-testid="x-item-condition"]');

  const { vendedor, vendedorPctPositivo, vendedorTotalVentas } = vendedorDePagina();
  const cantidadOfertas = cantidadOfertasDePagina();

  return {
    itemId, titulo, precio, envio,
    textoCompleto: [titulo, condicion, specifics, descripcionExterna].filter(Boolean).join(' · '),
    vendedor, vendedorPctPositivo, vendedorTotalVentas, cantidadOfertas,
  };
}

// §16/§25: abrir el listing lo registra como 'visto' (si no estaba ya guardado),
// para que en los resultados de búsqueda aparezca atenuado como "ya lo vi".
async function marcarVisto(pagina: ReturnType<typeof extraerPagina>, catalogo: Catalogo) {
  if (!pagina.itemId || !pagina.titulo) return;
  try {
    const ev = pagina.precio != null
      ? evaluarListado(
          pagina.titulo, pagina.precio, pagina.envio, catalogo, undefined,
          pagina.vendedor, pagina.vendedorPctPositivo, pagina.vendedorTotalVentas, pagina.cantidadOfertas,
        )
      : null;
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
      vendedor: pagina.vendedor,
      vendedorPctPositivo: pagina.vendedorPctPositivo,
      vendedorTotalVentas: pagina.vendedorTotalVentas,
      cantidadOfertas: pagina.cantidadOfertas,
    };
    await enviar({ tipo: 'listings:guardar', listing });
  } catch { /* modo degradado: sin registro de vistos */ }
}

type Pagina = ReturnType<typeof extraerPagina> & { itemId: string; titulo: string };

/** eBay a veces hidrata el título/precio tarde (esqueleto de carga): esperar en vez de rendirse.
 *  También espera (con un presupuesto más corto) a que el iframe de descripción reporte su
 *  texto por postMessage — si no llega a tiempo, se sigue igual con lo que haya (mejor
 *  parcial que bloquear el panel indefinidamente si el iframe no carga o falla el postMessage). */
async function esperarPagina(maxMs = 15000, maxMsDescripcion = 5000): Promise<Pagina | null> {
  const inicio = Date.now();
  for (;;) {
    const p = extraerPagina();
    if (!p.itemId) return null; // no es una página /itm/ — no insistir
    const hayIframeDescripcion = !!document.getElementById('desc_ifr');
    const esperandoDescripcion = hayIframeDescripcion && descripcionExterna == null && Date.now() - inicio < maxMsDescripcion;
    if (p.itemId && p.titulo && !esperandoDescripcion) return p as Pagina;
    if (Date.now() - inicio > maxMs) return p.titulo ? (p as Pagina) : null;
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
      vendedor={pagina.vendedor}
      vendedorPctPositivo={pagina.vendedorPctPositivo}
      vendedorTotalVentas={pagina.vendedorTotalVentas}
      cantidadOfertas={pagina.cantidadOfertas}
      catalogo={catalogo}
      estadoPrevio={previo?.estado ?? null}
      motivoDescartePrevio={previo?.motivoDescarte ?? null}
      guardado={guardado}
    />,
  );
}

void main();
