'use client';

import { useEffect, useMemo, useState } from 'react';
import { Boton } from '@/ui/Boton';
import {
  CATEGORIAS_DETALLE,
  actualizarDetalle,
  crearDetalle,
  eliminarDetalle,
  listarDetalles,
  type CategoriaDetalle,
  type DetalleCatalogo,
} from '@/data/configuracion';
import { CeldaNumero } from './_CeldaNumero';
import { CeldaTexto } from './_CeldaTexto';

const NOMBRES_CATEGORIA: Record<CategoriaDetalle, string> = {
  specs: 'Specs',
  carcasa: 'Carcasa',
  pantalla: 'Pantalla',
  puertos: 'Puertos',
  bateria: 'Batería',
  teclado: 'Teclado',
  touchpad: 'Touchpad',
  audio: 'Audio',
  otro: 'Otro',
};

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function SeccionDetalles() {
  const [detalles, setDetalles] = useState<DetalleCatalogo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: '', categoria: 'specs' as CategoriaDetalle, deduccion: '' });
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  const cargar = () => {
    listarDetalles()
      .then(setDetalles)
      .catch((e: Error) => setError(e.message));
  };
  useEffect(cargar, []);

  const porCategoria = useMemo(() => {
    const mapa = new Map<CategoriaDetalle, DetalleCatalogo[]>();
    for (const c of CATEGORIAS_DETALLE) mapa.set(c, []);
    for (const d of detalles ?? []) mapa.get(d.categoria)?.push(d);
    return mapa;
  }, [detalles]);

  const agregar = async () => {
    setErrorAlta(null);
    const deduccion = Number(nuevo.deduccion);
    if (!nuevo.nombre.trim() || Number.isNaN(deduccion)) {
      setErrorAlta('Nombre y deducción son obligatorios.');
      return;
    }
    try {
      const creado = await crearDetalle({
        nombre: nuevo.nombre.trim(),
        categoria: nuevo.categoria,
        deduccionBase: deduccion,
      });
      setDetalles((prev) => [...(prev ?? []), creado]);
      setNuevo((n) => ({ ...n, nombre: '', deduccion: '' }));
    } catch (e) {
      setErrorAlta((e as Error).message);
    }
  };

  const borrar = async (d: DetalleCatalogo) => {
    if (!window.confirm(`¿Borrar el detalle "${d.nombre}"?`)) return;
    await eliminarDetalle(d.id);
    setDetalles((prev) => prev?.filter((x) => x.id !== d.id) ?? prev);
  };

  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!detalles) return <p className="text-slate-400">Cargando…</p>;

  return (
    <section id="detalles" className="scroll-mt-20">
      <h2 className="text-lg font-bold">Detalles / catálogo</h2>
      <p className="mb-2 text-sm text-slate-500">Deducciones por detalle, agrupadas por categoría.</p>

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="detalle-nuevo-nombre">
            Nombre
          </label>
          <input
            id="detalle-nuevo-nombre"
            data-testid="detalle-nuevo-nombre"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={nuevo.nombre}
            onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="detalle-nuevo-categoria">
            Categoría
          </label>
          <select
            id="detalle-nuevo-categoria"
            data-testid="detalle-nuevo-categoria"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={nuevo.categoria}
            onChange={(e) => setNuevo((n) => ({ ...n, categoria: e.target.value as CategoriaDetalle }))}
          >
            {CATEGORIAS_DETALLE.map((c) => (
              <option key={c} value={c}>
                {NOMBRES_CATEGORIA[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="detalle-nuevo-deduccion">
            Deducción $
          </label>
          <input
            id="detalle-nuevo-deduccion"
            data-testid="detalle-nuevo-deduccion"
            type="number"
            step="0.01"
            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={nuevo.deduccion}
            onChange={(e) => setNuevo((n) => ({ ...n, deduccion: e.target.value }))}
          />
        </div>
        <Boton data-testid="detalle-nuevo-guardar" onClick={() => void agregar()}>
          + Agregar detalle
        </Boton>
        {errorAlta && <span className="text-sm text-red-600">{errorAlta}</span>}
      </div>

      {CATEGORIAS_DETALLE.map((c) => {
        const filas = porCategoria.get(c) ?? [];
        if (filas.length === 0) return null;
        return (
          <div key={c} className="mb-4" data-testid={`detalle-grupo-${c}`}>
            <h3 className="mb-1 text-sm font-semibold text-slate-600">{NOMBRES_CATEGORIA[c]}</h3>
            <table className="w-full text-sm">
              <tbody>
                {filas.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100" data-testid={`detalle-fila-${slug(d.nombre)}`}>
                    <td className="w-1/2 px-2 py-1">
                      <CeldaTexto
                        valor={d.nombre}
                        permiteNull={false}
                        testId={`detalle-nombre-${slug(d.nombre)}`}
                        onGuardar={async (v) => {
                          const nombre = v ?? d.nombre;
                          await actualizarDetalle(d.id, { nombre });
                          setDetalles((prev) => prev?.map((x) => (x.id === d.id ? { ...x, nombre } : x)) ?? prev);
                        }}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CeldaNumero
                        valor={d.deduccionBase}
                        permiteNull={false}
                        testId={`detalle-deduccion-${slug(d.nombre)}`}
                        onGuardar={async (v) => {
                          const deduccionBase = v ?? 0;
                          await actualizarDetalle(d.id, { deduccionBase });
                          setDetalles((prev) => prev?.map((x) => (x.id === d.id ? { ...x, deduccionBase } : x)) ?? prev);
                        }}
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        data-testid={`detalle-borrar-${slug(d.nombre)}`}
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => void borrar(d)}
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}
