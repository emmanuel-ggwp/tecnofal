'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  evaluar,
  type CpuTipo,
  type EntradaEvaluacion,
  type MetodoEnvio,
} from '@tecnofal/core';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Modal } from '@/ui/Modal';
import { Tabla } from '@/ui/Tabla';
import { Dinero } from '@/ui/Dinero';
import { Semaforo } from '@/ui/Semaforo';
import {
  cargarConfiguracion,
  crearLote,
  guardarEvaluacion,
  type ConfiguracionCalculadora,
  type ItemDeduccion,
  type ItemFaltante,
} from '@/data/calculadora';

const CPU_TIPOS: CpuTipo[] = ['i3', 'i5', 'i7', 'ryzen3', 'ryzen5', 'ryzen7', 'otro'];
const TAMANOS_BUCKET = [12.5, 14, 15.6, 17];

interface FormState {
  origen: 'ebay' | 'local';
  precio: number;
  envioUsa: number;
  fleteNacional: number;
  metodo: MetodoEnvio;
  envioVzlaPorUnidad: number;
  volumenPie3: number;
  pesoKg: number;
  valorDeclarado: string;
  cpuTipo: CpuTipo;
  cpuGen: number;
  ramGb: number;
  ssdGb: number;
  pantallaPulgadas: number;
  pantallaTactil: boolean;
  cantidadLaptops: number;
  bloqueado: boolean;
  urlEbay: string;
  titulo: string;
}

const FORM_INICIAL: FormState = {
  origen: 'ebay',
  precio: 0,
  envioUsa: 0,
  fleteNacional: 0,
  metodo: 'barco',
  envioVzlaPorUnidad: 0,
  volumenPie3: 0,
  pesoKg: 0,
  valorDeclarado: '',
  cpuTipo: 'i5',
  cpuGen: 8,
  ramGb: 8,
  ssdGb: 256,
  pantallaPulgadas: 14,
  pantallaTactil: false,
  cantidadLaptops: 1,
  bloqueado: false,
  urlEbay: '',
  titulo: '',
};

