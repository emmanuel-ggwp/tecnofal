'use client';

import { useState } from 'react';
import { IndicadorGuardado, type EstadoGuardado } from './_estado';

export interface CeldaTextoProps {
  valor: string | null;
  onGuardar: (valor: string | null) => Promise<void> | void;
  testId?: string;
  /** Si es false, no se puede dejar vacío (muestra error en vez de guardar null). */
  permiteNull?: boolean;
  ancho?: string;
}

/** Celda de texto editable inline (mismo patrón que CeldaNumero: clic → input → blur/Enter). */
export function CeldaTexto({ valor, onGuardar, testId, permiteNull = true, ancho = 'w-40' }: CeldaTextoProps) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? '');
  const [estado, setEstado] = useState<EstadoGuardado>(null);

  const confirmar = async () => {
    const t = texto.trim();
    if (t === '' && !permiteNull) {
      setEstado('error');
      setEditando(false);
      setTimeout(() => setEstado(null), 2000);
      return;
    }
    const nuevo = t === '' ? null : t;
    if (nuevo === (valor ?? null)) {
      setEditando(false);
      return;
    }
    setEstado('guardando');
    try {
      await onGuardar(nuevo);
      setEstado('ok');
    } catch {
      setEstado('error');
    } finally {
      setEditando(false);
      setTimeout(() => setEstado(null), 2000);
    }
  };

  if (!editando) {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          data-testid={testId}
          className={`rounded px-1.5 py-0.5 text-left hover:bg-slate-100 ${ancho} ${!valor ? 'italic text-slate-400' : ''}`}
          onClick={() => {
            setTexto(valor ?? '');
            setEditando(true);
          }}
        >
          {valor && valor.length > 0 ? valor : '—'}
        </button>
        <IndicadorGuardado estado={estado} />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input
        autoFocus
        data-testid={testId}
        className={`rounded-md border border-slate-300 px-2 py-1 text-sm ${ancho}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => void confirmar()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditando(false);
        }}
      />
      <IndicadorGuardado estado={estado} />
    </span>
  );
}
