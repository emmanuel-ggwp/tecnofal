'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Tabla } from '@/ui/Tabla';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Chip } from '@/ui/Chip';
import { Dinero } from '@/ui/Dinero';
import { FechaCorta } from '@/ui/FechaCorta';
import {
  ESTADO_VENTA_ETIQUETAS,
  ESTADO_VENTA_TONOS,
  listarVentas,
  type VentaEstado,
  type VentaListado,
} from '@/data/ventas';
import { RegistrarVentaModal } from './RegistrarVentaModal';

export function ListadoVentas() {
  const [ventas, setVentas] = useState<VentaListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<VentaEstado | ''>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const datos = await listarVentas({
        estado: estado || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      });
      setVentas(datos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar ventas');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, [estado, desde, hasta]);

  const totales = useMemo(() => {
    const activas = ventas.filter((v) => v.estado === 'activa');
    return {
      gananciaBruta: activas.reduce((acc, v) => acc + (v.gananciaBruta ?? 0), 0),
      gananciaNeta: activas.reduce((acc, v) => acc + (v.gananciaNeta ?? 0), 0),
    };
  }, [ventas]);

  const filas = ventas.map((v) => [
    <FechaCorta key="fecha" fecha={v.fecha} />,
    <Link key="alias" href={`/inventario/${v.laptopId}`} className="hover:underline">
      <span className="font-medium">{v.alias}</span> <span className="text-slate-400">— {v.modeloNombre}</span>
    </Link>,
    <Link key="comprador" href={`/ventas?tab=compradores&compradorId=${v.compradorId}`} className="hover:underline">
      {v.compradorNombre}
    </Link>,
    v.moneda === 'VES' ? (
      <span key="precio">
        <Dinero monto={v.montoVes} moneda="VES" /> <span className="text-slate-400">(tasa {v.tasaImplicita})</span>
      </span>
    ) : (
      <Dinero key="precio" monto={v.precioVenta} moneda="USD" />
    ),
    <Dinero key="gb" monto={v.gananciaBruta} moneda="USD" />,
    <Dinero key="gn" monto={v.gananciaNeta} moneda="USD" />,
    <Chip key="estado" tono={ESTADO_VENTA_TONOS[v.estado]}>
      {ESTADO_VENTA_ETIQUETAS[v.estado]}
    </Chip>,
    <FechaCorta key="garantia" fecha={v.garantiaHasta} />,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-estado" className="text-sm font-medium text-slate-700">
            Estado
          </label>
          <select
            id="filtro-estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as VentaEstado | '')}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            <option value="activa">Activa</option>
            <option value="devuelta_garantia">Devuelta (garantía)</option>
          </select>
        </div>
        <Campo label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Campo label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <Boton className="ml-auto" onClick={() => setModalAbierto(true)}>
          + Registrar venta
        </Boton>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-6 text-sm text-slate-600">
        <span>
          Ganancia bruta:{' '}
          <strong data-testid="total-ganancia-bruta">
            <Dinero monto={totales.gananciaBruta} />
          </strong>
        </span>
        <span>
          Ganancia neta:{' '}
          <strong data-testid="total-ganancia-neta">
            <Dinero monto={totales.gananciaNeta} />
          </strong>
        </span>
      </div>

      <Tabla
        encabezados={[
          'Fecha',
          'Laptop',
          'Comprador',
          'Precio',
          'Ganancia bruta',
          'Ganancia neta',
          'Estado',
          'Garantía hasta',
        ]}
        filas={cargando ? [] : filas}
        claves={ventas.map((v) => v.id)}
        vacio={cargando ? 'Cargando…' : 'Sin ventas'}
        paginado
      />

      <RegistrarVentaModal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        onRegistrada={() => {
          setModalAbierto(false);
          void cargar();
        }}
      />
    </div>
  );
}
