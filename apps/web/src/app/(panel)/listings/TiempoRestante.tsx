'use client';

import { formatearTiempoRestante } from '@tecnofal/core';

export interface TiempoRestanteProps {
  fechaFinSubasta: string | null;
  /** hora de referencia para el cálculo — la pasa el padre (se recalcula cuando el padre
   *  actualiza `ahora` cada 5 min o al refrescar manualmente), no un timer propio. */
  ahora: Date;
}

/** Texto grueso de tiempo restante ("2d 3h", "45m", "Finalizada") o "—" si no hay fecha. */
export function TiempoRestante({ fechaFinSubasta, ahora }: TiempoRestanteProps) {
  const resultado = formatearTiempoRestante(fechaFinSubasta, ahora);
  if (!resultado) return <span className="text-slate-400">—</span>;
  return (
    <span className={resultado.finalizada ? 'font-medium text-red-600' : 'tabular-nums'}>
      {resultado.texto}
    </span>
  );
}
