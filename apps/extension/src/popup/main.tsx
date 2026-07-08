import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { enviar, type Cuenta } from '../lib/mensajes';

interface Estado {
  configurado: boolean;
  email: string | null;
  error?: string;
}

/** §13: acción rápida — registrar conversión/transferencia entre cuentas */
function Conversion() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [montoOrigen, setMontoOrigen] = useState('');
  const [montoDestino, setMontoDestino] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void enviar<Cuenta[]>({ tipo: 'cuentas:listar' }).then((cs) => {
      if (Array.isArray(cs)) setCuentas(cs);
    });
  }, []);

  const registrar = async () => {
    setOcupado(true); setMsg(null);
    try {
      const r = await enviar<{ ok?: boolean; tasaImplicita?: number; error?: string }>({
        tipo: 'conversion:registrar',
        datos: {
          cuentaOrigenId: origen, cuentaDestinoId: destino,
          montoOrigen: +montoOrigen, montoDestino: +montoDestino,
          fecha, nota: nota || undefined,
        },
      });
      if (r.error) throw new Error(r.error);
      setMsg(`Registrada ✓ (tasa implícita ${r.tasaImplicita?.toFixed(4)})`);
      setMontoOrigen(''); setMontoDestino(''); setNota('');
    } catch (e) {
      setMsg(`⚠ ${e instanceof Error ? e.message : e}`);
    } finally {
      setOcupado(false);
    }
  };

  const moneda = (id: string) => cuentas.find((c) => c.id === id)?.moneda ?? '';
  const listo = origen && destino && origen !== destino && +montoOrigen > 0 && +montoDestino > 0;

  return (
    <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 10, paddingTop: 8 }}>
      <b>Conversión entre cuentas</b>
      <div style={{ display: 'flex', gap: 4, margin: '6px 0' }}>
        <select value={origen} onChange={(e) => setOrigen(e.target.value)} style={{ flex: 1 }}>
          <option value="">Origen…</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
        <select value={destino} onChange={(e) => setDestino(e.target.value)} style={{ flex: 1 }}>
          <option value="">Destino…</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <input type="number" placeholder={`Sale ${moneda(origen)}`} value={montoOrigen} onChange={(e) => setMontoOrigen(e.target.value)} style={{ flex: 1, width: 80 }} />
        <input type="number" placeholder={`Entra ${moneda(destino)}`} value={montoDestino} onChange={(e) => setMontoDestino(e.target.value)} style={{ flex: 1, width: 80 }} />
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <input placeholder="nota" value={nota} onChange={(e) => setNota(e.target.value)} style={{ flex: 1 }} />
      </div>
      <button disabled={!listo || ocupado} onClick={() => void registrar()}>Registrar conversión</button>
      {msg && <p style={{ fontWeight: 600 }}>{msg}</p>}
    </div>
  );
}

function Popup() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const refrescar = () => void enviar<Estado>({ tipo: 'auth:estado' }).then(setEstado);
  useEffect(refrescar, []);

  const login = async () => {
    setOcupado(true); setMsg(null);
    try {
      const r = await enviar<Estado>({ tipo: 'auth:login', email, password });
      if (r.error) throw new Error(r.error);
      setEstado(r);
      setMsg('Sesión iniciada ✓');
    } catch (e) {
      setMsg(`⚠ ${e instanceof Error ? e.message : e}`);
    } finally {
      setOcupado(false);
    }
  };

  if (!estado) return <p>Cargando…</p>;

  if (!estado.configurado) {
    return (
      <div>
        <h3 style={{ margin: '0 0 8px' }}>TecnoFal</h3>
        <p>⚠ Falta configurar <code>.env</code> (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) y recompilar.</p>
        <p>La extensión funciona en <b>modo degradado</b> con valores semilla: semáforo sí, guardar/comprar no.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 8px' }}>TecnoFal</h3>
      {estado.email ? (
        <>
          <p>Conectado como <b>{estado.email}</b></p>
          <button disabled={ocupado} onClick={() => void enviar({ tipo: 'auth:logout' }).then(refrescar)}>Cerrar sesión</button>
          <Conversion />
        </>
      ) : (
        <>
          <p>Inicia sesión (usuario de Supabase Auth):</p>
          <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', marginBottom: 6 }} />
          <input placeholder="contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', marginBottom: 6 }} />
          <button disabled={ocupado || !email || !password} onClick={() => void login()}>Entrar</button>
        </>
      )}
      {msg && <p style={{ fontWeight: 600 }}>{msg}</p>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);
