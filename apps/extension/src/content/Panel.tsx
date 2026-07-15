import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ajustePantalla, ajusteRam, ajusteSsd, avisosDeVendedor, evaluar, parseListing, precioBasePara,
  type AvisoVendedor, type Confianza, type CpuTipo, type DetalleCat, type EntradaEvaluacion, type MetodoEnvio, type ModeloInfo, type Semaforo,
} from '@tecnofal/core';
import { enviar, type Catalogo, type ListingGuardar } from '../lib/mensajes';
import { deduccionesSugeridas, faltantesDe, PESO_LAPTOP_KG, VOLUMEN_LAPTOP_PIE3, type Faltante } from '../lib/eval';
import { useSeccionesPersistidas } from '../lib/uiState';

const COLORES: Record<Semaforo, string> = { verde: '#16a34a', amarillo: '#d97706', rojo: '#dc2626' };
const CHIP: Record<Confianza, { txt: string; bg: string }> = {
  confirmado: { txt: '✓', bg: '#dcfce7' },
  posible: { txt: '?', bg: '#fef9c3' },
  no_mencionado: { txt: '—', bg: '#fee2e2' },
};

const css: Record<string, CSSProperties> = {
  panel: {
    position: 'fixed', top: 0, right: 0, width: 340, height: '100vh', overflowY: 'auto',
    background: '#fff', borderLeft: '1px solid #d1d5db', boxShadow: '-4px 0 16px rgba(0,0,0,.12)',
    font: '13px/1.45 system-ui, sans-serif', color: '#111827', zIndex: 2147483647, padding: 12, boxSizing: 'border-box',
  },
  h: { fontWeight: 700, fontSize: 14, margin: '10px 0 4px' },
  fila: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  etiqueta: { width: 110, color: '#374151' },
  input: { width: 70, padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4 },
  boton: { padding: '6px 10px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
};

/** Specs editables desde los chips del encabezado */
type ClaveSpec = 'cpuTipo' | 'cpuGen' | 'ramGb' | 'ssdGb' | 'pantalla';

// Sección colapsable: encabezado clicable con ▾/▸.
function Seccion({ titulo, abierta, onToggle, children }: {
  titulo: ReactNode; abierta: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <div>
      <div
        style={{ ...css.h, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        onClick={onToggle}
      >
        <span>{titulo}</span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{abierta ? '▾' : '▸'}</span>
      </div>
      {abierta && children}
    </div>
  );
}

// Campo click-to-edit: si el valor ya está establecido, muestra un chip compacto;
// un clic lo cambia al control editable (children), y perder el foco vuelve a compactar.
function Campo({ valorTexto, establecido, children }: {
  valorTexto: string; establecido: boolean; children: ReactNode;
}) {
  const [editando, setEditando] = useState(!establecido);
  const abrioPorClicRef = useRef(false);
  const contRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (editando && abrioPorClicRef.current && contRef.current) {
      contRef.current.querySelector<HTMLElement>('input, select, textarea')?.focus();
      abrioPorClicRef.current = false;
    }
  }, [editando]);

  if (!editando) {
    return (
      <button
        onClick={() => { abrioPorClicRef.current = true; setEditando(true); }}
        style={{ ...css.boton, background: '#f3f4f6', color: '#111827', fontWeight: 500, padding: '2px 8px', border: '1px solid #e5e7eb' }}
      >
        {valorTexto} ✎
      </button>
    );
  }
  return (
    <span ref={contRef} onBlur={(e) => { if (!contRef.current?.contains(e.relatedTarget as Node)) setEditando(false); }}>
      {children}
    </span>
  );
}

/** Nombres de los items que el picker muestra por defecto (sección "specs", sin expandir "ver otros") */
const SPECS_PINNED = [
  'Tecla(s) faltante(s)', 'Carcasa marcada',
  'Solo 4GB RAM', 'Solo 128GB SSD', 'Solo 128GB HDD',
  'RAM soldada', 'SSD soldado',
];

/** Etiqueta legible para una categoría de detalle (el enum DB usa minúscula) */
const LABEL_CAT: Record<string, string> = {
  specs: 'Specs', carcasa: 'Carcasa', pantalla: 'Pantalla',
  puertos: 'Puertos', bateria: 'Batería', teclado: 'Teclado',
  touchpad: 'Touchpad', audio: 'Audio', otro: 'Otro',
};

function DetallePicker({ catalogo, onAgregar, onCrearNuevo }: {
  catalogo: { detalles: DetalleCat[] };
  onAgregar: (d: DetalleCat) => void;
  onCrearNuevo: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [otrosAbiertos, setOtrosAbiertos] = useState(false);
  const [hovNombre, setHovNombre] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Cierre al hacer clic fuera (composedPath para funcionar dentro de Shadow DOM)
  useEffect(() => {
    if (!abierto) return;
    const onDown = (e: MouseEvent) => {
      const path = e.composedPath();
      if (
        (btnRef.current && !path.includes(btnRef.current)) &&
        (dropRef.current && !path.includes(dropRef.current))
      ) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [abierto]);

  const abrir = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const margen = 8;
      const alturaDeseada = 340;
      const espacioAbajo = window.innerHeight - r.bottom - margen;
      const espacioArriba = r.top - margen;
      if (espacioAbajo >= alturaDeseada || espacioAbajo >= espacioArriba) {
        setPos({ top: r.bottom + 4, left: r.left, width: r.width, maxHeight: Math.max(140, Math.min(alturaDeseada, espacioAbajo)) });
      } else {
        setPos({ bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width, maxHeight: Math.max(140, Math.min(alturaDeseada, espacioArriba)) });
      }
    }
    setAbierto(true);
  };

  const specsItems = SPECS_PINNED
    .map((n) => catalogo.detalles.find((d) => d.nombre === n))
    .filter((d): d is DetalleCat => d != null);
  const otrosItems = catalogo.detalles.filter((d) => !SPECS_PINNED.includes(d.nombre));
  const otrosCats = [...new Set(otrosItems.map((d) => d.categoria))].sort();

  const q = busqueda.trim().toLowerCase();
  const filtrar = (lista: DetalleCat[]) => (q ? lista.filter((d) => d.nombre.toLowerCase().includes(q)) : lista);

  const cerrar = () => { setAbierto(false); setBusqueda(''); setOtrosAbiertos(false); };

  const renderItem = (d: DetalleCat) => (
    <div
      key={d.id ?? d.nombre}
      onMouseDown={() => { onAgregar(d); cerrar(); }}
      onMouseEnter={() => setHovNombre(d.nombre)}
      onMouseLeave={() => setHovNombre(null)}
      style={{
        padding: '5px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: hovNombre === d.nombre ? '#f0f9ff' : 'transparent',
        borderBottom: '1px solid #f3f4f6', fontSize: 12,
      }}
    >
      <span style={{ color: '#111827' }}>{d.nombre}</span>
      {d.deduccionBase > 0 && <span style={{ color: '#9ca3af', fontSize: 11 }}>−${d.deduccionBase}</span>}
    </div>
  );

  const specsVisible = filtrar(specsItems);
  const otrosVisible = filtrar(otrosItems);
  const hayBusqueda = q !== '';

  return (
    <>
      <button
        ref={btnRef}
        onClick={abierto ? cerrar : abrir}
        style={{ ...css.boton, background: '#e5e7eb', textAlign: 'left' }}
      >
        + agregar detalle… ▾
      </button>
      {abierto && pos && (
        <div
          ref={dropRef}
          style={{
            position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left,
            width: Math.max(pos.width, 260), maxHeight: pos.maxHeight, overflowY: 'auto',
            background: '#fff', border: '1px solid #d1d5db', borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,.18)', zIndex: 2147483646,
          }}
        >
          {/* Buscador */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 4, position: 'sticky', top: 0, background: '#fff' }}>
            <input
              autoFocus
              placeholder="buscar…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') cerrar(); }}
              style={{ ...css.input, flex: 1, width: 'auto', fontSize: 12 }}
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} style={{ ...css.boton, background: '#e5e7eb', padding: '2px 7px' }}>×</button>
            )}
          </div>
          {/* Specs + búsqueda combinada */}
          {hayBusqueda ? (
            [...specsVisible, ...otrosVisible].map(renderItem)
          ) : (
            <>
              {specsItems.map(renderItem)}
              <div
                onClick={() => setOtrosAbiertos(!otrosAbiertos)}
                style={{ padding: '5px 10px', cursor: 'pointer', color: '#6b7280', fontSize: 11, borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
              >
                {otrosAbiertos ? '▾' : '▸'} ver otros ({otrosItems.length})
              </div>
              {otrosAbiertos && otrosCats.map((cat) => (
                <div key={cat}>
                  <div style={{ padding: '3px 10px', fontSize: 10, color: '#9ca3af', fontWeight: 700, background: '#f9fafb', textTransform: 'uppercase', letterSpacing: 1 }}>{LABEL_CAT[cat] ?? cat}</div>
                  {otrosItems.filter((d) => d.categoria === cat).map(renderItem)}
                </div>
              ))}
            </>
          )}
          {/* Crear nuevo */}
          <div
            onMouseDown={() => { onCrearNuevo(); cerrar(); }}
            style={{ padding: '6px 10px', cursor: 'pointer', color: '#2563eb', borderTop: '1px solid #e5e7eb', fontSize: 12, fontWeight: 500 }}
          >
            + Otro… (crear nuevo)
          </div>
        </div>
      )}
    </>
  );
}

