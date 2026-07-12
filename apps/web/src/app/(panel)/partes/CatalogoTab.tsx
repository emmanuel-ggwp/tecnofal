'use client';

import { useEffect, useState } from 'react';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Dinero } from '@/ui/Dinero';
import { Modal } from '@/ui/Modal';
import { Tabla } from '@/ui/Tabla';
import {
  actualizarParteCatalogo,
  crearParteCatalogo,
  eliminarParteCatalogo,
  listarCatalogo,
  type ParteCatalogo,
} from '@/data/partes';

interface FormEstado {
  nombre: string;
  precioReferencia: string;
  valorNominal: string;
  volumenPie3: string;
  pesoKg: string;
}

const FORM_VACIO: FormEstado = { nombre: '', precioReferencia: '', valorNominal: '', volumenPie3: '', pesoKg: '' };

export function CatalogoTab() {
  const [partes, setPartes] = useState<ParteCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<ParteCatalogo | null>(null);
  const [form, setForm] = useState<FormEstado>(FORM_VACIO);

  async function cargar() {
    setCargando(true);
    try {
      setPartes(await listarCatalogo());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el catálogo');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrirAlta() {
    setEditando(null);
    setForm(FORM_VACIO);
    setModalAbierto(true);
  }

  function abrirEdicion(p: ParteCatalogo) {
    setEditando(p);
    setForm({
      nombre: p.nombre,
      precioReferencia: String(p.precioReferencia),
      valorNominal: p.valorNominal != null ? String(p.valorNominal) : '',
      volumenPie3: p.volumenPie3 != null ? String(p.volumenPie3) : '',
      pesoKg: p.pesoKg != null ? String(p.pesoKg) : '',
    });
    setModalAbierto(true);
  }

  async function guardar() {
    setError(null);
    try {
      const input = {
        nombre: form.nombre,
        precioReferencia: Number(form.precioReferencia),
        valorNominal: form.valorNominal ? Number(form.valorNominal) : null,
        volumenPie3: form.volumenPie3 ? Number(form.volumenPie3) : null,
        pesoKg: form.pesoKg ? Number(form.pesoKg) : null,
      };
      if (editando) {
        await actualizarParteCatalogo(editando.id, input);
      } else {
        await crearParteCatalogo(input);
      }
      setModalAbierto(false);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar la parte');
    }
  }

  async function eliminar(id: string) {
    setError(null);
    try {
      await eliminarParteCatalogo(id);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar (puede tener stock o referencias).');
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Catálogo de partes</h2>
        <Boton onClick={abrirAlta}>+ Nueva parte</Boton>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <Tabla
          encabezados={['Nombre', 'Precio referencia', 'Valor nominal', 'Volumen (pie³)', 'Peso (kg)', '']}
          claves={partes.map((p) => p.id)}
          filas={partes.map((p) => [
            p.nombre,
            <Dinero key="precio" monto={p.precioReferencia} />,
            p.valorNominal != null ? <Dinero key="nominal" monto={p.valorNominal} /> : '—',
            p.volumenPie3 ?? '—',
            p.pesoKg ?? '—',
            <div key="acciones" className="flex gap-2">
              <Boton variante="secundario" onClick={() => abrirEdicion(p)}>
                Editar
              </Boton>
              <Boton variante="peligro" onClick={() => eliminar(p.id)}>
                Eliminar
              </Boton>
            </div>,
          ])}
        />
      )}

      <Modal abierto={modalAbierto} titulo={editando ? 'Editar parte' : 'Nueva parte'} onCerrar={() => setModalAbierto(false)}>
        <div className="flex flex-col gap-3">
          <Campo label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <Campo
            label="Precio de referencia"
            type="number"
            step="0.01"
            value={form.precioReferencia}
            onChange={(e) => setForm({ ...form, precioReferencia: e.target.value })}
          />
          <Campo
            label="Valor nominal"
            type="number"
            step="0.01"
            value={form.valorNominal}
            onChange={(e) => setForm({ ...form, valorNominal: e.target.value })}
          />
          <Campo
            label="Volumen (pie³)"
            type="number"
            step="0.01"
            value={form.volumenPie3}
            onChange={(e) => setForm({ ...form, volumenPie3: e.target.value })}
          />
          <Campo
            label="Peso (kg)"
            type="number"
            step="0.01"
            value={form.pesoKg}
            onChange={(e) => setForm({ ...form, pesoKg: e.target.value })}
          />
          <Boton onClick={guardar}>{editando ? 'Guardar cambios' : 'Agregar parte'}</Boton>
        </div>
      </Modal>
    </div>
  );
}