export default function CalculadoraPage() {
  const [config, setConfig] = useState<ConfiguracionCalculadora | null>(null);
  const [errorConfig, setErrorConfig] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [buckets, setBuckets] = useState<number[]>([0, 0, 0, 0]);
  const [faltantes, setFaltantes] = useState<ItemFaltante[]>([]);
  const [parteSeleccionada, setParteSeleccionada] = useState('');
  const [deducciones, setDeducciones] = useState<ItemDeduccion[]>([]);
  const [detalleSeleccionado, setDetalleSeleccionado] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [loteCreadoId, setLoteCreadoId] = useState<string | null>(null);
  // Clave de idempotencia por conversión: se reusa si el usuario reintenta tras un error;
  // se limpia al tener éxito. Evita que el RPC (no idempotente) duplique el lote.
  const reqKeyLote = useRef<string | null>(null);

  useEffect(() => {
    cargarConfiguracion()
      .then((c) => {
        setConfig(c);
        setForm((f) => ({ ...f, envioVzlaPorUnidad: c.parametros.envioVzlaPorLaptop }));
      })
      .catch((e: unknown) => setErrorConfig(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const entrada: EntradaEvaluacion = useMemo(() => {
    const n = form.cantidadLaptops;
    const pantallasActivas =
      n > 1 && buckets.some((c) => c > 0)
        ? TAMANOS_BUCKET.map((pulgadas, i) => ({ pulgadas, cantidad: buckets[i] })).filter((b) => b.cantidad > 0)
        : undefined;
    return {
      origen: form.origen,
      fleteNacional: form.origen === 'local' ? form.fleteNacional : undefined,
      precioSubasta: form.precio,
      envioUsa: form.origen === 'ebay' ? form.envioUsa : 0,
      extrasPartes: faltantes.reduce((s, f) => s + f.precio * f.cantidad, 0),
      deducciones: deducciones.reduce((s, d) => s + d.monto * d.cantidad, 0),
      metodo: form.metodo,
      envioVzlaPorUnidad: form.origen === 'ebay' ? form.envioVzlaPorUnidad : undefined,
      volumenPie3: form.volumenPie3,
      pesoKg: form.pesoKg,
      cantidadLaptops: n,
      valorDeclarado: form.valorDeclarado === '' ? undefined : Number(form.valorDeclarado),
      cpuTipo: form.cpuTipo,
      cpuGen: form.cpuGen,
      ramGb: form.ramGb,
      ssdGb: form.ssdGb,
      pantallaPulgadas: form.pantallaPulgadas,
      pantallas: pantallasActivas,
      pantallaTactil: form.pantallaTactil,
      bloqueado: form.bloqueado,
    };
  }, [form, buckets, faltantes, deducciones]);

  const resultado = useMemo(
    () => (config ? evaluar(entrada, config.parametros, config.precios, config.ajustes) : null),
    [entrada, config],
  );

  function agregarParte() {
    if (!config) return;
    const p = config.partes.find((x) => x.id === parteSeleccionada);
    if (!p) return;
    setFaltantes((f) => [...f, { nombre: p.nombre, precio: p.precioReferencia, cantidad: 1 }]);
    setParteSeleccionada('');
  }

  function agregarDeduccion() {
    if (!config) return;
    const d = config.detalles.find((x) => x.id === detalleSeleccionado);
    if (!d) return;
    setDeducciones((ds) => [...ds, { nombre: d.nombre, monto: d.deduccionBase, cantidad: 1 }]);
    setDetalleSeleccionado('');
  }

  async function onGuardarEvaluacion() {
    if (!resultado) return;
    setGuardando(true);
    try {
      await guardarEvaluacion({
        entrada,
        resultado,
        titulo: form.titulo || 'Evaluación desde calculadora',
        url: form.urlEbay || null,
        faltantes,
        deducciones,
      });
      setToast('Evaluación guardada en Inventario/Listings.');
    } catch (e: unknown) {
      setToast(`Error al guardar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGuardando(false);
    }
  }

  async function onConfirmarLote() {
    if (!resultado) return;
    if (guardando) return; // guard de reentrada: el RPC no es idempotente, un doble-submit duplica el lote
    if (!reqKeyLote.current) reqKeyLote.current = crypto.randomUUID();
    setGuardando(true);
    try {
      const { loteId } = await crearLote({
        entrada,
        resultado,
        titulo: form.titulo || 'Lote desde calculadora',
        url: form.urlEbay || null,
        faltantes,
        idempotencyKey: reqKeyLote.current,
      });
      reqKeyLote.current = null; // éxito → la próxima conversión usa clave nueva
      setLoteCreadoId(loteId);
    } catch (e: unknown) {
      setToast(`Error al convertir en lote: ${e instanceof Error ? e.message : String(e)}`);
      setModalAbierto(false);
    } finally {
      setGuardando(false);
    }
  }

  if (errorConfig) {
    return (
      <section>
        <h1 className="text-2xl font-bold">Calculadora</h1>
        <p className="mt-2 text-red-600" data-testid="error-config">
          {errorConfig}
        </p>
      </section>
    );
  }

  if (!config || !resultado) {
    return (
      <section>
        <h1 className="text-2xl font-bold">Calculadora</h1>
        <p className="mt-2 text-slate-500">Cargando…</p>
      </section>
    );
  }

  const n = Math.max(form.cantidadLaptops, 1);
  // Modo local: cadena corta (sin Zinli/impuesto eBay/seguro — no aplican fuera de eBay).
  const filasCadena: [string, number][] =
    form.origen === 'local'
      ? [
          ['Base (precio de compra)', resultado.cadena.base],
          ['Partes faltantes', resultado.cadena.extras],
          ['Flete nacional', resultado.cadena.envioVzla],
          ['Revisión', resultado.cadena.revision],
          ['Total', resultado.cadena.total],
        ]
      : [
          ['Base (subasta + envío USA)', resultado.cadena.base],
          ['Con Zinli', resultado.cadena.conZinli],
          ['Con impuesto eBay', resultado.cadena.conEbay],
          ['Partes faltantes', resultado.cadena.extras],
          ['Seguro', resultado.cadena.seguro],
          ['Envío Vzla', resultado.cadena.envioVzla],
          ['Revisión', resultado.cadena.revision],
          ['Total', resultado.cadena.total],
        ];

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Calculadora</h1>

      {toast && (
        <div data-testid="toast" className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Entrada ────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-semibold">Entrada</h2>

            <fieldset className="mb-3 flex gap-4" data-testid="origen">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="origen"
                  checked={form.origen === 'ebay'}
                  onChange={() => setForm((f) => ({ ...f, origen: 'ebay' }))}
                />
                eBay
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="origen"
                  checked={form.origen === 'local'}
                  onChange={() => setForm((f) => ({ ...f, origen: 'local' }))}
                />
                Local
              </label>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <Campo
                label={form.origen === 'ebay' ? 'Precio subasta' : 'Precio compra'}
                type="number"
                value={form.precio}
                onChange={(e) => setForm((f) => ({ ...f, precio: Number(e.target.value) }))}
              />

              {form.origen === 'ebay' ? (
                <Campo
                  label="Envío USA"
                  type="number"
                  value={form.envioUsa}
                  onChange={(e) => setForm((f) => ({ ...f, envioUsa: Number(e.target.value) }))}
                />
              ) : (
                <Campo
                  label="Flete nacional"
                  type="number"
                  value={form.fleteNacional}
                  onChange={(e) => setForm((f) => ({ ...f, fleteNacional: Number(e.target.value) }))}
                />
              )}

              {form.origen === 'ebay' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-slate-700" htmlFor="metodo">
                      Método
                    </label>
                    <select
                      id="metodo"
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      value={form.metodo}
                      onChange={(e) => setForm((f) => ({ ...f, metodo: e.target.value as MetodoEnvio }))}
                    >
                      <option value="barco">Barco</option>
                      <option value="avion_zoom">Avión (Zoom)</option>
                    </select>
                  </div>
                  <Campo
                    label="Envío Vzla por unidad"
                    type="number"
                    value={form.envioVzlaPorUnidad}
                    onChange={(e) => setForm((f) => ({ ...f, envioVzlaPorUnidad: Number(e.target.value) }))}
                  />
                  <Campo
                    label="Volumen (pie3, por unidad)"
                    type="number"
                    value={form.volumenPie3}
                    onChange={(e) => setForm((f) => ({ ...f, volumenPie3: Number(e.target.value) }))}
                  />
                  <Campo
                    label="Peso (kg, por unidad)"
                    type="number"
                    value={form.pesoKg}
                    onChange={(e) => setForm((f) => ({ ...f, pesoKg: Number(e.target.value) }))}
                  />
                  <Campo
                    label="Valor declarado"
                    type="number"
                    placeholder="default: subasta + envío"
                    value={form.valorDeclarado}
                    onChange={(e) => setForm((f) => ({ ...f, valorDeclarado: e.target.value }))}
                  />
                </>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700" htmlFor="cpuTipo">
                  CPU tipo
                </label>
                <select
                  id="cpuTipo"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  value={form.cpuTipo}
                  onChange={(e) => setForm((f) => ({ ...f, cpuTipo: e.target.value as CpuTipo }))}
                >
                  {CPU_TIPOS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <Campo
                label="Generación CPU"
                type="number"
                value={form.cpuGen}
                onChange={(e) => setForm((f) => ({ ...f, cpuGen: Number(e.target.value) }))}
              />
              <Campo
                label="RAM (GB)"
                type="number"
                value={form.ramGb}
                onChange={(e) => setForm((f) => ({ ...f, ramGb: Number(e.target.value) }))}
              />
              <Campo
                label="SSD (GB)"
                type="number"
                value={form.ssdGb}
                onChange={(e) => setForm((f) => ({ ...f, ssdGb: Number(e.target.value) }))}
              />
              <Campo
                label="Pantalla (pulgadas)"
                type="number"
                step="0.1"
                value={form.pantallaPulgadas}
                onChange={(e) => setForm((f) => ({ ...f, pantallaPulgadas: Number(e.target.value) }))}
              />
              <label className="mt-6 flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.pantallaTactil}
                  onChange={(e) => setForm((f) => ({ ...f, pantallaTactil: e.target.checked }))}
                />
                Táctil
              </label>
              <Campo
                label="Cantidad de laptops"
                type="number"
                min={1}
                value={form.cantidadLaptops}
                onChange={(e) => setForm((f) => ({ ...f, cantidadLaptops: Math.max(1, Number(e.target.value)) }))}
              />
              <label className="mt-6 flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.bloqueado}
                  onChange={(e) => setForm((f) => ({ ...f, bloqueado: e.target.checked }))}
                />
                Bloqueada (no pujar)
              </label>
            </div>

            {form.cantidadLaptops > 1 && (
              <div className="mt-3" data-testid="buckets-pantalla">
                <p className="mb-1 text-sm font-medium text-slate-700">
                  Lote mixto — pantallas por tamaño (opcional; sin asignar → 14&quot;)
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {TAMANOS_BUCKET.map((tam, i) => (
                    <Campo
                      key={tam}
                      label={`${tam}"`}
                      type="number"
                      min={0}
                      value={buckets[i]}
                      onChange={(e) =>
                        setBuckets((b) => b.map((v, j) => (j === i ? Number(e.target.value) : v)))
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3">
              <Campo
                label="URL de eBay (opcional)"
                type="text"
                placeholder="https://www.ebay.com/itm/123456789012/"
                value={form.urlEbay}
                onChange={(e) => setForm((f) => ({ ...f, urlEbay: e.target.value }))}
              />
            </div>
            <div className="mt-3">
              <Campo
                label="Título"
                type="text"
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-semibold">Partes faltantes</h2>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-sm font-medium text-slate-700" htmlFor="parte-select">
                  Agregar parte
                </label>
                <select
                  id="parte-select"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  value={parteSeleccionada}
                  onChange={(e) => setParteSeleccionada(e.target.value)}
                >
                  <option value="">— elegir —</option>
                  {config.partes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} (ref. {p.precioReferencia})
                    </option>
                  ))}
                </select>
              </div>
              <Boton variante="secundario" onClick={agregarParte} disabled={!parteSeleccionada}>
                Agregar
              </Boton>
            </div>
            <ul className="mt-3 space-y-2" data-testid="lista-faltantes">
              {faltantes.map((f, i) => (
                <li key={`${f.nombre}-${i}`} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{f.nombre}</span>
                  <input
                    type="number"
                    aria-label={`precio-${f.nombre}`}
                    className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    value={f.precio}
                    onChange={(e) =>
                      setFaltantes((fs) => fs.map((x, j) => (j === i ? { ...x, precio: Number(e.target.value) } : x)))
                    }
                  />
                  <input
                    type="number"
                    aria-label={`cantidad-${f.nombre}`}
                    min={1}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    value={f.cantidad}
                    onChange={(e) =>
                      setFaltantes((fs) => fs.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) } : x)))
                    }
                  />
                  <button
                    type="button"
                    aria-label={`quitar-${f.nombre}`}
                    className="text-slate-400 hover:text-red-600"
                    onClick={() => setFaltantes((fs) => fs.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-semibold">Deducciones</h2>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-sm font-medium text-slate-700" htmlFor="detalle-select">
                  Agregar deducción
                </label>
                <select
                  id="detalle-select"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  value={detalleSeleccionado}
                  onChange={(e) => setDetalleSeleccionado(e.target.value)}
                >
                  <option value="">— elegir —</option>
                  {config.detalles.map((d) => (
                    <option key={d.id} value={d.id}>
                      [{d.categoria}] {d.nombre} (base {d.deduccionBase})
                    </option>
                  ))}
                </select>
              </div>
              <Boton variante="secundario" onClick={agregarDeduccion} disabled={!detalleSeleccionado}>
                Agregar
              </Boton>
            </div>
            <ul className="mt-3 space-y-2" data-testid="lista-deducciones">
              {deducciones.map((d, i) => (
                <li key={`${d.nombre}-${i}`} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{d.nombre}</span>
                  <input
                    type="number"
                    aria-label={`monto-${d.nombre}`}
                    className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    value={d.monto}
                    onChange={(e) =>
                      setDeducciones((ds) => ds.map((x, j) => (j === i ? { ...x, monto: Number(e.target.value) } : x)))
                    }
                  />
                  <input
                    type="number"
                    aria-label={`cantidad-${d.nombre}`}
                    min={1}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    value={d.cantidad}
                    onChange={(e) =>
                      setDeducciones((ds) => ds.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) } : x)))
                    }
                  />
                  <button
                    type="button"
                    aria-label={`quitar-${d.nombre}`}
                    className="text-slate-400 hover:text-red-600"
                    onClick={() => setDeducciones((ds) => ds.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Salida ─────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-semibold">Resultado</h2>

            <Tabla
              encabezados={['Concepto', 'Monto']}
              filas={filasCadena.map(([etiqueta, monto]) => [etiqueta, <Dinero key={etiqueta} monto={monto} />])}
            />

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm" data-testid="resumen-resultado">
              <div>
                <dt className="text-slate-500">Valor esperado (total)</dt>
                <dd data-testid="valor-esperado-total">
                  <Dinero monto={resultado.valorEsperado} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Valor esperado (por unidad)</dt>
                <dd data-testid="valor-esperado-unidad">
                  <Dinero monto={resultado.valorEsperadoUnidad} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Costo por unidad</dt>
                <dd>
                  <Dinero monto={resultado.costoPorUnidad} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Margen</dt>
                <dd data-testid="margen">
                  {resultado.margen == null ? '—' : `${(resultado.margen * 100).toFixed(1)}%`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Semáforo</dt>
                <dd data-testid="semaforo">
                  <Semaforo margen={resultado.margen} parametros={config.parametros} etiqueta={resultado.semaforo ?? '—'} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">S. decente / S. máximo</dt>
                <dd data-testid="s-decente-max">
                  <Dinero monto={resultado.sDecente} /> / <Dinero monto={resultado.sMax} />
                </dd>
              </div>
            </dl>

            {resultado.sinPujaMotivo && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="sin-puja-motivo">
                {resultado.sinPujaMotivo}
              </p>
            )}

            {resultado.advertencias.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-amber-700" data-testid="advertencias">
                {resultado.advertencias.map((a) => (
                  <li key={a}>⚠ {a}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-3">
            <Boton onClick={onGuardarEvaluacion} disabled={guardando}>
              Guardar evaluación
            </Boton>
            <Boton
              variante="secundario"
              onClick={() => {
                setLoteCreadoId(null);
                setModalAbierto(true);
              }}
              disabled={guardando}
            >
              Convertir en lote
            </Boton>
          </div>
        </div>
      </div>

      <Modal abierto={modalAbierto} titulo="Convertir en lote" onCerrar={() => setModalAbierto(false)}>
        {loteCreadoId ? (
          <div className="space-y-3" data-testid="lote-creado">
            <p className="text-sm text-slate-700">
              Lote creado con {n} laptop{n > 1 ? 's' : ''} en estado{' '}
              {form.origen === 'local' ? 'en revisión' : 'comprada'}.
            </p>
            <Link href="/lotes" className="text-sm font-medium text-slate-900 underline" data-testid="link-ver-lote">
              Ver en /lotes
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Se creará un lote de <strong>{n}</strong> laptop{n > 1 ? 's' : ''} (
              {form.origen === 'local' ? 'origen local' : 'origen eBay'}), costo proyectado{' '}
              <Dinero monto={resultado.cadena.total} />, valor esperado <Dinero monto={resultado.valorEsperado} />.
            </p>
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setModalAbierto(false)}>
                Cancelar
              </Boton>
              <Boton onClick={onConfirmarLote} disabled={guardando}>
                Confirmar conversión
              </Boton>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
