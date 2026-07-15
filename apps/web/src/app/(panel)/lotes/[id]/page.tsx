'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Chip } from '@/ui/Chip';
import { Dinero } from '@/ui/Dinero';
import { FechaCorta } from '@/ui/FechaCorta';
import { Tabla } from '@/ui/Tabla';
import {
  agregarParteEncontrada,
  congelarReparto,
  listarLaptopsDeLote,
  listarLineasLote,
  listarPartesCatalogo,
  listarPartesEncontradas,
  listarReparto,
  obtenerLote,
  registrarCostoRealLote,
  yaTieneReparto,
  type CostoLinea,
  type LaptopDeLote,
  type LoteDetalle,
  type ParteCatalogo,
  type ParteEncontrada,
  type RepartoFila,
} from '@/data/lotes';

export default function LoteDetallePage() {
  const params = useParams<{ id: string }>();
  const loteId = params.id;

  const [lote, setLote] = useState<LoteDetalle | null>(null);
  const [lineas, setLineas] = useState<CostoLinea[]>([]);
  const [laptops, setLaptops] = useState<LaptopDeLote[]>([]);
  const [catalogo, setCatalogo] = useState<ParteCatalogo[]>([]);
  const [encontradas, setEncontradas] = useState<ParteEncontrada[]>([]);
  const [reparto, setReparto] = useState<RepartoFila[]>([]);
  const [tieneReparto, setTieneReparto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [realesEnEdicion, setRealesEnEdicion] = useState<Record<string, string>>({});
  const [parteSeleccionada, setParteSeleccionada] = useState('');
  const [cantidadParte, setCantidadParte] = useState('1');
  const [valorNominalParte, setValorNominalParte] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const [loteData, lineasData, laptopsData, catalogoData, encontradasData, tiene] = await Promise.all([
        obtenerLote(loteId),
        listarLineasLote(loteId),
        listarLaptopsDeLote(loteId),
        listarPartesCatalogo(),
        listarPartesEncontradas(loteId),
        yaTieneReparto(loteId),
      ]);
      setLote(loteData);
      setLineas(lineasData);
      setLaptops(laptopsData);
      setCatalogo(catalogoData);
      setEncontradas(encontradasData);
      setTieneReparto(tiene);
      if (tiene) setReparto(await listarReparto(loteId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el lote');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, [loteId]);

  async function guardarReal(tipo: string) {
    const valor = realesEnEdicion[tipo];
    if (valor === undefined || valor === '') return;
    setGuardando(true);
    try {
      await registrarCostoRealLote(loteId, tipo, Number(valor));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar el real');
    } finally {
      setGuardando(false);
    }
  }

  async function agregarParte() {
    if (!parteSeleccionada || guardando) return; // upsert por (lote_id,parte_id) ya es idempotente (0034)
    setGuardando(true);
    try {
      const parte = catalogo.find((p) => p.id === parteSeleccionada);
      const valorNominal = valorNominalParte ? Number(valorNominalParte) : (parte?.valor_nominal ?? 0);
      await agregarParteEncontrada(loteId, parteSeleccionada, Number(cantidadParte || 1), valorNominal);
      setParteSeleccionada('');
      setCantidadParte('1');
      setValorNominalParte('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al agregar la parte encontrada');
    } finally {
      setGuardando(false);
    }
  }

  async function congelar() {
    if (
      !window.confirm(
        'El reparto quedará FIJO e inmutable: no podrá volver a congelarse. ¿Confirmas continuar?',
      )
    ) {
      return;
    }
    setGuardando(true);
    try {
      await congelarReparto(loteId);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al congelar el reparto');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="text-slate-500">Cargando…</p>;
  if (!lote) return <p className="text-red-600">Lote no encontrado.</p>;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/lotes" className="text-sm text-slate-500 underline">
          ← Lotes
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          Lote <FechaCorta fecha={lote.fecha_compra} /> — <Chip tono={lote.origen === 'local' ? 'azul' : 'gris'}>{lote.origen}</Chip>
        </h1>
        {lote.vendedor && <p className="text-sm text-slate-500">Vendedor: {lote.vendedor}</p>}
        <p className="text-sm text-slate-500">
          Proyectado congelado: <Dinero monto={lote.costo_proyectado_total} />
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <h2 className="mb-2 text-lg font-semibold">Líneas de costo</h2>
        <Tabla
          encabezados={['Tipo', 'Estimado', 'Real', 'Registrar real']}
          claves={lineas.map((l) => l.id)}
          filas={lineas.map((l) => [
            l.tipo,
            <Dinero key="e" monto={l.monto_estimado} />,
            <Dinero key="r" monto={l.monto_real} />,
            <div key="acc" className="flex items-center gap-1">
              <input
                type="number"
                data-testid={`costo-real-input-${l.tipo}`}
                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={realesEnEdicion[l.tipo] ?? ''}
                onChange={(e) => setRealesEnEdicion({ ...realesEnEdicion, [l.tipo]: e.target.value })}
              />
              <Boton
                variante="secundario"
                data-testid={`costo-real-guardar-${l.tipo}`}
                disabled={guardando}
                onClick={() => void guardarReal(l.tipo)}
              >
                Guardar
              </Boton>
            </div>,
          ])}
        />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Laptops del lote</h2>
        <Tabla
          encabezados={['Alias', 'Estado', 'CPU', 'RAM', 'SSD']}
          claves={laptops.map((l) => l.id)}
          filas={laptops.map((l) => [
            <Link key="a" href={`/inventario/${l.id}`} data-testid={`laptop-link-${l.id}`} className="underline">
              {l.alias ?? l.id.slice(0, 8)}
            </Link>,
            <Chip key="e">{l.estado}</Chip>,
            l.cpu_tipo ? `${l.cpu_tipo} gen ${l.cpu_gen ?? '?'}` : '—',
            l.ram_gb ?? '—',
            l.ssd_gb ?? '—',
          ])}
        />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Revisión física del lote</h2>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Parte</label>
            <select
              data-testid="parte-select"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={parteSeleccionada}
              onChange={(e) => setParteSeleccionada(e.target.value)}
            >
              <option value="">—</option>
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
            data-testid="parte-cantidad"
            value={cantidadParte}
            onChange={(e) => setCantidadParte(e.target.value)}
          />
          <Campo
            label="Valor nominal (opcional)"
            type="number"
            data-testid="parte-valor-nominal"
            value={valorNominalParte}
            onChange={(e) => setValorNominalParte(e.target.value)}
          />
          <Boton data-testid="parte-agregar" disabled={guardando} onClick={() => void agregarParte()}>
            Agregar encontrada
          </Boton>
        </div>
        <Tabla
          encabezados={['Parte', 'Cantidad', 'Valor nominal', 'En stock']}
          claves={encontradas.map((e) => e.id)}
          filas={encontradas.map((e) => [e.parte_nombre, e.cantidad, <Dinero key="v" monto={e.valor_nominal_aplicado} />, e.en_stock ? 'sí' : 'no'])}
        />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Reparto</h2>
        {tieneReparto ? (
          <>
            <p className="mb-2 text-sm text-slate-500">Reparto congelado — fijo e inmutable.</p>
            <Tabla
              encabezados={['Laptop', 'Valor esperado', 'Proporción', 'Costo asignado']}
              claves={reparto.map((r) => r.laptop_id)}
              filas={reparto.map((r) => [
                <span key="l" data-testid={`fila-reparto-${r.laptop_id}`}>
                  {r.alias ?? r.laptop_id.slice(0, 8)}
                </span>,
                <Dinero key="v" monto={r.valor_esperado_al_comprar} />,
                `${(r.proporcion * 100).toFixed(1)}%`,
                <Dinero key="c" monto={r.costo_asignado} />,
              ])}
            />
          </>
        ) : (
          <Boton data-testid="boton-congelar-reparto" disabled={guardando} onClick={() => void congelar()}>
            Congelar reparto
          </Boton>
        )}
      </div>
    </section>
  );
}
