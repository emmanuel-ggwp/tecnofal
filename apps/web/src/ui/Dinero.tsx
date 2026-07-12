'use client';

export interface DineroProps {
  monto: number | null | undefined;
  moneda?: 'USD' | 'VES';
}

const FORMATOS: Record<'USD' | 'VES', Intl.NumberFormat> = {
  USD: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' }),
  VES: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', currencyDisplay: 'narrowSymbol' }),
};

/** Monto formateado en USD o VES ("—" si es null). */
export function Dinero({ monto, moneda = 'USD' }: DineroProps) {
  if (monto == null || Number.isNaN(monto)) return <span className="text-slate-400">—</span>;
  return <span className="tabular-nums">{FORMATOS[moneda].format(monto)}</span>;
}
