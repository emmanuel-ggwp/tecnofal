import type {
  AjustesConfig, CadenaCostos, CpuTipo, EntradaEvaluacion, MetodoEnvio,
  Parametros, PrecioIdeal, ResultadoEvaluacion, Semaforo,
} from './types.js';

/** Precio base desde precios_ideales; i7 sin fila propia usa i5 + ajuste i7_sobre_i5 */
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

/** Ajustes sobre la config base 8GB/256GB/14" (§2.1) */
export function ajustesPara(
  e: { ramGb: number | null; ssdGb: number | null; pantallaPulgadas: number | null; pantallaTactil: boolean },
  aj: AjustesConfig,
): number {
  let total = 0;
  if (e.ramGb != null) total += Math.floor(Math.max(e.ramGb - 8, 0) / 8) * (aj['ram_por_8gb'] ?? 0);
  if (e.ssdGb != null) total += Math.floor(Math.max(e.ssdGb - 256, 0) / 256) * (aj['ssd_por_256gb'] ?? 0);
  if (e.pantallaPulgadas != null) {
    if (e.pantallaPulgadas >= 15) total += aj['pantalla_grande'] ?? 0;
    else if (e.pantallaPulgadas <= 13) total += aj['pantalla_pequena'] ?? 0;
  }
  if (e.pantallaTactil) total += aj['pantalla_tactil'] ?? 0;
  return total;
}

function envioVzla(metodo: MetodoEnvio, volumenPie3: number, pesoKg: number, p: Parametros): number | null {
  if (metodo === 'barco') return p.tarifaBarcoPorPie3 == null ? null : volumenPie3 * p.tarifaBarcoPorPie3;
  return p.tarifaAvionZoomPorKg == null ? null : pesoKg * p.tarifaAvionZoomPorKg;
}

/**
 * Cadena de costos estimados en el orden real del flujo (§4.1).
 * §13: comision_zinli_estimada es OPCIONAL y solo aporta conservadurismo al estimado;
 * NUNCA genera línea de costo real (el resultado cambiario vive en `conversiones`).
 * §12: origen 'local' → cadena corta: precio + partes + flete nacional + revisión.
 */
export function cadenaCostos(e: EntradaEvaluacion, p: Parametros): { cadena: CadenaCostos; advertencias: string[] } {
  const advertencias: string[] = [];
  if (e.origen === 'local') {
    const base = e.precioSubasta;
    const envio = e.fleteNacional ?? 0;
    const revision = p.costoRevision * e.cantidadLaptops;
    const total = base + e.extrasPartes + envio + revision;
    return {
      cadena: { base, conZinli: base, conEbay: base, extras: e.extrasPartes, seguro: 0, envioVzla: envio, revision, total },
      advertencias,
    };
  }
  const base = e.precioSubasta + e.envioUsa;
  const conZinli = base * (1 + p.comisionZinliEstimada);
  const conEbay = conZinli * p.impuestoEbay;
  const valorDeclarado = e.valorDeclarado ?? base;
  const tasaSeguro = p.seguroValorDeclarado + (e.metodo === 'avion_zoom' ? p.seguroZoom : 0);
  const seguro = valorDeclarado * tasaSeguro;
  let envio = envioVzla(e.metodo, e.volumenPie3, e.pesoKg, p);
  if (envio == null) {
    advertencias.push(e.metodo === 'barco'
      ? 'tarifa_barco_por_pie3 sin valor: cargar en Configuración/Studio (envío Vzla = 0 en el cálculo)'
      : 'tarifa_avion_zoom_por_kg sin valor: cargar en Configuración/Studio (envío Vzla = 0 en el cálculo)');
    envio = 0;
  }
  const revision = p.costoRevision * e.cantidadLaptops;
  const total = conEbay + e.extrasPartes + seguro + envio + revision;
  return {
    cadena: { base, conZinli, conEbay, extras: e.extrasPartes, seguro, envioVzla: envio, revision, total },
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

/**
 * S(m): tope de subasta para margen objetivo m (§4.2). Lineal en S;
 * el seguro se recalcula sobre el valor declarado (una iteración).
 */
export function precioPuja(m: number, e: EntradaEvaluacion, p: Parametros, valorEsperado: number): number | null {
  if (e.origen === 'local') {
    const revision = p.costoRevision * e.cantidadLaptops;
    const s = valorEsperado / (1 + m) - e.extrasPartes - (e.fleteNacional ?? 0) - revision;
    return Number.isFinite(s) ? Math.max(Math.floor(s * 100) / 100, 0) : null;
  }
  const factor = (1 + p.comisionZinliEstimada) * p.impuestoEbay;
  const tasaSeguro = p.seguroValorDeclarado + (e.metodo === 'avion_zoom' ? p.seguroZoom : 0);
  const envio = envioVzla(e.metodo, e.volumenPie3, e.pesoKg, p) ?? 0;
  const revision = p.costoRevision * e.cantidadLaptops;

  const resolver = (seguro: number) =>
    (valorEsperado / (1 + m) - e.extrasPartes - seguro - envio - revision) / factor - e.envioUsa;

  let s = resolver((e.precioSubasta + e.envioUsa) * tasaSeguro);
  s = resolver(Math.max(s + e.envioUsa, 0) * tasaSeguro); // iterar una vez
  return Number.isFinite(s) ? Math.max(Math.floor(s * 100) / 100, 0) : null;
}

/** Evaluación completa: valor esperado, cadena, margen, semáforo, S_decente y S_max */
export function evaluar(
  e: EntradaEvaluacion,
  p: Parametros,
  precios: PrecioIdeal[],
  ajustes: AjustesConfig,
): ResultadoEvaluacion {
  const precioBase = precioBasePara(e.cpuTipo, e.cpuGen, precios, ajustes);
  const ajustesTotal = ajustesPara(e, ajustes);
  const valorEsperado = precioBase == null ? null : precioBase + ajustesTotal - e.deducciones;
  const { cadena, advertencias } = cadenaCostos(e, p);

  const margen = valorEsperado == null || cadena.total <= 0 ? null : (valorEsperado - cadena.total) / cadena.total;
  const semaforo = semaforoDe(margen, p, e.bloqueado);
  const sDecente = valorEsperado == null ? null : precioPuja(p.gananciaDecente, e, p, valorEsperado);
  const sMax = valorEsperado == null ? null : precioPuja(p.gananciaMinima, e, p, valorEsperado);
  if (precioBase == null) advertencias.push('Sin precio ideal para esta CPU/generación: corrige specs o agrega fila en precios_ideales');

  return { cadena, precioBase, ajustes: ajustesTotal, valorEsperado, margen, semaforo, sDecente, sMax, advertencias };
}
