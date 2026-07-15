// Relay del texto de la descripción del vendedor: eBay la sirve en un iframe cross-origin
// (itm.ebaydesc.com / vi.vipr.ebaydesc.com), inaccesible desde el frame del listing por
// same-origin policy. Este script corre DENTRO de ese iframe (ver manifest.config.ts) y le
// pasa el texto al frame principal por postMessage — ahí es donde suelen vivir frases como
// "Package List: 1x Charger" que el parser necesita para "cargador incluido" (§5.1).
// Reintentos: el iframe suele terminar de cargar (y disparar document_idle) ANTES que el
// frame principal — listing.tsx es un bundle bastante más grande (React + parser + panel) y
// puede no tener su listener de "message" registrado todavía cuando se manda el primer post.
// Sin ack posible (uno-a-muchos, fire-and-forget), reintentar es más simple que un handshake.
function enviarDescripcion() {
  window.parent.postMessage({ tecnofal: true, tipo: 'descripcion', texto: document.body.innerText }, 'https://www.ebay.com');
}
enviarDescripcion();
[300, 800, 1500, 3000].forEach((ms) => setTimeout(enviarDescripcion, ms));
