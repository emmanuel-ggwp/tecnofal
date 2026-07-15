'use client';

import { useEffect, useRef, useState } from 'react';
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
  // Compra rápida en curso por parte + clave de idempotencia reusada entre reintentos.
  // Un doble-insert dispara trg_partes_promedio 2× y corrompe el promedio (0032).
  const [comprando, setComprando] = useState<Record<string, boolean>>({});
  const reqKeyCompra = useRef<Record<string, string>>({});

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
    if (comprando[parteId]) return; // guard de reentrada: el trigger corrompe el promedio si se duplica
    setError(null);
    const { cantidad, costo } = campoCompra(parteId);
    if (!reqKeyCompra.current[parteId]) reqKeyCompra.current[parteId] = crypto.randomUUID();
    setComprando((c) => ({ ...c, [parteId]: true }));
    try {
      await registrarCompraStock(parteId, Number(cantidad), Number(costo), undefined, reqKeyCompra.current[parteId]);
      delete reqKeyCompra.current[parteId]; // éxito → la próxima compra usa clave nueva
      setCompra({ ...compra, [parteId]: { cantidad: '', costo: '' } });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar la compra');
    } finally {
      setComprando((c) => ({ ...c, [parteId]: false }));
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
                disabled={!campoCompra(f.parteId).cantidad || !campoCompra(f.parteId).costo || !!comprando[f.parteId]}
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
