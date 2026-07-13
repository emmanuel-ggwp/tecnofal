'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Chip } from '@/ui/Chip';
import { Dinero } from '@/ui/Dinero';
import { Semaforo } from '@/ui/Semaforo';
import { Tabla } from '@/ui/Tabla';
import {
  ESTADO_ETIQUETAS,
  ESTADO_TONOS,
  listarListings,
  type ListingEstado,
  type ListingListado,
} from '@/data/listings';
import { ListingCard } from './ListingCard';
import { TiempoRestante } from './TiempoRestante';

const ESTADOS_DEFAULT: ListingEstado[] = ['visto', 'evaluado'];
const ESTADOS_TODOS: ListingEstado[] = ['visto', 'evaluado', 'comprado', 'descartado'];
const INTERVALO_REFRESCO_MS = 5 * 60 * 1000;

export default function ListingsPage() {
  const [listings, setListings] = useState<ListingListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => new Date());

  const [ocultarFinalizadas, setOcultarFinalizadas] = useState(true);
  const [incluirCompradasDescartadas, setIncluirCompradasDescartadas] = useState(false);

  // Evita condiciones de carrera: con polling cada 5 min + refresco manual, una respuesta
  // anterior más lenta podría resolver después de la más reciente y pisar el resultado.
  const peticionIdRef = useRef(0);

  const cargar = useCallback(() => {
    const idPeticion = ++peticionIdRef.current;
    setCargando(true);
    setError(null);
    listarListings({
      incluirFinalizadas: !ocultarFinalizadas,
      estados: incluirCompradasDescartadas ? ESTADOS_TODOS : ESTADOS_DEFAULT,
    })
      .then((data) => {
        if (peticionIdRef.current !== idPeticion) return; // respuesta obsoleta: descartar
        setListings(data);
      })
      .catch((e) => {
        if (peticionIdRef.current !== idPeticion) return;
        setError(e instanceof Error ? e.message : 'Error al cargar los listings');
      })
      .finally(() => {
        if (peticionIdRef.current !== idPeticion) return;
        setCargando(false);
      });
  }, [ocultarFinalizadas, incluirCompradasDescartadas]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const id = setInterval(() => {
      setAhora(new Date());
      cargar();
    }, INTERVALO_REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  const refrescarAhora = () => {
    setAhora(new Date());
    cargar();
  };

  const filas = listings.map((l) => {
    const celdas: React.ReactNode[] = [
      <span>
        {l.titulo || '—'}
        {!l.url && <span className="ml-1 text-xs text-slate-400">(sin link)</span>}
      </span>,
      <Semaforo tono={l.semaforo} />,
      <Dinero monto={l.precioVisto} />,
      <Dinero monto={l.precioPujaDecente} />,
      <TiempoRestante fechaFinSubasta={l.fechaFinSubasta} ahora={ahora} />,
      <Chip tono={ESTADO_TONOS[l.estado]}>{ESTADO_ETIQUETAS[l.estado]}</Chip>,
    ];
    if (!l.url) {
      return celdas.map((celda, i) => <span key={i}>{celda}</span>);
    }
    return celdas.map((celda, i) =>
      i === 0 ? (
        <a
          key={i}
          href={l.url!}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
          data-testid="fila-listing-link"
        >
          {celda}
        </a>
      ) : (
        <a
          key={i}
          href={l.url!}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
          tabIndex={-1}
          aria-hidden="true"
        >
          {celda}
        </a>
      ),
    );
  });

  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Listings</h1>
        <button
          type="button"
          data-testid="listings-refrescar"
          onClick={refrescarAhora}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
        >
          ↻ Refrescar ahora
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            data-testid="listings-filtro-ocultar-finalizadas"
            checked={ocultarFinalizadas}
            onChange={(e) => setOcultarFinalizadas(e.target.checked)}
          />
          Ocultar finalizadas
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            data-testid="listings-filtro-incluir-compradas-descartadas"
            checked={incluirCompradasDescartadas}
            onChange={(e) => setIncluirCompradasDescartadas(e.target.checked)}
          />
          Incluir compradas/descartadas
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 hidden sm:block" data-testid="listings-desktop-tabla">
        <Tabla
          encabezados={['Título', 'Semáforo', 'Precio visto', 'Puja máx. decente', 'Tiempo restante', 'Estado']}
          filas={filas}
          claves={listings.map((l) => l.id)}
          vacio={cargando ? 'Cargando…' : 'Sin listings que coincidan con los filtros'}
        />
      </div>

      <div className="mt-4 space-y-2 sm:hidden" data-testid="listings-mobile">
        {listings.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {cargando ? 'Cargando…' : 'Sin listings que coincidan con los filtros'}
          </p>
        ) : (
          listings.map((l) => <ListingCard key={l.id} listing={l} ahora={ahora} />)
        )}
      </div>
    </section>
  );
}
