'use client';

import { useEffect, useMemo, useState } from 'react';
import { Boton } from '@/ui/Boton';
import {
  CPU_TIPOS,
  actualizarPrecioIdeal,
  crearPrecioIdeal,
  detectarSolapes,
  eliminarPrecioIdeal,
  listarPreciosIdeales,
  type CpuTipo,
  type PrecioIdeal,
} from '@/data/configuracion';
import { CeldaNumero } from './_CeldaNumero';

export function SeccionPreciosIdeales() {
  const [precios, setPrecios] = useState<PrecioIdeal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ cpuTipo: 'i5' as CpuTipo, genDesde: '', genHasta: '', precioBase: '' });
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  const cargar = () => {
    listarPreciosIdeales()
      .then(setPrecios)
      .catch((e: Error) => setError(e.message));
  };
  useEffect(cargar, []);

  const solapados = useMemo(() => detectarSolapes(precios ?? []), [precios]);

  const agregar = async () => {
    setErrorAlta(null);
    const genDesde = Number(nuevo.genDesde);
    const genHasta = Number(nuevo.genHasta);
    const precioBase = Number(nuevo.precioBase);
    if ([genDesde, genHasta, precioBase].some((n) => Number.isNaN(n))) {
      setErrorAlta('Completa generación desde/hasta y precio base.');
      return;
    }
    if (genDesde > genHasta) {
      setErrorAlta('gen_desde debe ser ≤ gen_hasta.');
      return;
    }
    try {
      const creado = await crearPrecioIdeal({ cpuTipo: nuevo.cpuTipo, genDesde, genHasta, precioBase });
      setPrecios((prev) => [...(prev ?? []), creado]);
      setNuevo((n) => ({ ...n, genDesde: '', genHasta: '', precioBase: '' }));
    } catch (e) {
      setErrorAlta((e as Error).message);
    }
  };

  const borrar = async (p: PrecioIdeal) => {
    if (!window.confirm(`¿Borrar el precio ideal ${p.cpuTipo} ${p.genDesde}-${p.genHasta}?`)) return;
    await eliminarPrecioIdeal(p.id);
    setPrecios((prev) => prev?.filter((x) => x.id !== p.id) ?? prev);
  };

  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!precios) return <p className="text-slate-400">Cargando…</p>;

  return (
    <section id="precios-ideales" className="scroll-mt-20">
      <h2 className="text-lg font-bold">Precios ideales</h2>
      <p className="mb-2 text-sm text-slate-500">
        Precio base por tipo de CPU y rango de generación (config 8GB / 256GB / 14&quot;). Los rangos que
        se solapan dentro del mismo tipo de CPU se marcan en amarillo (advertencia, no bloqueo).
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="precio-nuevo-cpu">
            CPU
          </label>
          <select
            id="precio-nuevo-cpu"
            data-testid="precio-nuevo-cpu"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={nuevo.cpuTipo}
            onChange={(e) => setNuevo((n) => ({ ...n, cpuTipo: e.target.value as CpuTipo }))}
          >
            {CPU_TIPOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="precio-nuevo-desde">
            Gen. desde
          </label>
          <input
            id="precio-nuevo-desde"
            data-testid="precio-nuevo-desde"
            type="number"
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={nuevo.genDesde}
            onChange={(e) => setNuevo((n) => ({ ...n, genDesde: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="precio-nuevo-hasta">
            Gen. hasta
          </label>
          <input
            id="precio-nuevo-hasta"
            data-testid="precio-nuevo-hasta"
            type="number"
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={nuevo.genHasta}
            onChange={(e) => setNuevo((n) => ({ ...n, genHasta: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="precio-nuevo-base">
            Precio base $
          </label>
          <input
            id="precio-nuevo-base"
            data-testid="precio-nuevo-base"
            type="number"
            step="0.01"
            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={nuevo.precioBase}
            onChange={(e) => setNuevo((n) => ({ ...n, precioBase: e.target.value }))}
          />
        </div>
        <Boton data-testid="precio-nuevo-guardar" onClick={() => void agregar()}>
          + Agregar rango
        </Boton>
        {errorAlta && <span className="text-sm text-red-600">{errorAlta}</span>}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className="px-3 py-2 font-semibold text-slate-600">CPU</th>
            <th className="px-3 py-2 font-semibold text-slate-600">Gen. desde</th>
            <th className="px-3 py-2 font-semibold text-slate-600">Gen. hasta</th>
            <th className="px-3 py-2 font-semibold text-slate-600">Precio base</th>
            <th className="px-3 py-2 font-semibold text-slate-600" />
          </tr>
        </thead>
        <tbody>
          {precios.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                Sin registros
              </td>
            </tr>
          )}
          {precios.map((p) => (
            <tr
              key={p.id}
              data-testid={`precio-fila-${p.cpuTipo}-${p.genDesde}-${p.genHasta}`}
              className={`border-b border-slate-100 ${solapados.has(p.id) ? 'bg-yellow-50' : ''}`}
            >
              <td className="px-3 py-2">{p.cpuTipo}</td>
              <td className="px-3 py-2">{p.genDesde}</td>
              <td className="px-3 py-2">{p.genHasta}</td>
              <td className="px-3 py-2">
                <CeldaNumero
                  valor={p.precioBase}
                  permiteNull={false}
                  testId={`precio-base-${p.id}`}
                  onGuardar={async (v) => {
                    const precioBase = v ?? 0;
                    await actualizarPrecioIdeal(p.id, { precioBase });
                    setPrecios((prev) => prev?.map((x) => (x.id === p.id ? { ...x, precioBase } : x)) ?? prev);
                  }}
                />
              </td>
              <td className="px-3 py-2 text-right">
                {solapados.has(p.id) && (
                  <span data-testid="precio-advertencia" className="mr-2 text-xs font-medium text-yellow-700">
                    ⚠ se solapa
                  </span>
                )}
                <button
                  type="button"
                  data-testid={`precio-borrar-${p.id}`}
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => void borrar(p)}
                >
                  Borrar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
