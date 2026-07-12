'use client';

import { useEffect, useState } from 'react';
import { Tabla } from '@/ui/Tabla';
import { actualizarAjuste, listarAjustes, type AjusteConfig } from '@/data/configuracion';
import { CeldaNumero } from './_CeldaNumero';
import { CeldaTexto } from './_CeldaTexto';

export function SeccionAjustes() {
  const [ajustes, setAjustes] = useState<AjusteConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = () => {
    listarAjustes()
      .then(setAjustes)
      .catch((e: Error) => setError(e.message));
  };
  useEffect(cargar, []);

  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!ajustes) return <p className="text-slate-400">Cargando…</p>;

  return (
    <section id="ajustes" className="scroll-mt-20">
      <h2 className="text-lg font-bold">Ajustes de configuración</h2>
      <p className="mb-2 text-sm text-slate-500">
        Deltas que usan las vistas del motor de cálculo. Las claves no se renombran (las vistas SQL
        las referencian por nombre); solo se edita el delta y la nota.
      </p>
      <Tabla
        encabezados={['Clave', 'Delta', 'Nota']}
        claves={ajustes.map((a) => a.clave)}
        filas={ajustes.map((a) => [
          <code key="clave" className="text-xs text-slate-600">
            {a.clave}
          </code>,
          <CeldaNumero
            key="delta"
            valor={a.delta}
            permiteNull={false}
            testId={`ajuste-delta-${a.clave}`}
            onGuardar={async (v) => {
              const delta = v ?? 0;
              await actualizarAjuste(a.clave, { delta });
              setAjustes((prev) => prev?.map((x) => (x.clave === a.clave ? { ...x, delta } : x)) ?? prev);
            }}
          />,
          <CeldaTexto
            key="nota"
            valor={a.nota}
            ancho="w-64"
            testId={`ajuste-nota-${a.clave}`}
            onGuardar={async (v) => {
              await actualizarAjuste(a.clave, { nota: v });
              setAjustes((prev) => prev?.map((x) => (x.clave === a.clave ? { ...x, nota: v } : x)) ?? prev);
            }}
          />,
        ])}
      />
    </section>
  );
}