// Tooltip hover: muestra a la izquierda del elemento una tabla de desglose (motivo/monto) + total.
function TooltipTabla({ trigger, filas, total, notaFinal }: {
  trigger: ReactNode;
  filas: { motivo: string; monto: number }[];
  total: number;
  notaFinal?: string;
}) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  return (
    <span
      ref={ref}
      style={{ cursor: 'help' }}
      onMouseEnter={() => {
        if (ref.current) {
          const r = ref.current.getBoundingClientRect();
          setPos({ top: r.top, right: window.innerWidth - r.left + 8 });
        }
        setHover(true);
      }}
      onMouseLeave={() => setHover(false)}
    >
      {trigger}
      {hover && pos && (
        <div style={{
          position: 'fixed', top: pos.top, right: pos.right, zIndex: 2147483646,
          background: '#fff', color: '#111827', border: '1px solid #d1d5db', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,.18)', padding: '8px 10px', fontSize: 12, minWidth: 210,
          fontWeight: 400, textAlign: 'left',
        }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 10px 2px 0', color: '#374151', whiteSpace: 'nowrap' }}>{f.motivo}</td>
                  <td style={{ padding: '2px 0', textAlign: 'right', color: f.monto < 0 ? '#dc2626' : '#111827' }}>
                    {f.monto >= 0 ? '+' : '−'}${Math.abs(f.monto).toFixed(0)}
                  </td>
                </tr>
              ))}
              <tr><td colSpan={2} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 4 }} /></tr>
              <tr>
                <td style={{ padding: '2px 10px 0 0', fontWeight: 700 }}>Total</td>
                <td style={{ padding: '2px 0 0', textAlign: 'right', fontWeight: 700 }}>${total.toFixed(0)}</td>
              </tr>
            </tbody>
          </table>
          {notaFinal && <div style={{ marginTop: 4, color: '#6b7280', fontSize: 11 }}>{notaFinal}</div>}
        </div>
      )}
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
  vendedor: string | null;
  vendedorPctPositivo: number | null;
  vendedorTotalVentas: number | null;
  cantidadOfertas: number | null;
  catalogo: Catalogo;
  /** estado guardado antes de abrir esta página (null = primera vez) */
  estadoPrevio: string | null;
  /** motivo del descarte guardado (null = sin motivo o no descartada) */
  motivoDescartePrevio: string | null;
  /** evaluación completa guardada — al reabrir, el panel restaura tus ajustes */
  guardado: ListingGuardar | null;
}

/** forma del JSON evaluacionManual que persiste el propio panel */
interface EvalGuardada {
  entrada?: Partial<EntradaEvaluacion>;
  faltantes?: Faltante[];
  deducciones?: { nombre: string; monto: number; cantidad: number }[];
  bloqueosDescartados?: string[];
}

// distinción nuevo / solo visto / guardado al menos una vez (§16)
const ESTADO_CHIP: Record<string, { txt: string; bg: string; fg: string }> = {
  nuevo: { txt: 'NUEVO', bg: '#e0f2fe', fg: '#075985' },
  visto: { txt: 'visto antes', bg: '#f3f4f6', fg: '#4b5563' },
  evaluado: { txt: '✓ guardado (evaluado)', bg: '#dbeafe', fg: '#1e40af' },
  comprado: { txt: '✓ comprado', bg: '#dcfce7', fg: '#166534' },
  descartado: { txt: 'descartado', bg: '#fee2e2', fg: '#991b1b' },
};

