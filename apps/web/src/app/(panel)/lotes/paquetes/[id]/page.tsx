'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Chip } from '@/ui/Chip';
import { Dinero } from '@/ui/Dinero';
import { Modal } from '@/ui/Modal';
import { Tabla } from '@/ui/Tabla';
import {
  SECUENCIA_PAQUETE_ESTADO,
  agregarItemLaptop,
  agregarItemParte,
  agregarItemPersonal,
  avanzarEstado,
  laptopsDisponibles,
  listarItemsPaquete,
  obtenerCostosPaquete,
  obtenerPaquete,
  recibirPaquete,
  type LaptopDisponible,
  type PaqueteCostos,
  type PaqueteDetalle,
  type PaqueteEstado,
  type PaqueteItem,
} from '@/data/paquetes';

export default function PaqueteDetallePage() {
  const params = useParams<{ id: string }>();
  const paqueteId = params.id;

  const [paquete, setPaquete] = useState<PaqueteDetalle | null>(null);
  const [items, setItems] = useState<PaqueteItem[]>([]);
  const [disponibles, setDisponibles] = useState<LaptopDisponible[]>([]);
  const [costos, setCostos] = useState<PaqueteCostos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [laptopSel, setLaptopSel] = useState('');
  const [laptopVol, setLaptopVol] = useState('');
  const [laptopVal, setLaptopVal] = useState('');

  const [parteDesc, setParteDesc] = useState('');
  const [parteVol, setParteVol] = useState('');
  const [parteVal, setParteVal] = useState('');

  const [personalDesc, setPersonalDesc] = useState('');
  const [personalVol, setPersonalVol] = useState('');
  const [personalVal, setPersonalVal] = useState('');

  const [modalRecibido, setModalRecibido] = useState(false);
  const [fleteReal, setFleteReal] = useState('');
  const [seguroReal, setSeguroReal] = useState('');
  const [revisionReal, setRevisionReal] = useState('');

  async function cargar() {
    setCargando(true);
    try {
      const [paqueteData, itemsData, disponiblesData, costosData] = await Promise.all([
        obtenerPaquete(paqueteId),
        listarItemsPaquete(paqueteId),
        laptopsDisponibles(),
        obtenerCostosPaquete(paqueteId),
      ]);
      setPaquete(paqueteData);
      setItems(itemsData);
      setDisponibles(disponiblesData);
      setCostos(costosData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el paquete');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, [paqueteId]);

  async function agregarLaptop() {
    if (!laptopSel) return;
    setGuardando(true);
    try {
      await agregarItemLaptop(paqueteId, laptopSel, Number(laptopVol || 0), Number(laptopVal || 0));
      setLaptopSel('');
      setLaptopVol('');
      setLaptopVal('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al agregar la laptop');
    } finally {
      setGuardando(false);
    }
  }

  async function agregarParte() {
    if (!parteDesc) return;
    setGuardando(true);
    try {
      await agregarItemParte(paqueteId, parteDesc, Number(parteVol || 0), Number(parteVal || 0));
      setParteDesc('');
      setParteVol('');
      setParteVal('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al agregar la parte');
    } finally {
      setGuardando(false);
    }
  }

  async function agregarPersonal() {
    if (!personalDesc) return;
    setGuardando(true);
    try {
      await agregarItemPersonal(paqueteId, personalDesc, Number(personalVol || 0), Number(personalVal || 0));
      setPersonalDesc('');
      setPersonalVol('');
      setPersonalVal('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al agregar el ítem personal');
    } finally {
      setGuardando(false);
    }
  }

  async function avanzar(estado: PaqueteEstado) {
    setGuardando(true);
    setError(null);
    try {
      await avanzarEstado(paqueteId, estado);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transición rechazada');
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarRecibido() {
    setGuardando(true);
    try {
      await recibirPaquete(paqueteId, Number(fleteReal || 0), Number(seguroReal || 0), Number(revisionReal || 0));
      setModalRecibido(false);
      setFleteReal('');
      setSeguroReal('');
      setRevisionReal('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al recibir el paquete');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="text-slate-500">Cargando…</p>;
  if (!paquete) return <p className="text-red-600">Paquete no encontrado.</p>;

  const estadosSinRecibido = SECUENCIA_PAQUETE_ESTADO.filter((e) => e !== 'recibido');
  const recibido = paquete.estado === 'recibido';

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/lotes/paquetes" className="text-sm text-slate-500 underline">
          ← Paquetes
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          Paquete {paquete.courier ?? paquete.id.slice(0, 8)}{' '}
          <Chip tono={recibido ? 'verde' : 'gris'}>
            <span data-testid="paquete-estado-actual">{paquete.estado}</span>
          </Chip>
        </h1>
        {paquete.guia && <p className="text-sm text-slate-500">Guía: {paquete.guia}</p>}
      </div>

      {error && (
        <p className="text-sm text-red-600" data-testid="paquete-error">
          {error}
        </p>
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold">Sub-estados del courier</h2>
        <div className="flex flex-wrap gap-2">
          {estadosSinRecibido.map((estado) => (
            <Boton
              key={estado}
              variante={paquete.estado === estado ? 'primario' : 'secundario'}
              data-testid={`paquete-avanzar-${estado}`}
              disabled={guardando || recibido}
              onClick={() => void avanzar(estado)}
            >
              {estado}
            </Boton>
          ))}
        </div>
        {!recibido && (
          <div className="mt-3">
            <Boton data-testid="boton-recibido" disabled={guardando} onClick={() => setModalRecibido(true)}>
              Recibido
            </Boton>
          </div>
        )}
        {recibido && costos && (
          <div className="mt-3 text-sm text-slate-600">
            <p>
              Flete real: <Dinero monto={costos.flete_real} /> · Seguro real: <Dinero monto={costos.seguro_real} /> · Revisión real:{' '}
              <Dinero monto={costos.revision_real} />
            </p>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Ítems</h2>

        <div className="mb-3 flex flex-col gap-2 rounded-md border border-slate-200 p-3">
          <span className="text-sm font-medium text-slate-700">Agregar laptop (solo comprada, sin paquete)</span>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Laptop</label>
              <select
                data-testid="item-laptop-select"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                value={laptopSel}
                onChange={(e) => setLaptopSel(e.target.value)}
              >
                <option value="">—</option>
                {disponibles.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.alias ?? l.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            <Campo label="Volumen (pie³)" type="number" data-testid="item-laptop-volumen" value={laptopVol} onChange={(e) => setLaptopVol(e.target.value)} />
            <Campo label="Valor declarado" type="number" data-testid="item-laptop-valor" value={laptopVal} onChange={(e) => setLaptopVal(e.target.value)} />
            <Boton data-testid="item-laptop-agregar" disabled={guardando} onClick={() => void agregarLaptop()}>
              Agregar
            </Boton>
          </div>
        </div>

        <div className="mb-3 flex flex-col gap-2 rounded-md border border-slate-200 p-3">
          <span className="text-sm font-medium text-slate-700">Agregar parte</span>
          <div className="flex flex-wrap items-end gap-2">
            <Campo label="Descripción" data-testid="item-parte-descripcion" value={parteDesc} onChange={(e) => setParteDesc(e.target.value)} />
            <Campo label="Volumen (pie³)" type="number" data-testid="item-parte-volumen" value={parteVol} onChange={(e) => setParteVol(e.target.value)} />
            <Campo label="Valor declarado" type="number" data-testid="item-parte-valor" value={parteVal} onChange={(e) => setParteVal(e.target.value)} />
            <Boton data-testid="item-parte-agregar" disabled={guardando} onClick={() => void agregarParte()}>
              Agregar
            </Boton>
          </div>
        </div>

        <div className="mb-3 flex flex-col gap-2 rounded-md border border-slate-200 p-3">
          <span className="text-sm font-medium text-slate-700">Agregar ítem personal</span>
          <div className="flex flex-wrap items-end gap-2">
            <Campo label="Descripción" data-testid="item-personal-descripcion" value={personalDesc} onChange={(e) => setPersonalDesc(e.target.value)} />
            <Campo label="Volumen (pie³)" type="number" data-testid="item-personal-volumen" value={personalVol} onChange={(e) => setPersonalVol(e.target.value)} />
            <Campo label="Valor declarado" type="number" data-testid="item-personal-valor" value={personalVal} onChange={(e) => setPersonalVal(e.target.value)} />
            <Boton data-testid="item-personal-agregar" disabled={guardando} onClick={() => void agregarPersonal()}>
              Agregar
            </Boton>
          </div>
        </div>

        <Tabla
          encabezados={['Tipo', 'Descripción', 'Volumen', 'Valor declarado', 'Flete prorrateado', 'Seguro prorrateado', 'Revisión prorrateada']}
          claves={items.map((i) => i.id)}
          filas={items.map((i) => [
            <span key="t" data-testid={`fila-item-${i.id}`}>
              {i.tipo}
            </span>,
            i.tipo === 'laptop' && i.ref_id ? (
              <Link key="d" href={`/inventario/${i.ref_id}`} className="underline">
                {i.laptop_alias ?? i.ref_id.slice(0, 8)}
              </Link>
            ) : (
              (i.descripcion ?? '—')
            ),
            i.volumen_pie3,
            <Dinero key="v" monto={i.valor_declarado} />,
            <Dinero key="f" monto={i.flete_prorrateado} />,
            <Dinero key="s" monto={i.seguro_prorrateado} />,
            <Dinero key="r" monto={i.revision_prorrateado} />,
          ])}
        />
      </div>

      <Modal abierto={modalRecibido} titulo="Recibir paquete (factura real)" onCerrar={() => setModalRecibido(false)}>
        <div className="flex flex-col gap-3">
          <Campo label="Flete real" type="number" data-testid="recibido-flete" value={fleteReal} onChange={(e) => setFleteReal(e.target.value)} />
          <Campo label="Seguro real" type="number" data-testid="recibido-seguro" value={seguroReal} onChange={(e) => setSeguroReal(e.target.value)} />
          <Campo
            label="Revisión real (0 permitido)"
            type="number"
            data-testid="recibido-revision"
            value={revisionReal}
            onChange={(e) => setRevisionReal(e.target.value)}
          />
          <Boton data-testid="recibido-confirmar" disabled={guardando} onClick={() => void confirmarRecibido()}>
            Confirmar recepción
          </Boton>
        </div>
      </Modal>
    </section>
  );
}
