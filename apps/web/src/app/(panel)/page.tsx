'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Boton } from '@/ui/Boton';
import { Chip } from '@/ui/Chip';
import { Dinero } from '@/ui/Dinero';
import { FechaCorta } from '@/ui/FechaCorta';
import { Tabla } from '@/ui/Tabla';
import {
  cargarDashboard,
  convertirVesAUsd,
  ESTADOS_LAPTOP,
  mesActualISO,
  sumaResultadoCambiario,
  type DashboardData,
  type EstadoLaptop,
  type TipoTasa,
} from '@/data/dashboard';

const ETIQUETA_ESTADO: Record<EstadoLaptop, string> = {
  evaluando: 'Evaluando',
  comprada: 'Comprada',
  en_transito: 'En tránsito',
  en_revision: 'En revisión',
  falta_partes: 'Falta partes',
  lista_para_venta: 'Lista para venta',
  reservada: 'Reservada',
  vendida: 'Vendida',
  para_repuestos: 'Para repuestos',
};

const ETIQUETA_TASA: Record<TipoTasa, string> = {
  bcv: 'BCV',
  paralelo: 'Paralelo',
  usdt: 'USDT',
  paypal: 'PayPal',
};

function slug(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function colorSigno(valor: number): string {
  return valor < 0 ? 'text-red-700' : 'text-green-700';
}

function TarjetaSkeleton() {
  return <div className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />;
}

export default function DashboardPage() {
  const [datos, setDatos] = useState<DashboardData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasaSeleccionada, setTasaSeleccionada] = useState<TipoTasa | ''>('');

  const cargar = useCallback(async (esRefresco: boolean) => {
    if (esRefresco) setRefrescando(true);
    setError(null);
    try {
      const d = await cargarDashboard();
      setDatos(d);
      setTasaSeleccionada((actual) => actual || d.tasas[0]?.tipo || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando el dashboard');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(false);
  }, [cargar]);

  if (cargando) {
    return (
      <section>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="dashboard-skeleton">
          {Array.from({ length: 5 }).map((_, i) => (
            <TarjetaSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (error || !datos) {
    return (
      <section>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-4 text-sm text-red-700" data-testid="dashboard-error">
          {error ?? 'No se pudo cargar el dashboard'}
        </p>
        <Boton className="mt-3" onClick={() => void cargar(false)}>
          Reintentar
        </Boton>
      </section>
    );
  }

  const { totales, porEstado, cuentas, resultadoCambiario, garantias, sugerenciasPartes, tasas } = datos;

  const mesActual = mesActualISO();
  const resultadoMes = sumaResultadoCambiario(resultadoCambiario.filter((f) => f.mes === mesActual));
  const resultadoTotal = sumaResultadoCambiario(resultadoCambiario);

  const conteoPorEstado = new Map(porEstado.map((p) => [p.estado, p.cantidad]));
  const sinDatos =
    totales.total_invertido === 0 &&
    totales.valor_inventario === 0 &&
    totales.ganancia_bruta_acum === 0 &&
    porEstado.length === 0 &&
    cuentas.every((c) => c.saldo === 0);

  const tasaActiva = tasas.find((t) => t.tipo === tasaSeleccionada) ?? tasas[0] ?? null;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Boton
          variante="secundario"
          data-testid="dashboard-refrescar"
          onClick={() => void cargar(true)}
          disabled={refrescando}
        >
          {refrescando ? 'Actualizando…' : '↻ Refrescar'}
        </Boton>
      </div>

      {sinDatos && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" data-testid="banner-sin-datos">
          Aún no tienes movimientos registrados. Comienza evaluando una laptop en{' '}
          <Link href="/calculadora" className="font-semibold underline">
            la Calculadora
          </Link>
          .
        </div>
      )}

      {/* fila 1: totales */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TarjetaTotal titulo="Total invertido" testid="card-total-invertido" valor={totales.total_invertido}>
          <Dinero monto={totales.total_invertido} />
        </TarjetaTotal>
        <TarjetaTotal titulo="Valor inventario" testid="card-valor-inventario" valor={totales.valor_inventario}>
          <Dinero monto={totales.valor_inventario} />
        </TarjetaTotal>
        <TarjetaTotal titulo="Ganancia bruta" testid="card-ganancia-bruta" valor={totales.ganancia_bruta_acum}>
          <Dinero monto={totales.ganancia_bruta_acum} />
        </TarjetaTotal>
        <TarjetaTotal titulo="Ganancia neta" testid="card-ganancia-neta" valor={totales.ganancia_neta_acum}>
          <Dinero monto={totales.ganancia_neta_acum} />
        </TarjetaTotal>
        <TarjetaTotal titulo="Resultado cambiario" testid="card-resultado-cambiario">
          <div className="space-y-0.5">
            <div
              className={`text-sm ${colorSigno(resultadoMes)}`}
              data-testid="resultado-cambiario-mes"
              data-valor={resultadoMes}
            >
              Mes: <Dinero monto={resultadoMes} />
            </div>
            <div
              className={`font-semibold ${colorSigno(resultadoTotal)}`}
              data-testid="resultado-cambiario-total"
              data-valor={resultadoTotal}
            >
              Total: <Dinero monto={resultadoTotal} />
            </div>
          </div>
        </TarjetaTotal>
      </div>

      {/* fila 2: laptops por estado + banner de sugerencia */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Laptops por estado</h2>
        <div className="flex flex-wrap gap-2">
          {ESTADOS_LAPTOP.map((estado) => {
            const cantidad = conteoPorEstado.get(estado) ?? 0;
            return (
              <Link
                key={estado}
                href={`/inventario?estado=${estado}`}
                data-testid={`chip-estado-${estado}`}
                data-valor={cantidad}
                className="no-underline"
              >
                <Chip tono={cantidad > 0 ? 'azul' : 'gris'}>
                  {ETIQUETA_ESTADO[estado]}: {cantidad}
                </Chip>
              </Link>
            );
          })}
        </div>
        {sugerenciasPartes.length > 0 && (
          <div
            className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            data-testid="banner-sugerencia-partes"
          >
            {sugerenciasPartes.length} laptop{sugerenciasPartes.length === 1 ? '' : 's'} con partes completas,
            confirmar paso a lista_para_venta —{' '}
            <Link href="/inventario" className="font-semibold underline">
              ver en Inventario
            </Link>
            .
          </div>
        )}
      </div>

      {/* fila 3: cuentas + por cobrar/pagar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-600">Saldos por cuenta</h2>
            {tasas.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Tasa
                <select
                  data-testid="selector-tasa"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  value={tasaSeleccionada}
                  onChange={(e) => setTasaSeleccionada(e.target.value as TipoTasa)}
                >
                  {Array.from(new Set(tasas.map((t) => t.tipo))).map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {ETIQUETA_TASA[tipo]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {cuentas.length === 0 ? (
            <p className="text-sm text-slate-400">Sin cuentas registradas.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cuentas.map((c) => {
                const enUsd = c.moneda === 'VES' ? convertirVesAUsd(c.saldo, tasaActiva?.valor) : null;
                return (
                  <div
                    key={c.cuenta_id}
                    data-testid={`cuenta-saldo-${slug(c.nombre)}`}
                    data-valor={c.saldo}
                    className="rounded-md border border-slate-100 p-3"
                  >
                    <p className="text-xs text-slate-500">{c.nombre}</p>
                    <p className="font-semibold">
                      <Dinero monto={c.saldo} moneda={c.moneda} />
                    </p>
                    {enUsd != null && (
                      <p
                        className="text-xs text-slate-500"
                        data-testid={`cuenta-saldo-usd-${slug(c.nombre)}`}
                        data-valor={enUsd}
                      >
                        ≈ <Dinero monto={enUsd} moneda="USD" /> ({ETIQUETA_TASA[tasaActiva!.tipo]})
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-3">
          <Link
            href="/cuentas"
            data-testid="card-por-cobrar"
            data-valor={totales.por_cobrar_pendiente}
            className="block rounded-lg border border-slate-200 bg-white p-4 no-underline hover:bg-slate-50"
          >
            <p className="text-xs text-slate-500">Por cobrar</p>
            <p className="text-lg font-semibold">
              <Dinero monto={totales.por_cobrar_pendiente} />
            </p>
          </Link>
          <Link
            href="/cuentas"
            data-testid="card-por-pagar"
            data-valor={totales.por_pagar_pendiente}
            className="block rounded-lg border border-slate-200 bg-white p-4 no-underline hover:bg-slate-50"
          >
            <p className="text-xs text-slate-500">Por pagar</p>
            <p className="text-lg font-semibold">
              <Dinero monto={totales.por_pagar_pendiente} />
            </p>
          </Link>
        </div>
      </div>

      {/* fila 4: garantías próximas a vencer */}
      <div data-testid="tabla-garantias">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Garantías próximas a vencer</h2>
        <Tabla
          encabezados={['Alias', 'Comprador', 'Vence', 'Días restantes']}
          claves={garantias.map((g) => g.venta_id)}
          vacio="Sin garantías vigentes"
          filas={garantias.map((g) => [
            g.alias ?? '—',
            g.comprador ?? '—',
            <FechaCorta key="f" fecha={g.garantia_hasta} />,
            <span key="d" className={g.dias_restantes < 15 ? 'font-semibold text-red-700' : ''}>
              {g.dias_restantes}
            </span>,
          ])}
        />
      </div>
    </section>
  );
}

function TarjetaTotal({
  titulo,
  testid,
  valor,
  children,
}: {
  titulo: string;
  testid: string;
  valor?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid={testid} data-valor={valor}>
      <p className="text-xs text-slate-500">{titulo}</p>
      <div className="mt-1 text-lg font-semibold">{children}</div>
    </div>
  );
}
