'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/ui/Modal';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Dinero } from '@/ui/Dinero';
import {
  crearComprador,
  listarCompradores,
  listarCuentas,
  listarLaptopsVendibles,
  registrarVenta,
  tasaSugerida,
  type Comprador,
  type CuentaOpcion,
  type LaptopVendible,
  type Moneda,
} from '@/data/ventas';

export interface RegistrarVentaModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onRegistrada: () => void;
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RegistrarVentaModal({ abierto, onCerrar, onRegistrada }: RegistrarVentaModalProps) {
  const [laptops, setLaptops] = useState<LaptopVendible[]>([]);
  const [compradores, setCompradores] = useState<Comprador[]>([]);
  const [cuentas, setCuentas] = useState<CuentaOpcion[]>([]);

  const [laptopId, setLaptopId] = useState('');
  const [compradorModo, setCompradorModo] = useState<'existente' | 'nuevo'>('existente');
  const [compradorId, setCompradorId] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [telefonoNuevo, setTelefonoNuevo] = useState('');
  const [notasNuevo, setNotasNuevo] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [precioUsd, setPrecioUsd] = useState('');
  const [montoVes, setMontoVes] = useState('');
  const [tasa, setTasa] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [fecha, setFecha] = useState(hoyISO());

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir: reiniciar el formulario y cargar catálogos.
  useEffect(() => {
    if (!abierto) return;
    setLaptopId('');
    setCompradorModo('existente');
    setCompradorId('');
    setNombreNuevo('');
    setTelefonoNuevo('');
    setNotasNuevo('');
    setMoneda('USD');
    setPrecioUsd('');
    setMontoVes('');
    setTasa('');
    setCuentaId('');
    setFecha(hoyISO());
    setError(null);

    void listarLaptopsVendibles().then(setLaptops);
    void listarCompradores().then(setCompradores);
  }, [abierto]);

  // Cuentas filtradas por la moneda elegida (la RPC exige que coincidan).
  useEffect(() => {
    if (!abierto) return;
    setCuentaId('');
    void listarCuentas(moneda).then(setCuentas);
  }, [abierto, moneda]);

  // Sugerencia de tasa del día para ventas en VES (editable).
  useEffect(() => {
    if (!abierto || moneda !== 'VES' || tasa !== '') return;
    void tasaSugerida(fecha).then((sugerida) => {
      if (sugerida != null) setTasa(String(sugerida));
    });
  }, [abierto, moneda, fecha, tasa]);

  const precioCalculado =
    moneda === 'VES'
      ? montoVes && tasa && Number(tasa) > 0
        ? Number(montoVes) / Number(tasa)
        : null
      : precioUsd
        ? Number(precioUsd)
        : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!laptopId) return setError('Selecciona una laptop.');
    if (compradorModo === 'existente' && !compradorId) return setError('Selecciona un comprador o crea uno nuevo.');
    if (compradorModo === 'nuevo' && !nombreNuevo.trim()) return setError('El nombre del comprador es obligatorio.');
    if (!cuentaId) return setError('Selecciona la cuenta destino.');
    if (precioCalculado == null || precioCalculado <= 0) return setError('El precio de venta debe ser mayor a 0.');

    setGuardando(true);
    try {
      let compradorIdFinal = compradorId;
      if (compradorModo === 'nuevo') {
        const nuevo = await crearComprador({
          nombre: nombreNuevo.trim(),
          telefono: telefonoNuevo.trim() || null,
          notas: notasNuevo.trim() || null,
        });
        compradorIdFinal = nuevo.id;
      }

      await registrarVenta({
        laptopId,
        compradorId: compradorIdFinal,
        precio: precioCalculado,
        moneda,
        montoVes: moneda === 'VES' ? Number(montoVes) : null,
        tasa: moneda === 'VES' ? Number(tasa) : null,
        cuentaId,
        fecha,
      });
      onRegistrada();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar la venta');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal abierto={abierto} titulo="Registrar venta" onCerrar={onCerrar}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="rv-laptop" className="text-sm font-medium text-slate-700">
            Laptop
          </label>
          <select
            id="rv-laptop"
            value={laptopId}
            onChange={(e) => setLaptopId(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Selecciona…</option>
            {laptops.map((l) => (
              <option key={l.id} value={l.id}>
                {l.alias} — {l.modeloNombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="rv-comprador" className="text-sm font-medium text-slate-700">
            Comprador
          </label>
          <select
            id="rv-comprador"
            value={compradorModo === 'nuevo' ? '__nuevo__' : compradorId}
            onChange={(e) => {
              if (e.target.value === '__nuevo__') {
                setCompradorModo('nuevo');
                setCompradorId('');
              } else {
                setCompradorModo('existente');
                setCompradorId(e.target.value);
              }
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Selecciona…</option>
            <option value="__nuevo__">+ Nuevo comprador</option>
            {compradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        {compradorModo === 'nuevo' && (
          <div className="space-y-2 rounded-md border border-slate-200 p-3">
            <Campo label="Nombre" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} />
            <Campo label="Teléfono" value={telefonoNuevo} onChange={(e) => setTelefonoNuevo(e.target.value)} />
            <Campo label="Notas" value={notasNuevo} onChange={(e) => setNotasNuevo(e.target.value)} />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="rv-moneda" className="text-sm font-medium text-slate-700">
            Moneda
          </label>
          <select
            id="rv-moneda"
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as Moneda)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="USD">USD</option>
            <option value="VES">VES (Bs)</option>
          </select>
        </div>

        {moneda === 'USD' ? (
          <Campo
            label="Precio (USD)"
            type="number"
            min="0.01"
            step="0.01"
            value={precioUsd}
            onChange={(e) => setPrecioUsd(e.target.value)}
          />
        ) : (
          <>
            <Campo
              label="Monto (Bs)"
              type="number"
              min="0.01"
              step="0.01"
              value={montoVes}
              onChange={(e) => setMontoVes(e.target.value)}
            />
            <Campo
              label="Tasa"
              type="number"
              min="0.0001"
              step="0.0001"
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
            />
            <p className="text-sm text-slate-600">
              Precio en USD:{' '}
              <strong data-testid="precio-calculado">
                <Dinero monto={precioCalculado} />
              </strong>
            </p>
          </>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="rv-cuenta" className="text-sm font-medium text-slate-700">
            Cuenta destino
          </label>
          <select
            id="rv-cuenta"
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Selecciona…</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <Campo label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Boton variante="secundario" type="button" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Confirmar'}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
