import { describe, expect, it } from 'vitest';
import { parseListing } from './parser.js';
import { cadenaCostos, evaluar, precioPuja } from './evaluacion.js';
import { PARAMETROS_DEFAULT, type EntradaEvaluacion, type ModeloInfo, type PrecioIdeal } from './types.js';

const MODELOS: ModeloInfo[] = [
  { marca: 'Dell', modelo: 'Latitude 5420', ramSoldada: 'no', reglaCompra: 'bloqueada', motivoRegla: 'Carcasa se marca fácil' },
  { marca: 'Dell', modelo: 'Latitude 7400', ramSoldada: 'no', reglaCompra: 'normal' },
  { marca: 'Dell', modelo: 'Latitude 7400 2-in-1', ramSoldada: 'total', reglaCompra: 'bloqueada', motivoRegla: 'RAM soldada' },
  { marca: 'Lenovo', modelo: 'ThinkPad T480', ramSoldada: 'no', reglaCompra: 'normal' },
  { marca: 'Dell', modelo: 'Latitude 5300', ramSoldada: 'revisar', reglaCompra: 'normal' },
];

const PRECIOS: PrecioIdeal[] = [
  { cpuTipo: 'i5', genDesde: 4, genHasta: 5, precioBase: 160 },
  { cpuTipo: 'i5', genDesde: 6, genHasta: 7, precioBase: 180 },
  { cpuTipo: 'i5', genDesde: 8, genHasta: 9, precioBase: 220 },
  { cpuTipo: 'i5', genDesde: 10, genHasta: 10, precioBase: 240 },
  { cpuTipo: 'i5', genDesde: 11, genHasta: 11, precioBase: 260 },
];
const AJUSTES = { i7_sobre_i5: 20, ram_por_8gb: 10, ssd_por_256gb: 20, pantalla_grande: 20, pantalla_tactil: 10, pantalla_pequena: -20 };

describe('parser §5.1', () => {
  it('confirmado: specs explícitas', () => {
    const s = parseListing('Dell Latitude 7490 i5-8350U 16GB RAM 512GB SSD charger included', MODELOS);
    expect(s.cpuTipo).toEqual({ valor: 'i5', confianza: 'confirmado' });
    expect(s.cpuGen.valor).toBe(8);
    expect(s.ramGb).toEqual({ valor: 16, confianza: 'confirmado' });
    expect(s.ssdGb).toEqual({ valor: 512, confianza: 'confirmado' });
    expect(s.cargadorIncluido.valor).toBe(true);
  });

  it('posible: números sueltos → escenario pesimista', () => {
    const s = parseListing('Lenovo ThinkPad T480 i5 8th gen 16GB 512GB', MODELOS);
    expect(s.ramGb).toEqual({ valor: 16, confianza: 'posible' });
    expect(s.ssdGb).toEqual({ valor: 512, confianza: 'posible' });
    expect(s.cpuGen).toEqual({ valor: 8, confianza: 'confirmado' });
  });

  it('no_mencionado: cargador/batería se asumen faltantes', () => {
    const s = parseListing('HP EliteBook 840 G5 i5-8250U 8GB RAM 256GB SSD', []);
    expect(s.cargadorIncluido.confianza).toBe('no_mencionado');
    expect(s.bateriaIncluida.confianza).toBe('no_mencionado');
  });

  it('bloqueos: for parts, celeron, modelo bloqueado, RAM soldada', () => {
    expect(parseListing('Dell laptop FOR PARTS no power', []).bloqueos.length).toBeGreaterThan(0);
    expect(parseListing('HP Celeron N4000 laptop', []).bloqueos.length).toBeGreaterThan(0);
    expect(parseListing('Dell Latitude 5420 i5-1135G7', MODELOS).bloqueos.some((b) => b.includes('Carcasa'))).toBe(true);
    const dosEnUno = parseListing('Dell Latitude 7400 2-in-1 i7-8665U', MODELOS);
    expect(dosEnUno.modeloDetectado?.modelo).toBe('Latitude 7400 2-in-1');
    expect(dosEnUno.bloqueos.some((b) => b.includes('soldada'))).toBe(true);
  });

  it('revisar → advertencia prominente', () => {
    const s = parseListing('Dell Latitude 5300 i5-8365U 8GB RAM', MODELOS);
    expect(s.alertas.some((a) => a.includes('VERIFICAR'))).toBe(true);
  });
});

