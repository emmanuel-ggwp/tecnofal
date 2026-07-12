'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Campo } from '@/ui/Campo';
import { Chip } from '@/ui/Chip';
import { Dinero } from '@/ui/Dinero';
import { Tabla } from '@/ui/Tabla';
import {
  ESTADO_ETIQUETAS,
  ESTADO_TONOS,
  listarLaptops,
  listarModelosParaFiltro,
  type FiltrosInventario,
  type LaptopEstado,
  type LaptopListado,
  type ModeloOpcion,
} from '@/data/inventario';

type DetallesFiltro = 'todos' | 'con' | 'sin';

function specsResumen(l: LaptopListado): string {
  const cpu = [l.cpuTipo?.toUpperCase(), l.cpuGen ? `gen ${l.cpuGen}` : null].filter(Boolean).join(' ') || '—';
  const ram = l.ramGb != null ? `${l.ramGb}GB RAM` : '— RAM';
  const ssd = l.ssdGb != null ? `${l.ssdGb}GB SSD` : '— SSD';
  const pantalla = l.pantallaPulgadas != null ? `${l.pantallaPulgadas}"${l.pantallaTactil ? ' táctil' : ''}` : '—';
  return `${cpu} · ${ram} · ${ssd} · ${pantalla}`;
}

export default function InventarioPage() {
  return (
    <Suspense fallback={null}>
      <InventarioPageInterno />
    </Suspense>
  );
}

function InventarioPageInterno() {
  const searchParams = useSearchParams();
  const [laptops, setLaptops] = useState<LaptopListado[]>([]);
  const [modelos, setModelos] = useState<ModeloOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<LaptopEstado | ''>('');

  // Lee el filtro de estado inicial desde la URL (ej. link "Laptops por estado" del
  // Dashboard: /inventario?estado=X).
  useEffect(() => {
    const estadoUrl = searchParams.get('estado');
    if (estadoUrl) setEstado(estadoUrl as LaptopEstado);
  }, []);
  const [modeloId, setModeloId] = useState('');
  const [cpuGen, setCpuGen] = useState('');
  const [detallesFiltro, setDetallesFiltro] = useState<DetallesFiltro>('todos');
  const [bateriaMin, setBateriaMin] = useState('');
  const [soloDonantes, setSoloDonantes] = useState(false);

  useEffect(() => {
    listarModelosParaFiltro()
      .then(setModelos)
      .catch(() => setModelos([]));
  }, []);

  const filtros: FiltrosInventario = useMemo(
    () => ({
      busqueda: busqueda.trim() || undefined,
      estado: estado || undefined,
      modeloId: modeloId || undefined,
      cpuGen: cpuGen ? Number(cpuGen) : undefined,
      conDetalles: detallesFiltro === 'todos' ? undefined : detallesFiltro === 'con',
      bateriaMin: bateriaMin ? Number(bateriaMin) : undefined,
      esDonante: soloDonantes ? true : undefined,
    }),
    [busqueda, estado, modeloId, cpuGen, detallesFiltro, bateriaMin, soloDonantes],
  );

  // Evita condiciones de carrera: si el usuario cambia los filtros rápido (ej. al escribir
  // en el buscador), una petición anterior más lenta (p. ej. la carga inicial sin filtros)
  // podría resolver después de la más reciente y pisar el resultado ya filtrado.
  const peticionIdRef = useRef(0);

  const cargar = useCallback(() => {
    const idPeticion = ++peticionIdRef.current;
    setCargando(true);
    setError(null);
    listarLaptops(filtros)
      .then((data) => {
        if (peticionIdRef.current !== idPeticion) return; // respuesta obsoleta: descartar
        setLaptops(data);
      })
      .catch((e) => {
        if (peticionIdRef.current !== idPeticion) return;
        setError(e instanceof Error ? e.message : 'Error al cargar el inventario');
      })
      .finally(() => {
        if (peticionIdRef.current !== idPeticion) return;
        setCargando(false);
      });
  }, [filtros]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filas = laptops.map((l) => {
    const contenido: React.ReactNode[] = [
      <span className="font-mono font-semibold">{l.alias || '—'}</span>,
      l.modeloNombre,
      <span className="text-slate-500">{specsResumen(l)}</span>,
      <Chip tono={ESTADO_TONOS[l.estado]}>{l.estadoMostrado}</Chip>,
      <Dinero monto={l.precioSugerido} />,
      <Dinero monto={l.costoActual} />,
      <Dinero monto={l.gananciaPotencial} />,
    ];
    return contenido.map((celda, i) =>
      i === 0 ? (
        <Link key={i} href={`/inventario/${l.id}`} className="block" data-testid="fila-inventario-link">
          {celda}
        </Link>
      ) : (
        <Link key={i} href={`/inventario/${l.id}`} className="block" tabIndex={-1} aria-hidden="true">
          {celda}
        </Link>
      ),
    );
  });

  return (
    <section>
      <h1 className="text-2xl font-bold">Inventario</h1>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-4">
        <Campo
          label="Buscar por alias"
          placeholder="Ej. 1234"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Estado
          <select
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={estado}
            onChange={(e) => setEstado(e.target.value as LaptopEstado | '')}
          >
            <option value="">Todos</option>
            {(Object.keys(ESTADO_ETIQUETAS) as LaptopEstado[]).map((e) => (
              <option key={e} value={e}>
                {ESTADO_ETIQUETAS[e]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Marca / modelo
          <select
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={modeloId}
            onChange={(e) => setModeloId(e.target.value)}
          >
            <option value="">Todos</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <Campo
          label="Generación"
          type="number"
          placeholder="Ej. 10"
          value={cpuGen}
          onChange={(e) => setCpuGen(e.target.value)}
        />

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Detalles
          <select
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={detallesFiltro}
            onChange={(e) => setDetallesFiltro(e.target.value as DetallesFiltro)}
          >
            <option value="todos">Todos</option>
            <option value="con">Con detalles</option>
            <option value="sin">Sin detalles</option>
          </select>
        </label>

        <Campo
          label="Batería mínima (h)"
          type="number"
          step="0.1"
          placeholder="Ej. 3"
          value={bateriaMin}
          onChange={(e) => setBateriaMin(e.target.value)}
        />

        <label className="flex items-end gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={soloDonantes} onChange={(e) => setSoloDonantes(e.target.checked)} />
          Solo donantes
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4">
        <Tabla
          encabezados={['Alias', 'Modelo', 'Specs', 'Estado', 'Precio sugerido', 'Costo actual', 'Ganancia potencial']}
          filas={filas}
          claves={laptops.map((l) => l.id)}
          vacio={cargando ? 'Cargando…' : 'Sin laptops que coincidan con los filtros'}
        />
      </div>
    </section>
  );
}
