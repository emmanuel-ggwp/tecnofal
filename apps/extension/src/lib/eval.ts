import {
  evaluar, parseListing,
  type EntradaEvaluacion, type MetodoEnvio, type ResultadoEvaluacion, type SpecsParseadas,
} from '@tecnofal/core';
import type { Catalogo } from './mensajes';

/** Volumen/peso típicos de una laptop empacada (editables en el panel) */
export const VOLUMEN_LAPTOP_PIE3 = 0.6;
export const PESO_LAPTOP_KG = 3;

export interface Faltante {
  clave: string;
  nombre: string;
  precio: number;
  falta: boolean;
}

function precioRef(catalogo: Catalogo, patron: RegExp, fallback: number): number {
  const k = Object.keys(catalogo.partesRef).find((n) => patron.test(n));
  return k ? catalogo.partesRef[k] : fallback;
}

/**
 * Partes faltantes según §5.1: no_mencionado → falta; posible → pesimista (falta).
 */
export function faltantesDe(specs: SpecsParseadas, catalogo: Catalogo): Faltante[] {
  return [
    {
      clave: 'cargador', nombre: 'Cargador',
      precio: precioRef(catalogo, /cargador/i, 12),
      falta: specs.cargadorIncluido.valor !== true,
    },
    {
      clave: 'bateria', nombre: 'Batería',
      precio: precioRef(catalogo, /bater/i, 25),
      falta: specs.bateriaIncluida.valor !== true,
    },
    {
      clave: 'ssd', nombre: 'SSD 256GB',
      precio: precioRef(catalogo, /ssd 256/i, 22),
      falta: !(specs.ssdGb.confianza === 'confirmado' && (specs.ssdGb.valor ?? 0) > 0),
    },
    {
      clave: 'ram', nombre: 'RAM 8GB',
      precio: precioRef(catalogo, /ram 8/i, 14),
      falta: specs.ramGb.valor == null,
    },
  ];
}

/** Specs pesimistas para el valor esperado: solo lo confirmado suma ajustes */
export function specsPesimistas(specs: SpecsParseadas) {
  return {
    cpuTipo: specs.cpuTipo.valor,
    cpuGen: specs.cpuGen.valor,
    ramGb: specs.ramGb.confianza === 'confirmado' && specs.ramGb.valor != null ? specs.ramGb.valor : 8,
    ssdGb: specs.ssdGb.confianza === 'confirmado' && specs.ssdGb.valor != null ? specs.ssdGb.valor : 256,
    pantallaPulgadas: specs.pantallaPulgadas.valor,
    pantallaTactil: specs.pantallaTactil.valor === true,
  };
}

export interface EvaluacionRapida {
  specs: SpecsParseadas;
  entrada: EntradaEvaluacion;
  resultado: ResultadoEvaluacion;
}

/** Evaluación rápida para badges en resultados de búsqueda */
export function evaluarListado(
  titulo: string,
  precio: number,
  envioUsa: number,
  catalogo: Catalogo,
  metodo: MetodoEnvio = 'barco',
): EvaluacionRapida {
  const specs = parseListing(titulo, catalogo.modelos);
  const extras = faltantesDe(specs, catalogo)
    .filter((f) => f.falta)
    .reduce((s, f) => s + f.precio, 0);
  const entrada: EntradaEvaluacion = {
    precioSubasta: precio,
    envioUsa,
    extrasPartes: extras,
    deducciones: 0,
    metodo,
    volumenPie3: VOLUMEN_LAPTOP_PIE3,
    pesoKg: PESO_LAPTOP_KG,
    cantidadLaptops: 1,
    ...specsPesimistas(specs),
    bloqueado: specs.bloqueos.length > 0,
  };
  const resultado = evaluar(entrada, catalogo.parametros, catalogo.precios, catalogo.ajustes);
  return { specs, entrada, resultado };
}
