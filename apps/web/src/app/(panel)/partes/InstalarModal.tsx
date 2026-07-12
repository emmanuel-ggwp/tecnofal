'use client';

import { useEffect, useState } from 'react';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Dinero } from '@/ui/Dinero';
import { Modal } from '@/ui/Modal';
import {
  etiquetaLaptop,
  instalarParteCommodity,
  instalarParteEspecifica,
  listarLaptopsInstalables,
  type LaptopOpcion,
} from '@/data/partes';

export interface ParteAInstalar {
  tipo: 'commodity' | 'especifica';
  /** id de partes_catalogo (commodity) o de partes_especificas (específica). */
  id: string;
  nombre: string;
  costoAplicado: number;
}

export interface InstalarModalProps {
  abierto: boolean;
  parte: ParteAInstalar | null;
  onCerrar: () => void;
  onInstalado: () => void;
}

/** Modal reusado desde Stock (commodity) y Específicas — elige laptop por alias e instala. */
export function InstalarModal({ abierto, parte, onCerrar, onInstalado }: InstalarModalProps) {
  const [busqueda, setBusqueda] = useState('');
  const [opciones, setOpciones] = useState<LaptopOpcion[]>([]);
  const [seleccionada, setSeleccionada] = useState<LaptopOpcion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setBusqueda('');
    setSeleccionada(null);
    setError(null);
    listarLaptopsInstalables().then(setOpciones).catch((e) => setError(e.message));
  }, [abierto]);

  const filtradas = opciones.filter((o) => o.alias.toLowerCase().includes(busqueda.toLowerCase()));

  async function confirmar() {
    if (!parte || !seleccionada) return;
    setEnviando(true);
    setError(null);
    try {
      if (parte.tipo === 'commodity') {
        await instalarParteCommodity(seleccionada.id, parte.id);
      } else {
        await instalarParteEspecifica(seleccionada.id, parte.id);
      }
      onInstalado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo instalar la parte.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal abierto={abierto} titulo={`Instalar ${parte?.nombre ?? ''}`} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">
          Costo aplicado: <Dinero monto={parte?.costoAplicado ?? null} />
        </p>
        <Campo label="Buscar laptop por alias" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <ul className="max-h-40 overflow-y-auto rounded-md border border-slate-200">
          {filtradas.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">Sin laptops disponibles</li>}
          {filtradas.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setSeleccionada(o)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  seleccionada?.id === o.id ? 'bg-slate-100 font-semibold' : ''
                }`}
              >
                {etiquetaLaptop(o)}
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Boton onClick={confirmar} disabled={!seleccionada || enviando}>
          Confirmar instalación
        </Boton>
      </div>
    </Modal>
  );
}
