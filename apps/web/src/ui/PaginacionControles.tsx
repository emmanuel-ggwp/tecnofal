'use client';

import { TAMANOS_PAGINA } from './usePaginacionCliente';

export interface PaginacionControlesProps {
  pagina: number; // 1-based
  totalPaginas: number;
  total: number;
  rangoDesde: number;
  rangoHasta: number;
  tamano: number;
  onPagina: (p: number) => void;
  onTamano: (t: number) => void;
  tamanos?: readonly number[];
}

/**
 * Control de paginación presentacional puro (no conoce datos). Lo usa el `Tabla` con estado
 * interno (paginación en cliente) y puede reusarlo una página con estado propio si algún día
 * migra a paginación en servidor (llamando `listar*({ pagina, tamano })`).
 */
export function PaginacionControles({
  pagina,
  totalPaginas,
  total,
  rangoDesde,
  rangoHasta,
  tamano,
  onPagina,
  onTamano,
  tamanos = TAMANOS_PAGINA,
}: PaginacionControlesProps) {
  return (
    <div
      data-testid="paginacion"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
    >
      <span data-testid="paginacion-rango">
        Mostrando <strong>{rangoDesde}</strong>–<strong>{rangoHasta}</strong> de <strong>{total}</strong>
      </span>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span className="text-slate-500">Por página</span>
          <select
            data-testid="paginacion-tamano"
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
            value={tamano}
            onChange={(e) => onTamano(Number(e.target.value))}
          >
            {tamanos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="paginacion-anterior"
            className="rounded-md border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onPagina(pagina - 1)}
            disabled={pagina <= 1}
          >
            ‹ Anterior
          </button>
          <span className="tabular-nums text-slate-500">
            {pagina} / {totalPaginas}
          </span>
          <button
            type="button"
            data-testid="paginacion-siguiente"
            className="rounded-md border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onPagina(pagina + 1)}
            disabled={pagina >= totalPaginas}
          >
            Siguiente ›
          </button>
        </div>
      </div>
    </div>
  );
}
