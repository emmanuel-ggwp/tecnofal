'use client';

import { useEffect, useState } from 'react';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Chip } from '@/ui/Chip';
import { Dinero } from '@/ui/Dinero';
import { Modal } from '@/ui/Modal';
import { Tabla } from '@/ui/Tabla';
import {
  actualizarEspecifica,
  crearEspecifica,
  listarCatalogo,
  listarEspecificas,
  type ParteCatalogo,
  type ParteEspecifica,
} from '@/data/partes';
import { CosecharModal } from './CosecharModal';
import { InstalarModal, type ParteAInstalar } from './InstalarModal';

export function EspecificasTab() {
  const [especificas, setEspecificas] = useState<ParteEspecifica[]>([]);
  const [catalogo, setCatalogo] = useState<ParteCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalAltaAbierto, setModalAltaAbierto] = useState(false);
  const [parteId, setParteId] = useState('');
  const [identificador, setIdentificador] = useState('');
  const [costoReal, setCostoReal] = useState('0');

  const [editando, setEditando] = useState<ParteEspecifica | null>(null);
  const [editIdentificador, setEditIdentificador] = useState('');
  const [editCosto, setEditCosto] = useState('');

  const [cosecharAbierto, setCosecharAbierto] = useState(false);
  const [parteAInstalar, setParteAInstalar] = useState<ParteAInstalar | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const [e, c] = await Promise.all([listarEspecificas(), listarCatalogo()]);
      setEspecificas(e);
      setCatalogo(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las partes específicas');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrirAlta() {
    setParteId('');
    setIdentificador('');
    setCostoReal('0');
    setModalAltaAbierto(true);
  }

  async function guardarAlta() {
    setError(null);
    try {
      await crearEspecifica({ parteId, identificador, costoReal: Number(costoReal || '0') });
      setModalAltaAbierto(false);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la parte específica');
    }
  }

  function abrirEdicion(e: ParteEspecifica) {
    setEditando(e);
    setEditIdentificador(e.identificador ?? '');
    setEditCosto(String(e.costoReal));
  }

  async function guardarEdicion() {
    if (!editando) return;
    setError(null);
    try {
      await actualizarEspecifica(editando.id, { identificador: editIdentificador, costoReal: Number(editCosto) });
      setEditando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al editar la parte específica');
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Partes específicas</h2>
        <div className="flex gap-2">
          <Boton variante="secundario" onClick={() => setCosecharAbierto(true)}>
            Cosechar
          </Boton>
          <Boton onClick={abrirAlta}>+ Nueva parte específica</Boton>
        </div>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <Tabla
          encabezados={['Parte', 'Identificador', 'Costo', 'Origen', 'Asignada a', '']}
          claves={especificas.map((e) => e.id)}
          filas={especificas.map((e) => [
            e.parteNombre,
            e.identificador ?? '—',
            <Dinero key="costo" monto={e.costoReal} />,
            <Chip key="origen" tono={e.origen === 'cosechada' ? 'azul' : 'gris'}>
              {e.origen === 'cosechada' ? 'Cosechada' : 'Compra'}
            </Chip>,
            e.laptopAsignadaAlias ? (
              <a key="asignada" className="text-blue-700 underline" href={`/inventario/${e.laptopAsignadaId}`}>
                {e.laptopAsignadaAlias}
              </a>
            ) : (
              '—'
            ),
            <div key="acciones" className="flex gap-2">
              <Boton variante="secundario" onClick={() => abrirEdicion(e)}>
                Editar
              </Boton>
              {!e.laptopAsignadaId && (
                <Boton
                  onClick={() =>
                    setParteAInstalar({ tipo: 'especifica', id: e.id, nombre: e.parteNombre, costoAplicado: e.costoReal })
                  }
                >
                  Asignar a laptop
                </Boton>
              )}
            </div>,
          ])}
        />
      )}

      <Modal abierto={modalAltaAbierto} titulo="Nueva parte específica" onCerrar={() => setModalAltaAbierto(false)}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="parte-especifica-alta" className="text-sm font-medium text-slate-700">
              Tipo de parte
            </label>
            <select
              id="parte-especifica-alta"
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
          <Campo label="Costo real" type="number" step="0.01" value={costoReal} onChange={(e) => setCostoReal(e.target.value)} />
          <Boton onClick={guardarAlta} disabled={!parteId || !identificador}>
            Agregar parte específica
          </Boton>
        </div>
      </Modal>

      <Modal abierto={!!editando} titulo="Editar parte específica" onCerrar={() => setEditando(null)}>
        <div className="flex flex-col gap-3">
          <Campo label="Identificador (editar)" value={editIdentificador} onChange={(e) => setEditIdentificador(e.target.value)} />
          <Campo
            label="Costo real (editar)"
            type="number"
            step="0.01"
            value={editCosto}
            onChange={(e) => setEditCosto(e.target.value)}
          />
          <Boton onClick={guardarEdicion}>Guardar cambios</Boton>
        </div>
      </Modal>

      <CosecharModal
        abierto={cosecharAbierto}
        onCerrar={() => setCosecharAbierto(false)}
        onCosechada={() => {
          setCosecharAbierto(false);
          cargar();
        }}
      />

      <InstalarModal
        abierto={!!parteAInstalar}
        parte={parteAInstalar}
        onCerrar={() => setParteAInstalar(null)}
        onInstalado={() => {
          setParteAInstalar(null);
          cargar();
        }}
      />
    </div>
  );
}
