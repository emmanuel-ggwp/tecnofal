'use client';

export interface TablaProps {
  encabezados: string[];
  /** Cada fila: celdas ya renderizables. */
  filas: React.ReactNode[][];
  vacio?: string;
  /** key opcional por fila (default: índice). */
  claves?: (string | number)[];
}

export function Tabla({ encabezados, filas, vacio = 'Sin registros', claves }: TablaProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
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
            filas.map((fila, i) => (
              <tr key={claves?.[i] ?? i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                {fila.map((celda, j) => (
                  <td key={j} className="px-3 py-2">
                    {celda}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
