'use client';

import { useId } from 'react';

export interface CampoProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** Label + input apilados; pasa cualquier prop de input (type, value, onChange…). */
export function Campo({ label, className = '', id, ...rest }: CampoProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        {...rest}
      />
    </div>
  );
}
