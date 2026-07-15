'use client';

import { useEffect, useState } from 'react';
import { Tabla } from '@/ui/Tabla';
import { Boton } from '@/ui/Boton';
import { Chip } from '@/ui/Chip';
import { FechaCorta } from '@/ui/FechaCorta';
import { listarGarantiasVigentes, type GarantiaVigente } from '@/data/ventas';
import { DevolucionModal } from './DevolucionModal';

const UMBRAL_DIAS_ALERTA = 15;

export function Garantias() {
  const [garantias, setGarantias] = useState<GarantiaVigente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<GarantiaVigente | null>(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      setGarantias(await listarGarantiasVigentes());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar garantías');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const filas = garantias.map((g) => [
    <span key="alias" className="font-medium">
      {g.alias}
    </span>,
    g.comprador,
    <FechaCorta key="fecha" fecha={g.fecha} />,
    <FechaCorta key="hasta" fecha={g.garantiaHasta} />,
    <Chip
      key="dias"
      testId="dias-restantes"
      tono={g.diasRestantes < UMBRAL_DIAS_ALERTA ? 'naranja' : 'gris'}
    >
      {g.diasRestantes} días
    </Chip>,
    <Boton key="accion" variante="secundario" onClick={() => setSeleccion(g)}>
      Devolución
    </Boton>,
  ]);

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Tabla
        encabezados={['Laptop', 'Comprador', 'Fecha venta', 'Garantía hasta', 'Días restantes', 'Acción']}
        filas={cargando ? [] : filas}
        claves={garantias.map((g) => g.ventaId)}
        vacio={cargando ? 'Cargando…' : 'Sin garantías vigentes'}
        paginado
      />

      <DevolucionModal
        garantia={seleccion}
        onCerrar={() => setSeleccion(null)}
        onDevuelta={() => {
          setSeleccion(null);
          void cargar();
        }}
      />
    </div>
  );
}
