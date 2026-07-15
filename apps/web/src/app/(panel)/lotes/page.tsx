'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Chip } from '@/ui/Chip';
import { Dinero } from '@/ui/Dinero';
import { FechaCorta } from '@/ui/FechaCorta';
import { Modal } from '@/ui/Modal';
import { Tabla } from '@/ui/Tabla';
import {
  crearLoteEbay,
  crearLoteLocal,
  listarLotes,
  type CpuTipo,
  type LoteResumen,
  type NuevaLaptopSpec,
} from '@/data/lotes';

const CPU_TIPOS: CpuTipo[] = ['i3', 'i5', 'i7', 'ryzen3', 'ryzen5', 'ryzen7', 'otro'];

function nuevaLaptopVacia(): NuevaLaptopSpec {
  return { service_tag: '', cpu_tipo: undefined, cpu_gen: undefined, ram_gb: undefined, ssd_gb: undefined };
}

function limpiarSpecs(laptops: NuevaLaptopSpec[]): NuevaLaptopSpec[] {
  return laptops.map((l) => ({
    service_tag: l.service_tag || undefined,
    cpu_tipo: l.cpu_tipo || undefined,
    cpu_gen: l.cpu_gen ? Number(l.cpu_gen) : undefined,
    ram_gb: l.ram_gb ? Number(l.ram_gb) : undefined,
    ssd_gb: l.ssd_gb ? Number(l.ssd_gb) : undefined,
  }));
}

interface FormLaptopsProps {
  prefijo: string;
  laptops: NuevaLaptopSpec[];
  onCambiar: (laptops: NuevaLaptopSpec[]) => void;
}

