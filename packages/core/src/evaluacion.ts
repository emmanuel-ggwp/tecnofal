import type {
  AjustesConfig, CadenaCostos, CpuTipo, EntradaEvaluacion, MetodoEnvio,
  Parametros, PrecioIdeal, ResultadoEvaluacion, Semaforo,
} from './types.js';

export function precioBasePara(
  cpuTipo: CpuTipo | null,
  cpuGen: number | null,
  precios: PrecioIdeal[],
  ajustes: AjustesConfig,
): number | null {
  if (!cpuTipo || cpuGen == null) return null;
  const exacto = precios.find((p) => p.cpuTipo === cpuTipo && cpuGen >= p.genDesde && cpuGen <= p.genHasta);
  if (exacto) return exacto.precioBase;
  if (cpuTipo === 'i7') {
    const i5 = precios.find((p) => p.cpuTipo === 'i5' && cpuGen >= p.genDesde && cpuGen <= p.genHasta);
    if (i5) return i5.precioBase + (ajustes['i7_sobre_i5'] ?? 0);
  }
  return null;
}

export function ajusteRam(ramGb: number | null, aj: AjustesConfig): number {
  return ramGb != null ? Math.floor(Math.max(ramGb - 8, 0) / 8) * (aj['ram_por_8gb'] ?? 0) : 0;
}

export function ajusteSsd(ssdGb: number | null, aj: AjustesConfig): number {
  return ssdGb != null ? Math.floor(Math.max(ssdGb - 256, 0) / 256) * (aj['ssd_por_256gb'] ?? 0) : 0;
}

export function ajustesPara(
  e: { ramGb: number | null; ssdGb: number | null; pantallaPulgadas: number | null; pantallaTactil: boolean },
  aj: AjustesConfig,
): number {
  let total = ajusteRam(e.ramGb, aj) + ajusteSsd(e.ssdGb, aj) + ajustePantalla(e.pantallaPulgadas, aj);
  if (e.pantallaTactil) total += aj['pantalla_tactil'] ?? 0;
  return total;
}

/** Ajuste por tamaño de pantalla: base = 14" (13.3 cuenta como 14); ≥15 grande; ≤13 pequeña */
export function ajustePantalla(pulgadas: number | null, aj: AjustesConfig): number {
  if (pulgadas == null) return 0;
  if (pulgadas >= 15) return aj['pantalla_grande'] ?? 0;
  if (pulgadas <= 13) return aj['pantalla_pequena'] ?? 0;
  return 0;
}

function envioVzla(metodo: MetodoEnvio, volumenTotal: number, pesoTotal: number, p: Parametros): number | null {
  if (metodo === 'barco') return p.tarifaBarcoPorPie3 == null ? null : volumenTotal * p.tarifaBarcoPorPie3;
  return p.tarifaAvionZoomPorKg == null ? null : pesoTotal * p.tarifaAvionZoomPorKg;
}

export function cadenaCostos(e: EntradaEvaluacion, p: Parametros): { cadena: CadenaCostos; advertencias: string[] } {
  const advertencias: string[] = [];
  const n = Math.max(e.cantidadLaptops, 1);
  const extras = e.extrasPartes; // TOTAL del lote
  const revision = p.costoRevision * n;

  if (e.origen === 'local') {
    const base = e.precioSubasta;
    const envio = e.fleteNacional ?? 0;
    const total = base + extras + envio + revision;
    return {
      cadena: { base, conZinli: base, conEbay: base, extras, seguro: 0, envioVzla: envio, revision, total },
      advertencias,
    };
  }

  const base = e.precioSubasta + e.envioUsa;
  const conZinli = base * (1 + p.comisionZinliEstimada);
  const conEbay = conZinli * p.impuestoEbay;
  const valorDeclarado = e.valorDeclarado ?? base;
  const tasaSeguro = p.seguroValorDeclarado + (e.metodo === 'avion_zoom' ? p.seguroZoom : 0);
  const seguro = valorDeclarado * tasaSeguro;
  let envio = e.envioVzlaPorUnidad != null
    ? e.envioVzlaPorUnidad * n
    : envioVzla(e.metodo, e.volumenPie3 * n, e.pesoKg * n, p);
  if (envio == null) {
    advertencias.push(e.metodo === 'barco'
      ? 'tarifa_barco_por_pie3 sin valor: cargar en Configuración/Studio (envío Vzla = 0 en el cálculo)'
      : 'tarifa_avion_zoom_por_kg sin valor: cargar en Configuración/Studio (envío Vzla = 0 en el cálculo)');
    envio = 0;
  }
  const total = conEbay + extras + seguro + envio + revision;
  return {
    cadena: { base, conZinli, conEbay, extras, seguro, envioVzla: envio, revision, total },
    advertencias,
  };
}

