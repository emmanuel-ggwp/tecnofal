'use client';

import { useEffect, useState } from 'react';
import { Tabla } from '@/ui/Tabla';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Dinero } from '@/ui/Dinero';
import { FechaCorta } from '@/ui/FechaCorta';
import {
  actualizarComprador,
  crearComprador,
  listarCompradores,
  listarVentas,
  type Comprador,
  type VentaListado,
} from '@/data/ventas';

export interface CompradoresProps {
  compradorIdInicial?: string | null;
}

export function Compradores({ compradorIdInicial = null }: CompradoresProps) {
  const [compradores, setCompradores] = useState<Comprador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionId, setSeleccionId] = useState<string | null>(compradorIdInicial);
  const [historial, setHistorial] = useState<VentaListado[]>([]);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      setCompradores(await listarCompradores());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar compradores');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  useEffect(() => {
    if (!seleccionId) {
      setHistorial([]);
      return;
    }
    void listarVentas({ compradorId: seleccionId }).then(setHistorial);
  }, [seleccionId]);

  const limpiarForm = () => {
    setNombre('');
    setTelefono('');
    setNotas('');
    setEditandoId(null);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return setError('El nombre es obligatorio.');
    setError(null);
    try {
      if (editandoId) {
        await actualizarComprador(editandoId, {
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          notas: notas.trim() || null,
        });
      } else {
        await crearComprador({
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          notas: notas.trim() || null,
        });
      }
      limpiarForm();
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el comprador');
    }
  };

  const editar = (c: Comprador) => {
    setEditandoId(c.id);
    setNombre(c.nombre);
    setTelefono(c.telefono ?? '');
    setNotas(c.notas ?? '');
  };

  const filas = compradores.map((c) => [
    <button
      key="nombre"
      type="button"
      className="font-medium text-slate-900 underline-offset-2 hover:underline"
      onClick={() => setSeleccionId(c.id)}
    >
      {c.nombre}
    </button>,
    c.telefono ?? '—',
    c.notas ?? '—',
    <Boton key="editar" variante="secundario" onClick={() => editar(c)}>
      Editar
    </Boton>,
  ]);

  return (
    <div className="space-y-6">
      <form onSubmit={guardar} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <Campo label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Campo label="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <Campo label="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
        <Boton type="submit">{editandoId ? 'Guardar cambios' : '+ Nuevo comprador'}</Boton>
        {editandoId && (
          <Boton type="button" variante="secundario" onClick={limpiarForm}>
            Cancelar edición
          </Boton>
        )}
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Tabla
        encabezados={['Nombre', 'Teléfono', 'Notas', '']}
        filas={cargando ? [] : filas}
        claves={compradores.map((c) => c.id)}
        vacio={cargando ? 'Cargando…' : 'Sin compradores'}
        paginado
      />

      {seleccionId && (
        <div>
          <h2 className="text-lg font-semibold">Historial de ventas</h2>
          <Tabla
            encabezados={['Fecha', 'Laptop', 'Precio', 'Estado']}
            filas={historial.map((v) => [
              <FechaCorta key="fecha" fecha={v.fecha} />,
              v.alias,
              <Dinero key="precio" monto={v.precioVenta} moneda={v.moneda} />,
              v.estado,
            ])}
            claves={historial.map((v) => v.id)}
            vacio="Sin ventas registradas"
          />
        </div>
      )}
    </div>
  );
}
