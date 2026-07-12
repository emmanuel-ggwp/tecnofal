'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Chip, type TonoChip } from '@/ui/Chip';
import { Modal } from '@/ui/Modal';
import { Dinero } from '@/ui/Dinero';
import { FechaCorta } from '@/ui/FechaCorta';
import { Tabla } from '@/ui/Tabla';
import {
  ESTADO_ETIQUETAS,
  ESTADO_TONOS,
  TIPO_COSTO_ETIQUETAS,
  TRANSICIONES_VALIDAS,
  actualizarServiceTag,
  actualizarSpecs,
  agregarDetalle,
  eliminarFoto,
  guardarCondicion,
  listarCatalogoDetalles,
  obtenerFicha,
  quitarDetalle,
  registrarMontoReal,
  subirFoto,
  transicionarEstado,
  urlFoto,
  type CondicionEstado,
  type CondicionLaptop,
  type DetalleCatalogo,
  type LaptopEstado,
  type LaptopFicha,
  type PantallaCondicion,
} from '@/data/inventario';

const OPCIONES_COND: CondicionEstado[] = ['ok', 'detalle', 'malo'];
const OPCIONES_PANTALLA: PantallaCondicion[] = ['ok', 'manchas', 'lineas', 'rota'];
const CAMPOS_COND = ['teclado', 'touchpad', 'bisagras', 'carcasa', 'audio'] as const;
const PUERTOS: { clave: string; etiqueta: string }[] = [
  { clave: 'usb_izq', etiqueta: 'USB izquierdo' },
  { clave: 'usb_der', etiqueta: 'USB derecho' },
  { clave: 'hdmi', etiqueta: 'HDMI' },
  { clave: 'lan', etiqueta: 'LAN' },
  { clave: 'audio', etiqueta: 'Audio (jack)' },
  { clave: 'dc_in', etiqueta: 'DC-IN (carga)' },
];

const CONDICION_VACIA: CondicionLaptop = {
  bateriaHoras: null,
  pantalla: 'ok',
  puertosMalos: {},
  teclado: 'ok',
  touchpad: 'ok',
  bisagras: 'ok',
  carcasa: 'ok',
  audio: 'ok',
  notas: null,
};

