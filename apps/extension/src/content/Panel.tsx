import { useMemo, useState, type CSSProperties } from 'react';
import {
  evaluar, parseListing,
  type Confianza, type CpuTipo, type EntradaEvaluacion, type MetodoEnvio, type Semaforo,
} from '@tecnofal/core';
import { enviar, type Catalogo, type ListingGuardar } from '../lib/mensajes';
import { faltantesDe, PESO_LAPTOP_KG, VOLUMEN_LAPTOP_PIE3, type Faltante } from '../lib/eval';

const COLORES: Record<Semaforo, string> = { verde: '#16a34a', amarillo: '#d97706', rojo: '#dc2626' };
const CHIP: Record<Confianza, { txt: string; bg: string }> = {
  confirmado: { txt: '✓', bg: '#dcfce7' },
  posible: { txt: '?', bg: '#fef9c3' },
  no_mencionado: { txt: '—', bg: '#fee2e2' },
};

const css: Record<string, CSSProperties> = {
  panel: {
    position: 'fixed', top: 80, right: 12, width: 340, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
    background: '#fff', border: '1px solid #d1d5db', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.18)',
    font: '13px/1.45 system-ui, sans-serif', color: '#111827', zIndex: 2147483647, padding: 12,
  },
  h: { fontWeight: 700, fontSize: 14, margin: '10px 0 4px' },
  fila: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  etiqueta: { width: 110, color: '#374151' },
  input: { width: 70, padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4 },
  boton: { padding: '6px 10px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
};

function Chip({ c }: { c: Confianza }) {
  return (
    <span title={c} style={{ background: CHIP[c].bg, borderRadius: 4, padding: '0 5px', fontSize: 11 }}>
      {CHIP[c].txt}
    </span>
  );
}

export interface PanelProps {
  itemId: string;
  url: string;
  titulo: string;
  textoCompleto: string;
  precioInicial: number | null;
  envioInicial: number;
  catalogo: Catalogo;
}