function FormLaptops({ prefijo, laptops, onCambiar }: FormLaptopsProps) {
  function actualizar(i: number, campo: keyof NuevaLaptopSpec, valor: string) {
    const copia = laptops.slice();
    copia[i] = { ...copia[i], [campo]: valor };
    onCambiar(copia);
  }
  function quitar(i: number) {
    onCambiar(laptops.filter((_, idx) => idx !== i));
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Laptops del lote</span>
        <Boton
          type="button"
          variante="secundario"
          data-testid={`${prefijo}-agregar-laptop`}
          onClick={() => onCambiar([...laptops, nuevaLaptopVacia()])}
        >
          + Agregar laptop
        </Boton>
      </div>
      {laptops.map((l, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-5">
          <Campo
            label="Service tag"
            data-testid={`${prefijo}-laptop-${i}-service_tag`}
            value={l.service_tag ?? ''}
            onChange={(e) => actualizar(i, 'service_tag', e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">CPU</label>
            <select
              data-testid={`${prefijo}-laptop-${i}-cpu_tipo`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={l.cpu_tipo ?? ''}
              onChange={(e) => actualizar(i, 'cpu_tipo', e.target.value)}
            >
              <option value="">—</option>
              {CPU_TIPOS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <Campo
            label="Gen."
            type="number"
            data-testid={`${prefijo}-laptop-${i}-cpu_gen`}
            value={l.cpu_gen ?? ''}
            onChange={(e) => actualizar(i, 'cpu_gen', e.target.value)}
          />
          <Campo
            label="RAM (GB)"
            type="number"
            data-testid={`${prefijo}-laptop-${i}-ram_gb`}
            value={l.ram_gb ?? ''}
            onChange={(e) => actualizar(i, 'ram_gb', e.target.value)}
          />
          <Campo
            label="SSD (GB)"
            type="number"
            data-testid={`${prefijo}-laptop-${i}-ssd_gb`}
            value={l.ssd_gb ?? ''}
            onChange={(e) => actualizar(i, 'ssd_gb', e.target.value)}
          />
          <div className="col-span-2 sm:col-span-5">
            <Boton variante="peligro" type="button" onClick={() => quitar(i)}>
              Quitar
            </Boton>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LotesPage() {
  const [lotes, setLotes] = useState<LoteResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalLocal, setModalLocal] = useState(false);
  const [modalEbay, setModalEbay] = useState(false);

  const [fechaLocal, setFechaLocal] = useState(new Date().toISOString().slice(0, 10));
  const [precioLocal, setPrecioLocal] = useState('');
  const [fleteLocal, setFleteLocal] = useState('');
  const [revisionLocal, setRevisionLocal] = useState('');
  const [laptopsLocal, setLaptopsLocal] = useState<NuevaLaptopSpec[]>([nuevaLaptopVacia()]);

  const [fechaEbay, setFechaEbay] = useState(new Date().toISOString().slice(0, 10));
  const [urlEbay, setUrlEbay] = useState('');
  const [vendedorEbay, setVendedorEbay] = useState('');
  const [precioEbay, setPrecioEbay] = useState('');
  const [envioEbay, setEnvioEbay] = useState('');
  const [impuestoEbay, setImpuestoEbay] = useState('');
  const [seguroEbay, setSeguroEbay] = useState('');
  const [laptopsEbay, setLaptopsEbay] = useState<NuevaLaptopSpec[]>([nuevaLaptopVacia()]);

  const [guardando, setGuardando] = useState(false);
  // Clave de idempotencia por submit: se genera una vez y se reusa si el usuario reintenta
  // tras un error (el RPC no es idempotente sin ella). Se limpia solo al tener éxito, para
  // que la siguiente compra genere una clave nueva.
  const reqKeyLocal = useRef<string | null>(null);
  const reqKeyEbay = useRef<string | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      setLotes(await listarLotes());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar lotes');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function guardarLocal() {
    if (guardando) return; // guard de reentrada: el RPC no es idempotente, un doble-submit duplica el lote
    if (!reqKeyLocal.current) reqKeyLocal.current = crypto.randomUUID();
    setGuardando(true);
    try {
      await crearLoteLocal({
        fecha_compra: fechaLocal,
        precio_compra: Number(precioLocal || 0),
        flete_nacional: fleteLocal ? Number(fleteLocal) : undefined,
        revision: revisionLocal ? Number(revisionLocal) : undefined,
        laptops: limpiarSpecs(laptopsLocal),
        idempotencyKey: reqKeyLocal.current,
      });
      reqKeyLocal.current = null; // éxito → la próxima compra usa clave nueva
      setModalLocal(false);
      setPrecioLocal('');
      setFleteLocal('');
      setRevisionLocal('');
      setLaptopsLocal([nuevaLaptopVacia()]);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el lote');
    } finally {
      setGuardando(false);
    }
  }

  async function guardarEbay() {
    if (guardando) return; // guard de reentrada: el RPC no es idempotente, un doble-submit duplica el lote
    if (!reqKeyEbay.current) reqKeyEbay.current = crypto.randomUUID();
    setGuardando(true);
    try {
      await crearLoteEbay({
        fecha_compra: fechaEbay,
        url_ebay: urlEbay || undefined,
        vendedor: vendedorEbay || undefined,
        precio_subasta: Number(precioEbay || 0),
        envio_usa: envioEbay ? Number(envioEbay) : undefined,
        impuesto_ebay: impuestoEbay ? Number(impuestoEbay) : undefined,
        seguro: seguroEbay ? Number(seguroEbay) : undefined,
        laptops: limpiarSpecs(laptopsEbay),
        idempotencyKey: reqKeyEbay.current,
      });
      reqKeyEbay.current = null; // éxito → la próxima compra usa clave nueva
      setModalEbay(false);
      setUrlEbay('');
      setVendedorEbay('');
      setPrecioEbay('');
      setEnvioEbay('');
      setImpuestoEbay('');
      setSeguroEbay('');
      setLaptopsEbay([nuevaLaptopVacia()]);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el lote');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lotes</h1>
        <Link href="/lotes/paquetes" className="text-sm font-medium text-slate-600 underline">
          Ver paquetes →
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Boton data-testid="boton-nueva-compra-local" onClick={() => setModalLocal(true)}>
          + Compra local
        </Boton>
        <Boton variante="secundario" data-testid="boton-nueva-compra-ebay" onClick={() => setModalEbay(true)}>
          + Compra eBay (manual)
        </Boton>
      </div>

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <Tabla
          encabezados={['Fecha', 'Origen', 'Laptops', 'Proyectado congelado', 'Actual']}
          paginado
          claves={lotes.map((l) => l.id)}
          filas={lotes.map((l) => [
            <Link key="f" href={`/lotes/${l.id}`} data-testid={`lote-link-${l.id}`} className="underline">
              <FechaCorta fecha={l.fecha_compra} />
            </Link>,
            <Chip key="o" tono={l.origen === 'local' ? 'azul' : 'gris'}>
              {l.origen}
            </Chip>,
            l.num_laptops,
            <Dinero key="p" monto={l.costo_proyectado_total} />,
            <Dinero key="a" monto={l.costo_actual} />,
          ])}
        />
      )}

      <Modal abierto={modalLocal} titulo="Nueva compra local" onCerrar={() => setModalLocal(false)}>
        <div className="flex flex-col gap-3">
          <Campo
            label="Fecha de compra"
            type="date"
            data-testid="lote-local-fecha"
            value={fechaLocal}
            onChange={(e) => setFechaLocal(e.target.value)}
          />
          <Campo
            label="Precio de compra"
            type="number"
            data-testid="lote-local-precio"
            value={precioLocal}
            onChange={(e) => setPrecioLocal(e.target.value)}
          />
          <Campo
            label="Flete nacional (opcional)"
            type="number"
            data-testid="lote-local-flete"
            value={fleteLocal}
            onChange={(e) => setFleteLocal(e.target.value)}
          />
          <Campo
            label="Revisión (opcional)"
            type="number"
            data-testid="lote-local-revision"
            value={revisionLocal}
            onChange={(e) => setRevisionLocal(e.target.value)}
          />
          <FormLaptops prefijo="lote-local" laptops={laptopsLocal} onCambiar={setLaptopsLocal} />
          <Boton data-testid="lote-local-guardar" disabled={guardando} onClick={() => void guardarLocal()}>
            Guardar
          </Boton>
        </div>
      </Modal>

      <Modal abierto={modalEbay} titulo="Nueva compra eBay (manual)" onCerrar={() => setModalEbay(false)}>
        <div className="flex flex-col gap-3">
          <Campo
            label="Fecha de compra"
            type="date"
            data-testid="lote-ebay-fecha"
            value={fechaEbay}
            onChange={(e) => setFechaEbay(e.target.value)}
          />
          <Campo
            label="URL de eBay"
            data-testid="lote-ebay-url"
            value={urlEbay}
            onChange={(e) => setUrlEbay(e.target.value)}
          />
          <Campo
            label="Vendedor"
            data-testid="lote-ebay-vendedor"
            value={vendedorEbay}
            onChange={(e) => setVendedorEbay(e.target.value)}
          />
          <Campo
            label="Precio de subasta"
            type="number"
            data-testid="lote-ebay-precio"
            value={precioEbay}
            onChange={(e) => setPrecioEbay(e.target.value)}
          />
          <Campo
            label="Envío a USA (opcional)"
            type="number"
            data-testid="lote-ebay-envio"
            value={envioEbay}
            onChange={(e) => setEnvioEbay(e.target.value)}
          />
          <Campo
            label="Impuesto eBay (opcional)"
            type="number"
            data-testid="lote-ebay-impuesto"
            value={impuestoEbay}
            onChange={(e) => setImpuestoEbay(e.target.value)}
          />
          <Campo
            label="Seguro (opcional)"
            type="number"
            data-testid="lote-ebay-seguro"
            value={seguroEbay}
            onChange={(e) => setSeguroEbay(e.target.value)}
          />
          <FormLaptops prefijo="lote-ebay" laptops={laptopsEbay} onCambiar={setLaptopsEbay} />
          <Boton data-testid="lote-ebay-guardar" disabled={guardando} onClick={() => void guardarEbay()}>
            Guardar
          </Boton>
        </div>
      </Modal>
    </section>
  );
}
