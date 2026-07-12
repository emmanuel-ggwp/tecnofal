'use client';

import { useState } from 'react';
import { IndicadorGuardado, type EstadoGuardado } from './_estado';

export interface CeldaNumeroProps {
  valor: number | null;
  onGuardar: (valor: number | null) => Promise<void> | void;
  testId?: string;
  /** Si es false, un campo vacío no se guarda como NULL (muestra error). */
  permiteNull?: boolean;
}

/**
 * Celda numérica editable inline: muestra el valor con 2 decimales (o "—" si es NULL),
 * al hacer clic se convierte en input; guarda en blur/Enter y muestra un indicador de estado.
 */
export function CeldaNumero({ valor, onGuardar, testId, permiteNull = true }: CeldaNumeroProps) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor == null ? '' : String(valor));
  const [estado, setEstado] = useState<EstadoGuardado>(null);

  const formateado = valor == null ? '—' : valor.toFixed(2);

  const confirmar = async () => {
    const t = texto.trim();
    if (t === '' && !permiteNull) {
      setEstado('error');
      setEditando(false);
      setTimeout(() => setEstado(null), 2000);
      return;
    }
    const nuevo = t === '' ? null : Number(t);
    if (nuevo !== null && Number.isNaN(nuevo)) {
      setEstado('error');
      setTimeout(() => setEstado(null), 2000);
      return;
    }
    if (nuevo === valor) {
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
          className={`rounded px-1.5 py-0.5 text-left tabular-nums hover:bg-slate-100 ${
            valor == null ? 'italic text-slate-400' : ''
          }`}
          onClick={() => {
            setTexto(valor == null ? '' : String(valor));
            setEditando(true);
          }}
        >
          {formateado}
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
        type="number"
        step="0.01"
        inputMode="decimal"
        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums"
        placeholder={permiteNull ? 'sin valor' : undefined}
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
