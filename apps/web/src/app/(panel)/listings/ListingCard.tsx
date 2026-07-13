'use client';

import { Chip } from '@/ui/Chip';
import { Dinero } from '@/ui/Dinero';
import { Semaforo } from '@/ui/Semaforo';
import { ESTADO_ETIQUETAS, ESTADO_TONOS, type ListingListado } from '@/data/listings';
import { TiempoRestante } from './TiempoRestante';

export interface ListingCardProps {
  listing: ListingListado;
  ahora: Date;
}

/** Tarjeta para el layout mobile (sm:hidden) — toda la tarjeta es el link a eBay cuando hay url. */
export function ListingCard({ listing: l, ahora }: ListingCardProps) {
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 flex-1 text-sm font-medium text-slate-900">{l.titulo || '—'}</p>
        <Semaforo tono={l.semaforo} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="text-slate-500">Precio: </span>
          <Dinero monto={l.precioVisto} />
        </span>
        <span>
          <span className="text-slate-500">Puja máx. decente: </span>
          <Dinero monto={l.precioPujaDecente} />
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <TiempoRestante fechaFinSubasta={l.fechaFinSubasta} ahora={ahora} />
        <Chip tono={ESTADO_TONOS[l.estado]}>{ESTADO_ETIQUETAS[l.estado]}</Chip>
      </div>
      {!l.url && <p className="mt-2 text-xs text-slate-400">Sin link a eBay</p>}
    </>
  );

  const clases = 'block rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50';

  if (l.url) {
    return (
      <a
        href={l.url}
        target="_blank"
        rel="noopener noreferrer"
        className={clases}
        data-testid="listing-card"
      >
        {contenido}
      </a>
    );
  }
  return (
    <div className={clases} data-testid="listing-card">
      {contenido}
    </div>
  );
}
