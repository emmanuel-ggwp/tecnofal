'use client';

import { SeccionAjustes } from './secciones/Ajustes';
import { SeccionDetalles } from './secciones/Detalles';
import { SeccionModelos } from './secciones/Modelos';
import { SeccionParametros } from './secciones/Parametros';
import { SeccionPreciosIdeales } from './secciones/PreciosIdeales';

const SECCIONES = [
  { href: '#parametros', nombre: 'Parámetros' },
  { href: '#precios-ideales', nombre: 'Precios ideales' },
  { href: '#ajustes', nombre: 'Ajustes' },
  { href: '#detalles', nombre: 'Detalles' },
  { href: '#modelos', nombre: 'Modelos' },
];

export default function ConfiguracionPage() {
  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="mt-1 text-sm text-slate-500">
          Todo lo editable aquí reemplaza a Supabase Studio para la operación diaria del negocio.
        </p>
        <nav aria-label="Secciones de configuración" className="mt-3 flex flex-wrap gap-3 text-sm">
          {SECCIONES.map((s) => (
            <a key={s.href} href={s.href} className="text-slate-600 underline-offset-2 hover:underline">
              {s.nombre}
            </a>
          ))}
        </nav>
      </div>

      <SeccionParametros />
      <SeccionPreciosIdeales />
      <SeccionAjustes />
      <SeccionDetalles />
      <SeccionModelos />
    </section>
  );
}
