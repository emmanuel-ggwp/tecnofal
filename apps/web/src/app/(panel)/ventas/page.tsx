'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListadoVentas } from './secciones/ListadoVentas';
import { Garantias } from './secciones/Garantias';
import { Compradores } from './secciones/Compradores';

type Tab = 'ventas' | 'garantias' | 'compradores';

const TABS: { id: Tab; etiqueta: string }[] = [
  { id: 'ventas', etiqueta: 'Ventas' },
  { id: 'garantias', etiqueta: 'Garantías' },
  { id: 'compradores', etiqueta: 'Compradores' },
];

function esTab(valor: string | null): valor is Tab {
  return TABS.some((t) => t.id === valor);
}

export default function VentasPage() {
  return (
    <Suspense fallback={null}>
      <VentasPageInterno />
    </Suspense>
  );
}

function VentasPageInterno() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('ventas');
  const [compradorIdInicial, setCompradorIdInicial] = useState<string | null>(null);

  // Lee tab/compradorId desde la URL (ej. link "comprador" en la tabla de Ventas:
  // /ventas?tab=compradores&compradorId=X).
  useEffect(() => {
    const tabUrl = searchParams.get('tab');
    if (esTab(tabUrl)) setTab(tabUrl);
    setCompradorIdInicial(searchParams.get('compradorId'));
  }, []);

  return (
    <section>
      <h1 className="text-2xl font-bold">Ventas</h1>

      <div className="mt-4 flex gap-1 border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              tab === t.id ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'ventas' && <ListadoVentas />}
        {tab === 'garantias' && <Garantias />}
        {tab === 'compradores' && <Compradores compradorIdInicial={compradorIdInicial} />}
      </div>
    </section>
  );
}