function colorDesviacion(d: number | null): TonoChip {
  if (d == null) return 'gris';
  return d <= 0 ? 'verde' : 'rojo';
}

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function FichaLaptopPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [ficha, setFicha] = useState<LaptopFicha | null>(null);
  const [catalogoDetalles, setCatalogoDetalles] = useState<DetalleCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const [ramInput, setRamInput] = useState('');
  const [ssdInput, setSsdInput] = useState('');
  const [serviceTagInput, setServiceTagInput] = useState('');
  const [condicionForm, setCondicionForm] = useState<CondicionLaptop>(CONDICION_VACIA);

  const [detalleSel, setDetalleSel] = useState('');
  const [deduccionInput, setDeduccionInput] = useState('');
  const [notasDetalle, setNotasDetalle] = useState('');

  const [realInputs, setRealInputs] = useState<Record<string, { monto: string; fecha: string }>>({});
  const [transicionPendiente, setTransicionPendiente] = useState<LaptopEstado | null>(null);

  const cargar = useCallback(() => {
    if (!id) return;
    setCargando(true);
    setError(null);
    obtenerFicha(id)
      .then((f) => {
        setFicha(f);
        if (f) {
          setRamInput(f.ramGb != null ? String(f.ramGb) : '');
          setSsdInput(f.ssdGb != null ? String(f.ssdGb) : '');
          setServiceTagInput(f.serviceTag ?? '');
          setCondicionForm(f.condicion ?? CONDICION_VACIA);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar la ficha'))
      .finally(() => setCargando(false));
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    listarCatalogoDetalles()
      .then(setCatalogoDetalles)
      .catch(() => setCatalogoDetalles([]));
  }, []);

  async function ejecutar(accion: () => Promise<void>) {
    setProcesando(true);
    setError(null);
    try {
      await accion();
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error');
    } finally {
      setProcesando(false);
    }
  }

  if (cargando && !ficha) {
    return (
      <section>
        <p className="text-slate-500">Cargando…</p>
      </section>
    );
  }

  if (!ficha) {
    return (
      <section>
        <Link href="/inventario" className="text-sm text-slate-500 hover:underline">
          ← Volver a inventario
        </Link>
        <p className="mt-4 text-red-600">{error ?? 'Laptop no encontrada'}</p>
      </section>
    );
  }

  const transicionesDisponibles = TRANSICIONES_VALIDAS[ficha.estado] ?? [];
  const lineasPorTipo = new Map<string, LaptopFicha['lineasCosto']>();
  for (const l of ficha.lineasCosto) {
    const arr = lineasPorTipo.get(l.tipo) ?? [];
    arr.push(l);
    lineasPorTipo.set(l.tipo, arr);
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/inventario" className="text-sm text-slate-500 hover:underline">
          ← Volver a inventario
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              {ficha.alias} <span className="font-normal text-slate-500">— {ficha.modeloNombre}</span>
            </h1>
            <div className="mt-1 flex items-center gap-2" data-testid="estado-chip">
              <Chip tono={ESTADO_TONOS[ficha.estado]}>{ficha.estadoMostrado}</Chip>
              {ficha.esDonante && <Chip tono="gris">Donante</Chip>}
              {ficha.loteId && (
                <Link
                  href={`/lotes/${ficha.loteId}`}
                  className="text-sm text-slate-500 hover:underline"
                  data-testid="link-lote-origen"
                >
                  Ver lote de origen →
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {transicionesDisponibles.map((destino) => (
              <Boton
                key={destino}
                variante={destino === 'para_repuestos' ? 'peligro' : 'secundario'}
                disabled={procesando}
                onClick={() => setTransicionPendiente(destino)}
              >
                → {ESTADO_ETIQUETAS[destino]}
              </Boton>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {ficha.estado === 'falta_partes' && ficha.sugerenciaPartesCompletas && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Partes completas — confirmar el paso a <strong>{ESTADO_ETIQUETAS.lista_para_venta}</strong> si ya está lista
          para la venta.
        </div>
      )}

      <Modal
        abierto={transicionPendiente != null}
        titulo="Confirmar transición de estado"
        onCerrar={() => setTransicionPendiente(null)}
      >
        {transicionPendiente && (
          <div className="flex flex-col gap-4">
            <p>
              ¿Confirmas el cambio de estado de <strong>{ESTADO_ETIQUETAS[ficha.estado]}</strong> a{' '}
              <strong>{ESTADO_ETIQUETAS[transicionPendiente]}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setTransicionPendiente(null)}>
                Cancelar
              </Boton>
              <Boton
                variante="primario"
                disabled={procesando}
                onClick={() => {
                  const destino = transicionPendiente;
                  ejecutar(async () => {
                    await transicionarEstado(ficha.id, ficha.estado, destino);
                    setTransicionPendiente(null);
                  });
                }}
              >
                Confirmar
              </Boton>
            </div>
          </div>
        )}
      </Modal>

      {/* Especificaciones */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Especificaciones</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">CPU</dt>
            <dd>
              {ficha.cpuTipo?.toUpperCase() ?? '—'} {ficha.cpuGen ? `gen ${ficha.cpuGen}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Pantalla</dt>
            <dd>
              {ficha.pantallaPulgadas != null ? `${ficha.pantallaPulgadas}"` : '—'}
              {ficha.pantallaTactil ? ' (táctil)' : ''}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Disco</dt>
            <dd>{ficha.tieneHdd ? 'SSD + HDD' : 'Solo SSD'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Service tag</dt>
            <dd>{ficha.serviceTag ?? '—'}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Campo label="RAM (GB)" type="number" value={ramInput} onChange={(e) => setRamInput(e.target.value)} />
          <Campo label="SSD (GB)" type="number" value={ssdInput} onChange={(e) => setSsdInput(e.target.value)} />
          <Boton
            disabled={procesando}
            onClick={() =>
              ejecutar(async () => {
                await actualizarSpecs(ficha.id, {
                  ramGb: ramInput ? Number(ramInput) : undefined,
                  ssdGb: ssdInput ? Number(ssdInput) : undefined,
                });
              })
            }
          >
            Guardar specs
          </Boton>
        </div>
        {/* Laptops creadas por Calculadora → "Convertir en lote" nacen sin service_tag (y por
            tanto sin alias, columna generada) — este campo es el único lugar de la app para
            fijarlo/corregirlo después (ver Hallazgos plan-10b/plan-10c). */}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Campo
            label="Service tag"
            value={serviceTagInput}
            onChange={(e) => setServiceTagInput(e.target.value)}
          />
          <Boton
            disabled={procesando}
            onClick={() =>
              ejecutar(async () => {
                await actualizarServiceTag(ficha.id, serviceTagInput);
              })
            }
          >
            Guardar service tag
          </Boton>
        </div>
      </div>

      {/* Precio sugerido */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Precio sugerido</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Base</dt>
            <dd>
              <Dinero monto={ficha.precioBase} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Ajustes (specs/pantalla)</dt>
            <dd>
              <Dinero
                monto={
                  ficha.precioBase != null && ficha.precioSugerido != null
                    ? ficha.precioSugerido - ficha.precioBase + ficha.deduccionesTotal
                    : null
                }
              />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Deducciones (detalles)</dt>
            <dd className="text-red-600">
              − <Dinero monto={ficha.deduccionesTotal} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Sugerido</dt>
            <dd className="text-lg font-bold" data-testid="precio-sugerido">
              <Dinero monto={ficha.precioSugerido} />
            </dd>
          </div>
        </dl>
      </div>

      {/* Costos */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Costos</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Costo directo</dt>
            <dd>
              <Dinero monto={ficha.costos?.costoDirecto ?? null} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Costo proyectado</dt>
            <dd>
              <Dinero monto={ficha.costos?.costoProyectado ?? null} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Costo actual</dt>
            <dd className="font-semibold">
              <Dinero monto={ficha.costos?.costoFinal ?? null} />
            </dd>
          </div>
        </dl>

        <h3 className="mb-2 mt-4 font-medium">Timeline estimado vs. real</h3>
        <div className="flex flex-col gap-4">
          {ficha.desviaciones.map((d) => (
            <div key={d.tipo} className="border-b border-slate-100 pb-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-medium">{TIPO_COSTO_ETIQUETAS[d.tipo]}</h4>
                <div className="flex items-center gap-3 text-sm">
                  <span>
                    Estimado: <Dinero monto={d.estimado} />
                  </span>
                  <span>
                    Real: <Dinero monto={d.real} />
                  </span>
                  <Chip tono={colorDesviacion(d.desviacion)}>
                    Desviación: {d.desviacion != null ? <Dinero monto={d.desviacion} /> : '—'}
                  </Chip>
                </div>
              </div>
              <ul className="mt-2 flex flex-col gap-2">
                {(lineasPorTipo.get(d.tipo) ?? []).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-slate-500">{l.descripcion ?? '—'}</span>
                    <span>
                      Estimado: <Dinero monto={l.montoEstimado} />
                    </span>
                    {l.montoReal != null ? (
                      <span>
                        Real: <Dinero monto={l.montoReal} /> <FechaCorta fecha={l.fechaReal} />
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Monto real"
                          aria-label={`Monto real — ${TIPO_COSTO_ETIQUETAS[l.tipo]}`}
                          className="w-28 rounded-md border border-slate-300 px-2 py-1"
                          value={realInputs[l.id]?.monto ?? ''}
                          onChange={(e) =>
                            setRealInputs((prev) => ({
                              ...prev,
                              [l.id]: { monto: e.target.value, fecha: prev[l.id]?.fecha ?? hoyIso() },
                            }))
                          }
                        />
                        <input
                          type="date"
                          aria-label={`Fecha real — ${TIPO_COSTO_ETIQUETAS[l.tipo]}`}
                          className="rounded-md border border-slate-300 px-2 py-1"
                          value={realInputs[l.id]?.fecha ?? hoyIso()}
                          onChange={(e) =>
                            setRealInputs((prev) => ({
                              ...prev,
                              [l.id]: { monto: prev[l.id]?.monto ?? '', fecha: e.target.value },
                            }))
                          }
                        />
                        <Boton
                          variante="secundario"
                          disabled={procesando || !realInputs[l.id]?.monto}
                          onClick={() =>
                            ejecutar(async () => {
                              const entrada = realInputs[l.id] ?? { monto: '0', fecha: hoyIso() };
                              await registrarMontoReal(l.id, Number(entrada.monto), entrada.fecha);
                            })
                          }
                        >
                          Registrar
                        </Boton>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {ficha.desviaciones.length === 0 && <p className="text-slate-400">Sin líneas de costo registradas.</p>}
        </div>
      </div>

      {/* Condición */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Condición</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Campo
            label="Batería (horas)"
            type="number"
            step="0.1"
            value={condicionForm.bateriaHoras != null ? String(condicionForm.bateriaHoras) : ''}
            onChange={(e) =>
              setCondicionForm((c) => ({ ...c, bateriaHoras: e.target.value ? Number(e.target.value) : null }))
            }
          />
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Pantalla
            <select
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={condicionForm.pantalla}
              onChange={(e) => setCondicionForm((c) => ({ ...c, pantalla: e.target.value as PantallaCondicion }))}
            >
              {OPCIONES_PANTALLA.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          {CAMPOS_COND.map((campo) => (
            <label key={campo} className="flex flex-col gap-1 text-sm font-medium capitalize text-slate-700">
              {campo}
              <select
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                value={condicionForm[campo]}
                onChange={(e) => setCondicionForm((c) => ({ ...c, [campo]: e.target.value as CondicionEstado }))}
              >
                {OPCIONES_COND.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="mt-3">
          <p className="mb-1 text-sm font-medium text-slate-700">Puertos dañados</p>
          <div className="flex flex-wrap gap-3">
            {PUERTOS.map((p) => (
              <label key={p.clave} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={!!condicionForm.puertosMalos[p.clave]}
                  onChange={(e) =>
                    setCondicionForm((c) => ({
                      ...c,
                      puertosMalos: { ...c.puertosMalos, [p.clave]: e.target.checked },
                    }))
                  }
                />
                {p.etiqueta}
              </label>
            ))}
          </div>
        </div>
        <label className="mt-3 flex flex-col gap-1 text-sm font-medium text-slate-700">
          Notas
          <textarea
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            rows={2}
            value={condicionForm.notas ?? ''}
            onChange={(e) => setCondicionForm((c) => ({ ...c, notas: e.target.value }))}
          />
        </label>
        <div className="mt-3">
          <Boton
            disabled={procesando}
            onClick={() =>
              ejecutar(async () => {
                await guardarCondicion(ficha.id, condicionForm);
              })
            }
          >
            Guardar condición
          </Boton>
        </div>
      </div>

      {/* Detalles aplicados */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Detalles aplicados</h2>
        <ul className="flex flex-col gap-2">
          {ficha.detalles.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {d.nombre} {d.notas ? `— ${d.notas}` : ''}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-red-600">
                  − <Dinero monto={d.deduccionAplicada} />
                </span>
                <Boton
                  variante="secundario"
                  disabled={procesando}
                  onClick={() =>
                    ejecutar(async () => {
                      await quitarDetalle(d.id);
                    })
                  }
                >
                  Quitar
                </Boton>
              </div>
            </li>
          ))}
          {ficha.detalles.length === 0 && <p className="text-slate-400">Sin detalles aplicados.</p>}
        </ul>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Detalle a agregar
            <select
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={detalleSel}
              onChange={(e) => {
                const val = e.target.value;
                setDetalleSel(val);
                const cat = catalogoDetalles.find((c) => c.id === val);
                setDeduccionInput(cat ? String(cat.deduccionBase) : '');
              }}
            >
              <option value="">Seleccionar…</option>
              {catalogoDetalles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <Campo
            label="Deducción"
            type="number"
            step="0.01"
            value={deduccionInput}
            onChange={(e) => setDeduccionInput(e.target.value)}
          />
          <Campo label="Notas (opcional)" value={notasDetalle} onChange={(e) => setNotasDetalle(e.target.value)} />
          <Boton
            disabled={procesando || !detalleSel || !deduccionInput}
            onClick={() =>
              ejecutar(async () => {
                await agregarDetalle(ficha.id, detalleSel, Number(deduccionInput), notasDetalle || undefined);
                setDetalleSel('');
                setDeduccionInput('');
                setNotasDetalle('');
              })
            }
          >
            Agregar detalle
          </Boton>
        </div>
      </div>

      {/* Partes instaladas (lectura) */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Partes instaladas</h2>
        <Tabla
          encabezados={['Parte', 'Identificador', 'Costo', 'Fecha']}
          filas={ficha.partes.map((p) => [
            p.parteNombre,
            p.identificador ?? '—',
            <Dinero monto={p.costoAplicado} />,
            <FechaCorta fecha={p.fecha} />,
          ])}
          claves={ficha.partes.map((p) => p.id)}
          vacio="Sin partes instaladas"
        />
      </div>

      {/* Fotos */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Fotos</h2>
        <div className="flex flex-wrap gap-3">
          {ficha.fotos.map((path) => (
            <div key={path} className="relative">
              <img src={urlFoto(path)} alt="Foto de la laptop" className="h-24 w-24 rounded-md object-cover" />
              <button
                type="button"
                className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-xs text-white"
                aria-label="Eliminar foto"
                onClick={() =>
                  ejecutar(async () => {
                    await eliminarFoto(ficha.id, path);
                  })
                }
              >
                ✕
              </button>
            </div>
          ))}
          {ficha.fotos.length === 0 && <p className="text-slate-400">Sin fotos.</p>}
        </div>
        <label className="mt-3 flex flex-col gap-1 text-sm font-medium text-slate-700">
          Subir foto
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (!archivo) return;
              ejecutar(async () => {
                await subirFoto(ficha.id, archivo);
              });
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </section>
  );
}