describe('motor §4', () => {
  const entrada: EntradaEvaluacion = {
    precioSubasta: 100, envioUsa: 10, extrasPartes: 12, deducciones: 0,
    metodo: 'barco', volumenPie3: 0.6, pesoKg: 2.5, cantidadLaptops: 1,
    cpuTipo: 'i5', cpuGen: 8, ramGb: 16, ssdGb: 256, pantallaPulgadas: 14, pantallaTactil: false,
    bloqueado: false,
  };
  const params = { ...PARAMETROS_DEFAULT, tarifaBarcoPorPie3: 20 };

  it('cadena en el orden real del flujo', () => {
    const { cadena } = cadenaCostos(entrada, params);
    expect(cadena.base).toBe(110);
    expect(cadena.conZinli).toBeCloseTo(110 * 1.05);
    expect(cadena.conEbay).toBeCloseTo(110 * 1.05 * 1.07);
    expect(cadena.seguro).toBeCloseTo(110 * 0.05);
    expect(cadena.envioVzla).toBeCloseTo(12);
    expect(cadena.total).toBeCloseTo(110 * 1.05 * 1.07 + 12 + 5.5 + 12 + 5);
  });

  it('valor esperado con ajustes y semáforo', () => {
    const r = evaluar(entrada, params, PRECIOS, AJUSTES);
    expect(r.precioBase).toBe(220);
    expect(r.ajustes).toBe(10); // +8GB RAM
    expect(r.valorEsperado).toBe(230);
    expect(r.semaforo).toBe('rojo'); // margen ≈ 0.45 < ganancia_minima
    expect(r.margen).toBeGreaterThan(0.4);
    expect(r.margen).toBeLessThan(0.5);
  });

  it('S_max: comprar en S_max deja margen ≈ ganancia_minima', () => {
    const r = evaluar(entrada, params, PRECIOS, AJUSTES);
    expect(r.sMax).not.toBeNull();
    expect(r.sDecente).not.toBeNull();
    expect(r.sDecente!).toBeLessThan(r.sMax!);
    const enTope = cadenaCostos({ ...entrada, precioSubasta: r.sMax!, valorDeclarado: r.sMax! + entrada.envioUsa }, params);
    const margen = (r.valorEsperado! - enTope.cadena.total) / enTope.cadena.total;
    expect(margen).toBeCloseTo(params.gananciaMinima, 2);
  });

  it('bloqueado → rojo aunque el margen sea bueno', () => {
    const r = evaluar({ ...entrada, precioSubasta: 10, bloqueado: true }, params, PRECIOS, AJUSTES);
    expect(r.semaforo).toBe('rojo');
  });

  it('comisión Zinli negativa (ganancia) reduce el costo', () => {
    const conNegativa = cadenaCostos(entrada, { ...params, comisionZinliEstimada: -0.02 });
    expect(conNegativa.cadena.conZinli).toBeCloseTo(110 * 0.98);
  });

  it('§12 compra local: cadena corta (precio + partes + flete nacional + revisión)', () => {
    const r = cadenaCostos({ ...entrada, origen: 'local', fleteNacional: 8 }, params);
    expect(r.cadena.total).toBeCloseTo(100 + 12 + 8 + 5);
    expect(r.cadena.seguro).toBe(0);
    const ev = evaluar({ ...entrada, origen: 'local', fleteNacional: 8 }, params, PRECIOS, AJUSTES);
    expect(ev.sMax).not.toBeNull();
    const enTope = cadenaCostos({ ...entrada, origen: 'local', fleteNacional: 8, precioSubasta: ev.sMax! }, params);
    expect((ev.valorEsperado! - enTope.cadena.total) / enTope.cadena.total).toBeCloseTo(params.gananciaMinima, 2);
  });

  it('tarifa NULL → advertencia y envío 0', () => {
    const r = cadenaCostos(entrada, { ...params, tarifaBarcoPorPie3: null });
    expect(r.advertencias.length).toBe(1);
    expect(r.cadena.envioVzla).toBe(0);
  });
});