export function Panel(p: PanelProps) {
  const specs = useMemo(() => parseListing(p.textoCompleto, p.catalogo.modelos), [p.textoCompleto, p.catalogo.modelos]);

  const [abierto, setAbierto] = useState(true);
  const [precio, setPrecio] = useState(p.precioInicial ?? 0);
  const [envioUsa, setEnvioUsa] = useState(p.envioInicial);
  const [metodo, setMetodo] = useState<MetodoEnvio>('barco');
  const [volumen, setVolumen] = useState(VOLUMEN_LAPTOP_PIE3);
  const [peso, setPeso] = useState(PESO_LAPTOP_KG);
  const [cantidad, setCantidad] = useState(1);

  // specs corregibles con un clic — editar = confirmar
  const [cpuTipo, setCpuTipo] = useState<CpuTipo | ''>(specs.cpuTipo.valor ?? '');
  const [cpuGen, setCpuGen] = useState<number | ''>(specs.cpuGen.valor ?? '');
  const [ramGb, setRamGb] = useState<number | ''>(specs.ramGb.valor ?? '');
  const [ssdGb, setSsdGb] = useState<number | ''>(specs.ssdGb.valor ?? '');
  const [pulgadas, setPulgadas] = useState<number | ''>(specs.pantallaPulgadas.valor ?? '');
  const [tactil, setTactil] = useState(specs.pantallaTactil.valor === true);

  const [faltantes, setFaltantes] = useState<Faltante[]>(() => faltantesDe(specs, p.catalogo));
  const [deducciones, setDeducciones] = useState<{ nombre: string; monto: number }[]>([]);
  const [detalleSel, setDetalleSel] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const extras = faltantes.filter((f) => f.falta).reduce((s, f) => s + f.precio, 0);
  const totalDeducciones = deducciones.reduce((s, d) => s + d.monto, 0);

  const entrada: EntradaEvaluacion = {
    precioSubasta: precio, envioUsa, extrasPartes: extras, deducciones: totalDeducciones,
    metodo, volumenPie3: volumen, pesoKg: peso, cantidadLaptops: cantidad,
    cpuTipo: cpuTipo || null, cpuGen: cpuGen === '' ? null : cpuGen,
    ramGb: ramGb === '' ? null : ramGb, ssdGb: ssdGb === '' ? null : ssdGb,
    pantallaPulgadas: pulgadas === '' ? null : pulgadas, pantallaTactil: tactil,
    bloqueado: specs.bloqueos.length > 0,
  };
  const r = useMemo(
    () => evaluar(entrada, p.catalogo.parametros, p.catalogo.precios, p.catalogo.ajustes),
    [JSON.stringify(entrada)], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const listing = (estado: ListingGuardar['estado']): ListingGuardar => ({
    ebayItemId: p.itemId, url: p.url, titulo: p.titulo, precioVisto: precio,
    semaforo: r.semaforo, specs, precioMaxPuja: r.sMax, precioPujaDecente: r.sDecente,
    evaluacionManual: { entrada, faltantes, deducciones }, estado,
  });

  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true); setMensaje(null);
    try {
      const res = (await fn()) as { error?: string } | undefined;
      if (res && res.error) throw new Error(res.error);
      setMensaje(ok);
    } catch (e) {
      setMensaje(`⚠ ${e instanceof Error ? e.message : e}`);
    } finally {
      setOcupado(false);
    }
  };

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        style={{ ...css.boton, position: 'fixed', top: 80, right: 12, zIndex: 2147483647, background: r.semaforo ? COLORES[r.semaforo] : '#6b7280', color: '#fff' }}
      >
        TecnoFal {r.semaforo === 'verde' ? '🟢' : r.semaforo === 'amarillo' ? '🟡' : r.semaforo === 'rojo' ? '🔴' : ''}
      </button>
    );
  }

  return (
    <div style={css.panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 15 }}>TecnoFal</strong>
        <span>
          {!p.catalogo.online && <span title="Sin sesión: usando valores semilla" style={{ marginRight: 8, fontSize: 11, color: '#b45309' }}>modo degradado</span>}
          <button onClick={() => setAbierto(false)} style={{ ...css.boton, background: '#e5e7eb' }}>—</button>
        </span>
      </div>

      {/* Semáforo y salidas */}
      <div style={{ background: r.semaforo ? COLORES[r.semaforo] : '#6b7280', color: '#fff', borderRadius: 8, padding: 10, margin: '8px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          {r.semaforo ? r.semaforo.toUpperCase() : 'SIN DATOS'}
          {r.margen != null && ` · ${(r.margen * 100).toFixed(0)}%`}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 6, fontSize: 12 }}>
          <div>Valor esperado<br /><b style={{ fontSize: 15 }}>{r.valorEsperado != null ? `$${r.valorEsperado.toFixed(0)}` : '—'}</b></div>
          <div>Costo total est.<br /><b style={{ fontSize: 15 }}>${r.cadena.total.toFixed(0)}</b></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 6, fontSize: 12 }}>
          <div title="Hasta aquí, verde (ganancia decente)">S_decente<br /><b style={{ fontSize: 15 }}>{r.sDecente != null ? `$${r.sDecente.toFixed(2)}` : '—'}</b></div>
          <div title="Tope absoluto (ganancia mínima); por encima, rojo">S_max<br /><b style={{ fontSize: 15 }}>{r.sMax != null ? `$${r.sMax.toFixed(2)}` : '—'}</b></div>
        </div>
      </div>

      {specs.bloqueos.map((b) => (
        <div key={b} style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '4px 8px', marginBottom: 4, fontWeight: 600 }}>⛔ {b}</div>
      ))}
      {[...specs.alertas, ...r.advertencias].map((a) => (
        <div key={a} style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 6, padding: '4px 8px', marginBottom: 4 }}>⚠ {a}</div>
      ))}
      {specs.modeloDetectado && (
        <div style={{ color: '#374151', marginBottom: 4 }}>
          Modelo: <b>{specs.modeloDetectado.marca} {specs.modeloDetectado.modelo}</b>
        </div>
      )}

      {/* Specs parseadas, corrección con un clic */}
      <div style={css.h}>Specs (✓ confirmado · ? posible · — no mencionado)</div>
      <div style={css.fila}>
        <span style={css.etiqueta}>CPU <Chip c={specs.cpuTipo.confianza} /></span>
        <select value={cpuTipo} onChange={(e) => setCpuTipo(e.target.value as CpuTipo)} style={css.input}>
          <option value="">—</option>
          {['i3', 'i5', 'i7', 'ryzen3', 'ryzen5', 'ryzen7', 'otro'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={css.etiqueta}>Gen <Chip c={specs.cpuGen.confianza} /></span>
        <input type="number" value={cpuGen} onChange={(e) => setCpuGen(e.target.value === '' ? '' : +e.target.value)} style={{ ...css.input, width: 45 }} />
      </div>
      <div style={css.fila}>
        <span style={css.etiqueta}>RAM GB <Chip c={specs.ramGb.confianza} /></span>
        <input type="number" value={ramGb} onChange={(e) => setRamGb(e.target.value === '' ? '' : +e.target.value)} style={css.input} />
        <span style={css.etiqueta}>SSD GB <Chip c={specs.ssdGb.confianza} /></span>
        <input type="number" value={ssdGb} onChange={(e) => setSsdGb(e.target.value === '' ? '' : +e.target.value)} style={css.input} />
      </div>
      <div style={css.fila}>
        <span style={css.etiqueta}>Pantalla " <Chip c={specs.pantallaPulgadas.confianza} /></span>
        <input type="number" step="0.1" value={pulgadas} onChange={(e) => setPulgadas(e.target.value === '' ? '' : +e.target.value)} style={css.input} />
        <label><input type="checkbox" checked={tactil} onChange={(e) => setTactil(e.target.checked)} /> Táctil</label>
      </div>

      {/* Partes faltantes */}
      <div style={css.h}>Partes faltantes (pesimista hasta confirmar)</div>
      {faltantes.map((f, i) => (
        <div key={f.clave} style={css.fila}>
          <label style={{ ...css.etiqueta, width: 150 }}>
            <input
              type="checkbox" checked={f.falta}
              onChange={(e) => setFaltantes(faltantes.map((x, j) => (j === i ? { ...x, falta: e.target.checked } : x)))}
            /> {f.nombre}
          </label>
          $<input
            type="number" value={f.precio}
            onChange={(e) => setFaltantes(faltantes.map((x, j) => (j === i ? { ...x, precio: +e.target.value } : x)))}
            style={{ ...css.input, width: 55 }}
          />
        </div>
      ))}

      {/* Deducciones por detalles */}
      <div style={css.h}>Detalles / deducciones (−${totalDeducciones})</div>
      {deducciones.map((d, i) => (
        <div key={i} style={css.fila}>
          <span style={{ ...css.etiqueta, width: 150 }}>{d.nombre}</span>
          $<input type="number" value={d.monto} onChange={(e) => setDeducciones(deducciones.map((x, j) => (j === i ? { ...x, monto: +e.target.value } : x)))} style={{ ...css.input, width: 55 }} />
          <button onClick={() => setDeducciones(deducciones.filter((_, j) => j !== i))} style={{ ...css.boton, background: '#fee2e2', padding: '2px 6px' }}>×</button>
        </div>
      ))}
      <div style={css.fila}>
        <select value={detalleSel} onChange={(e) => setDetalleSel(e.target.value)} style={{ ...css.input, width: 180 }}>
          <option value="">+ agregar detalle…</option>
          {p.catalogo.detalles.map((d) => <option key={d.id} value={d.nombre}>{d.nombre} (−${d.deduccionBase})</option>)}
          <option value="__otro__">Otro…</option>
        </select>
        <button
          style={{ ...css.boton, background: '#e5e7eb' }}
          onClick={() => {
            if (!detalleSel) return;
            const cat = p.catalogo.detalles.find((d) => d.nombre === detalleSel);
            setDeducciones([...deducciones, { nombre: cat?.nombre ?? 'Otro', monto: cat?.deduccionBase ?? 10 }]);
            setDetalleSel('');
          }}
        >Añadir</button>
      </div>

      {/* Compra / envío */}
      <div style={css.h}>Costos</div>
      <div style={css.fila}>
        <span style={css.etiqueta}>Subasta $</span>
        <input type="number" value={precio} onChange={(e) => setPrecio(+e.target.value)} style={css.input} />
        <span style={css.etiqueta}>Envío USA $</span>
        <input type="number" value={envioUsa} onChange={(e) => setEnvioUsa(+e.target.value)} style={{ ...css.input, width: 50 }} />
      </div>
      <div style={css.fila}>
        <span style={css.etiqueta}>Método</span>
        <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoEnvio)} style={{ ...css.input, width: 100 }}>
          <option value="barco">Barco (pie³)</option>
          <option value="avion_zoom">Avión Zoom (kg)</option>
        </select>
        {metodo === 'barco'
          ? <>pie³ <input type="number" step="0.1" value={volumen} onChange={(e) => setVolumen(+e.target.value)} style={{ ...css.input, width: 50 }} /></>
          : <>kg <input type="number" step="0.1" value={peso} onChange={(e) => setPeso(+e.target.value)} style={{ ...css.input, width: 50 }} /></>}
      </div>
      <div style={css.fila}>
        <span style={css.etiqueta}>Laptops en lote</span>
        <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Math.max(1, +e.target.value))} style={{ ...css.input, width: 50 }} />
      </div>
      <div style={{ color: '#6b7280', fontSize: 12, margin: '4px 0' }}>
        base ${r.cadena.base.toFixed(2)} → Zinli ${r.cadena.conZinli.toFixed(2)} → eBay ${r.cadena.conEbay.toFixed(2)} + partes ${r.cadena.extras.toFixed(0)} + seguro ${r.cadena.seguro.toFixed(2)} + envío ${r.cadena.envioVzla.toFixed(2)} + revisión ${r.cadena.revision.toFixed(0)}
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button disabled={ocupado} style={{ ...css.boton, background: '#2563eb', color: '#fff', flex: 1 }}
          onClick={() => accion(() => enviar({ tipo: 'listings:guardar', listing: listing('evaluado') }), 'Evaluación guardada ✓')}>
          Guardar
        </button>
        <button disabled={ocupado} style={{ ...css.boton, background: '#e5e7eb', flex: 1 }}
          onClick={() => accion(() => enviar({ tipo: 'listings:guardar', listing: listing('descartado') }), 'Descartado')}>
          Descartar
        </button>
        <button disabled={ocupado} style={{ ...css.boton, background: '#16a34a', color: '#fff', flex: 1 }}
          onClick={() => accion(() => enviar({
            tipo: 'comprar',
            datos: {
              listing: listing('comprado'), envioUsa, cantidad,
              modeloId: specs.modeloDetectado?.id ?? null,
              cpuTipo: cpuTipo || null,
              cpuGen: cpuGen === '' ? null : cpuGen, ramGb: ramGb === '' ? null : ramGb, ssdGb: ssdGb === '' ? null : ssdGb,
              pantallaPulgadas: pulgadas === '' ? null : pulgadas, pantallaTactil: tactil,
              valorEsperado: r.valorEsperado, cadena: r.cadena,
            },
          }), 'Lote creado con estimado congelado ✓')}>
          Comprada
        </button>
      </div>
      {mensaje && <div style={{ marginTop: 6, fontWeight: 600 }}>{mensaje}</div>}
    </div>
  );
}
