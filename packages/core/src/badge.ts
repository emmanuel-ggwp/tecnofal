// §25: semáforo con ganancia en resultados de búsqueda — una sola escala de color/umbrales,
// reutilizada por el panel del listing y por los badges de la lista de resultados.
import type { Parametros, ResultadoEvaluacion, Semaforo, SpecsParseadas } from './types.js';

export interface Badge {
  nivel: Semaforo | null;
  /** margen ≥ mínimo y no bloqueado — "supera tu mínimo" */
  check: boolean;
  /** color CSS (hsl) interpolado por margen %, continuo bajo el mismo nivel */
  color: string;
  /** true si el cálculo depende de specs no confirmadas (RAM/SSD/batería/cargador) */
  provisional: boolean;
  margen: number | null;
  ganancia: number | null;
  costo: number | null;
  valorEsperado: number | null;
}

/** Campos que, si no están confirmados, hacen el cálculo pesimista/provisional (§20) */
function esProvisional(specs: SpecsParseadas): boolean {
  return (
    specs.ramGb.confianza !== 'confirmado' ||
    specs.ssdGb.confianza !== 'confirmado' ||
    specs.bateriaIncluida.confianza !== 'confirmado' ||
    specs.cargadorIncluido.confianza !== 'confirmado'
  );
}

/** Gradiente continuo por margen: rojo (≤ mínimo-20pts) → amarillo (mínimo) → verde (decente+) */
export function colorDeMargen(margen: number | null, p: Parametros): string {
  if (margen == null) return 'hsl(0, 0%, 60%)'; // gris: sin dato
  const rojoDesde = p.gananciaMinima - 0.2;
  let hue: number;
  if (margen <= rojoDesde) {
    hue = 0;
  } else if (margen < p.gananciaMinima) {
    hue = 30 * ((margen - rojoDesde) / (p.gananciaMinima - rojoDesde));
  } else if (margen < p.gananciaDecente) {
    hue = 30 + 15 * ((margen - p.gananciaMinima) / (p.gananciaDecente - p.gananciaMinima));
  } else {
    const extra = Math.min((margen - p.gananciaDecente) / 0.3, 1);
    hue = 45 + 75 * extra; // 45°(amarillo) → 120°(verde) a medida que supera lo decente
  }
  return `hsl(${hue.toFixed(0)}, 75%, 42%)`;
}

export function badgeDeResultado(
  resultado: ResultadoEvaluacion,
  specs: SpecsParseadas,
  p: Parametros,
): Badge {
  const nivel = resultado.semaforo;
  const check = nivel === 'verde' || nivel === 'amarillo';
  const costo = resultado.cadena.total;
  const ganancia = resultado.valorEsperado != null ? resultado.valorEsperado - costo : null;
  return {
    nivel,
    check,
    color: colorDeMargen(resultado.margen, p),
    provisional: esProvisional(specs),
    margen: resultado.margen,
    ganancia,
    costo,
    valorEsperado: resultado.valorEsperado,
  };
}
