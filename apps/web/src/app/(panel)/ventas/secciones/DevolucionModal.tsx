'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/ui/Modal';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { devolverGarantia, listarCuentas, type CuentaOpcion, type GarantiaVigente } from '@/data/ventas';

export interface DevolucionModalProps {
  garantia: GarantiaVigente | null;
  onCerrar: () => void;
  onDevuelta: () => void;
}

/** Modal de devolución por garantía: cuenta de reembolso (filtrada por la moneda de la
 * venta) + monto (prellenado con el precio de venta, editable). RPC `devolver_garantia`. */
export function DevolucionModal({ garantia, onCerrar, onDevuelta }: DevolucionModalProps) {
  const [cuentas, setCuentas] = useState<CuentaOpcion[]>([]);
  const [cuentaId, setCuentaId] = useState('');
  const [monto, setMonto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!garantia) return;
    setMonto(String(garantia.precioVenta));
    setCuentaId('');
    setError(null);
    void listarCuentas(garantia.moneda).then(setCuentas);
  }, [garantia]);

  if (!garantia) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!cuentaId) return setError('Selecciona la cuenta de reembolso.');
    if (!monto || Number(monto) <= 0) return setError('El monto del reembolso debe ser mayor a 0.');

    setGuardando(true);
    try {
      await devolverGarantia(garantia.ventaId, cuentaId, Number(monto));
      onDevuelta();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar la devolución');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal abierto={!!garantia} titulo={`Devolución por garantía — ${garantia.alias}`} onCerrar={onCerrar}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="dv-cuenta" className="text-sm font-medium text-slate-700">
            Cuenta de reembolso
          </label>
          <select
            id="dv-cuenta"
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

        <Campo
          label="Monto del reembolso"
          type="number"
          min="0.01"
          step="0.01"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Boton variante="secundario" type="button" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando}>
            {guardando ? 'Procesando…' : 'Confirmar devolución'}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
