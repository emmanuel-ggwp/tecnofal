'use client';

export interface FechaCortaProps {
  fecha: string | Date | null | undefined;
}

const FORMATO = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' });

/** Fecha corta en español ("9 jul 2026"); acepta ISO string o Date ("—" si es null). */
export function FechaCorta({ fecha }: FechaCortaProps) {
  if (!fecha) return <span className="text-slate-400">—</span>;
  // Las fechas 'YYYY-MM-DD' de SQL se interpretan a mediodía UTC para evitar el corrimiento de zona.
  const d = typeof fecha === 'string' ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T12:00:00Z` : fecha) : fecha;
  if (Number.isNaN(d.getTime())) return <span className="text-slate-400">—</span>;
  return <time dateTime={d.toISOString()}>{FORMATO.format(d)}</time>;
}
