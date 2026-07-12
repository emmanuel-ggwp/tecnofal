'use client';

type Variante = 'primario' | 'secundario' | 'peligro';

const ESTILOS: Record<Variante, string> = {
  primario: 'bg-slate-900 text-white hover:bg-slate-700',
  secundario: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
  peligro: 'bg-red-600 text-white hover:bg-red-500',
};

export interface BotonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
}

export function Boton({ variante = 'primario', className = '', type = 'button', ...rest }: BotonProps) {
  return (
    <button
      type={type}
      className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${ESTILOS[variante]} ${className}`}
      {...rest}
    />
  );
}
