// Parseo de precios de eBay — el formato varía por locale: "US $21.50", "USD21.50", "$1,299.99", "USD 21,50"

/** true si el texto indica envío/entrega sin costo en cualquier locale soportado */
export function esGratis(texto: string): boolean {
  return /free|gratis/i.test(texto);
}

export function parsearPrecio(texto: string | null | undefined): number | null {
  const m = texto?.match(/(?:US\s*\$|USD|\$)\s*([\d.,]+)/i);
  if (!m) return null;
  let n = m[1].replace(/[.,]$/, ''); // puntuación final ("USD21." al cortar un rango)
  const ultimoPunto = n.lastIndexOf('.');
  const ultimaComa = n.lastIndexOf(',');
  if (ultimoPunto !== -1 && ultimaComa !== -1) {
    // ambos presentes: el último es el decimal, el otro separador de miles
    n = ultimoPunto > ultimaComa
      ? n.replace(/,/g, '')
      : n.replace(/\./g, '').replace(',', '.');
  } else if (ultimaComa !== -1) {
    // solo coma: decimal si van exactamente 2 dígitos al final ("21,50"); si no, miles ("1,299")
    n = /,\d{2}$/.test(n) ? n.replace(',', '.') : n.replace(/,/g, '');
  }
  const v = parseFloat(n);
  return Number.isNaN(v) ? null : v;
}

/** Envío: "Free"/"Gratis" o sin texto → 0; si no, mismo parseo que un precio */
export function parsearEnvio(texto: string | null | undefined): number {
  if (!texto) return 0;
  if (esGratis(texto)) return 0;
  return parsearPrecio(texto) ?? 0;
}
