import type { AjustesConfig, PrecioIdeal } from './types.js';

/**
 * Espejo de las semillas SQL (0003_seeds.sql) para modo degradado:
 * la extensión los usa SOLO si no hay sesión/conexión con Supabase.
 * La fuente de verdad siempre son las tablas.
 */
export const PRECIOS_IDEALES_SEMILLA: PrecioIdeal[] = [
  { cpuTipo: 'i5', genDesde: 4, genHasta: 5, precioBase: 160 },
  { cpuTipo: 'i5', genDesde: 6, genHasta: 7, precioBase: 180 },
  { cpuTipo: 'i5', genDesde: 8, genHasta: 9, precioBase: 220 },
  { cpuTipo: 'i5', genDesde: 10, genHasta: 10, precioBase: 240 },
  { cpuTipo: 'i5', genDesde: 11, genHasta: 11, precioBase: 260 },
];

export const AJUSTES_SEMILLA: AjustesConfig = {
  i7_sobre_i5: 20,
  ram_por_8gb: 10,
  ssd_por_256gb: 20,
  pantalla_grande: 20,
  pantalla_tactil: 10,
  pantalla_pequena: -20,
};

/** Precios de referencia de partes para estimar faltantes sin conexión */
export const PARTES_REF_SEMILLA: Record<string, number> = {
  cargador: 12,
  bateria: 25,
  ssd_256: 22,
  ram_8: 14,
};
