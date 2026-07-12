'use client';

import { useState } from 'react';
import { CatalogoTab } from './CatalogoTab';
import { StockTab } from './StockTab';
import { EspecificasTab } from './EspecificasTab';
import { OrdenesTab } from './OrdenesTab';

type Pestana = 'stock' | 'especificas' | 'catalogo' | 'ordenes';

const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: 'stock', etiqueta: 'Stock' },
  { id: 'especificas', etiqueta: 'Específicas' },
  { id: 'catalogo', etiqueta: 'Catálogo' },
  { id: 'ordenes', etiqueta: 'Órdenes' },
];

export default function PartesPage() {
  const [pestana, setPestana] = useState<Pestana>('stock');

  return (
    <section>
      <h1 className="text-2xl font-bold">Partes</h1>

      <nav className="mt-4 flex gap-1 border-b border-slate-200" aria-label="Secciones de Partes">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            aria-current={pestana === p.id ? 'page' : undefined}
            className={`rounded-t-md px-3 py-2 text-sm font-medium ${
              pestana === p.id
                ? 'border-b-2 border-slate-900 text-slate-900'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        {pestana === 'stock' && <StockTab />}
        {pestana === 'especificas' && <EspecificasTab />}
        {pestana === 'catalogo' && <CatalogoTab />}
        {pestana === 'ordenes' && <OrdenesTab />}
      </div>
    </section>
  );
}
