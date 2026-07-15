'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Chip } from '@/ui/Chip';
import { Dinero } from '@/ui/Dinero';
import { FechaCorta } from '@/ui/FechaCorta';
import { Modal } from '@/ui/Modal';
import { Tabla } from '@/ui/Tabla';
import { crearOrden, listarOrdenes, type OrdenPartes } from '@/data/partes';

const HOY = () => new Date().toISOString().slice(0, 10);

export function OrdenesTab() {
  const [ordenes, setOrdenes] = useState<OrdenPartes[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  const [fecha, setFecha] = useState(HOY());
  const [origen, setOrigen] = useState('');
  const [fuente, setFuente] = useState('');
  const [envioUsa, setEnvioUsa] = useState('0');
  const [fees, setFees] = useState('0');
  const [notas, setNotas] = useState('');

  async function cargar() {
    setCargando(true);
    try {
      setOrdenes(await listarOrdenes());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar las órdenes');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrirAlta() {
    setFecha(HOY());
    setOrigen('');
    setFuente('');
    setEnvioUsa('0');
    setFees('0');
    setNotas('');
    setModalAbierto(true);
  }

  async function guardar() {
    setError(null);
    try {
      await crearOrden({
        fecha,
        origen,
        fuente: fuente || null,
        envioUsa: Number(envioUsa || '0'),
        fees: Number(fees || '0'),
        notas: notas || null,
      });
      setModalAbierto(false);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la orden');
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Órdenes de partes</h2>
        <Boton onClick={abrirAlta}>+ Nueva orden</Boton>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <Tabla
          encabezados={['Fecha', 'Origen', 'Fuente', 'Envío USA', 'Fees', 'Ítems', 'Estado', '']}
          paginado
          claves={ordenes.map((o) => o.id)}
          filas={ordenes.map((o) => [
            <FechaCorta key="fecha" fecha={o.fecha} />,
            o.origen ?? '—',
            o.fuente ?? '—',
            <Dinero key="envio" monto={o.envioUsa} />,
            <Dinero key="fees" monto={o.fees} />,
            o.totalItems,
            <Chip key="estado" tono={o.recibida ? 'verde' : 'amarillo'}>{o.recibida ? 'Recibida' : 'Pendiente'}</Chip>,
            <Link key="ver" className="text-blue-700 underline" href={`/partes/ordenes/${o.id}`}>
              Ver detalle
            </Link>,
          ])}
        />
      )}

      <Modal abierto={modalAbierto} titulo="Nueva orden de partes" onCerrar={() => setModalAbierto(false)}>
        <div className="flex flex-col gap-3">
          <Campo label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <Campo label="Origen" value={origen} onChange={(e) => setOrigen(e.target.value)} />
          <Campo label="Fuente" value={fuente} onChange={(e) => setFuente(e.target.value)} />
          <Campo label="Envío USA" type="number" step="0.01" value={envioUsa} onChange={(e) => setEnvioUsa(e.target.value)} />
          <Campo label="Fees" type="number" step="0.01" value={fees} onChange={(e) => setFees(e.target.value)} />
          <Campo label="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
          <Boton onClick={guardar} disabled={!origen}>
            Crear orden
          </Boton>
        </div>
      </Modal>
    </div>
  );
}
