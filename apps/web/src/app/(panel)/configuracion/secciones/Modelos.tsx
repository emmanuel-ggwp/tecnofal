'use client';

import { useEffect, useMemo, useState } from 'react';
import { Boton } from '@/ui/Boton';
import { Chip, type TonoChip } from '@/ui/Chip';
import {
  RAM_SOLDADA,
  REGLAS_COMPRA,
  SEVERIDADES_AVISO,
  actualizarModelo,
  crearAviso,
  crearModelo,
  eliminarAviso,
  listarAvisosPorModelo,
  listarModelos,
  listarTiposAviso,
  type Modelo,
  type ModeloAviso,
  type RamSoldada,
  type ReglaCompra,
  type SeveridadAviso,
  type TipoAviso,
} from '@/data/configuracion';
import { CeldaTexto } from './_CeldaTexto';

const TONO_SEVERIDAD: Record<SeveridadAviso, TonoChip> = {
  bloquea: 'rojo',
  condiciona: 'amarillo',
  advierte: 'azul',
  nota: 'gris',
};

export function SeccionModelos() {
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [marca, setMarca] = useState('');
  const [reglaCompra, setReglaCompra] = useState<ReglaCompra | ''>('');
  const [ramSoldada, setRamSoldada] = useState<RamSoldada | ''>('');
  const [expandido, setExpandido] = useState<string | null>(null);
  const [avisosPorModelo, setAvisosPorModelo] = useState<Record<string, ModeloAviso[]>>({});
  const [tiposAviso, setTiposAviso] = useState<TipoAviso[]>([]);
  const [nuevoModelo, setNuevoModelo] = useState({ marca: '', modelo: '' });
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  const cargar = () => {
    listarModelos()
      .then(setModelos)
      .catch((e: Error) => setError(e.message));
  };
  useEffect(cargar, []);
  useEffect(() => {
    listarTiposAviso()
      .then(setTiposAviso)
      .catch(() => setTiposAviso([]));
  }, []);

  const marcas = useMemo(() => [...new Set((modelos ?? []).map((m) => m.marca))].sort(), [modelos]);

  const filtrados = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return (modelos ?? []).filter((m) => {
      if (marca && m.marca !== marca) return false;
      if (reglaCompra && m.reglaCompra !== reglaCompra) return false;
      if (ramSoldada && m.ramSoldada !== ramSoldada) return false;
      if (t && !`${m.marca} ${m.modelo}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [modelos, texto, marca, reglaCompra, ramSoldada]);

  const guardarCampo = async (id: string, cambios: Partial<Omit<Modelo, 'id'>>) => {
    await actualizarModelo(id, cambios);
    setModelos((prev) => prev?.map((m) => (m.id === id ? { ...m, ...cambios } : m)) ?? prev);
  };

  const alta = async () => {
    setErrorAlta(null);
    if (!nuevoModelo.marca.trim() || !nuevoModelo.modelo.trim()) {
      setErrorAlta('Marca y modelo son obligatorios.');
      return;
    }
    try {
      const creado = await crearModelo({
        marca: nuevoModelo.marca.trim(),
        modelo: nuevoModelo.modelo.trim(),
        cpuTipo: null,
        cpuGen: null,
        ramSoldada: 'revisar',
        ssdSoldado: false,
        reglaCompra: 'normal',
        motivoRegla: null,
        notas: null,
      });
      setModelos((prev) => [creado, ...(prev ?? [])]);
      setNuevoModelo({ marca: '', modelo: '' });
    } catch (e) {
      setErrorAlta((e as Error).message);
    }
  };

  const toggleExpandido = async (id: string) => {
    if (expandido === id) {
      setExpandido(null);
      return;
    }
    setExpandido(id);
    if (!avisosPorModelo[id]) {
      const avisos = await listarAvisosPorModelo(id);
      setAvisosPorModelo((prev) => ({ ...prev, [id]: avisos }));
    }
  };

  const agregarAviso = async (modeloId: string, tipoAvisoId: string, severidad: SeveridadAviso, motivo: string) => {
    const creado = await crearAviso({ modeloId, tipoAvisoId, severidad, motivo: motivo.trim() || null });
    setAvisosPorModelo((prev) => ({ ...prev, [modeloId]: [creado, ...(prev[modeloId] ?? [])] }));
  };

  const borrarAviso = async (modeloId: string, avisoId: string) => {
    if (!window.confirm('¿Borrar este aviso?')) return;
    await eliminarAviso(avisoId);
    setAvisosPorModelo((prev) => ({ ...prev, [modeloId]: (prev[modeloId] ?? []).filter((a) => a.id !== avisoId) }));
  };

  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!modelos) return <p className="text-slate-400">Cargando…</p>;

  return (
    <section id="modelos" className="scroll-mt-20">
      <h2 className="text-lg font-bold">Modelos y reglas de compra ({modelos.length})</h2>
      <p className="mb-2 text-sm text-slate-500">
        Catálogo global (lo ven todos los usuarios). Edición inline por fila; expande &quot;Avisos&quot;
        para ver o agregar avisos del modelo.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="modelos-buscador">
            Buscar
          </label>
          <input
            id="modelos-buscador"
            data-testid="modelos-buscador"
            className="w-64 rounded-md border border-slate-300 px-2 py-1 text-sm"
            placeholder="marca o modelo…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="modelos-filtro-marca">
            Marca
          </label>
          <select
            id="modelos-filtro-marca"
            data-testid="modelos-filtro-marca"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
          >
            <option value="">Todas</option>
            {marcas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="modelos-filtro-regla">
            Regla
          </label>
          <select
            id="modelos-filtro-regla"
            data-testid="modelos-filtro-regla"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={reglaCompra}
            onChange={(e) => setReglaCompra(e.target.value as ReglaCompra | '')}
          >
            <option value="">Todas</option>
            {REGLAS_COMPRA.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="modelos-filtro-ram">
            RAM soldada
          </label>
          <select
            id="modelos-filtro-ram"
            data-testid="modelos-filtro-ram"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={ramSoldada}
            onChange={(e) => setRamSoldada(e.target.value as RamSoldada | '')}
          >
            <option value="">Todas</option>
            {RAM_SOLDADA.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="modelo-nuevo-marca">
            Marca
          </label>
          <input
            id="modelo-nuevo-marca"
            data-testid="modelo-nuevo-marca"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={nuevoModelo.marca}
            onChange={(e) => setNuevoModelo((n) => ({ ...n, marca: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="modelo-nuevo-modelo">
            Modelo
          </label>
          <input
            id="modelo-nuevo-modelo"
            data-testid="modelo-nuevo-modelo"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={nuevoModelo.modelo}
            onChange={(e) => setNuevoModelo((n) => ({ ...n, modelo: e.target.value }))}
          />
        </div>
        <Boton data-testid="modelo-nuevo-guardar" onClick={() => void alta()}>
          + Alta manual
        </Boton>
        {errorAlta && <span className="text-sm text-red-600">{errorAlta}</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-3 py-2 font-semibold text-slate-600">Marca</th>
              <th className="px-3 py-2 font-semibold text-slate-600">Modelo</th>
              <th className="px-3 py-2 font-semibold text-slate-600">RAM soldada</th>
              <th className="px-3 py-2 font-semibold text-slate-600">Regla</th>
              <th className="px-3 py-2 font-semibold text-slate-600">Motivo</th>
              <th className="px-3 py-2 font-semibold text-slate-600" />
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  Sin registros
                </td>
              </tr>
            )}
            {filtrados.flatMap((m) => {
              const filaPrincipal = (
                <tr key={m.id} data-testid={`modelo-fila-${m.id}`} className="border-b border-slate-100">
                  <td className="px-3 py-2">{m.marca}</td>
                  <td className="px-3 py-2">{m.modelo}</td>
                  <td className="px-3 py-2">
                    <select
                      data-testid="modelo-ram-select"
                      className="rounded-md border border-slate-300 px-1 py-0.5 text-xs"
                      value={m.ramSoldada}
                      onChange={(e) => void guardarCampo(m.id, { ramSoldada: e.target.value as RamSoldada })}
                    >
                      {RAM_SOLDADA.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      data-testid="modelo-regla-select"
                      className="rounded-md border border-slate-300 px-1 py-0.5 text-xs"
                      value={m.reglaCompra}
                      onChange={(e) => void guardarCampo(m.id, { reglaCompra: e.target.value as ReglaCompra })}
                    >
                      {REGLAS_COMPRA.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <CeldaTexto
                      valor={m.motivoRegla}
                      testId={`modelo-motivo-${m.id}`}
                      onGuardar={(v) => guardarCampo(m.id, { motivoRegla: v })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      data-testid={`modelo-avisos-toggle-${m.id}`}
                      className="text-xs text-slate-600 hover:underline"
                      onClick={() => void toggleExpandido(m.id)}
                    >
                      {expandido === m.id ? '▾ Avisos' : '▸ Avisos'}
                    </button>
                  </td>
                </tr>
              );
              if (expandido !== m.id) return [filaPrincipal];
              const filaAvisos = (
                <tr key={`${m.id}-avisos`}>
                  <td colSpan={6} className="bg-slate-50 px-4 py-3">
                    <PanelAvisos
                      modeloId={m.id}
                      avisos={avisosPorModelo[m.id] ?? []}
                      tiposAviso={tiposAviso}
                      onAgregar={(tipoAvisoId, severidad, motivo) => void agregarAviso(m.id, tipoAvisoId, severidad, motivo)}
                      onBorrar={(avisoId) => void borrarAviso(m.id, avisoId)}
                    />
                  </td>
                </tr>
              );
              return [filaPrincipal, filaAvisos];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PanelAvisos({
  modeloId,
  avisos,
  tiposAviso,
  onAgregar,
  onBorrar,
}: {
  modeloId: string;
  avisos: ModeloAviso[];
  tiposAviso: TipoAviso[];
  onAgregar: (tipoAvisoId: string, severidad: SeveridadAviso, motivo: string) => void;
  onBorrar: (avisoId: string) => void;
}) {
  const [tipoAvisoId, setTipoAvisoId] = useState(tiposAviso[0]?.id ?? '');
  const [severidad, setSeveridad] = useState<SeveridadAviso>('advierte');
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (!tipoAvisoId && tiposAviso[0]) setTipoAvisoId(tiposAviso[0].id);
  }, [tiposAviso, tipoAvisoId]);

  return (
    <div data-testid={`panel-avisos-${modeloId}`}>
      <h4 className="mb-2 text-sm font-semibold text-slate-700">Avisos</h4>
      {avisos.length === 0 && <p className="text-sm text-slate-400">Sin avisos.</p>}
      <ul className="mb-3 flex flex-col gap-1">
        {avisos.map((a) => (
          <li key={a.id} data-testid={`aviso-fila-${a.id}`} className="flex items-center gap-2 text-sm">
            <Chip tono={TONO_SEVERIDAD[a.severidad]}>{a.severidad}</Chip>
            <span className="text-slate-500">{tiposAviso.find((t) => t.id === a.tipoAvisoId)?.nombre ?? a.tipoAvisoId}</span>
            <span data-testid={`aviso-motivo-${a.id}`}>{a.motivo ?? '—'}</span>
            <button
              type="button"
              data-testid={`aviso-borrar-${a.id}`}
              className="text-xs text-red-600 hover:underline"
              onClick={() => onBorrar(a.id)}
            >
              Borrar
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor={`aviso-tipo-${modeloId}`}>
            Tipo
          </label>
          <select
            id={`aviso-tipo-${modeloId}`}
            data-testid="aviso-nuevo-tipo"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={tipoAvisoId}
            onChange={(e) => setTipoAvisoId(e.target.value)}
          >
            {tiposAviso.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor={`aviso-severidad-${modeloId}`}>
            Severidad
          </label>
          <select
            id={`aviso-severidad-${modeloId}`}
            data-testid="aviso-nuevo-severidad"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={severidad}
            onChange={(e) => setSeveridad(e.target.value as SeveridadAviso)}
          >
            {SEVERIDADES_AVISO.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor={`aviso-motivo-nuevo-${modeloId}`}>
            Motivo
          </label>
          <input
            id={`aviso-motivo-nuevo-${modeloId}`}
            data-testid="aviso-nuevo-motivo"
            className="w-56 rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        <Boton
          data-testid="aviso-nuevo-guardar"
          onClick={() => {
            if (tipoAvisoId) {
              onAgregar(tipoAvisoId, severidad, motivo);
              setMotivo('');
            }
          }}
        >
          + Agregar aviso
        </Boton>
      </div>
    </div>
  );
}
