'use client';

// Indicador de guardado compartido por las celdas editables de esta pantalla (uso interno,
// no forma parte del kit compartido src/ui/).
export type EstadoGuardado = 'guardando' | 'ok' | 'error' | null;

export function IndicadorGuardado({ estado }: { estado: EstadoGuardado }) {
  if (!estado) return null;
  if (estado === 'guardando') return <span className="text-xs text-slate-400">guardando…</span>;
  if (estado === 'ok') return <span className="text-xs text-green-600">✓ guardado</span>;
  return <span className="text-xs text-red-600">✗ error</span>;
}
