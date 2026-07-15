'use client';

// /cuentas (plan-07): libro por cuenta, conversiones con tasa implícita, resultado cambiario,
// tasas del día, movimientos personales, y por cobrar / por pagar con abonos.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Chip } from '@/ui/Chip';
import { Dinero } from '@/ui/Dinero';
import { FechaCorta } from '@/ui/FechaCorta';
import { Modal } from '@/ui/Modal';
import { Tabla } from '@/ui/Tabla';
import {
  abonar,
  crearCuenta,
  crearMovimiento,
  crearPorCobrar,
  crearPorPagar,
  listarConversiones,
  listarCuentas,
  listarMovimientos,
  listarPorCobrar,
  listarPorPagar,
  listarTasas,
  obtenerResultadoCambiario,
  obtenerSaldos,
  obtenerUltimaTasa,
  registrarTasa,
  type CategoriaMovimiento,
  type ConversionDetalle,
  type Cuenta,
  type Deuda,
  type Moneda,
  type PaginaMovimientos,
  type ResultadoCambiario,
  type SaldoCuenta,
  type TasaDia,
  type TipoMovimiento,
  type TipoTasa,
} from '@/data/cuentas';

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * `v_resultado_cambiario.cuenta_origen/destino`: no está documentado en el plan si la vista
 * expone el uuid de la cuenta o ya el nombre. Se resuelve por si acaso contra la lista de
 * cuentas cargada (si `valor` coincide con un id conocido se muestra el nombre; si no,
 * se asume que la vista ya trae el nombre y se muestra tal cual).
 */
function nombreCuentaPara(valor: string, cuentas: Cuenta[]): string {
  return cuentas.find((c) => c.id === valor)?.nombre ?? valor;
}

const POR_PAGINA = 20;