export function Panel(p: PanelProps) {
  const [catalogo, setCatalogo] = useState(p.catalogo);
  // Restauración: si esta publicación ya fue guardada, tus ajustes mandan sobre el parseo
  const ev: EvalGuardada | null = (p.guardado?.evaluacionManual as EvalGuardada | null) ?? null;
  const eg = ev?.entrada ?? null;
  // corrección manual del modelo (buscador): manda sobre la detección automática
  const [modeloOverride, setModeloOverride] = useState<ModeloInfo | null>(null);
  const specs = useMemo(
    () => parseListing(p.textoCompleto, catalogo.modelos, p.titulo, modeloOverride, catalogo.parametros.bateriaPctUmbral),
    [p.textoCompleto, p.titulo, catalogo.modelos, modeloOverride, catalogo.parametros.bateriaPctUmbral],
  );

  // avisos curados sobre el vendedor (nunca se muestra nombre/%/ventas en crudo)
  const avisosVendedor: AvisoVendedor[] = useMemo(
    () => avisosDeVendedor({
      vendedor: p.vendedor,
      vendedorPctPositivo: p.vendedorPctPositivo,
      vendedorTotalVentas: p.vendedorTotalVentas,
      cantidadOfertas: p.cantidadOfertas,
      vendedoresConocidos: catalogo.vendedoresConocidos,
      vendedoresBateria: catalogo.vendedoresBateria,
    }),
    [p.vendedor, p.vendedorPctPositivo, p.vendedorTotalVentas, p.cantidadOfertas, catalogo.vendedoresConocidos, catalogo.vendedoresBateria],
  );

  // este listing trae % de batería en el título/descripción → alimenta la lista global de vendedores
  // (optimista: refleja el aviso ya en este mismo listado, sin esperar a recargar la página)
  useEffect(() => {
    if (specs.bateriaPct.valor != null && p.vendedor) {
      const vNorm = p.vendedor.trim().toLowerCase();
      if (vNorm) {
        setCatalogo((c) => (c.vendedoresBateria?.includes(vNorm)
          ? c
          : { ...c, vendedoresBateria: [...(c.vendedoresBateria ?? []), vNorm] }));
      }
      void enviar({ tipo: 'vendedor:marcarBateria', vendedor: p.vendedor }).catch(() => {});
    }
  }, [specs.bateriaPct.valor, p.vendedor]);

  const [abierto, setAbierto] = useState(true);
  // Los chips del encabezado muestran todo: la sección solo se abre para editar
  const [specsAbierta, setSpecsAbierta] = useState(false);
  const { abiertas: seccionesAbiertas, toggle: toggleSeccion } = useSeccionesPersistidas();
  // precio/envío: siempre lo VIVO de la página (la subasta se mueve); lo guardado es fallback
  const [precio, setPrecio] = useState(p.precioInicial ?? eg?.precioSubasta ?? 0);
  const [envioUsa, setEnvioUsa] = useState(p.envioInicial);
  const [metodo, setMetodo] = useState<MetodoEnvio>((eg?.metodo as MetodoEnvio) ?? 'barco');
  const [envioVzlaU, setEnvioVzlaU] = useState(eg?.envioVzlaPorUnidad ?? catalogo.parametros.envioVzlaPorLaptop);
  const [volumen] = useState(VOLUMEN_LAPTOP_PIE3);
  const [peso] = useState(PESO_LAPTOP_KG);
  const [cantidad, setCantidad] = useState(
    eg?.cantidadLaptops ?? (specs.cantidadLote && specs.cantidadLote > 1 ? specs.cantidadLote : 1),
  );

  // specs corregibles con un clic — editar = confirmar; lo guardado manda sobre el parseo
  const [cpuTipo, setCpuTipo] = useState<CpuTipo | ''>((eg?.cpuTipo as CpuTipo) ?? specs.cpuTipo.valor ?? '');
  const [cpuGen, setCpuGen] = useState<number | ''>(eg?.cpuGen ?? specs.cpuGen.valor ?? '');
  const [ramGb, setRamGb] = useState<number | ''>(eg?.ramGb ?? specs.ramGb.valor ?? '');
  const [ssdGb, setSsdGb] = useState<number | ''>(eg?.ssdGb ?? specs.ssdGb.valor ?? '');
  // pantalla: base 14" (13.3 cuenta como 14); opciones 12.5 / 14 / 15.6 / 17
  const bucketDe = (v: number | null): '12.5' | '14' | '15.6' | '17' =>
    v == null ? '14' : v <= 12.9 ? '12.5' : v < 15 ? '14' : v < 16.5 ? '15.6' : '17';
  // Valor base manual: se usa solo cuando el catálogo no reconoce la CPU/gen (sin fila en precios_ideales)
  const [baseManual, setBaseManual] = useState<number | ''>('');
  const [pulgadas, setPulgadas] = useState<number>(eg?.pantallaPulgadas ?? specs.pantallaPulgadas.valor ?? 14);
  const [pantallas, setPantallas] = useState<Record<'12.5' | '14' | '15.6' | '17', number>>(() => {
    const b = { '12.5': 0, '14': 0, '15.6': 0, '17': 0 };
    if (eg?.pantallas && eg.pantallas.length > 0) {
      for (const bu of eg.pantallas) b[bucketDe(bu.pulgadas)] += bu.cantidad;
      return b;
    }
    b[bucketDe(specs.pantallaPulgadas.valor)] = specs.cantidadLote && specs.cantidadLote > 1 ? specs.cantidadLote : 1;
    return b;
  });
  const [tactil, setTactil] = useState(eg?.pantallaTactil ?? (specs.pantallaTactil.valor === true));

  // editar = confirmar: al cerrar el editor de un chip la spec queda confirmada
  const [confirmadas, setConfirmadas] = useState<Record<ClaveSpec, boolean>>(() => ({
    cpuTipo: eg ? eg.cpuTipo != null : specs.cpuTipo.confianza === 'confirmado',
    cpuGen: eg ? eg.cpuGen != null : specs.cpuGen.confianza === 'confirmado',
    ramGb: eg ? eg.ramGb != null : specs.ramGb.confianza === 'confirmado',
    ssdGb: eg ? eg.ssdGb != null : specs.ssdGb.confianza === 'confirmado',
    pantalla: eg ? eg.pantallaPulgadas != null || (eg.pantallas?.length ?? 0) > 0 : specs.pantallaPulgadas.confianza === 'confirmado',
  }));
  const [editandoSpec, setEditandoSpec] = useState<ClaveSpec | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editandoSpec) editorRef.current?.querySelector<HTMLElement>('input, select')?.focus();
  }, [editandoSpec]);

  const [faltantes, setFaltantes] = useState<Faltante[]>(
    () => ev?.faltantes ?? faltantesDe(specs, catalogo, specs.cantidadLote && specs.cantidadLote > 1 ? specs.cantidadLote : 1),
  );
  const [deducciones, setDeducciones] = useState<{ nombre: string; monto: number; cantidad: number }[]>(
    () => ev?.deducciones ?? deduccionesSugeridas(specs, catalogo),
  );
  // Cerrar el editor de una spec: si tiene valor, queda confirmada; RAM/SSD confirmadas dejan de faltar
  const cerrarEditor = () => {
    if (!editandoSpec) return;
    const k = editandoSpec;
    const vacia =
      k === 'cpuTipo' ? cpuTipo === '' :
      k === 'cpuGen' ? cpuGen === '' :
      k === 'ramGb' ? ramGb === '' :
      k === 'ssdGb' ? ssdGb === '' : false;
    if (!vacia) {
      setConfirmadas((c) => ({ ...c, [k]: true }));
      if (k === 'ramGb' || k === 'ssdGb') {
        const clave = k === 'ramGb' ? 'ram' : 'ssd';
        setFaltantes((fs) => fs.map((f) => (f.clave === clave ? { ...f, cantidad: 0 } : f)));
      }
    }
    setEditandoSpec(null);
  };

  // "Otro…": crear detalle permanente (categoría + descripción) sin salir del flujo
  const [creandoDetalle, setCreandoDetalle] = useState(false);
  const [detCategoria, setDetCategoria] = useState('Otro');
  const [detCategoriaNueva, setDetCategoriaNueva] = useState('');
  const [detNombre, setDetNombre] = useState('');
  const [detMonto, setDetMonto] = useState(10);
  const [detPermanente, setDetPermanente] = useState(true);
  const [detUnidades, setDetUnidades] = useState(1);
  const [detMarcarModelo, setDetMarcarModelo] = useState(false);
  const [detSeveridad, setDetSeveridad] = useState<'bloquea' | 'condiciona' | 'advierte' | 'nota'>('advierte');
  // aviso ⚑ → detalle: deducción opcional al marcar el modelo
  const [avisoDeduccion, setAvisoDeduccion] = useState<number | ''>('');
  const [avisoCategoria, setAvisoCategoria] = useState('Otro');
  const [avisoUnidades, setAvisoUnidades] = useState(1);
  const categorias = useMemo(
    () => [...new Set(catalogo.detalles.map((d) => d.categoria || 'Otro'))],
    [catalogo.detalles],
  );
  // bloqueos descartados con ×: sigo evaluando aunque la regla diga que no (se restauran al reabrir)
  const [descartados, setDescartados] = useState<string[]>(() => ev?.bloqueosDescartados ?? []);
  // avisos amarillos (alertas/advertencias) cerrados con ×: solo ocultan el mensaje, no cambian el cálculo
  const [avisosCerrados, setAvisosCerrados] = useState<string[]>([]);
  // 🚫 descarte con motivo (ej. "bisagra dañada" visto en la descripción)
  const [motivoDescarte, setMotivoDescarte] = useState<string | null>(p.motivoDescartePrevio);
  const [descartando, setDescartando] = useState(false);
  const [motivoInput, setMotivoInput] = useState('');
  // buscador de modelo (corrección manual de la detección)
  const [buscandoModelo, setBuscandoModelo] = useState(false);
  const [buscaModelo, setBuscaModelo] = useState('');
  const coincidenciasModelo = useMemo(() => {
    const q = buscaModelo.trim().toLowerCase();
    if (!q) return [];
    return catalogo.modelos
      .filter((mo) => `${mo.marca} ${mo.modelo}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [buscaModelo, catalogo.modelos]);
  const aplicarModelo = (mo: ModeloInfo) => {
    setModeloOverride(mo);
    setBuscandoModelo(false);
    // si la CPU no está confirmada, adoptar la asumida del modelo elegido
    if (!confirmadas.cpuTipo && mo.cpuTipo) setCpuTipo(mo.cpuTipo);
    if (!confirmadas.cpuGen && mo.cpuGen != null) setCpuGen(mo.cpuGen);
  };
  // §23: ⚑ marcar este modelo
  const [marcando, setMarcando] = useState(false);
  const [tipoSel, setTipoSel] = useState('');
  const [tipoNuevo, setTipoNuevo] = useState('');
  const [sevSel, setSevSel] = useState<'bloquea' | 'condiciona' | 'advierte' | 'nota'>('advierte');
  const [motivoAviso, setMotivoAviso] = useState('');
  const [alcance, setAlcance] = useState<'solo' | 'familia'>('solo');
  const [familiaTxt, setFamiliaTxt] = useState('');
  const sugerirFamilia = (modelo: string): string => {
    const m = modelo.match(/(\d{3,4})/);
    if (!m) return modelo;
    const n = parseInt(m[1], 10);
    return [n, n + 1, n + 10, n + 11].map((x) => modelo.replace(m[1], String(x))).join(', ');
  };
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Panel acoplado: reduce el ancho útil de eBay en vez de flotar encima
  useEffect(() => {
    const html = document.documentElement;
    const previo = html.style.marginRight;
    html.style.marginRight = abierto ? '354px' : '';
    return () => { html.style.marginRight = previo; };
  }, [abierto]);

  const extras = faltantes.reduce((s, f) => s + f.precio * Math.min(f.cantidad, cantidad), 0);
  const totalDeducciones = deducciones.reduce((s, d) => s + d.monto * Math.min(d.cantidad, cantidad), 0);

  const entrada: EntradaEvaluacion = {
    precioSubasta: precio, envioUsa, extrasPartes: extras, deducciones: totalDeducciones,
    metodo, envioVzlaPorUnidad: envioVzlaU, volumenPie3: volumen, pesoKg: peso, cantidadLaptops: cantidad,
    cpuTipo: cpuTipo || null, cpuGen: cpuGen === '' ? null : cpuGen,
    ramGb: ramGb === '' ? null : ramGb, ssdGb: ssdGb === '' ? null : ssdGb,
    pantallaPulgadas: cantidad === 1 ? pulgadas : null,
    pantallas: cantidad > 1
      ? (() => {
          let resto = cantidad;
          return (['12.5', '14', '15.6', '17'] as const).map((k) => {
            const c = Math.min(pantallas[k], resto);
            resto -= c;
            return { pulgadas: Number(k), cantidad: c };
          }).filter((b) => b.cantidad > 0);
        })()
      : undefined,
    pantallaTactil: tactil,
    bloqueado: specs.bloqueos.some((b) => !descartados.includes(b)) || avisosVendedor.some((a) => a.tipo === 'bloquea'),
  };
  // ¿El catálogo reconoce esta CPU/gen? Si no, habilitamos un "Valor base" manual.
  const precioBaseCatalogo = useMemo(
    () => precioBasePara(entrada.cpuTipo, entrada.cpuGen, catalogo.precios, catalogo.ajustes),
    [entrada.cpuTipo, entrada.cpuGen, catalogo.precios, catalogo.ajustes],
  );
  const sinBase = precioBaseCatalogo == null;
  // Cuando no hay fila en precios_ideales y el usuario tecleó un valor base, inyectamos una fila sintética
  // para esta CPU/gen exacta: el core la calza como coincidencia exacta y recalcula todo (ajustes incluidos).
  const preciosEval = useMemo(() => {
    if (!sinBase || baseManual === '' || entrada.cpuTipo == null || entrada.cpuGen == null) return catalogo.precios;
    return [
      { cpuTipo: entrada.cpuTipo, genDesde: entrada.cpuGen, genHasta: entrada.cpuGen, precioBase: Number(baseManual) },
      ...catalogo.precios,
    ];
  }, [sinBase, baseManual, entrada.cpuTipo, entrada.cpuGen, catalogo.precios]);
  const r = useMemo(
    () => evaluar(entrada, catalogo.parametros, preciosEval, catalogo.ajustes),
    [JSON.stringify(entrada), preciosEval], // recalcular cuando cambia cualquier campo de la entrada o el base manual
  );

  const ganancia = r.valorEsperado != null ? r.valorEsperado - r.cadena.total : null;
  // toggle lote / unidad: por defecto por unidad (solo relevante cuando cantidad > 1)
  const [verPorUnidad, setVerPorUnidad] = useState(true);
  const valorMostrar = verPorUnidad && cantidad > 1 ? r.valorEsperadoUnidad : r.valorEsperado;
  const costoMostrar = verPorUnidad && cantidad > 1 ? r.costoPorUnidad : r.cadena.total;
  const gananciaMostrar = valorMostrar != null ? valorMostrar - costoMostrar : null;

  // desglose de "Valor esperado" para el tooltip hover: precio base + cada ajuste − cada deducción
  const desglose = useMemo(() => {
    if (r.precioBase == null) return null;
    const n = Math.max(cantidad, 1);
    const filas: { motivo: string; monto: number }[] = [{ motivo: 'Precio base', monto: r.precioBase * n }];
    const ram = ajusteRam(entrada.ramGb, catalogo.ajustes);
    if (ram) filas.push({ motivo: `RAM ${entrada.ramGb}GB`, monto: ram * n });
    const ssd = ajusteSsd(entrada.ssdGb, catalogo.ajustes);
    if (ssd) filas.push({ motivo: `SSD ${entrada.ssdGb}GB`, monto: ssd * n });
    if (tactil && catalogo.ajustes['pantalla_tactil']) {
      filas.push({ motivo: 'Pantalla táctil', monto: (catalogo.ajustes['pantalla_tactil'] ?? 0) * n });
    }
    if (entrada.pantallas && entrada.pantallas.length > 0) {
      for (const b of entrada.pantallas) {
        const adj = ajustePantalla(b.pulgadas, catalogo.ajustes);
        if (adj) filas.push({ motivo: `Pantalla ${b.pulgadas}" ×${b.cantidad}`, monto: adj * b.cantidad });
      }
    } else if (cantidad === 1) {
      const adj = ajustePantalla(entrada.pantallaPulgadas, catalogo.ajustes);
      if (adj) filas.push({ motivo: entrada.pantallaPulgadas! >= 15 ? 'Pantalla grande' : 'Pantalla pequeña', monto: adj });
    }
    for (const d of deducciones) {
      const cant = Math.min(d.cantidad, cantidad);
      if (cant > 0 && d.monto) filas.push({ motivo: cant > 1 ? `${d.nombre} ×${cant}` : d.nombre, monto: -d.monto * cant });
    }
    return filas;
  }, [r.precioBase, entrada.ramGb, entrada.ssdGb, entrada.pantallas, entrada.pantallaPulgadas, tactil, cantidad, catalogo.ajustes, deducciones]);

  // explicación del margen (tooltip del ícono ⓘ en el semáforo)
  const notaMargen = r.valorEsperado != null && r.margen != null
    ? `margen = (valor esperado $${r.valorEsperado.toFixed(0)} − costo $${r.cadena.total.toFixed(0)}) ÷ $${r.cadena.total.toFixed(0)} = ${(r.margen * 100).toFixed(1)}%\numbral: ≥${(catalogo.parametros.gananciaDecente * 100).toFixed(0)}% verde · ≥${(catalogo.parametros.gananciaMinima * 100).toFixed(0)}% amarillo · menos, rojo`
    : null;
  const iconoNota = notaMargen
    ? <span title={notaMargen} style={{ cursor: 'help', marginLeft: 4, opacity: 0.85 }}>ⓘ</span>
    : null;

  const [estadoActual, setEstadoActual] = useState(p.estadoPrevio ?? 'nuevo');

  // el motivo de descarte solo se persiste cuando el estado es 'descartado'
  const listing = (estado: ListingGuardar['estado'], motivo: string | null = estado === 'descartado' ? motivoDescarte : null): ListingGuardar => ({
    ebayItemId: p.itemId, url: p.url, titulo: p.titulo, precioVisto: precio,
    semaforo: r.semaforo, specs, precioMaxPuja: r.sMax, precioPujaDecente: r.sDecente,
    cantidadLaptops: cantidad,
    costoEstimadoTotal: r.cadena.total,
    valorEsperadoTotal: r.valorEsperado,
    evaluacionManual: { entrada, faltantes, deducciones, bloqueosDescartados: descartados, motivoDescarte: motivo }, estado,
    // sin esto, cualquier acción del panel (guardar/comprar/descartar) borraría a null el
    // countdown ya capturado por marcarVisto() al abrir la página — nunca se re-captura aquí.
    fechaFinSubasta: p.guardado?.fechaFinSubasta ?? null,
    // estos sí se re-capturan en cada acción: listing.tsx siempre re-scrapea al abrir la página
    vendedor: p.vendedor,
    vendedorPctPositivo: p.vendedorPctPositivo,
    vendedorTotalVentas: p.vendedorTotalVentas,
    cantidadOfertas: p.cantidadOfertas,
  });

  const accion = async (fn: () => Promise<unknown>, ok: string, alOk?: () => void) => {
    setOcupado(true); setMensaje(null);
    try {
      const res = (await fn()) as { error?: string } | undefined;
      if (res && res.error) throw new Error(res.error);
      setMensaje(ok);
      alOk?.();
    } catch (e) {
      setMensaje(`⚠ ${e instanceof Error ? e.message : e}`);
    } finally {
      setOcupado(false);
    }
  };

  const confianzaChip = (k: ClaveSpec): Confianza => {
    if (confirmadas[k]) return 'confirmado';
    const spec = k === 'cpuTipo' ? specs.cpuTipo : k === 'cpuGen' ? specs.cpuGen
      : k === 'ramGb' ? specs.ramGb : k === 'ssdGb' ? specs.ssdGb : specs.pantallaPulgadas;
    return spec.confianza;
  };
  const chipSpec = (k: ClaveSpec, texto: string) => {
    const c = confianzaChip(k);
    return (
      <button
        key={k}
        title={`${c} — clic para editar`}
        onClick={(e) => {
          e.stopPropagation();
          setSpecsAbierta(true);
          if (!(k === 'pantalla' && cantidad > 1)) setEditandoSpec(k);
        }}
        style={{ background: CHIP[c].bg, border: 'none', borderRadius: 4, padding: '1px 6px', fontSize: 11, cursor: 'pointer', color: '#111827' }}
      >
        {texto} {CHIP[c].txt}
      </button>
    );
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 15 }}>TecnoFal</strong>
          {(() => {
            const ch = ESTADO_CHIP[estadoActual] ?? ESTADO_CHIP.nuevo;
            return (
              <span
                title={estadoActual === 'nuevo' ? 'Nunca guardado' : `Ya registrado: ${estadoActual}`}
                style={{ background: ch.bg, color: ch.fg, borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}
              >
                {ch.txt}
              </span>
            );
          })()}
        </span>
        <span>
          {!catalogo.online && <span title="Sin sesión: usando valores semilla" style={{ marginRight: 8, fontSize: 11, color: '#b45309' }}>modo degradado</span>}
          <button onClick={() => setAbierto(false)} style={{ ...css.boton, background: '#e5e7eb' }}>—</button>
        </span>
      </div>

      {/* Semáforo y salidas */}
      <div style={{ background: r.semaforo ? COLORES[r.semaforo] : '#6b7280', color: '#fff', borderRadius: 8, padding: 10, margin: '8px 0', textAlign: 'center' }}>
        {r.sDecente != null ? (
          <>
            <div style={{ fontSize: 12, opacity: 0.95 }}>
              Puja máxima para ganancia decente (≥{(catalogo.parametros.gananciaDecente * 100).toFixed(0)}%){iconoNota}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>${r.sDecente.toFixed(2)}</div>
            {r.margen != null && (
              <div style={{ fontSize: 11, opacity: 0.9 }}>margen al precio actual: {(r.margen * 100).toFixed(0)}%</div>
            )}
          </>
        ) : r.sMax != null ? (
          <>
            <div style={{ fontSize: 12, opacity: 0.95 }}>
              Ganancia decente (≥{(catalogo.parametros.gananciaDecente * 100).toFixed(0)}%) inalcanzable — mínimo (≥{(catalogo.parametros.gananciaMinima * 100).toFixed(0)}%) hasta:{iconoNota}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>${r.sMax.toFixed(2)}</div>
            {r.margen != null && (
              <div style={{ fontSize: 11, opacity: 0.9 }}>margen al precio actual: {(r.margen * 100).toFixed(0)}%</div>
            )}
          </>
        ) : (
          r.margen != null
            ? <div style={{ fontSize: 11, opacity: 0.9 }}>margen al precio actual: {(r.margen * 100).toFixed(0)}%{ganancia != null && <> · ganancia est. {ganancia >= 0 ? '+' : '−'}${Math.abs(ganancia).toFixed(0)}</>}</div>
            : <div style={{ fontSize: 13, fontWeight: 700 }}>SIN DATOS</div>
        )}
        {cantidad > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6, gap: 2 }}>
            <button
              onClick={() => setVerPorUnidad(true)}
              style={{ ...css.boton, background: verPorUnidad ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.2)', color: '#fff', padding: '2px 10px', fontSize: 11, fontWeight: verPorUnidad ? 700 : 500 }}
            >por unidad</button>
            <button
              onClick={() => setVerPorUnidad(false)}
              style={{ ...css.boton, background: !verPorUnidad ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.2)', color: '#fff', padding: '2px 10px', fontSize: 11, fontWeight: !verPorUnidad ? 700 : 500 }}
            >lote ×{cantidad}</button>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 6, fontSize: 12 }}>
          <div>
            {desglose ? (
              <TooltipTabla
                trigger={<>{verPorUnidad && cantidad > 1 ? 'Valor/laptop' : 'Valor esperado'}</>}
                filas={desglose}
                total={r.valorEsperado ?? 0}
                notaFinal={cantidad > 1 ? `≈ $${(r.valorEsperadoUnidad ?? 0).toFixed(0)} / laptop` : undefined}
              />
            ) : (
              verPorUnidad && cantidad > 1 ? 'Valor/laptop' : 'Valor esperado'
            )}
            <br /><b style={{ fontSize: 15 }}>{valorMostrar != null ? `$${valorMostrar.toFixed(0)}` : '—'}</b>
          </div>
          <div>{verPorUnidad && cantidad > 1 ? 'Costo/laptop' : 'Costo total est.'}<br /><b style={{ fontSize: 15 }}>${costoMostrar.toFixed(0)}</b></div>
        </div>
        {r.sMax == null && r.sinPujaMotivo && !sinBase ? (
          <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, background: 'rgba(0,0,0,.25)', borderRadius: 6, padding: '4px 6px' }}>
            🚫 {r.sinPujaMotivo}
          </div>
        ) : (
          <>
            {sinBase && r.sinPujaMotivo && (
              <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, background: 'rgba(0,0,0,.25)', borderRadius: 6, padding: '4px 6px' }}>
                🚫 {r.sinPujaMotivo}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 6, fontSize: 12 }}>
              {sinBase ? (
                <div title="El sistema no reconoce esta CPU/generación (sin fila en precios_ideales). Escribe un valor base manual para calcular; 💾 lo guarda para no repetirlo.">
                  Valor base<br />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      min={0}
                      value={baseManual}
                      onChange={(e) => setBaseManual(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="—"
                      style={{ width: 58, fontSize: 15, fontWeight: 700, textAlign: 'center', border: 'none', borderRadius: 4, padding: '1px 2px', background: 'rgba(255,255,255,.92)', color: '#111827' }}
                    />
                    {baseManual !== '' && cpuTipo && cpuGen !== '' && (
                      <button
                        title="Guardar como fila en precios_ideales para esta CPU/generación (no volver a teclearlo)"
                        disabled={ocupado}
                        onClick={() => {
                          const gen = Number(cpuGen);
                          const filas = [...catalogo.precios, { cpuTipo, genDesde: gen, genHasta: gen, precioBase: Number(baseManual) }];
                          void accion(
                            () => enviar<{ ok?: boolean; error?: string }>({ tipo: 'config:seccion', seccion: 'precios', filas }),
                            `✔ Base $${Number(baseManual)} guardada para ${cpuTipo} gen ${gen}`,
                            () => setCatalogo({ ...catalogo, precios: filas }),
                          );
                        }}
                        style={{ ...css.boton, background: 'rgba(255,255,255,.92)', color: '#111827', padding: '2px 6px', fontSize: 12 }}
                      >💾</button>
                    )}
                  </span>
                </div>
              ) : (
                <div title="Hasta aquí, verde (ganancia decente)">S_decente<br /><b style={{ fontSize: 15 }}>{r.sDecente != null ? `${r.sDecente.toFixed(2)}` : '—'}</b></div>
              )}
              <div title="Valor esperado − costo total estimado, al precio actual">Ganancia est.<br /><b style={{ fontSize: 15 }}>{gananciaMostrar != null ? `${gananciaMostrar >= 0 ? '+' : '−'}$${Math.abs(gananciaMostrar).toFixed(0)}` : '—'}</b></div>
            </div>
          </>
        )}
        {r.semaforo === 'amarillo' && r.sDecente != null && (
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,.22)', borderRadius: 6, padding: '4px 8px' }}>
            ✔ COMPRABLE — margen mínimo: supera tu ganancia mínima ({(catalogo.parametros.gananciaMinima * 100).toFixed(0)}%),
            no alcanza la decente ({(catalogo.parametros.gananciaDecente * 100).toFixed(0)}%).
            A subasta ≤ ${r.sDecente.toFixed(2)} sería verde.
          </div>
        )}
      </div>

      {specs.bloqueos.filter((b) => !descartados.includes(b)).map((b) => (
        <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '4px 8px', marginBottom: 4, fontWeight: 600 }}>
          <span style={{ flex: 1 }}>⛔ Bloqueada: {b}</span>
          <button
            title="Descartar este aviso y seguir evaluando (ej. donante o falso positivo)"
            onClick={() => setDescartados([...descartados, b])}
            style={{ ...css.boton, background: '#fecaca', color: '#7f1d1d', padding: '1px 7px' }}
          >×</button>
        </div>
      ))}
      {[...specs.alertas, ...r.advertencias].filter((a) => !avisosCerrados.includes(a)).map((a) => (
        <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fef9c3', color: '#854d0e', borderRadius: 6, padding: '4px 8px', marginBottom: 4 }}>
          <span style={{ flex: 1 }}>⚠ {a}</span>
          <button
            title="Cerrar este aviso"
            onClick={() => setAvisosCerrados([...avisosCerrados, a])}
            style={{ ...css.boton, background: '#fde68a', color: '#78350f', padding: '1px 7px' }}
          >×</button>
        </div>
      ))}

      {/* ✓ comprada: banner permanente; la evaluación quedó congelada en el lote */}
      {estadoActual === 'comprado' && (
        <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '6px 10px', marginBottom: 4, fontWeight: 600 }}>
          ✅ Ya la compraste — el lote quedó registrado con el estimado congelado.
          <div style={{ fontWeight: 400, fontSize: 12, marginTop: 2 }}>
            Los botones de guardar/comprar están bloqueados para no duplicar el lote ni pisar la evaluación.
          </div>
        </div>
      )}

      {/* 🚫 descartada: banner con el motivo; × la reactiva */}
      {estadoActual === 'descartado' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '4px 8px', marginBottom: 4, fontWeight: 600 }}>
          <span style={{ flex: 1 }}>🚫 Descartada por ti{motivoDescarte ? `: ${motivoDescarte}` : ''}</span>
          <button
            title="Reactivar: quitar el descarte y su motivo"
            disabled={ocupado}
            onClick={() => accion(
              () => enviar({ tipo: 'listings:guardar', listing: listing('visto', null) }),
              'Descarte quitado',
              () => { setMotivoDescarte(null); setEstadoActual('visto'); },
            )}
            style={{ ...css.boton, background: '#fecaca', color: '#7f1d1d', padding: '1px 7px' }}
          >×</button>
        </div>
      )}
      <div style={{ color: '#374151', marginBottom: 4 }}>
        Modelo:{' '}
        {!buscandoModelo ? (
          <>
            <b>{specs.modeloDetectado ? `${specs.modeloDetectado.marca} ${specs.modeloDetectado.modelo}` : '—'}</b>{' '}
            <button
              title="Buscar/corregir el modelo detectado"
              onClick={() => { setBuscandoModelo(true); setBuscaModelo(''); }}
              style={{ ...css.boton, background: '#f3f4f6', border: '1px solid #e5e7eb', padding: '1px 7px', fontSize: 12, fontWeight: 500 }}
            >✎</button>{' '}
            {specs.modeloDetectado && (
              <button
                title="Registrar un aviso sobre este modelo (RAM soldada, carcasa, bisagras…)"
                onClick={() => {
                  setMarcando(!marcando);
                  setFamiliaTxt(sugerirFamilia(specs.modeloDetectado!.modelo));
                }}
                style={{ ...css.boton, background: '#fde68a', padding: '1px 8px', fontSize: 12 }}
              >⚑ marcar</button>
            )}
          </>
        ) : (
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <input
              autoFocus
              placeholder="buscar modelo… (ej. 9360)"
              value={buscaModelo}
              onChange={(e) => setBuscaModelo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setBuscandoModelo(false); }}
              style={{ ...css.input, width: 190 }}
            />
            <button onClick={() => setBuscandoModelo(false)} style={{ ...css.boton, background: '#e5e7eb', padding: '2px 7px', marginLeft: 4 }}>×</button>
            {buscaModelo.trim() !== '' && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 10, width: 250, maxHeight: 190, overflowY: 'auto',
                background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, boxShadow: '0 4px 10px rgba(0,0,0,.15)',
              }}>
                {coincidenciasModelo.length === 0 && <div style={{ padding: '4px 8px', color: '#6b7280' }}>sin coincidencias</div>}
                {coincidenciasModelo.map((mo) => (
                  <div
                    key={`${mo.marca}|${mo.modelo}`}
                    onMouseDown={() => aplicarModelo(mo)}
                    style={{ padding: '4px 8px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
                  >
                    {mo.marca} {mo.modelo}
                    {mo.reglaCompra === 'bloqueada' && <span style={{ color: '#dc2626' }}> ⛔</span>}
                    {mo.ramSoldada === 'total' && <span style={{ color: '#b45309' }}> RAM soldada</span>}
                  </div>
                ))}
              </div>
            )}
          </span>
        )}
      </div>
      {specs.bateriaPct.valor != null && !avisosCerrados.includes('bateria-pct') && (() => {
        const ok = specs.bateriaPct.valor > catalogo.parametros.bateriaPctUmbral;
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, borderRadius: 6, padding: '4px 8px',
            background: ok ? '#dcfce7' : '#fef9c3', color: ok ? '#166534' : '#854d0e', fontWeight: 600,
          }}>
            <span style={{ flex: 1 }}>
              🔋 Batería: {specs.bateriaPct.valor}%{' '}
              {ok ? '— no hace falta cambiarla' : `— ≤${catalogo.parametros.bateriaPctUmbral}%: conviene presupuestar nueva`}
            </span>
            <button
              title="Cerrar este aviso"
              onClick={() => setAvisosCerrados([...avisosCerrados, 'bateria-pct'])}
              style={{ ...css.boton, background: ok ? '#bbf7d0' : '#fde68a', color: ok ? '#14532d' : '#78350f', padding: '1px 7px' }}
            >×</button>
          </div>
        );
      })()}
      {avisosVendedor.map((a, i) => (
        <div
          key={`${a.tipo}-${i}`}
          style={{
            ...(a.tipo === 'bloquea' ? { background: '#fee2e2', color: '#991b1b' }
              : a.tipo === 'advierte' ? { background: '#fef9c3', color: '#854d0e' }
              : { background: '#dcfce7', color: '#166534' }),
            borderRadius: 6, padding: '4px 8px', marginBottom: 4, fontWeight: a.tipo === 'bloquea' ? 600 : 400,
          }}
        >
          {a.tipo === 'bloquea' ? '⛔' : a.tipo === 'advierte' ? '⚠' : '✓'} {a.texto}
        </div>
      ))}
      {marcando && specs.modeloDetectado && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 8, marginBottom: 6 }}>
          <div style={css.fila}>
            <select value={tipoSel} onChange={(e) => setTipoSel(e.target.value)} style={{ ...css.input, width: 150 }}>
              <option value="">Tipo de aviso…</option>
              {(catalogo.tiposAviso ?? []).map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
              <option value="__nuevo__">+ Crear tipo nuevo…</option>
            </select>
            <select value={sevSel} onChange={(e) => setSevSel(e.target.value as typeof sevSel)} style={{ ...css.input, width: 105 }}>
              <option value="bloquea">🔴 bloquea</option>
              <option value="condiciona">🟡 condiciona</option>
              <option value="advierte">⚠ advierte</option>
              <option value="nota">📝 nota</option>
            </select>
          </div>
          {tipoSel === '__nuevo__' && (
            <div style={css.fila}>
              <input placeholder="nombre del tipo nuevo" value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value)} style={{ ...css.input, width: '100%' }} />
            </div>
          )}
          <div style={css.fila}>
            <input placeholder="motivo corto (ej. la tapa se desgasta fácil)" value={motivoAviso} onChange={(e) => setMotivoAviso(e.target.value)} style={{ ...css.input, width: '100%' }} />
          </div>
          <div style={css.fila}>
            <label><input type="radio" checked={alcance === 'solo'} onChange={() => setAlcance('solo')} /> solo este modelo</label>
            <label><input type="radio" checked={alcance === 'familia'} onChange={() => setAlcance('familia')} /> familia:</label>
          </div>
          <div style={{ ...css.fila, flexWrap: 'wrap' }}>
            <span style={{ color: '#374151' }} title="Si lo llenas, se crea también un detalle permanente en el catálogo y se aplica a esta evaluación">deducción $ (opcional)</span>
            <input
              type="number" min={0} value={avisoDeduccion}
              onChange={(e) => setAvisoDeduccion(e.target.value === '' ? '' : +e.target.value)}
              style={{ ...css.input, width: 55 }}
            />
            {avisoDeduccion !== '' && (
              <select value={avisoCategoria} onChange={(e) => setAvisoCategoria(e.target.value)} style={{ ...css.input, width: 100 }}>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                {!categorias.includes('Otro') && <option value="Otro">Otro</option>}
              </select>
            )}
            {avisoDeduccion !== '' && cantidad > 1 && (
              <>
                <span style={{ color: '#6b7280' }}>×</span>
                <input
                  type="number" min={1} max={cantidad} value={avisoUnidades}
                  onChange={(e) => setAvisoUnidades(Math.max(1, Math.min(cantidad, +e.target.value)))}
                  style={{ ...css.input, width: 42 }}
                />
                <span style={{ color: '#6b7280' }}>de {cantidad}</span>
              </>
            )}
          </div>
          {alcance === 'familia' && (
            <input value={familiaTxt} onChange={(e) => setFamiliaTxt(e.target.value)} style={{ ...css.input, width: '100%', marginBottom: 4 }} title="Modelos separados por coma — edita/confirma la sugerencia" />
          )}
          <button
            disabled={ocupado || (!tipoSel || (tipoSel === '__nuevo__' && !tipoNuevo.trim()))}
            style={{ ...css.boton, background: '#d97706', color: '#fff' }}
            onClick={() => accion(async () => {
              const lista = alcance === 'familia'
                ? familiaTxt.split(',').map((x) => x.trim()).filter(Boolean)
                : [specs.modeloDetectado!.modelo];
              const r = await enviar<{ ok?: boolean; reevaluados?: number; error?: string }>({
                tipo: 'modelo:marcar',
                datos: {
                  marca: specs.modeloDetectado!.marca,
                  modelos: lista,
                  tipoClave: tipoSel === '__nuevo__' ? null : tipoSel,
                  tipoNuevoNombre: tipoSel === '__nuevo__' ? tipoNuevo.trim() : null,
                  severidad: sevSel,
                  motivo: motivoAviso.trim(),
                },
              });
              if (r.error) throw new Error(r.error);
              // aviso → detalle: si se indicó deducción, crear el detalle permanente y aplicarlo aquí
              if (avisoDeduccion !== '' && avisoDeduccion > 0) {
                const nombreDet = motivoAviso.trim()
                  || (tipoSel === '__nuevo__' ? tipoNuevo.trim() : (catalogo.tiposAviso ?? []).find((t) => t.clave === tipoSel)?.nombre)
                  || 'Aviso de modelo';
                const rd = await enviar<{ ok?: boolean; error?: string }>({
                  tipo: 'detalle:crear',
                  detalle: { categoria: avisoCategoria, nombre: nombreDet, deduccionBase: avisoDeduccion },
                });
                if (rd?.error) throw new Error(rd.error);
                setDeducciones((ds) => [...ds, { nombre: nombreDet, monto: avisoDeduccion, cantidad: Math.min(avisoUnidades, cantidad) }]);
                setAvisoDeduccion('');
                setAvisoUnidades(1);
              }
              setMarcando(false);
              setCatalogo(await enviar({ tipo: 'catalogo' }));
              return r;
            }, `⚑ Aviso guardado — listings del modelo re-evaluados`)}
          >Guardar aviso</button>
        </div>
      )}

      {/* Specs como chips compactos en el encabezado; clic en un chip abre su editor abajo */}
      <Seccion
        titulo={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            Specs
            {chipSpec('cpuTipo', `CPU ${cpuTipo || '—'}`)}
            {chipSpec('cpuGen', `Gen ${cpuGen === '' ? '—' : cpuGen}`)}
            {chipSpec('ramGb', `RAM ${ramGb === '' ? '—' : `${ramGb}GB`}`)}
            {chipSpec('ssdGb', `SSD ${ssdGb === '' ? '—' : `${ssdGb}GB`}`)}
            {chipSpec('pantalla', cantidad === 1 ? `${pulgadas}"` : 'Pantallas')}
            <button
              title="Alternar táctil"
              onClick={(e) => { e.stopPropagation(); setTactil(!tactil); }}
              style={{ background: tactil ? '#dcfce7' : '#f3f4f6', border: 'none', borderRadius: 4, padding: '1px 6px', fontSize: 11, cursor: 'pointer', color: '#111827' }}
            >
              {tactil ? '☑' : '☐'} Táctil
            </button>
          </span>
        }
        abierta={specsAbierta}
        onToggle={() => setSpecsAbierta(!specsAbierta)}
      >
        {editandoSpec && (
          <div
            ref={editorRef}
            style={css.fila}
            onBlur={(e) => { if (!editorRef.current?.contains(e.relatedTarget as Node)) cerrarEditor(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') cerrarEditor(); }}
          >
            {editandoSpec === 'cpuTipo' && (
              <>
                <span style={css.etiqueta}>CPU</span>
                <select value={cpuTipo} onChange={(e) => setCpuTipo(e.target.value as CpuTipo)} style={css.input}>
                  <option value="">—</option>
                  {['i3', 'i5', 'i7', 'ryzen3', 'ryzen5', 'ryzen7', 'otro'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </>
            )}
            {editandoSpec === 'cpuGen' && (
              <>
                <span style={css.etiqueta}>Gen</span>
                <input type="number" value={cpuGen} onChange={(e) => setCpuGen(e.target.value === '' ? '' : +e.target.value)} style={{ ...css.input, width: 45 }} />
              </>
            )}
            {editandoSpec === 'ramGb' && (
              <>
                <span style={css.etiqueta}>RAM GB</span>
                <input type="number" value={ramGb} onChange={(e) => setRamGb(e.target.value === '' ? '' : +e.target.value)} style={css.input} />
              </>
            )}
            {editandoSpec === 'ssdGb' && (
              <>
                <span style={css.etiqueta}>SSD GB</span>
                <input type="number" value={ssdGb} onChange={(e) => setSsdGb(e.target.value === '' ? '' : +e.target.value)} style={css.input} />
              </>
            )}
            {editandoSpec === 'pantalla' && cantidad === 1 && (
              <>
                <span style={css.etiqueta}>Pantalla</span>
                <select value={String(pulgadas)} onChange={(e) => setPulgadas(+e.target.value)} style={{ ...css.input, width: 70 }}>
                  {['12.5', '13.3', '14', '15.6', '17'].map((o) => <option key={o} value={o}>{o}"</option>)}
                </select>
              </>
            )}
            <button onClick={cerrarEditor} style={{ ...css.boton, background: '#e5e7eb', padding: '2px 8px' }}>✓</button>
          </div>
        )}
        {cantidad > 1 && (
          <div style={{ ...css.fila, flexWrap: 'wrap' }}>
            {(['12.5', '14', '15.6', '17'] as const).map((k) => (
              <span key={k} style={{ fontSize: 12, color: '#374151' }}>
                {k}" <input
                  type="number" min={0} max={cantidad} value={pantallas[k]}
                  onChange={(e) => setPantallas({ ...pantallas, [k]: Math.max(0, Math.min(cantidad, +e.target.value)) })}
                  style={{ ...css.input, width: 36 }}
                />
              </span>
            ))}
            <span style={{ fontSize: 11, color: '#6b7280' }}>(sin asignar = 14")</span>
          </div>
        )}
      </Seccion>

      {/* Partes faltantes */}
      <Seccion
        titulo={cantidad > 1
          ? `Partes faltantes — cuántas unidades del lote de ${cantidad} necesitan cada una (pesimista: todas)`
          : 'Partes faltantes'}
        abierta={seccionesAbiertas.partesFaltantes}
        onToggle={() => toggleSeccion('partesFaltantes')}
      >
        {faltantes
          // RAM/SSD confirmadas CON valor en Specs ya no faltan: se ocultan (confirmada ausente, ej. "No HDD", sigue visible)
          .filter((f) => (
            f.clave === 'ram' ? !(confirmadas.ramGb && ramGb !== '')
            : f.clave === 'ssd' ? !(confirmadas.ssdGb && ssdGb !== '' && ssdGb > 0)
            : true
          ))
          .map((f) => (
          <div key={f.clave} style={css.fila}>
            <label style={{ ...css.etiqueta, width: cantidad > 1 ? 105 : 150 }}>
              <input
                type="checkbox" checked={Math.min(f.cantidad, cantidad) > 0}
                onChange={(e) => setFaltantes(faltantes.map((x) => (x.clave === f.clave ? { ...x, cantidad: e.target.checked ? cantidad : 0 } : x)))}
              /> {f.nombre}
            </label>
            {cantidad > 1 && (
              <>
                <input
                  type="number" min={0} max={cantidad} value={Math.min(f.cantidad, cantidad)}
                  onChange={(e) => setFaltantes(faltantes.map((x) => (x.clave === f.clave ? { ...x, cantidad: Math.max(0, Math.min(cantidad, +e.target.value)) } : x)))}
                  style={{ ...css.input, width: 42 }}
                />
                <span style={{ color: '#6b7280' }}>de {cantidad} ·</span>
              </>
            )}
            $<Campo valorTexto={String(f.precio)} establecido>
              <input
                type="number" value={f.precio}
                onChange={(e) => setFaltantes(faltantes.map((x) => (x.clave === f.clave ? { ...x, precio: +e.target.value } : x)))}
                style={{ ...css.input, width: 55 }}
              />
            </Campo>
          </div>
        ))}
      </Seccion>

      {/* Deducciones por detalles */}
      <Seccion
        titulo={`Detalles / deducciones (−${totalDeducciones} total)`}
        abierta={seccionesAbiertas.detalles}
        onToggle={() => toggleSeccion('detalles')}
      >
        {deducciones.map((d, i) => (
          <div key={i} style={css.fila}>
            <span style={{ ...css.etiqueta, width: cantidad > 1 ? 105 : 150 }}>{d.nombre}</span>
            $<Campo valorTexto={String(d.monto)} establecido>
              <input type="number" value={d.monto} onChange={(e) => setDeducciones(deducciones.map((x, j) => (j === i ? { ...x, monto: +e.target.value } : x)))} style={{ ...css.input, width: 55 }} />
            </Campo>
            {cantidad > 1 && (
              <>
                <span style={{ color: '#6b7280' }}>×</span>
                <input
                  type="number" min={1} max={cantidad} value={Math.min(d.cantidad, cantidad)}
                  onChange={(e) => setDeducciones(deducciones.map((x, j) => (j === i ? { ...x, cantidad: Math.max(1, Math.min(cantidad, +e.target.value)) } : x)))}
                  style={{ ...css.input, width: 42 }}
                />
                <span style={{ color: '#6b7280' }}>de {cantidad}</span>
              </>
            )}
            <button onClick={() => setDeducciones(deducciones.filter((_, j) => j !== i))} style={{ ...css.boton, background: '#fee2e2', padding: '2px 6px' }}>×</button>
          </div>
        ))}
        <DetallePicker
          catalogo={catalogo}
          onAgregar={(d) => setDeducciones([...deducciones, { nombre: d.nombre, monto: d.deduccionBase, cantidad: 1 }])}
          onCrearNuevo={() => setCreandoDetalle(true)}
        />
        {creandoDetalle && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, marginTop: 4 }}>
            <div style={css.fila}>
              <select value={detCategoria} onChange={(e) => setDetCategoria(e.target.value)} style={{ ...css.input, width: 110 }}>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                {!categorias.includes('Otro') && <option value="Otro">Otro</option>}
                <option value="__nueva__">+ nueva…</option>
              </select>
              {detCategoria === '__nueva__' && (
                <input placeholder="categoría" value={detCategoriaNueva} onChange={(e) => setDetCategoriaNueva(e.target.value)} style={{ ...css.input, width: 90 }} />
              )}
              <span style={{ color: '#374151' }}>−$</span>
              <input type="number" value={detMonto} onChange={(e) => setDetMonto(+e.target.value)} style={{ ...css.input, width: 55 }} />
            </div>
            <div style={css.fila}>
              <input
                autoFocus
                placeholder="descripción (ej. Puerto de carga defectuoso)"
                value={detNombre}
                onChange={(e) => setDetNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setCreandoDetalle(false); }}
                style={{ ...css.input, width: '100%' }}
              />
            </div>
            {cantidad > 1 && (
              <div style={css.fila}>
                <span style={{ color: '#374151' }}>unidades afectadas</span>
                <input
                  type="number" min={1} max={cantidad} value={detUnidades}
                  onChange={(e) => setDetUnidades(Math.max(1, Math.min(cantidad, +e.target.value)))}
                  style={{ ...css.input, width: 42 }}
                />
                <span style={{ color: '#6b7280' }}>de {cantidad}</span>
              </div>
            )}
            <div style={{ ...css.fila, flexWrap: 'wrap' }}>
              <label><input type="checkbox" checked={detPermanente} onChange={(e) => setDetPermanente(e.target.checked)} /> guardar en el catálogo</label>
              {specs.modeloDetectado && (
                <label title={`Crear también un aviso ⚑ para ${specs.modeloDetectado.marca} ${specs.modeloDetectado.modelo}`}>
                  <input type="checkbox" checked={detMarcarModelo} onChange={(e) => setDetMarcarModelo(e.target.checked)} /> ⚑ marcar modelo
                </label>
              )}
              {detMarcarModelo && (
                <select value={detSeveridad} onChange={(e) => setDetSeveridad(e.target.value as typeof detSeveridad)} style={{ ...css.input, width: 105 }}>
                  <option value="bloquea">🔴 bloquea</option>
                  <option value="condiciona">🟡 condiciona</option>
                  <option value="advierte">⚠ advierte</option>
                  <option value="nota">📝 nota</option>
                </select>
              )}
            </div>
            <div style={css.fila}>
              <button
                disabled={ocupado || !detNombre.trim() || (detCategoria === '__nueva__' && !detCategoriaNueva.trim())}
                style={{ ...css.boton, background: '#2563eb', color: '#fff' }}
                onClick={() => {
                  const categoriaFinal = detCategoria === '__nueva__' ? detCategoriaNueva.trim() : detCategoria;
                  const nombre = detNombre.trim();
                  void accion(async () => {
                    if (detPermanente) {
                      const r = await enviar<{ ok?: boolean; error?: string }>({
                        tipo: 'detalle:crear',
                        detalle: { categoria: categoriaFinal, nombre, deduccionBase: detMonto },
                      });
                      if (r?.error) throw new Error(r.error);
                    }
                    if (detMarcarModelo && specs.modeloDetectado) {
                      const r2 = await enviar<{ error?: string }>({
                        tipo: 'modelo:marcar',
                        datos: {
                          marca: specs.modeloDetectado.marca,
                          modelos: [specs.modeloDetectado.modelo],
                          tipoClave: null, tipoNuevoNombre: nombre,
                          severidad: detSeveridad, motivo: nombre,
                        },
                      });
                      if (r2?.error) throw new Error(r2.error);
                    }
                    if (detPermanente || detMarcarModelo) setCatalogo(await enviar({ tipo: 'catalogo' }));
                    return { ok: true };
                  }, detMarcarModelo ? 'Detalle añadido + modelo marcado ⚑' : 'Detalle añadido', () => {
                    setDeducciones((ds) => [...ds, { nombre, monto: detMonto, cantidad: Math.min(detUnidades, cantidad) }]);
                    setCreandoDetalle(false);
                    setDetNombre(''); setDetMonto(10); setDetUnidades(1); setDetMarcarModelo(false); setDetCategoriaNueva('');
                  });
                }}
              >Añadir detalle</button>
              <button onClick={() => setCreandoDetalle(false)} style={{ ...css.boton, background: '#e5e7eb', padding: '2px 7px' }}>×</button>
            </div>
          </div>
        )}
      </Seccion>

      {/* Compra / envío */}
      <Seccion titulo="Costos" abierta={seccionesAbiertas.costos} onToggle={() => toggleSeccion('costos')}>
        <div style={css.fila}>
          <span style={css.etiqueta}>Subasta $</span>
          <Campo valorTexto={String(precio)} establecido={p.precioInicial != null}>
            <input type="number" value={precio} onChange={(e) => setPrecio(+e.target.value)} style={css.input} />
          </Campo>
          <span style={css.etiqueta}>Envío USA $</span>
          <Campo valorTexto={String(envioUsa)} establecido={p.envioInicial != null}>
            <input type="number" value={envioUsa} onChange={(e) => setEnvioUsa(+e.target.value)} style={{ ...css.input, width: 50 }} />
          </Campo>
        </div>
        <div style={css.fila}>
          <span style={css.etiqueta}>Método</span>
          <Campo valorTexto={metodo === 'barco' ? 'Barco (pie³)' : 'Avión Zoom (kg)'} establecido>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoEnvio)} style={{ ...css.input, width: 100 }}>
              <option value="barco">Barco (pie³)</option>
              <option value="avion_zoom">Avión Zoom (kg)</option>
            </select>
          </Campo>
          <span style={{ color: '#374151' }}>Vzla $/laptop</span>
          <Campo valorTexto={String(envioVzlaU)} establecido>
            <input type="number" step="0.5" value={envioVzlaU} onChange={(e) => setEnvioVzlaU(+e.target.value)} style={{ ...css.input, width: 50 }} />
          </Campo>
        </div>
        <div style={css.fila}>
          <span style={css.etiqueta}>Laptops en lote</span>
          <Campo valorTexto={String(cantidad)} establecido>
            <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Math.max(1, +e.target.value))} style={{ ...css.input, width: 50 }} />
          </Campo>
        </div>
        <div style={{ color: '#6b7280', fontSize: 12, margin: '4px 0' }}>
          base ${r.cadena.base.toFixed(2)} → Zinli ${r.cadena.conZinli.toFixed(2)} → eBay ${r.cadena.conEbay.toFixed(2)} + partes ${r.cadena.extras.toFixed(0)} + seguro ${r.cadena.seguro.toFixed(2)} + envío ${r.cadena.envioVzla.toFixed(2)} + revisión ${r.cadena.revision.toFixed(0)}
        </div>
      </Seccion>

      {/* Acciones */}
      {descartando && (
        <div style={{ ...css.fila, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 6px', marginTop: 8 }}>
          <input
            autoFocus
            placeholder="motivo opcional (ej. bisagra dañada)"
            value={motivoInput}
            onChange={(e) => setMotivoInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setDescartando(false);
            }}
            style={{ ...css.input, flex: 1, width: 'auto' }}
          />
          <button
            disabled={ocupado}
            onClick={() => {
              const motivo = motivoInput.trim() || null;
              void accion(
                () => enviar({ tipo: 'listings:guardar', listing: listing('descartado', motivo) }),
                '🚫 Descartada — en la lista aparecerá roja',
                () => {
                  setMotivoDescarte(motivo);
                  setEstadoActual('descartado');
                  setDescartando(false);
                  setMotivoInput('');
                },
              );
            }}
            style={{ ...css.boton, background: '#dc2626', color: '#fff', padding: '2px 8px' }}
          >Descartar</button>
          <button onClick={() => setDescartando(false)} style={{ ...css.boton, background: '#e5e7eb', padding: '2px 7px' }}>×</button>
        </div>
      )}
      {estadoActual === 'comprado' ? (
        <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 8px' }}>
          🔒 Comprada — evaluación congelada en el lote
        </div>
      ) : (
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button disabled={ocupado} style={{ ...css.boton, background: '#2563eb', color: '#fff', flex: 1 }}
          onClick={() => accion(() => enviar({ tipo: 'listings:guardar', listing: listing('evaluado') }), 'Evaluación guardada ✓', () => { setEstadoActual('evaluado'); setMotivoDescarte(null); })}>
          Guardar
        </button>
        <button disabled={ocupado} style={{ ...css.boton, background: '#e5e7eb', flex: 1 }}
          onClick={() => setDescartando(true)}>
          Descartar
        </button>
        <button disabled={ocupado} style={{ ...css.boton, background: '#16a34a', color: '#fff', flex: 1 }}
          onClick={() => accion(() => enviar({
            tipo: 'comprar',
            datos: {
              listing: listing('comprado'), envioUsa, cantidad,
              metodo,
              faltantes: faltantes
                .map((f) => ({ nombre: f.nombre, precio: f.precio, cantidad: Math.min(f.cantidad, cantidad) }))
                .filter((f) => f.cantidad > 0),
              modeloId: specs.modeloDetectado?.id ?? null,
              cpuTipo: cpuTipo || null,
              cpuGen: cpuGen === '' ? null : cpuGen, ramGb: ramGb === '' ? null : ramGb, ssdGb: ssdGb === '' ? null : ssdGb,
              pantallaPulgadas: cantidad === 1 ? pulgadas : null, pantallaTactil: tactil,
              valorEsperado: r.valorEsperado, cadena: r.cadena,
            },
          }), 'Lote creado con estimado congelado ✓', () => {
            setEstadoActual('comprado');
            // optimista: "Ya le has comprado antes" ya en este mismo listado, sin esperar
            // a que el servidor recompute vendedoresConocidos y sincronice de vuelta
            const vNorm = p.vendedor?.trim().toLowerCase();
            if (vNorm) {
              setCatalogo((c) => (c.vendedoresConocidos?.includes(vNorm)
                ? c
                : { ...c, vendedoresConocidos: [...(c.vendedoresConocidos ?? []), vNorm] }));
            }
          })}>
          Comprada
        </button>
      </div>
      )}
      {mensaje && <div style={{ marginTop: 6, fontWeight: 600 }}>{mensaje}</div>}
    </div>
  );
}
