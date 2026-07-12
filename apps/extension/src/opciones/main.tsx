// §22: configuración editable EN la extensión — reemplaza a Supabase Studio en Fase 1.
// Todo se guarda en el provider-local (IndexedDB); export/import JSON como respaldo.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { enviar } from '../lib/mensajes';

interface Config {
  parametros: { clave: string; valor: number | null; descripcion: string | null }[];
  precios: { id?: number; cpuTipo: string; genDesde: number; genHasta: number; precioBase: number }[];
  ajustes: { clave: string; delta: number; nota: string | null }[];
  detalles: { nombre: string; deduccionBase: number; categoria?: string }[];
  modelos: { marca: string; modelo: string; ramSoldada: string; reglaCompra: string; motivoRegla?: string | null }[];
  partesRef: { nombre: string; precioReferencia: number; valorNominal: number | null }[];
}

function Opciones() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [filtroModelo, setFiltroModelo] = useState('');
  const [msg, setMsg] = useState('');

  const cargar = () => void enviar<Config>({ tipo: 'config:leer' }).then(setCfg);
  useEffect(cargar, []);
  const aviso = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2500); };

  if (!cfg) return <p>Cargando…</p>;

  const guardarSeccion = async (seccion: 'precios' | 'ajustes' | 'detalles' | 'modelos' | 'partesRef', filas: unknown[]) => {
    await enviar({ tipo: 'config:seccion', seccion, filas });
    aviso('Guardado ✓ (local; el espejo lo recibe al sincronizar)');
    cargar();
  };

  const exportar = async () => {
    const { json } = await enviar<{ json: string }>({ tipo: 'config:exportar' });
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tecnofal-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importar = async (f: File) => {
    const r = await enviar<{ ok?: boolean; error?: string }>({ tipo: 'config:importar', json: await f.text() });
    if (r.error) { aviso(`⚠ ${r.error}`); return; }
    aviso('Importado ✓');
    cargar();
  };

  const modelosFiltrados = cfg.modelos.filter((m) =>
    `${m.marca} ${m.modelo}`.toLowerCase().includes(filtroModelo.toLowerCase()),
  );

  return (
    <div>
      <h1>TecnoFal — Configuración (local-first)</h1>
      <p style={{ color: '#6b7280' }}>
        Todo se edita y guarda en tu navegador; el backend remoto es solo un espejo.
        {msg && <b style={{ color: '#16a34a', marginLeft: 12 }}>{msg}</b>}
      </p>
      <p>
        <button className="primario" onClick={() => void exportar()}>⬇ Exportar respaldo JSON</button>{' '}
        <label style={{ display: 'inline-block' }}>
          <span style={{ background: '#e5e7eb', padding: '5px 10px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>⬆ Importar respaldo</span>
          <input type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && void importar(e.target.files[0])} />
        </label>
      </p>

      <h2>Parámetros</h2>
      <table><tbody>
        {cfg.parametros.map((p, i) => (
          <tr key={p.clave}>
            <td><code>{p.clave}</code></td>
            <td>
              <input
                type="number" step="0.01" value={p.valor ?? ''}
                placeholder="sin valor"
                onChange={(e) => setCfg({ ...cfg, parametros: cfg.parametros.map((x, j) => (j === i ? { ...x, valor: e.target.value === '' ? null : +e.target.value } : x)) })}
                onBlur={(e) => void enviar({ tipo: 'config:parametro', clave: p.clave, valor: e.target.value === '' ? null : +e.target.value }).then(() => aviso('Parámetro guardado ✓'))}
              />
            </td>
          </tr>
        ))}
      </tbody></table>

      <h2>Precios ideales (config base 8GB / 256GB / 14")</h2>
      <table>
        <thead><tr><th>CPU</th><th>Gen desde</th><th>Gen hasta</th><th>Precio base $</th><th /></tr></thead>
        <tbody>
          {cfg.precios.map((p, i) => (
            <tr key={i}>
              <td><select value={p.cpuTipo} onChange={(e) => setCfg({ ...cfg, precios: cfg.precios.map((x, j) => (j === i ? { ...x, cpuTipo: e.target.value } : x)) })}>
                {['i3', 'i5', 'i7', 'ryzen3', 'ryzen5', 'ryzen7', 'otro'].map((c) => <option key={c}>{c}</option>)}
              </select></td>
              {(['genDesde', 'genHasta', 'precioBase'] as const).map((k) => (
                <td key={k}><input type="number" style={{ width: 70 }} value={p[k]} onChange={(e) => setCfg({ ...cfg, precios: cfg.precios.map((x, j) => (j === i ? { ...x, [k]: +e.target.value } : x)) })} /></td>
              ))}
              <td><button onClick={() => setCfg({ ...cfg, precios: cfg.precios.filter((_, j) => j !== i) })}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => setCfg({ ...cfg, precios: [...cfg.precios, { cpuTipo: 'i5', genDesde: 12, genHasta: 12, precioBase: 280 }] })}>+ fila</button>{' '}
      <button className="primario" onClick={() => void guardarSeccion('precios', cfg.precios)}>Guardar precios</button>

      <h2>Ajustes de configuración</h2>
      <table><tbody>
        {cfg.ajustes.map((a, i) => (
          <tr key={a.clave}>
            <td><code>{a.clave}</code></td>
            <td><input type="number" style={{ width: 70 }} value={a.delta} onChange={(e) => setCfg({ ...cfg, ajustes: cfg.ajustes.map((x, j) => (j === i ? { ...x, delta: +e.target.value } : x)) })} /></td>
            <td style={{ color: '#6b7280' }}>{a.nota}</td>
          </tr>
        ))}
      </tbody></table>
      <button className="primario" onClick={() => void guardarSeccion('ajustes', cfg.ajustes)}>Guardar ajustes</button>

      <h2>Detalles / deducciones</h2>
      <datalist id="categorias-detalle">
        {[...new Set(cfg.detalles.map((d) => d.categoria || 'Otro'))].map((c) => <option key={c} value={c} />)}
      </datalist>
      <table>
        <thead><tr><th>Categoría</th><th>Descripción</th><th>Deducción</th><th /></tr></thead>
        <tbody>
        {cfg.detalles.map((d, i) => (
          <tr key={i}>
            <td><input list="categorias-detalle" style={{ width: 90 }} value={d.categoria ?? 'Otro'} onChange={(e) => setCfg({ ...cfg, detalles: cfg.detalles.map((x, j) => (j === i ? { ...x, categoria: e.target.value } : x)) })} /></td>
            <td><input value={d.nombre} onChange={(e) => setCfg({ ...cfg, detalles: cfg.detalles.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })} /></td>
            <td>−$<input type="number" style={{ width: 60 }} value={d.deduccionBase} onChange={(e) => setCfg({ ...cfg, detalles: cfg.detalles.map((x, j) => (j === i ? { ...x, deduccionBase: +e.target.value } : x)) })} /></td>
            <td><button onClick={() => setCfg({ ...cfg, detalles: cfg.detalles.filter((_, j) => j !== i) })}>×</button></td>
          </tr>
        ))}
      </tbody></table>
      <button onClick={() => setCfg({ ...cfg, detalles: [...cfg.detalles, { categoria: 'Otro', nombre: 'Nuevo detalle', deduccionBase: 10 }] })}>+ fila</button>{' '}
      <button className="primario" onClick={() => void guardarSeccion('detalles', cfg.detalles)}>Guardar detalles</button>

      <h2>Partes (precio referencia aterrizado + valor nominal)</h2>
      <table>
        <thead><tr><th>Parte</th><th>Ref. $</th><th>Nominal $</th><th /></tr></thead>
        <tbody>
          {cfg.partesRef.map((d, i) => (
            <tr key={i}>
              <td><input value={d.nombre} onChange={(e) => setCfg({ ...cfg, partesRef: cfg.partesRef.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })} /></td>
              <td><input type="number" style={{ width: 60 }} value={d.precioReferencia} onChange={(e) => setCfg({ ...cfg, partesRef: cfg.partesRef.map((x, j) => (j === i ? { ...x, precioReferencia: +e.target.value } : x)) })} /></td>
              <td><input type="number" style={{ width: 60 }} value={d.valorNominal ?? ''} onChange={(e) => setCfg({ ...cfg, partesRef: cfg.partesRef.map((x, j) => (j === i ? { ...x, valorNominal: e.target.value === '' ? null : +e.target.value } : x)) })} /></td>
              <td><button onClick={() => setCfg({ ...cfg, partesRef: cfg.partesRef.filter((_, j) => j !== i) })}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => setCfg({ ...cfg, partesRef: [...cfg.partesRef, { nombre: 'Nueva parte', precioReferencia: 10, valorNominal: null }] })}>+ fila</button>{' '}
      <button className="primario" onClick={() => void guardarSeccion('partesRef', cfg.partesRef)}>Guardar partes</button>

      <h2>Modelos y reglas de compra ({cfg.modelos.length})</h2>
      <p><input placeholder="filtrar… (ej. 5410, X1, EliteBook)" value={filtroModelo} onChange={(e) => setFiltroModelo(e.target.value)} style={{ width: 280 }} /></p>
      <table>
        <thead><tr><th>Marca</th><th>Modelo</th><th>RAM soldada</th><th>Regla</th><th>Motivo</th><th /></tr></thead>
        <tbody>
          {modelosFiltrados.map((m) => {
            const i = cfg.modelos.indexOf(m);
            return (
              <tr key={`${m.marca}|${m.modelo}`}>
                <td><input style={{ width: 70 }} value={m.marca} onChange={(e) => setCfg({ ...cfg, modelos: cfg.modelos.map((x, j) => (j === i ? { ...x, marca: e.target.value } : x)) })} /></td>
                <td><input style={{ width: 170 }} value={m.modelo} onChange={(e) => setCfg({ ...cfg, modelos: cfg.modelos.map((x, j) => (j === i ? { ...x, modelo: e.target.value } : x)) })} /></td>
                <td><select value={m.ramSoldada} onChange={(e) => setCfg({ ...cfg, modelos: cfg.modelos.map((x, j) => (j === i ? { ...x, ramSoldada: e.target.value } : x)) })}>
                  {['no', 'parcial', 'total', 'revisar'].map((o) => <option key={o}>{o}</option>)}
                </select></td>
                <td><select value={m.reglaCompra} onChange={(e) => setCfg({ ...cfg, modelos: cfg.modelos.map((x, j) => (j === i ? { ...x, reglaCompra: e.target.value } : x)) })}>
                  {['normal', 'condicional', 'bloqueada'].map((o) => <option key={o}>{o}</option>)}
                </select></td>
                <td><input style={{ width: 170 }} value={m.motivoRegla ?? ''} onChange={(e) => setCfg({ ...cfg, modelos: cfg.modelos.map((x, j) => (j === i ? { ...x, motivoRegla: e.target.value || null } : x)) })} /></td>
                <td><button onClick={() => setCfg({ ...cfg, modelos: cfg.modelos.filter((_, j) => j !== i) })}>×</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button onClick={() => setCfg({ ...cfg, modelos: [{ marca: 'Dell', modelo: 'Nuevo modelo', ramSoldada: 'revisar', reglaCompra: 'normal', motivoRegla: null }, ...cfg.modelos] })}>+ fila</button>{' '}
      <button className="primario" onClick={() => void guardarSeccion('modelos', cfg.modelos)}>Guardar modelos</button>

      <p style={{ color: '#9ca3af', marginTop: 30, fontSize: 12 }}>
        Límites del modo local (§22): sin multi-dispositivo; Android no ve estos datos;
        desinstalar la extensión sin exportar pierde lo local. Mitigación: exporta el JSON
        periódicamente y/o inicia sesión para que el sync lo respalde en el espejo.
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Opciones />);
