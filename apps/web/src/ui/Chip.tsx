'use client';

export type TonoChip = 'verde' | 'amarillo' | 'rojo' | 'azul' | 'gris' | 'naranja';

const TONOS: Record<TonoChip, string> = {
  verde: 'bg-green-100 text-green-800',
  amarillo: 'bg-yellow-100 text-yellow-800',
  rojo: 'bg-red-100 text-red-800',
  azul: 'bg-blue-100 text-blue-800',
  gris: 'bg-slate-100 text-slate-600',
  naranja: 'bg-orange-100 text-orange-800',
};

export interface ChipProps {
  tono?: TonoChip;
  children: React.ReactNode;
  testId?: string;
}

/** Etiqueta pequeña de estado con color. */
export function Chip({ tono = 'gris', children, testId }: ChipProps) {
  return (
    <span
      data-testid={testId}
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONOS[tono]}`}
    >
      {children}
    </span>
  );
}
