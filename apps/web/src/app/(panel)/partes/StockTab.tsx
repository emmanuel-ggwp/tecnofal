'use client';

import { useEffect, useState } from 'react';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Dinero } from '@/ui/Dinero';
import { Tabla } from '@/ui/Tabla';
import { listarStock, registrarCompraStock, type StockFila } from '@/data/partes';
import { InstalarModal, type ParteAInstalar } from './InstalarModal';

export function StockTab() {
  const [filas, setFilas] = useState<StockFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compra, setCompra] = useState<Record<string, { cantidad: string; costo: string }>>({});
  const [parteAInstalar, setParteAInstalar] = useState<ParteAInstalar | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      setFilas(await listarStock());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el stock');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function campoCompra(parteId: string): { cantidad: string; costo: string } {
    return compra[parteId] ?? { cantidad: '', costo: '' };
  }

  async function comprar(parteId: string) {
    setError(null);
    const { cantidad, costo } = campoCompra(parteId);
    try {
      await registrarCompraStock(parteId, Number(cantidad), Number(costo));
      setCompra({ ...compra, [parteId]: { cantidad: '', costo: '' } });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar la compra');
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Stock a costo promedio</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <Tabla
          encabezados={['Parte', 'Cantidad', 'Costo promedio', 'Valor total', 'Compra rápida', '']}
          paginado
          claves={filas.map((f) => f.parteId)}
          filas={filas.map((f) => [
            f.parteNombre,
            f.cantidad,
            <Dinero key="costo" monto={f.costoPromedio} />,
            <Dinero key="valor" monto={f.valorTotal} />,
            <div key="compra" className="flex items-end gap-2">
              <Campo
                label={`Cantidad — ${f.parteNombre}`}
                type="number"
                className="w-24"
                value={campoCompra(f.parteId).cantidad}
                onChange={(e) => setCompra({ ...compra, [f.parteId]: { ...campoCompra(f.parteId), cantidad: e.target.value } })}
              />
              <Campo
                label={`Costo unitario — ${f.parteNombre}`}
                type="number"
                step="0.01"
                className="w-28"
                value={campoCompra(f.parteId).costo}
                onChange={(e) => setCompra({ ...compra, [f.parteId]: { ...campoCompra(f.parteId), costo: e.target.value } })}
              />
              <Boton
                variante="secundario"
                onClick={() => comprar(f.parteId)}
                disabled={!campoCompra(f.parteId).cantidad || !campoCompra(f.parteId).costo}
              >
                Comprar
              </Boton>
            </div>,
            <Boton
              key="instalar"
              disabled={f.cantidad < 1}
              onClick={() =>
                setParteAInstalar({ tipo: 'commodity', id: f.parteId, nombre: f.parteNombre, costoAplicado: f.costoPromedio })
              }
            >
              Instalar
            </Boton>,
          ])}
        />
      )}

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
