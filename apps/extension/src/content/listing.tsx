// Panel lateral de evaluación en la página del listing (§5.2)
import { createRoot } from 'react-dom/client';
import { enviar, type Catalogo } from '../lib/mensajes';
import { Panel } from './Panel';

function texto(sel: string): string {
  return document.querySelector(sel)?.textContent?.trim() ?? '';
}

function parsearPrecio(t: string): number | null {
  const m = t.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
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
  const envioTxt = texto('.ux-labels-values--shipping .ux-textspans--BOLD') || texto('#fshippingCost');
  const envio = /free/i.test(envioTxt) ? 0 : parsearPrecio(envioTxt) ?? 0;

  // Item specifics → texto extra para el parser
  const specifics = [...document.querySelectorAll('.ux-labels-values__labels, .ux-labels-values__values, .ux-layout-section-evo__row')]
    .map((e) => e.textContent?.trim())
    .filter(Boolean)
    .join(' · ');

  return { itemId, titulo, precio, envio, textoCompleto: `${titulo} · ${specifics}` };
}

async function main() {
  const pagina = extraerPagina();
  if (!pagina.itemId || !pagina.titulo) return;

  let catalogo: Catalogo;
  try {
    catalogo = await enviar<Catalogo>({ tipo: 'catalogo' });
  } catch {
    return;
  }
  if (!catalogo || (catalogo as unknown as { error?: string }).error) return;

  const host = document.createElement('div');
  host.id = 'tecnofal-panel-host';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const raiz = document.createElement('div');
  shadow.appendChild(raiz);

  createRoot(raiz).render(
    <Panel
      itemId={pagina.itemId}
      url={location.href.split('?')[0]}
      titulo={pagina.titulo}
      textoCompleto={pagina.textoCompleto}
      precioInicial={pagina.precio}
      envioInicial={pagina.envio}
      catalogo={catalogo}
    />,
  );
}

void main();
