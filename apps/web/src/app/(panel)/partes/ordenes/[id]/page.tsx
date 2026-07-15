'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Chip } from '@/ui/Chip';
import { Dinero } from '@/ui/Dinero';
import { FechaCorta } from '@/ui/FechaCorta';
import { Tabla } from '@/ui/Tabla';
import {
  agregarItemOrden,
  fijarProrrateoManual,
  listarCatalogo,
  listarItemsOrden,
  obtenerOrden,
  prorratearOrden,
  recibirOrden,
  type OrdenPartes,
  type OrdenPartesItem,
  type ParteCatalogo,
} from '@/data/partes';

export default function OrdenDetallePage() {
  const params = useParams<{ id: string }>();
  const ordenId = params.id;

  const [orden, setOrden] = useState<OrdenPartes | null>(null);
  const [items, setItems] = useState<OrdenPartesItem[]>([]);
  const [catalogo, setCatalogo] = useState<ParteCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nuevoParteId, setNuevoParteId] = useState('');
  const [nuevaCantidad, setNuevaCantidad] = useState('1');
  const [nuevoPrecio, setNuevoPrecio] = useState('');

  const [manuales, setManuales] = useState<Record<string, string>>({});
  const [recibiendo, setRecibiendo] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const [o, its, cat] = await Promise.all([obtenerOrden(ordenId), listarItemsOrden(ordenId), listarCatalogo()]);
      setOrden(o);
      setItems(its);
      setCatalogo(cat);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar la orden');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, [ordenId]);

  async function agregarItem() {
    setError(null);
    try {
      await agregarItemOrden(ordenId, nuevoParteId, Number(nuevaCantidad), Number(nuevoPrecio));
      setNuevoParteId('');
      setNuevaCantidad('1');
      setNuevoPrecio('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al agregar el ítem');
    }
  }

  async function prorratear() {
    setError(null);
    try {
      await prorratearOrden(ordenId);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al prorratear');
    }
  }

  async function fijarManual(itemId: string) {
    setError(null);
    const valor = manuales[itemId];
    if (valor === undefined || valor === '') return;
    try {
      await fijarProrrateoManual(ordenId, itemId, Number(valor));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al fijar el prorrateo manual');
    }
  }

  async function recibir() {
    if (recibiendo) return; // guard de reentrada; el RPC además es idempotente por ítem (0032)
    setError(null);
    setRecibiendo(true);
    try {
      await recibirOrden(ordenId);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al recibir la orden');
    } finally {
      setRecibiendo(false);
    }
  }

  if (cargando) return <p className="text-slate-500">Cargando…</p>;
  if (!orden) return <p className="text-red-600">Orden no encontrada.</p>;

  return (
    <section>
      <h1 className="text-2xl font-bold">Orden de partes</h1>
      <p className="mt-1 text-slate-600">
        <FechaCorta fecha={orden.fecha} /> · {orden.origen ?? '—'} · {orden.fuente ?? '—'} · Envío{' '}
        <Dinero monto={orden.envioUsa} /> · Fees <Dinero monto={orden.fees} />
      </p>
      <p className="mt-1">
        <Chip tono={orden.recibida ? 'verde' : 'amarillo'}>{orden.recibida ? 'Recibida' : 'Pendiente'}</Chip>
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Boton onClick={prorratear} disabled={orden.recibida}>
          Prorratear
        </Boton>
        <Boton onClick={recibir} disabled={orden.recibida || items.length === 0 || recibiendo}>
          Recibir
        </Boton>
      </div>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Ítems</h2>
      <Tabla
        encabezados={['Parte', 'Cantidad', 'Precio unitario', 'Prorrateo', 'Manual', 'Recibido', 'Fijar manual']}
        claves={items.map((it) => it.id)}
        filas={items.map((it) => [
          it.parteNombre,
          it.cantidad,
          <Dinero key="precio" monto={it.precioUnitario} />,
          <Dinero key="prorrateo" monto={it.prorrateo} />,
          it.prorrateoManual ? 'Sí' : 'No',
          it.recibido ? 'Sí' : 'No',
          <div key="manual" className="flex items-end gap-2">
            <Campo
              label={`Prorrateo manual — ${it.parteNombre}`}
              type="number"
              step="0.01"
              className="w-24"
              value={manuales[it.id] ?? ''}
              onChange={(e) => setManuales({ ...manuales, [it.id]: e.target.value })}
              disabled={orden.recibida}
            />
            <Boton variante="secundario" onClick={() => fijarManual(it.id)} disabled={orden.recibida}>
              Fijar
            </Boton>
          </div>,
        ])}
      />

      {!orden.recibida && (
        <>
          <h2 className="mt-6 mb-2 text-lg font-semibold">Agregar ítem</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="parte-nuevo-item" className="text-sm font-medium text-slate-700">
                Parte a agregar
              </label>
              <select
                id="parte-nuevo-item"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                value={nuevoParteId}
                onChange={(e) => setNuevoParteId(e.target.value)}
              >
                <option value="">Selecciona…</option>
                {catalogo.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <Campo
              label="Cantidad"
              type="number"
              className="w-24"
              value={nuevaCantidad}
              onChange={(e) => setNuevaCantidad(e.target.value)}
            />
            <Campo
              label="Precio unitario"
              type="number"
              step="0.01"
              className="w-28"
              value={nuevoPrecio}
              onChange={(e) => setNuevoPrecio(e.target.value)}
            />
            <Boton onClick={agregarItem} disabled={!nuevoParteId || !nuevaCantidad || !nuevoPrecio}>
              Agregar ítem
            </Boton>
          </div>
        </>
      )}
    </section>
  );
}