export default function CuentasPage() {
  const [error, setError] = useState<string | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [saldos, setSaldos] = useState<SaldoCuenta[]>([]);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<string | null>(null);
  const [libro, setLibro] = useState<PaginaMovimientos>({ filas: [], total: 0 });
  const [pagina, setPagina] = useState(1);
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaMovimiento | ''>('');
  const [filtroTipo, setFiltroTipo] = useState<TipoMovimiento | ''>('');

  const [tipoTasaValoracion, setTipoTasaValoracion] = useState<TipoTasa>('bcv');
  const [ultimaTasaValoracion, setUltimaTasaValoracion] = useState<TasaDia | null>(null);

  const [conversiones, setConversiones] = useState<ConversionDetalle[]>([]);
  const [resultados, setResultados] = useState<ResultadoCambiario[]>([]);

  const [tasas, setTasas] = useState<TasaDia[]>([]);
  const [tipoTasaNueva, setTipoTasaNueva] = useState<TipoTasa>('bcv');
  const [valorTasaNueva, setValorTasaNueva] = useState('');

  const [porCobrar, setPorCobrar] = useState<Deuda[]>([]);
  const [porPagar, setPorPagar] = useState<Deuda[]>([]);

  // Alta de movimiento manual
  const [movCuenta, setMovCuenta] = useState('');
  const [movFecha, setMovFecha] = useState(hoyISO());
  const [movTipo, setMovTipo] = useState<TipoMovimiento>('ingreso');
  const [movMonto, setMovMonto] = useState('');
  const [movCategoria, setMovCategoria] = useState<CategoriaMovimiento>('negocio');
  const [movConcepto, setMovConcepto] = useState('');

  // Alta de cuenta
  const [modalCuenta, setModalCuenta] = useState(false);
  const [nombreCuenta, setNombreCuenta] = useState('');
  const [monedaCuenta, setMonedaCuenta] = useState<Moneda>('USD');

  // Alta de deuda (por cobrar / por pagar)
  const [modalDeuda, setModalDeuda] = useState<'por_cobrar' | 'por_pagar' | null>(null);
  const [deudaPersona, setDeudaPersona] = useState('');
  const [deudaMonto, setDeudaMonto] = useState('');
  const [deudaMoneda, setDeudaMoneda] = useState<Moneda>('USD');
  const [deudaFecha, setDeudaFecha] = useState(hoyISO());
  const [deudaNotas, setDeudaNotas] = useState('');

  // Abono
  const [abonoActivo, setAbonoActivo] = useState<{ tabla: 'por_cobrar' | 'por_pagar'; deuda: Deuda } | null>(null);
  const [abonoMonto, setAbonoMonto] = useState('');
  const [abonoCuenta, setAbonoCuenta] = useState('');

  // Guards de reentrada + claves de idempotencia reusadas entre reintentos: los inserts/RPC de
  // dinero no son idempotentes sin ellas (0033), y un doble-submit duplicaría asientos de caja.
  const [enviando, setEnviando] = useState(false);
  const reqKeyMov = useRef<string | null>(null);
  const reqKeyDeuda = useRef<string | null>(null);
  const reqKeyAbono = useRef<string | null>(null);

  const recargarSaldos = useCallback(async () => {
    setSaldos(await obtenerSaldos());
  }, []);

  const recargarConversiones = useCallback(async () => {
    setConversiones(await listarConversiones());
    setResultados(await obtenerResultadoCambiario());
  }, []);

  const recargarLibro = useCallback(async () => {
    if (!cuentaSeleccionada) {
      setLibro({ filas: [], total: 0 });
      return;
    }
    setLibro(
      await listarMovimientos(
        cuentaSeleccionada,
        {
          categoria: filtroCategoria || undefined,
          tipo: filtroTipo || undefined,
        },
        pagina,
        POR_PAGINA,
      ),
    );
  }, [cuentaSeleccionada, filtroCategoria, filtroTipo, pagina]);

  const recargarDeudas = useCallback(async () => {
    setPorCobrar(await listarPorCobrar());
    setPorPagar(await listarPorPagar());
  }, []);

  const recargarTasas = useCallback(async () => {
    setTasas(await listarTasas(30));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        setCuentas(await listarCuentas());
        await Promise.all([recargarSaldos(), recargarConversiones(), recargarTasas(), recargarDeudas()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos de cuentas');
      }
    })();
  }, [recargarSaldos, recargarConversiones, recargarTasas, recargarDeudas]);

  useEffect(() => {
    recargarLibro().catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el libro de la cuenta'));
  }, [recargarLibro]);

  useEffect(() => {
    void obtenerUltimaTasa(tipoTasaValoracion).then(setUltimaTasaValoracion);
  }, [tipoTasaValoracion]);

  // El modal global de conversión (montado en el layout) avisa cuando registra una: refrescar.
  useEffect(() => {
    const alRefrescar = () => {
      void recargarSaldos();
      void recargarConversiones();
    };
    window.addEventListener('tecnofal:conversion-registrada', alRefrescar);
    return () => window.removeEventListener('tecnofal:conversion-registrada', alRefrescar);
  }, [recargarSaldos, recargarConversiones]);

  useEffect(() => {
    if (cuentas.length > 0 && !movCuenta) setMovCuenta(cuentas[0].id);
  }, [cuentas, movCuenta]);

  const seleccionarCuenta = (id: string) => {
    setCuentaSeleccionada(id);
    setPagina(1);
  };

  const enviarMovimiento = async () => {
    const monto = Number(movMonto);
    if (!movCuenta || !(monto > 0) || enviando) return;
    if (!reqKeyMov.current) reqKeyMov.current = crypto.randomUUID();
    setEnviando(true);
    try {
      await crearMovimiento({
        cuenta_id: movCuenta,
        fecha: movFecha,
        tipo: movTipo,
        monto,
        categoria: movCategoria,
        concepto: movConcepto || undefined,
      }, reqKeyMov.current);
      reqKeyMov.current = null;
      setMovMonto('');
      setMovConcepto('');
      await recargarSaldos();
      await recargarLibro();
    } finally {
      setEnviando(false);
    }
  };

  const enviarCuenta = async () => {
    if (!nombreCuenta) return;
    await crearCuenta({ nombre: nombreCuenta, moneda: monedaCuenta });
    setNombreCuenta('');
    setModalCuenta(false);
    setCuentas(await listarCuentas());
    await recargarSaldos();
  };

  const enviarDeuda = async () => {
    if (!modalDeuda || !deudaPersona || !(Number(deudaMonto) > 0) || enviando) return;
    if (!reqKeyDeuda.current) reqKeyDeuda.current = crypto.randomUUID();
    setEnviando(true);
    try {
      const datos = { persona: deudaPersona, monto: Number(deudaMonto), moneda: deudaMoneda, fecha: deudaFecha, notas: deudaNotas || undefined, idempotencyKey: reqKeyDeuda.current };
      if (modalDeuda === 'por_cobrar') await crearPorCobrar(datos);
      else await crearPorPagar(datos);
      reqKeyDeuda.current = null;
      setDeudaPersona('');
      setDeudaMonto('');
      setDeudaNotas('');
      setModalDeuda(null);
      await recargarDeudas();
    } finally {
      setEnviando(false);
    }
  };

  const enviarAbono = async () => {
    if (!abonoActivo || !abonoCuenta || !(Number(abonoMonto) > 0) || enviando) return;
    if (!reqKeyAbono.current) reqKeyAbono.current = crypto.randomUUID();
    setEnviando(true);
    try {
      await abonar(abonoActivo.tabla, abonoActivo.deuda, Number(abonoMonto), abonoCuenta, hoyISO(), reqKeyAbono.current);
      reqKeyAbono.current = null;
      setAbonoActivo(null);
      setAbonoMonto('');
      setAbonoCuenta('');
      await recargarDeudas();
      await recargarSaldos();
    } finally {
      setEnviando(false);
    }
  };

  const enviarTasa = async () => {
    if (!(Number(valorTasaNueva) > 0)) return;
    await registrarTasa({ tipo: tipoTasaNueva, valor: Number(valorTasaNueva), fecha: hoyISO() });
    setValorTasaNueva('');
    await recargarTasas();
    if (tipoTasaNueva === tipoTasaValoracion) {
      setUltimaTasaValoracion(await obtenerUltimaTasa(tipoTasaValoracion));
    }
  };

  return (
    <section className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cuentas</h1>
        <Boton variante="secundario" onClick={() => setModalCuenta(true)}>
          ＋ Cuenta
        </Boton>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {/* Saldos por cuenta */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <label htmlFor="tasa-valoracion" className="text-sm font-medium text-slate-700">
            Tasa para valorar Bs
          </label>
          <select
            id="tasa-valoracion"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={tipoTasaValoracion}
            onChange={(e) => setTipoTasaValoracion(e.target.value as TipoTasa)}
          >
            <option value="bcv">BCV</option>
            <option value="paralelo">Paralelo</option>
            <option value="usdt">USDT</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {saldos.map((s) => (
            <button
              key={s.cuenta_id}
              type="button"
              data-testid={`saldo-${s.cuenta_id}`}
              onClick={() => seleccionarCuenta(s.cuenta_id)}
              className={`rounded-lg border p-3 text-left hover:bg-slate-50 ${
                cuentaSeleccionada === s.cuenta_id ? 'border-slate-900' : 'border-slate-200'
              }`}
            >
              <p className="text-sm font-medium text-slate-600">{s.nombre}</p>
              <p className="text-lg font-semibold">
                <Dinero monto={s.saldo} moneda={s.moneda} />
              </p>
              {s.moneda === 'VES' && ultimaTasaValoracion && (
                <p className="text-xs text-slate-500" data-testid={`equivalente-usd-${s.cuenta_id}`}>
                  <Dinero monto={s.saldo / ultimaTasaValoracion.valor} moneda="USD" />
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Libro de la cuenta seleccionada + alta de movimiento manual */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-2 text-lg font-semibold">
            Libro {cuentaSeleccionada ? `— ${saldos.find((s) => s.cuenta_id === cuentaSeleccionada)?.nombre ?? ''}` : ''}
          </h2>
          <div className="mb-2 flex gap-2">
            <div>
              <label htmlFor="filtro-categoria" className="text-xs text-slate-500">
                Filtrar por categoría
              </label>
              <select
                id="filtro-categoria"
                className="block rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value as CategoriaMovimiento | '')}
              >
                <option value="">Todas</option>
                <option value="negocio">Negocio</option>
                <option value="personal">Personal</option>
              </select>
            </div>
            <div>
              <label htmlFor="filtro-tipo" className="text-xs text-slate-500">
                Filtrar por tipo
              </label>
              <select
                id="filtro-tipo"
                className="block rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as TipoMovimiento | '')}
              >
                <option value="">Todos</option>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
            </div>
          </div>
          <Tabla
            encabezados={['Fecha', 'Tipo', 'Monto', 'Categoría', 'Concepto', 'Referencia']}
            claves={libro.filas.map((m) => m.id)}
            vacio={cuentaSeleccionada ? 'Sin movimientos' : 'Elige una cuenta arriba'}
            filas={libro.filas.map((m) => [
              <FechaCorta key="f" fecha={m.fecha} />,
              m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
              <Dinero key="d" monto={m.monto} moneda={saldos.find((s) => s.cuenta_id === m.cuenta_id)?.moneda ?? 'USD'} />,
              <Chip key="c" tono={m.categoria === 'personal' ? 'azul' : 'gris'}>
                {m.categoria === 'personal' ? 'Personal' : 'Negocio'}
              </Chip>,
              m.concepto ?? '—',
              m.venta_id ? (
                <Link key="r" href="/ventas" className="underline">
                  Venta
                </Link>
              ) : m.lote_id ? (
                <Link key="r" href={`/lotes/${m.lote_id}`} className="underline">
                  Lote
                </Link>
              ) : m.costo_linea_id ? (
                'Costo'
              ) : (
                '—'
              ),
            ])}
          />
          {libro.total > POR_PAGINA && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <Boton variante="secundario" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                ← Anterior
              </Boton>
              <span>
                Página {pagina} de {Math.ceil(libro.total / POR_PAGINA)}
              </span>
              <Boton
                variante="secundario"
                disabled={pagina >= Math.ceil(libro.total / POR_PAGINA)}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente →
              </Boton>
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">Movimiento manual</h2>
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
            <div>
              <label htmlFor="mov-cuenta" className="text-sm font-medium text-slate-700">
                Cuenta
              </label>
              <select
                id="mov-cuenta"
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={movCuenta}
                onChange={(e) => setMovCuenta(e.target.value)}
              >
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <Campo label="Fecha" type="date" value={movFecha} onChange={(e) => setMovFecha(e.target.value)} />
            <div>
              <label htmlFor="mov-tipo" className="text-sm font-medium text-slate-700">
                Tipo
              </label>
              <select
                id="mov-tipo"
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={movTipo}
                onChange={(e) => setMovTipo(e.target.value as TipoMovimiento)}
              >
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
            </div>
            <Campo label="Monto" type="number" step="0.01" value={movMonto} onChange={(e) => setMovMonto(e.target.value)} />
            <div>
              <label htmlFor="mov-categoria" className="text-sm font-medium text-slate-700">
                Categoría
              </label>
              <select
                id="mov-categoria"
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={movCategoria}
                onChange={(e) => setMovCategoria(e.target.value as CategoriaMovimiento)}
              >
                <option value="negocio">Negocio</option>
                <option value="personal">Personal</option>
              </select>
            </div>
            <Campo label="Concepto" value={movConcepto} onChange={(e) => setMovConcepto(e.target.value)} />
            <Boton onClick={() => void enviarMovimiento()} disabled={enviando}>Registrar movimiento</Boton>
          </div>
        </div>
      </div>

      {/* Conversiones */}
      <div>
        <h2 className="mb-2 text-lg font-semibold">Conversiones</h2>
        <Tabla
          encabezados={['Fecha', 'Origen', 'Destino', 'Monto origen', 'Monto destino', 'Tasa implícita', 'Nota']}
          paginado
          claves={conversiones.map((c) => c.id)}
          filas={conversiones.map((c) => [
            <FechaCorta key="f" fecha={c.fecha} />,
            c.cuenta_origen_nombre,
            c.cuenta_destino_nombre,
            <Dinero key="mo" monto={c.monto_origen} />,
            <Dinero key="md" monto={c.monto_destino} />,
            c.tasa_implicita.toFixed(4),
            c.nota ?? '—',
          ])}
        />
        <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-600">Resultado cambiario por mes (separado de la ganancia por laptops)</h3>
        <div data-testid="tabla-resultado-cambiario">
          <Tabla
            encabezados={['Mes', 'Origen', 'Destino', 'Operaciones', 'Total origen', 'Total destino', 'Resultado', 'Tasa promedio']}
            claves={resultados.map((r, i) => `${r.mes}-${r.cuenta_origen}-${r.cuenta_destino}-${i}`)}
            filas={resultados.map((r) => [
              <FechaCorta key="m" fecha={r.mes} />,
              nombreCuentaPara(r.cuenta_origen, cuentas),
              nombreCuentaPara(r.cuenta_destino, cuentas),
              String(r.operaciones),
              <Dinero key="to" monto={r.total_origen} moneda={r.moneda_origen} />,
              <Dinero key="td" monto={r.total_destino} moneda={r.moneda_destino} />,
              <Dinero key="res" monto={r.resultado} moneda={r.moneda_destino} />,
              r.tasa_implicita_promedio.toFixed(4),
            ])}
          />
        </div>
      </div>

      {/* Tasas del día */}
      <div>
        <h2 className="mb-2 text-lg font-semibold">Tasas del día</h2>
        <div className="mb-3 flex items-end gap-2">
          <div>
            <label htmlFor="tasa-tipo-nueva" className="text-sm font-medium text-slate-700">
              Tipo de tasa
            </label>
            <select
              id="tasa-tipo-nueva"
              className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={tipoTasaNueva}
              onChange={(e) => setTipoTasaNueva(e.target.value as TipoTasa)}
            >
              <option value="bcv">BCV</option>
              <option value="paralelo">Paralelo</option>
              <option value="usdt">USDT</option>
              <option value="paypal">PayPal</option>
            </select>
          </div>
          <Campo label="Valor" type="number" step="0.01" value={valorTasaNueva} onChange={(e) => setValorTasaNueva(e.target.value)} />
          <Boton onClick={() => void enviarTasa()}>Registrar tasa</Boton>
        </div>
        <Tabla
          encabezados={['Fecha', 'Tipo', 'Valor']}
          claves={tasas.map((t, i) => `${t.fecha}-${t.tipo}-${i}`)}
          filas={tasas.map((t) => [<FechaCorta key="f" fecha={t.fecha} />, t.tipo, t.valor.toFixed(4)])}
        />
      </div>

      {/* Por cobrar / por pagar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SeccionDeuda
          titulo="Por cobrar"
          deudas={porCobrar}
          onAbrirAlta={() => setModalDeuda('por_cobrar')}
          onAbrirAbono={(d) => setAbonoActivo({ tabla: 'por_cobrar', deuda: d })}
        />
        <SeccionDeuda
          titulo="Por pagar"
          deudas={porPagar}
          onAbrirAlta={() => setModalDeuda('por_pagar')}
          onAbrirAbono={(d) => setAbonoActivo({ tabla: 'por_pagar', deuda: d })}
        />
      </div>

      {/* Modal: alta de cuenta */}
      <Modal abierto={modalCuenta} titulo="Nueva cuenta" onCerrar={() => setModalCuenta(false)}>
        <div className="flex flex-col gap-3">
          <Campo label="Nombre" value={nombreCuenta} onChange={(e) => setNombreCuenta(e.target.value)} />
          <div>
            <label htmlFor="moneda-cuenta" className="text-sm font-medium text-slate-700">
              Moneda
            </label>
            <select
              id="moneda-cuenta"
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={monedaCuenta}
              onChange={(e) => setMonedaCuenta(e.target.value as Moneda)}
            >
              <option value="USD">USD</option>
              <option value="VES">VES</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setModalCuenta(false)}>
              Cancelar
            </Boton>
            <Boton onClick={() => void enviarCuenta()}>Crear</Boton>
          </div>
        </div>
      </Modal>

      {/* Modal: alta de deuda */}
      <Modal
        abierto={modalDeuda !== null}
        titulo={modalDeuda === 'por_cobrar' ? 'Nuevo por cobrar' : 'Nuevo por pagar'}
        onCerrar={() => setModalDeuda(null)}
      >
        <div className="flex flex-col gap-3">
          <Campo label="Persona" value={deudaPersona} onChange={(e) => setDeudaPersona(e.target.value)} />
          <Campo label="Monto" type="number" step="0.01" value={deudaMonto} onChange={(e) => setDeudaMonto(e.target.value)} />
          <div>
            <label htmlFor="deuda-moneda" className="text-sm font-medium text-slate-700">
              Moneda
            </label>
            <select
              id="deuda-moneda"
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={deudaMoneda}
              onChange={(e) => setDeudaMoneda(e.target.value as Moneda)}
            >
              <option value="USD">USD</option>
              <option value="VES">VES</option>
            </select>
          </div>
          <Campo label="Fecha" type="date" value={deudaFecha} onChange={(e) => setDeudaFecha(e.target.value)} />
          <Campo label="Notas" value={deudaNotas} onChange={(e) => setDeudaNotas(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setModalDeuda(null)}>
              Cancelar
            </Boton>
            <Boton onClick={() => void enviarDeuda()} disabled={enviando}>Crear</Boton>
          </div>
        </div>
      </Modal>

      {/* Modal: abono */}
      <Modal
        abierto={abonoActivo !== null}
        titulo={`Abonar a ${abonoActivo?.deuda.persona ?? ''}`}
        onCerrar={() => setAbonoActivo(null)}
      >
        <div className="flex flex-col gap-3">
          <Campo label="Monto del abono" type="number" step="0.01" value={abonoMonto} onChange={(e) => setAbonoMonto(e.target.value)} />
          <div>
            <label htmlFor="abono-cuenta" className="text-sm font-medium text-slate-700">
              Cuenta
            </label>
            <select
              id="abono-cuenta"
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={abonoCuenta}
              onChange={(e) => setAbonoCuenta(e.target.value)}
            >
              <option value="">Elige…</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbonoActivo(null)}>
              Cancelar
            </Boton>
            <Boton onClick={() => void enviarAbono()} disabled={enviando}>Confirmar abono</Boton>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function SeccionDeuda({
  titulo,
  deudas,
  onAbrirAlta,
  onAbrirAbono,
}: {
  titulo: string;
  deudas: Deuda[];
  onAbrirAlta: () => void;
  onAbrirAbono: (d: Deuda) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <Boton variante="secundario" onClick={onAbrirAlta}>
          ＋ {titulo}
        </Boton>
      </div>
      <Tabla
        encabezados={['Persona', 'Monto', 'Abonado', 'Estado', 'Fecha', '']}
        claves={deudas.map((d) => d.id)}
        filas={deudas.map((d) => [
          d.persona,
          <Dinero key="m" monto={d.monto} moneda={d.moneda} />,
          <Dinero key="a" monto={d.abonado} moneda={d.moneda} />,
          <Chip key="e" tono={d.estado === 'saldada' ? 'verde' : d.estado === 'parcial' ? 'amarillo' : 'gris'}>
            {d.estado === 'saldada' ? 'Saldada' : d.estado === 'parcial' ? 'Parcial' : 'Pendiente'}
          </Chip>,
          <FechaCorta key="f" fecha={d.fecha} />,
          d.estado !== 'saldada' ? (
            <button
              key="b"
              type="button"
              className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
              onClick={() => onAbrirAbono(d)}
            >
              Abonar
            </button>
          ) : (
            '—'
          ),
        ])}
      />
    </div>
  );
}
