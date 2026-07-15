'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Chip } from '@/ui/Chip';
import { FechaCorta } from '@/ui/FechaCorta';
import { Modal } from '@/ui/Modal';
import { Tabla } from '@/ui/Tabla';
import { crearPaquete, listarPaquetes, type PaqueteMetodo, type PaqueteResumen } from '@/data/paquetes';

export default function PaquetesPage() {
  const [paquetes, setPaquetes] = useState<PaqueteResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const reqKeyPaquete = useRef<string | null>(null);

  const [courier, setCourier] = useState('');
  const [guia, setGuia] = useState('');
  const [metodo, setMetodo] = useState<PaqueteMetodo>('barco');
  const [volumen, setVolumen] = useState('');
  const [peso, setPeso] = useState('');
  const [fleteEst, setFleteEst] = useState('');
  const [seguroEst, setSeguroEst] = useState('');
  const [revisionEst, setRevisionEst] = useState('');

  async function cargar() {
    setCargando(true);
    try {
      setPaquetes(await listarPaquetes());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar paquetes');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function guardar() {
    if (guardando) return;
    if (!reqKeyPaquete.current) reqKeyPaquete.current = crypto.randomUUID();
    setGuardando(true);
    try {
      await crearPaquete({
        courier: courier || undefined,
        guia: guia || undefined,
        metodo,
        volumen_estimado_pie3: volumen ? Number(volumen) : undefined,
        peso_estimado_kg: peso ? Number(peso) : undefined,
        flete_estimado: fleteEst ? Number(fleteEst) : undefined,
        seguro_estimado: seguroEst ? Number(seguroEst) : undefined,
        revision_estimada: revisionEst ? Number(revisionEst) : undefined,
        idempotencyKey: reqKeyPaquete.current,
      });
      reqKeyPaquete.current = null;
      setModalAbierto(false);
      setCourier('');
      setGuia('');
      setMetodo('barco');
      setVolumen('');
      setPeso('');
      setFleteEst('');
      setSeguroEst('');
      setRevisionEst('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el paquete');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Paquetes</h1>
        <Link href="/lotes" className="text-sm font-medium text-slate-600 underline">
          ← Lotes
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Boton data-testid="boton-nuevo-paquete" onClick={() => setModalAbierto(true)}>
        + Nuevo paquete
      </Boton>

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <Tabla
          encabezados={['Courier', 'Guía', 'Método', 'Estado', 'Recibido']}
          paginado
          claves={paquetes.map((p) => p.id)}
          filas={paquetes.map((p) => [
            <Link key="c" href={`/lotes/paquetes/${p.id}`} data-testid={`paquete-link-${p.id}`} className="underline">
              {p.courier ?? p.id.slice(0, 8)}
            </Link>,
            p.guia ?? '—',
            p.metodo,
            <Chip key="e" tono={p.estado === 'recibido' ? 'verde' : 'gris'}>
              {p.estado}
            </Chip>,
            <FechaCorta key="f" fecha={p.fecha_recibido} />,
          ])}
        />
      )}

      <Modal abierto={modalAbierto} titulo="Nuevo paquete" onCerrar={() => setModalAbierto(false)}>
        <div className="flex flex-col gap-3">
          <Campo label="Courier" data-testid="paquete-courier" value={courier} onChange={(e) => setCourier(e.target.value)} />
          <Campo label="Guía" data-testid="paquete-guia" value={guia} onChange={(e) => setGuia(e.target.value)} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Método</label>
            <select
              data-testid="paquete-metodo"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as PaqueteMetodo)}
            >
              <option value="barco">barco</option>
              <option value="avion_zoom">avion_zoom</option>
            </select>
          </div>
          <Campo
            label="Volumen estimado (pie³)"
            type="number"
            data-testid="paquete-volumen"
            value={volumen}
            onChange={(e) => setVolumen(e.target.value)}
          />
          <Campo label="Peso estimado (kg)" type="number" data-testid="paquete-peso" value={peso} onChange={(e) => setPeso(e.target.value)} />
          <Campo
            label="Flete estimado"
            type="number"
            data-testid="paquete-flete-estimado"
            value={fleteEst}
            onChange={(e) => setFleteEst(e.target.value)}
          />
          <Campo
            label="Seguro estimado"
            type="number"
            data-testid="paquete-seguro-estimado"
            value={seguroEst}
            onChange={(e) => setSeguroEst(e.target.value)}
          />
          <Campo
            label="Revisión estimada"
            type="number"
            data-testid="paquete-revision-estimada"
            value={revisionEst}
            onChange={(e) => setRevisionEst(e.target.value)}
          />
          <Boton data-testid="paquete-guardar" disabled={guardando} onClick={() => void guardar()}>
            Guardar
          </Boton>
        </div>
      </Modal>
    </section>
  );
}
