'use client';

import { PaginacionControles } from './PaginacionControles';
import { TAMANOS_PAGINA, usePaginacionCliente } from './usePaginacionCliente';

export interface TablaProps {
  encabezados: string[];
  /** Cada fila: celdas ya renderizables. */
  filas: React.ReactNode[][];
  vacio?: string;
  /** key opcional por fila (default: índice). */
  claves?: (string | number)[];
  /**
   * Paginación en cliente (opt-in). `true` usa el tamaño por defecto; el objeto permite fijar
   * el tamaño inicial y las opciones del selector. Sin este prop, la tabla se comporta igual
   * que siempre (cero regresión).
   */
  paginado?: boolean | { tamano?: number; tamanos?: readonly number[] };
}

export function Tabla({ encabezados, filas, vacio = 'Sin registros', claves, paginado }: TablaProps) {
  const opciones = typeof paginado === 'object' ? paginado : {};
  const pag = usePaginacionCliente(filas, { tamanoInicial: opciones.tamano });

  const activo = !!paginado;
  // Rango visible; cuando la paginación está activa cortamos filas y claves con el mismo offset
  // para mantener la correspondencia fila↔clave.
  const desde = activo ? (pag.pagina - 1) * pag.tamano : 0;
  const filasVisibles = activo ? pag.visibles : filas;

  // El control se muestra cuando hay más filas que el tamaño de página más chico disponible.
  // Así las tablas acotadas (que caben en la página mínima) nunca muestran nada, pero si el
  // usuario sube el tamaño y todo cabe en una página el control NO desaparece — puede volver
  // a bajarlo (no queda atascado).
  const tamanoMinimo = Math.min(...(opciones.tamanos ?? TAMANOS_PAGINA));
  const mostrarControl = activo && pag.total > tamanoMinimo;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              {encabezados.map((h) => (
                <th key={h} className="px-3 py-2 font-semibold text-slate-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={encabezados.length} className="px-3 py-6 text-center text-slate-400">
                  {vacio}
                </td>
              </tr>
            ) : (
              filasVisibles.map((fila, i) => {
                const indiceReal = desde + i;
                return (
                  <tr
                    key={claves?.[indiceReal] ?? indiceReal}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    {fila.map((celda, j) => (
                      <td key={j} className="px-3 py-2">
                        {celda}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {mostrarControl && (
        <PaginacionControles
          pagina={pag.pagina}
          totalPaginas={pag.totalPaginas}
          total={pag.total}
          rangoDesde={pag.rangoDesde}
          rangoHasta={pag.rangoHasta}
          tamano={pag.tamano}
          onPagina={pag.setPagina}
          onTamano={pag.setTamano}
          tamanos={opciones.tamanos}
        />
      )}
    </div>
  );
}
