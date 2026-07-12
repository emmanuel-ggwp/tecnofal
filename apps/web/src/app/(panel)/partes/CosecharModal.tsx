'use client';

import { useEffect, useState } from 'react';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Modal } from '@/ui/Modal';
import {
  cosecharParte,
  etiquetaLaptop,
  listarCatalogo,
  listarLaptopsDonantes,
  type LaptopOpcion,
  type ParteCatalogo,
} from '@/data/partes';

export interface CosecharModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onCosechada: () => void;
}

/** Modal de cosecha: elige donante por alias, tipo de parte del catálogo, identificador y costo (default 0). */
export function CosecharModal({ abierto, onCerrar, onCosechada }: CosecharModalProps) {
  const [busqueda, setBusqueda] = useState('');
  const [donantes, setDonantes] = useState<LaptopOpcion[]>([]);
  const [donanteSeleccionado, setDonanteSeleccionado] = useState<LaptopOpcion | null>(null);
  const [catalogo, setCatalogo] = useState<ParteCatalogo[]>([]);
  const [parteId, setParteId] = useState('');
  const [identificador, setIdentificador] = useState('');
  const [costo, setCosto] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setBusqueda('');
    setDonanteSeleccionado(null);
    setParteId('');
    setIdentificador('');
    setCosto('0');
    setError(null);
    Promise.all([listarLaptopsDonantes(), listarCatalogo()])
      .then(([d, c]) => {
        setDonantes(d);
        setCatalogo(c);
      })
      .catch((e) => setError(e.message));
  }, [abierto]);

  const filtrados = donantes.filter((d) => d.alias.toLowerCase().includes(busqueda.toLowerCase()));

  async function confirmar() {
    if (!donanteSeleccionado || !parteId || !identificador) return;
    setEnviando(true);
    setError(null);
    try {
      await cosecharParte(donanteSeleccionado.id, parteId, identificador, Number(costo || '0'));
      onCosechada();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la cosecha.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal abierto={abierto} titulo="Cosechar parte de donante" onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <Campo label="Buscar donante por alias" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <ul className="max-h-32 overflow-y-auto rounded-md border border-slate-200">
          {filtrados.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">Sin donantes</li>}
          {filtrados.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setDonanteSeleccionado(d)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  donanteSeleccionado?.id === d.id ? 'bg-slate-100 font-semibold' : ''
                }`}
              >
                {etiquetaLaptop(d)}
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1">
          <label htmlFor="parte-cosecha" className="text-sm font-medium text-slate-700">
            Tipo de parte
          </label>
          <select
            id="parte-cosecha"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={parteId}
            onChange={(e) => setParteId(e.target.value)}
          >
            <option value="">Selecciona…</option>
            {catalogo.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        <Campo label="Identificador" value={identificador} onChange={(e) => setIdentificador(e.target.value)} />
        <Campo label="Costo" type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />

        {error && <p className="text-sm text-red-600">{error}</p>}
        <Boton onClick={confirmar} disabled={!donanteSeleccionado || !parteId || !identificador || enviando}>
          Confirmar cosecha
        </Boton>
      </div>
    </Modal>
  );
}
