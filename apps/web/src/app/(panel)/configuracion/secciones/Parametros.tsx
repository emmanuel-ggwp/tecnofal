'use client';

import { useEffect, useState } from 'react';
import { Tabla } from '@/ui/Tabla';
import { actualizarParametro, listarParametros, type Parametro } from '@/data/configuracion';
import { CeldaNumero } from './_CeldaNumero';

export function SeccionParametros() {
  const [parametros, setParametros] = useState<Parametro[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = () => {
    listarParametros()
      .then(setParametros)
      .catch((e: Error) => setError(e.message));
  };
  useEffect(cargar, []);

  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!parametros) return <p className="text-slate-400">Cargando…</p>;

  return (
    <section id="parametros" className="scroll-mt-20">
      <h2 className="text-lg font-bold">Parámetros</h2>
      <p className="mb-2 text-sm text-slate-500">
        Valores globales del motor de cálculo. Un valor vacío (&quot;—&quot;) significa &quot;sin valor
        vigente&quot; — cárgalo antes de que el sistema lo necesite.
      </p>
      <Tabla
        encabezados={['Clave', 'Valor', 'Descripción']}
        claves={parametros.map((p) => p.clave)}
        filas={parametros.map((p) => [
          <code key="clave" className="text-xs text-slate-600">
            {p.clave}
          </code>,
          <CeldaNumero
            key="valor"
            valor={p.valor}
            testId={`param-valor-${p.clave}`}
            onGuardar={async (v) => {
              await actualizarParametro(p.clave, v);
              setParametros((prev) => prev?.map((x) => (x.clave === p.clave ? { ...x, valor: v } : x)) ?? prev);
            }}
          />,
          <span key="desc" className="text-sm text-slate-500">
            {p.descripcion ?? '—'}
          </span>,
        ])}
      />
    </section>
  );
}
