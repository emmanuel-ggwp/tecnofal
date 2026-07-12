'use client';

import { colorDeMargen, type Parametros } from '@tecnofal/core';

export interface SemaforoProps {
  margen: number | null;
  parametros: Parametros;
  /** Texto opcional al lado del punto (p. ej. "34%"). */
  etiqueta?: string;
}

/** Punto de color según el margen (verde→amarillo→rojo vía colorDeMargen de @tecnofal/core). */
export function Semaforo({ margen, parametros, etiqueta }: SemaforoProps) {
  const color = colorDeMargen(margen, parametros);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {etiqueta && <span className="text-sm tabular-nums">{etiqueta}</span>}
    </span>
  );
}
