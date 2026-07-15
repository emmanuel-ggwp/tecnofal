'use client';

import { useEffect, useMemo, useState } from 'react';

export const TAMANOS_PAGINA = [10, 25, 50, 100] as const;
const TAMANO_DEFAULT = 25;

export interface PaginacionCliente<T> {
  pagina: number; // 1-based
  tamano: number;
  totalPaginas: number;
  total: number;
  visibles: T[];
  /** 1-based; primera fila visible (0 si no hay filas). */
  rangoDesde: number;
  /** 1-based; última fila visible (0 si no hay filas). */
  rangoHasta: number;
  setPagina: (p: number) => void;
  setTamano: (t: number) => void;
}

/**
 * Paginación en cliente: corta un arreglo ya cargado en memoria. No toca datos.
 * La página se clampa a [1, totalPaginas] en cada render, así que si un filtro reduce el set
 * (o se borran filas) nunca queda una página fuera de rango; y vuelve a 1 al cambiar el tamaño.
 */
export function usePaginacionCliente<T>(
  items: T[],
  opts: { tamanoInicial?: number } = {},
): PaginacionCliente<T> {
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamanoInterno] = useState(opts.tamanoInicial ?? TAMANO_DEFAULT);

  const total = items.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));

  // Clampa la página si el total encogió (nuevos filtros, recarga, borrado).
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const paginaEfectiva = Math.min(pagina, totalPaginas);

  const setTamano = (t: number) => {
    setTamanoInterno(t);
    setPagina(1);
  };

  const visibles = useMemo(
    () => items.slice((paginaEfectiva - 1) * tamano, paginaEfectiva * tamano),
    [items, paginaEfectiva, tamano],
  );

  const rangoDesde = total === 0 ? 0 : (paginaEfectiva - 1) * tamano + 1;
  const rangoHasta = Math.min(paginaEfectiva * tamano, total);

  return {
    pagina: paginaEfectiva,
    tamano,
    totalPaginas,
    total,
    visibles,
    rangoDesde,
    rangoHasta,
    setPagina,
    setTamano,
  };
}
