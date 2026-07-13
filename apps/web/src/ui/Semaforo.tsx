'use client';

import { colorDeMargen, type Parametros } from '@tecnofal/core';

/** Colores fijos para el semáforo ya precalculado (listings.semaforo) — mismos matices que
 *  colorDeMargen (hue 0=rojo, 45=amarillo, 120=verde) pero sin margen en vivo para calcularlos. */
const COLOR_POR_TONO: Record<'verde' | 'amarillo' | 'rojo', string> = {
  rojo: 'hsl(0, 75%, 42%)',
  amarillo: 'hsl(45, 75%, 42%)',
  verde: 'hsl(120, 75%, 42%)',
};
const COLOR_SIN_TONO = 'hsl(0, 0%, 60%)'; // gris: sin dato (igual que colorDeMargen(null, …))

export type SemaforoProps =
  | { margen: number | null; parametros: Parametros; etiqueta?: string }
  | { tono: 'verde' | 'amarillo' | 'rojo' | null; etiqueta?: string };

/** Punto de color del semáforo. Dos formas de invocación:
 *  - { margen, parametros }: calcula el color en vivo vía colorDeMargen (Calculadora).
 *  - { tono }: usa el enum ya precalculado en listings.semaforo (pantalla /listings). */
export function Semaforo(props: SemaforoProps) {
  const etiqueta = props.etiqueta;
  const color = 'margen' in props ? colorDeMargen(props.margen, props.parametros) : (props.tono ? COLOR_POR_TONO[props.tono] : COLOR_SIN_TONO);
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