export function semaforoDe(margen: number | null, p: Parametros, bloqueado: boolean): Semaforo | null {
  if (bloqueado) return 'rojo';
  if (margen == null) return null;
  if (margen >= p.gananciaDecente) return 'verde';
  if (margen >= p.gananciaMinima) return 'amarillo';
  return 'rojo';
}

export function precioPuja(m: number, e: EntradaEvaluacion, p: Parametros, valorEsperadoTotal: number): number | null {
  const n = Math.max(e.cantidadLaptops, 1);
  const extras = e.extrasPartes; // TOTAL del lote
  const revision = p.costoRevision * n;

  if (e.origen === 'local') {
    const s = valorEsperadoTotal / (1 + m) - extras - (e.fleteNacional ?? 0) - revision;
    return Number.isFinite(s) ? Math.floor(s * 100) / 100 : null;
  }

  const factor = (1 + p.comisionZinliEstimada) * p.impuestoEbay;
  const tasaSeguro = p.seguroValorDeclarado + (e.metodo === 'avion_zoom' ? p.seguroZoom : 0);
  const envio = e.envioVzlaPorUnidad != null
    ? e.envioVzlaPorUnidad * n
    : envioVzla(e.metodo, e.volumenPie3 * n, e.pesoKg * n, p) ?? 0;

  const resolver = (seguro: number) =>
    (valorEsperadoTotal / (1 + m) - extras - seguro - envio - revision) / factor - e.envioUsa;

  let s = resolver((e.precioSubasta + e.envioUsa) * tasaSeguro);
  s = resolver(Math.max(s + e.envioUsa, 0) * tasaSeguro);
  return Number.isFinite(s) ? Math.floor(s * 100) / 100 : null;
}

export function evaluar(
  e: EntradaEvaluacion,
  p: Parametros,
  precios: PrecioIdeal[],
  ajustes: AjustesConfig,
): ResultadoEvaluacion {
  const n = Math.max(e.cantidadLaptops, 1);
  const precioBase = precioBasePara(e.cpuTipo, e.cpuGen, precios, ajustes);
  const ajustesTotal = ajustesPara(e, ajustes);
  let valorEsperado: number | null;
  if (precioBase == null) {
    valorEsperado = null;
  } else if (e.pantallas && e.pantallas.length > 0) {
    // LOTE MIXTO: Σ por tamaño; unidades sin asignar → 14" (base)
    const sinPantalla = ajustesPara({ ...e, pantallaPulgadas: null }, ajustes);
    const asignadas = e.pantallas.reduce((s, b) => s + b.cantidad, 0);
    const resto = Math.max(n - asignadas, 0);
    valorEsperado =
      e.pantallas.reduce((s, b) => s + b.cantidad * (precioBase + sinPantalla + ajustePantalla(b.pulgadas, ajustes)), 0)
      + resto * (precioBase + sinPantalla)
      - e.deducciones;
  } else {
    valorEsperado = (precioBase + ajustesTotal) * n - e.deducciones;
  }
  const valorEsperadoUnidad = valorEsperado == null ? null : valorEsperado / n;
  const { cadena, advertencias } = cadenaCostos(e, p);

  const margen = valorEsperado == null || cadena.total <= 0 ? null : (valorEsperado - cadena.total) / cadena.total;
  const semaforo = semaforoDe(margen, p, e.bloqueado);

  let sDecente: number | null = null;
  let sMax: number | null = null;
  let sinPujaMotivo: string | null = null;

  if (e.bloqueado) {
    sinPujaMotivo = 'Bloqueada: no pujar';
  } else if (valorEsperado != null) {
    sMax = precioPuja(p.gananciaMinima, e, p, valorEsperado);
    sDecente = precioPuja(p.gananciaDecente, e, p, valorEsperado);
    if (sMax != null && sMax <= 0) {
      sMax = null;
      sDecente = null;
      sinPujaMotivo = 'Sin margen ni gratis: partes + envío + revisión superan el valor esperado';
    } else if (sDecente != null && sDecente <= 0) {
      sDecente = null;
      advertencias.push('Margen decente inalcanzable incluso a subasta $0 — solo alcanza el mínimo');
    }
  }
  if (precioBase == null) advertencias.push('Sin precio ideal para esta CPU/generación: corrige specs o agrega fila en precios_ideales');

  return {
    cadena, precioBase, ajustes: ajustesTotal,
    valorEsperado, valorEsperadoUnidad,
    costoPorUnidad: cadena.total / n,
    margen, semaforo, sDecente, sMax, sinPujaMotivo, advertencias,
  };
}
