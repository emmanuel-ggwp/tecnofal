'use client';

// Modal global de conversión rápida (plan-07). Se monta UNA vez en el layout compartido
// (src/app/(panel)/layout.tsx) para estar disponible desde cualquier pantalla; escucha el
// evento `tecnofal:conversion-rapida` (botón "＋ Conversión" del header, plan-00) y el atajo
// de teclado Ctrl+Shift+C.
import { useEffect, useState } from 'react';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Modal } from '@/ui/Modal';
import { type Cuenta, listarCuentas, registrarConversion } from '@/data/cuentas';

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ConversionRapida() {
  const [abierto, setAbierto] = useState(false);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentaOrigen, setCuentaOrigen] = useState('');
  const [cuentaDestino, setCuentaDestino] = useState('');
  const [montoOrigen, setMontoOrigen] = useState('');
  const [montoDestino, setMontoDestino] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = () => {
    setError(null);
    setAbierto(true);
    void listarCuentas().then(setCuentas);
  };

  // Precarga las cuentas apenas se monta el layout (no solo al abrir) para que el <select>
  // ya tenga opciones la primera vez que el usuario dispara el atajo/botón.
  useEffect(() => {
    void listarCuentas().then(setCuentas);
  }, []);

  useEffect(() => {
    const alEvento = () => abrir();
    const alTeclado = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        abrir();
      }
    };
    window.addEventListener('tecnofal:conversion-rapida', alEvento);
    window.addEventListener('keydown', alTeclado);
    return () => {
      window.removeEventListener('tecnofal:conversion-rapida', alEvento);
      window.removeEventListener('keydown', alTeclado);
    };
  }, []);

  const cerrar = () => {
    setAbierto(false);
    setCuentaOrigen('');
    setCuentaDestino('');
    setMontoOrigen('');
    setMontoDestino('');
    setFecha(hoyISO());
    setNota('');
    setError(null);
  };

  const origenNum = Number(montoOrigen);
  const destinoNum = Number(montoDestino);
  const tasaImplicita = origenNum > 0 && destinoNum > 0 ? origenNum / destinoNum : null;

  const confirmar = async () => {
    setError(null);
    if (!cuentaOrigen || !cuentaDestino) {
      setError('Elige cuenta origen y destino.');
      return;
    }
    if (cuentaOrigen === cuentaDestino) {
      setError('La cuenta origen y destino deben ser distintas.');
      return;
    }
    if (!(origenNum > 0) || !(destinoNum > 0)) {
      setError('Los montos deben ser mayores a 0.');
      return;
    }
    setEnviando(true);
    try {
      await registrarConversion({
        cuenta_origen: cuentaOrigen,
        cuenta_destino: cuentaDestino,
        monto_origen: origenNum,
        monto_destino: destinoNum,
        fecha,
        nota: nota || undefined,
      });
      window.dispatchEvent(new CustomEvent('tecnofal:conversion-registrada'));
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la conversión.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal abierto={abierto} titulo="Conversión rápida" onCerrar={cerrar}>
      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor="conv-cuenta-origen" className="text-sm font-medium text-slate-700">
            Cuenta origen
          </label>
          <select
            id="conv-cuenta-origen"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={cuentaOrigen}
            onChange={(e) => setCuentaOrigen(e.target.value)}
          >
            <option value="">Elige…</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="conv-cuenta-destino" className="text-sm font-medium text-slate-700">
            Cuenta destino
          </label>
          <select
            id="conv-cuenta-destino"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={cuentaDestino}
            onChange={(e) => setCuentaDestino(e.target.value)}
          >
            <option value="">Elige…</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <Campo
          label="Monto origen"
          type="number"
          step="0.01"
          value={montoOrigen}
          onChange={(e) => setMontoOrigen(e.target.value)}
        />
        <Campo
          label="Monto destino"
          type="number"
          step="0.01"
          value={montoDestino}
          onChange={(e) => setMontoDestino(e.target.value)}
        />
        <Campo label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <Campo label="Nota" value={nota} onChange={(e) => setNota(e.target.value)} />
        <p className="text-sm text-slate-600">
          Tasa implícita: <span data-testid="tasa-implicita-rapida">{tasaImplicita ? tasaImplicita.toFixed(4) : '—'}</span>
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <Boton variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton onClick={() => void confirmar()} disabled={enviando}>
            Confirmar
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
