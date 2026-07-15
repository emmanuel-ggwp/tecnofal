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
  cantidad: number;
}

function precioRef(catalogo: Catalogo, patron: RegExp, fallback: number): number {
  const k = Object.keys(catalogo.partesRef).find((n) => patron.test(n));
  return k ? catalogo.partesRef[k] : fallback;
}

/**
 * Partes faltantes según §5.1: no_mencionado → falta; posible → pesimista (falta).
 */
export function faltantesDe(specs: SpecsParseadas, catalogo: Catalogo, cantidadLote = 1): Faltante[] {
  const item = (clave: string, nombre: string, precio: number, falta: boolean): Faltante => ({
    clave, nombre, precio, falta, cantidad: falta ? cantidadLote : 0,
  });
  return [
    item('cargador', 'Cargador', precioRef(catalogo, /cargador/i, 12), specs.cargadorIncluido.valor !== true),
    item('bateria', 'Batería', precioRef(catalogo, /bater/i, 25), specs.bateriaIncluida.valor !== true),
    item('ssd', 'SSD 256GB', precioRef(catalogo, /ssd 256/i, 22), !(specs.ssdGb.confianza === 'confirmado' && (specs.ssdGb.valor ?? 0) > 0)),
    item('ram', 'RAM 8GB', precioRef(catalogo, /ram 8/i, 14), specs.ramGb.valor == null),
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

export function deduccionesSugeridas(
  specs: SpecsParseadas,
  catalogo: Catalogo,
): { nombre: string; monto: number; cantidad: number }[] {
  const FALLBACK: Record<string, number> = { 'Pantalla rota': 30 };
  const base = specs.detallesSugeridos.map((nombre) => ({
    nombre,
    monto: catalogo.detalles.find((d) => d.nombre === nombre)?.deduccionBase ?? FALLBACK[nombre] ?? 15,
    cantidad: 1,
  }));
  // RAM soldada (total/parcial/revisar): añadir deducción automática — ya no bloquea la puja
  const ramSol = specs.modeloDetectado?.ramSoldada;
  if (ramSol === 'parcial' || ramSol === 'revisar' || ramSol === 'total') {
    const det = catalogo.detalles.find((d) => d.nombre === 'RAM soldada');
    if (det && !base.some((d) => d.nombre === 'RAM soldada'))
      base.push({ nombre: det.nombre, monto: det.deduccionBase, cantidad: 1 });
  }
  // SSD soldado: añadir deducción automática
  if (specs.modeloDetectado?.ssdSoldado) {
    const det = catalogo.detalles.find((d) => d.nombre === 'SSD soldado');
    if (det && !base.some((d) => d.nombre === 'SSD soldado'))
      base.push({ nombre: det.nombre, monto: det.deduccionBase, cantidad: 1 });
  }
  return base;
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
  vendedor?: string | null,
): EvaluacionRapida {
  const specs = parseListing(
    titulo, catalogo.modelos, undefined, undefined, vendedor, catalogo.vendedoresConocidos,
    catalogo.vendedoresBateria, catalogo.parametros.bateriaPctUmbral,
  );
  const n = specs.cantidadLote && specs.cantidadLote > 1 ? specs.cantidadLote : 1;
  const extras = faltantesDe(specs, catalogo, n).reduce((s, f) => s + f.precio * f.cantidad, 0);
  const deducciones = deduccionesSugeridas(specs, catalogo).reduce((s, d) => s + d.monto * d.cantidad, 0);
  const entrada: EntradaEvaluacion = {
    precioSubasta: precio,
    envioUsa,
    extrasPartes: extras,
    deducciones,
    metodo,
    envioVzlaPorUnidad: catalogo.parametros.envioVzlaPorLaptop,
    volumenPie3: VOLUMEN_LAPTOP_PIE3,
    pesoKg: PESO_LAPTOP_KG,
    cantidadLaptops: n,
    ...specsPesimistas(specs),
    bloqueado: specs.bloqueos.length > 0,
  };
  const resultado = evaluar(entrada, catalogo.parametros, catalogo.precios, catalogo.ajustes);
  return { specs, entrada, resultado };
}
