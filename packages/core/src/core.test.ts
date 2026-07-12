import { describe, expect, it } from 'vitest';
import { parseListing } from './parser.js';
import { cadenaCostos, evaluar, precioPuja } from './evaluacion.js';
import { PARAMETROS_DEFAULT, type EntradaEvaluacion, type ModeloInfo, type PrecioIdeal } from './types.js';
import { MODELOS_SEMILLA } from './seeds.js';
import { badgeDeResultado, colorDeMargen } from './badge.js';
import { motivoDescarteDe, lineasDeCompra, filasLaptops, type CompraDatos } from './negocio.js';

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

  it('CPU asumida por modelo cuando el título no la menciona (referencia Dell)', () => {
    const mods: ModeloInfo[] = [{ marca: 'Dell', modelo: 'Latitude 5480', cpuTipo: 'i5', cpuGen: 7, ramSoldada: 'no', reglaCompra: 'normal' }];
    const s = parseListing('Dell Latitude 5480 8GB RAM 256GB SSD', mods);
    expect(s.cpuTipo).toEqual({ valor: 'i5', confianza: 'posible' });
    expect(s.cpuGen).toEqual({ valor: 7, confianza: 'posible' });
    expect(s.alertas.some((a) => a.includes('CONFIRMAR procesador'))).toBe(true);
    // si el título SÍ trae CPU, lo explícito manda
    const s2 = parseListing('Dell Latitude 5480 i7-7600U 8GB RAM', mods);
    expect(s2.cpuTipo).toEqual({ valor: 'i7', confianza: 'confirmado' });
    expect(s2.alertas.some((a) => a.includes('CONFIRMAR procesador'))).toBe(false);
  });

  it('seeds Dell: XPS 13 9310 2-in-1 (RAM y SSD soldados) y XPS 13 (RAM soldada) — advertencia + deducción, no bloqueo', () => {
    const s = parseListing('Dell XPS 13 9310 2-in-1 16GB 512GB', MODELOS_SEMILLA);
    expect(s.bloqueos).toEqual([]);
    expect(s.alertas.some((a) => a.includes('soldada'))).toBe(true);
    const s2 = parseListing('Dell XPS 13 9360 8GB 256GB', MODELOS_SEMILLA);
    expect(s2.bloqueos).toEqual([]);
    expect(s2.alertas.some((a) => a.includes('soldada'))).toBe(true);
    expect(s2.cpuTipo).toEqual({ valor: 'i5', confianza: 'posible' });
    expect(s2.cpuGen.valor).toBe(7);
  });

  it('fallback por número de modelo: "Dell XPS 9360" (sin el 13) detecta XPS 13 9360', () => {
    const s = parseListing('Dell XPS 9360 8GB 256GB SSD', MODELOS_SEMILLA);
    expect(s.modeloDetectado?.modelo).toBe('XPS 13 9360');
    expect(s.alertas.some((a) => a.includes('asumido por número'))).toBe(true);
  });

  it('fallback por número con varios candidatos asume el PEOR (Latitude 9510 > XPS 15 9510)', () => {
    const s = parseListing('Dell 9510 16GB 512GB SSD', MODELOS_SEMILLA);
    expect(s.modeloDetectado?.modelo).toBe('Latitude 9510'); // RAM soldada total gana como peor caso
    expect(s.bloqueos).toEqual([]);
    expect(s.alertas.some((a) => a.includes('soldada'))).toBe(true);
  });

  it('modeloForzado manda sobre la detección', () => {
    const forzado = MODELOS_SEMILLA.find((m) => m.modelo === 'XPS 13 9360')!;
    const s = parseListing('Dell Latitude 5480 8GB', MODELOS_SEMILLA, undefined, forzado);
    expect(s.modeloDetectado?.modelo).toBe('XPS 13 9360');
    expect(s.bloqueos).toEqual([]);
    expect(s.alertas.some((a) => a.includes('soldada'))).toBe(true);
  });

  it('bloqueos en español: no enciende bloquea; "para repuestos/solo piezas/tal como está" solos NO bloquean', () => {
    expect(parseListing('Dell XPS 13 9365 i7 8th Gen 8GB RAM · Para repuestos solamente', []).bloqueos).toEqual([]);
    expect(parseListing('Dell XPS 13 9365 i7 8th Gen 8GB RAM · Para repuestos solamente', []).alertas.some((a) => a.includes('For parts'))).toBe(true);
    expect(parseListing('Laptop HP i5 no enciende', []).bloqueos.length).toBeGreaterThan(0);
    expect(parseListing('Lenovo T480 solo piezas', []).bloqueos).toEqual([]);
    expect(parseListing('Acer se vende tal como está', []).bloqueos).toEqual([]);
    expect(parseListing('Dell Latitude 7490 i5-8350U 8GB RAM funciona perfecto', []).bloqueos).toEqual([]);
  });

  it('bloqueos: for parts + no power (junto sí bloquea), celeron, modelo bloqueado, RAM soldada (ya no bloquea)', () => {
    expect(parseListing('Dell laptop FOR PARTS no power', []).bloqueos.length).toBeGreaterThan(0);
    expect(parseListing('Dell laptop FOR PARTS', []).bloqueos).toEqual([]);
    expect(parseListing('HP Celeron N4000 laptop', []).bloqueos.length).toBeGreaterThan(0);
    expect(parseListing('Dell Latitude 5420 i5-1135G7', MODELOS).bloqueos.some((b) => b.includes('Carcasa'))).toBe(true);
    // Este modelo de prueba tiene AMBOS campos legado a la vez (reglaCompra bloqueada + ramSoldada
    // total) — simula el caso real (ver seeds/migración 0024): debe bloquear una sola vez (por
    // reglaCompra), no dos, y la advertencia de RAM soldada queda como alerta aparte.
    const dosEnUno = parseListing('Dell Latitude 7400 2-in-1 i7-8665U', MODELOS);
    expect(dosEnUno.modeloDetectado?.modelo).toBe('Latitude 7400 2-in-1');
    expect(dosEnUno.bloqueos.length).toBe(1);
    expect(dosEnUno.alertas.some((a) => a.includes('soldada'))).toBe(true);
  });

  it('b) "No OS/No Batt/No HDD/No Power Cord" NUNCA bloquean — alimentan extras', () => {
    const s = parseListing('Lenovo ThinkPad T450 i5-5300U 8GB RAM No OS No Batt No HDD No Power Cord', []);
    expect(s.bloqueos).toEqual([]);
    expect(s.bateriaIncluida).toEqual({ valor: false, confianza: 'confirmado' });
    expect(s.ssdGb).toEqual({ valor: null, confianza: 'confirmado' });
    expect(s.cargadorIncluido.valor).toBe(false);
    expect(s.sinOs).toBe(true);
  });

  it('b) untested → advertencia, no bloqueo; no power sí bloquea', () => {
    const u = parseListing('Dell Latitude 5490 i5-8350U untested', []);
    expect(u.bloqueos).toEqual([]);
    expect(u.alertas.some((a) => a.includes('Untested'))).toBe(true);
    expect(parseListing('Dell laptop NO POWER for repair', []).bloqueos.length).toBe(1);
  });

  it('defectos mencionados → deducciones sugeridas', () => {
    const s = parseListing('Dell Latitude 5400 i5-8265U cracked screen, scratches and dents, missing keys', []);
    expect(s.detallesSugeridos).toContain('Pantalla rota');
    expect(s.detallesSugeridos).toContain('Carcasa marcada');
    expect(s.detallesSugeridos).toContain('Tecla(s) faltante(s)');
    expect(s.bloqueos).toEqual([]);
    expect(parseListing('HP EliteBook 840 G5 i5-8250U 8GB RAM 256GB SSD', []).detallesSugeridos).toEqual([]);
  });

  it('a) detección de lote: "Lot of 2"', () => {
    expect(parseListing('Lot of 2 Lenovo ThinkPad E450 i5-5200U 8GB RAM No HDD No OS No Batt', []).cantidadLote).toBe(2);
    expect(parseListing('Dell Latitude 7490 i5-8350U 8GB', []).cantidadLote).toBeNull();
    expect(parseListing('Dell 1366x768 screen i5', []).cantidadLote).toBeNull();
  });

  it('modo degradado: la semilla de modelos detecta la 5410 (carcasa)', () => {
    const s = parseListing('Dell Latitude 5410 i5-10310U 8GB RAM 256GB SSD', MODELOS_SEMILLA);
    expect(s.bloqueos.some((b) => b.includes('Carcasa se marca fácil'))).toBe(true);
    const x = parseListing('Lenovo ThinkPad X1 Carbon i7-8650U', MODELOS_SEMILLA);
    expect(x.bloqueos).toEqual([]);
    expect(x.alertas.some((a) => a.includes('soldada'))).toBe(true);
  });

  it('§23: avisos de modelo del usuario — severidades', () => {
    const conAvisos: ModeloInfo[] = [{
      marca: 'Dell', modelo: 'Latitude 3520', ramSoldada: 'no', reglaCompra: 'normal',
      avisos: [
        { tipo: 'bisagras_fragiles', severidad: 'bloquea', motivo: 'Bisagras se parten' },
        { tipo: 'pantalla', severidad: 'advierte', motivo: 'Pantallas con manchas frecuentes' },
        { tipo: 'nota', severidad: 'nota', motivo: 'Vende lento' },
      ],
    }];
    const s = parseListing('Dell Latitude 3520 i5-1135G7 8GB RAM 256GB SSD', conAvisos);
    expect(s.bloqueos.some((b) => b.includes('Bisagras se parten'))).toBe(true);
    expect(s.alertas.some((a) => a.includes('Pantallas con manchas'))).toBe(true);
    expect(s.alertas.some((a) => a.includes('Nota: Vende lento'))).toBe(true);
  });

  it('§23: dedupe — un aviso ram_soldada/ssd_soldado en avisos[] no se repite si el campo legado ya lo reporta', () => {
    const conDuplicado: ModeloInfo[] = [{
      marca: 'Dell', modelo: 'Latitude 9999', ramSoldada: 'total', ssdSoldado: true, reglaCompra: 'normal',
      avisos: [
        // Simula el backfill de la migración 0007: mismo hecho, ya cubierto por ramSoldada/ssdSoldado.
        { tipo: 'ram_soldada', severidad: 'bloquea', motivo: 'RAM soldada (copia del backfill)' },
        { tipo: 'ssd_soldado', severidad: 'advierte', motivo: 'SSD soldado (copia del backfill)' },
        { tipo: 'bisagras_fragiles', severidad: 'advierte', motivo: 'Bisagras frágiles' },
      ],
    }];
    const s = parseListing('Dell Latitude 9999 i5-1135G7 8GB RAM 256GB SSD', conDuplicado);
    expect(s.bloqueos).toEqual([]); // el aviso duplicado con severidad 'bloquea' se descarta
    expect(s.alertas.filter((a) => /soldad[oa]/.test(a)).length).toBe(2); // solo las del campo legado (RAM + SSD)
    expect(s.alertas.some((a) => a.includes('backfill'))).toBe(false); // el texto del aviso duplicado no aparece
    expect(s.alertas.some((a) => a.includes('Bisagras frágiles'))).toBe(true); // los avisos sin duplicado sí se listan
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
  const params = { ...PARAMETROS_DEFAULT, tarifaBarcoPorPie3: 20, comisionZinliEstimada: 0.05 };

  it('§19f: Zinli default 0 — sin colchón salvo que se configure', () => {
    expect(PARAMETROS_DEFAULT.comisionZinliEstimada).toBe(0);
    const r = cadenaCostos(entrada, { ...PARAMETROS_DEFAULT, tarifaBarcoPorPie3: 20 });
    expect(r.cadena.conZinli).toBe(110); // sin inflar
  });

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

  it('bloqueado → rojo + motivo "Bloqueada: no pujar" (c)', () => {
    const r = evaluar({ ...entrada, precioSubasta: 10, bloqueado: true }, params, PRECIOS, AJUSTES);
    expect(r.semaforo).toBe('rojo');
    expect(r.sMax).toBeNull();
    expect(r.sinPujaMotivo).toBe('Bloqueada: no pujar');
  });

  it('c) sin margen ni gratis → motivo explícito', () => {
    const r = evaluar(
      { ...entrada, cpuGen: 4, extrasPartes: 120, deducciones: 40, envioUsa: 60 },
      params, PRECIOS, AJUSTES,
    );
    expect(r.sMax).toBeNull();
    expect(r.sinPujaMotivo).toContain('Sin margen ni gratis');
  });

  it('e) CASO REAL: Lot of 2 E450 i5-5200U 8GB $33 + $17.65 ship → amarillo, sin bloqueo (a)', () => {
    const titulo = 'Lot of 2 Lenovo ThinkPad E450 i5-5200U 8GB RAM No HDD No OS No Batt';
    const specs = parseListing(titulo, []);
    expect(specs.bloqueos).toEqual([]);
    expect(specs.cantidadLote).toBe(2);
    const lote: EntradaEvaluacion = {
      precioSubasta: 33, envioUsa: 17.65, extrasPartes: 59 * 2, deducciones: 0,
      metodo: 'barco', volumenPie3: 0.6, pesoKg: 2.5, cantidadLaptops: 2,
      cpuTipo: 'i5', cpuGen: 5, ramGb: 8, ssdGb: 256, pantallaPulgadas: 14, pantallaTactil: false,
      bloqueado: false,
    };
    const r = evaluar(lote, params, PRECIOS, AJUSTES);
    expect(r.valorEsperadoUnidad).toBe(160);
    expect(r.valorEsperado).toBe(320);
    expect(r.cadena.extras).toBe(118);
    expect(r.cadena.envioVzla).toBeCloseTo(0.6 * 2 * 20);
    expect(r.cadena.revision).toBe(10);
    expect(r.costoPorUnidad).toBeGreaterThan(90);
    expect(r.costoPorUnidad).toBeLessThan(110);
    expect(r.margen!).toBeGreaterThan(0.5);
    expect(r.margen!).toBeLessThan(0.7);
    expect(r.semaforo).toBe('amarillo');
    expect(r.sMax).not.toBeNull();
  });

  it('comisión Zinli negativa (ganancia) reduce el costo', () => {
    const conNegativa = cadenaCostos(entrada, { ...params, comisionZinliEstimada: -0.02 });
    expect(conNegativa.cadena.conZinli).toBeCloseTo(110 * 0.98);
  });

  it('§12 compra local: cadena corta', () => {
    const r = cadenaCostos({ ...entrada, origen: 'local', fleteNacional: 8 }, params);
    expect(r.cadena.total).toBeCloseTo(100 + 12 + 8 + 5);
    expect(r.cadena.seguro).toBe(0);
    const ev = evaluar({ ...entrada, origen: 'local', fleteNacional: 8 }, params, PRECIOS, AJUSTES);
    const enTope = cadenaCostos({ ...entrada, origen: 'local', fleteNacional: 8, precioSubasta: ev.sMax! }, params);
    expect((ev.valorEsperado! - enTope.cadena.total) / enTope.cadena.total).toBeCloseTo(params.gananciaMinima, 2);
  });

  it('lote mixto de pantallas: 1×14" + 1×15.6" (13.3 cuenta como 14)', () => {
    const r = evaluar(
      { ...entrada, cantidadLaptops: 2, ramGb: 8, pantallas: [{ pulgadas: 14, cantidad: 1 }, { pulgadas: 15.6, cantidad: 1 }] },
      params, PRECIOS, AJUSTES,
    );
    expect(r.valorEsperado).toBe(220 + 240); // base 220 + (220 + 20 grande)
    const r133 = evaluar(
      { ...entrada, cantidadLaptops: 2, ramGb: 8, pantallas: [{ pulgadas: 13.3, cantidad: 2 }] },
      params, PRECIOS, AJUSTES,
    );
    expect(r133.valorEsperado).toBe(440); // 13.3 = base, sin deducción de pequeña
  });

  it('envío Vzla como $ por laptop (override editable)', () => {
    const r = cadenaCostos({ ...entrada, envioVzlaPorUnidad: 12, cantidadLaptops: 3 }, { ...params, tarifaBarcoPorPie3: null });
    expect(r.cadena.envioVzla).toBe(36);
    expect(r.advertencias).toEqual([]);
  });

  it('tarifa NULL → advertencia y envío 0', () => {
    const r = cadenaCostos(entrada, { ...params, tarifaBarcoPorPie3: null });
    expect(r.advertencias.length).toBe(1);
    expect(r.cadena.envioVzla).toBe(0);
  });
});

describe('negocio §12: origen local vs. eBay', () => {
  const compraBase: CompraDatos = {
    listing: {
      ebayItemId: 'calc-1', url: '', titulo: 'Dell Latitude 5420',
      precioVisto: 100, semaforo: null, specs: null, precioMaxPuja: null, precioPujaDecente: null,
      cantidadLaptops: 1, costoEstimadoTotal: null, valorEsperadoTotal: null, evaluacionManual: null,
      estado: 'comprado',
    },
    envioUsa: 10,
    cantidad: 1,
    metodo: 'barco',
    faltantes: [],
    modeloId: null,
    cpuTipo: 'i5',
    cpuGen: 8,
    ramGb: 16,
    ssdGb: 256,
    pantallaPulgadas: 14,
    pantallaTactil: false,
    valorEsperado: 200,
    cadena: {
      base: 100, conZinli: 100, conEbay: 100, extras: 0, seguro: 5, envioVzla: 20, revision: 10, total: 135,
    },
  };

  it('origen local ⇒ línea flete_nacional + laptops en_revision', () => {
    const compra: CompraDatos = { ...compraBase, origen: 'local' };
    const lineas = lineasDeCompra(compra, 'lote-1', '2026-07-11T00:00:00Z');
    const lineaEnvio = lineas.find((l) => l.monto_estimado === 20);
    expect(lineaEnvio?.tipo).toBe('flete_nacional');
    expect(lineas.some((l) => l.tipo === 'envio_vzla')).toBe(false);

    const filas = filasLaptops(compra, 'lote-1');
    expect(filas.every((f) => f.estado === 'en_revision')).toBe(true);
  });

  it('origen eBay (o sin especificar) ⇒ comportamiento actual: envio_vzla + comprada', () => {
    const lineasSinOrigen = lineasDeCompra(compraBase, 'lote-1', '2026-07-11T00:00:00Z');
    const lineaEnvioSinOrigen = lineasSinOrigen.find((l) => l.monto_estimado === 20);
    expect(lineaEnvioSinOrigen?.tipo).toBe('envio_vzla');
    expect(filasLaptops(compraBase, 'lote-1').every((f) => f.estado === 'comprada')).toBe(true);

    const compraEbay: CompraDatos = { ...compraBase, origen: 'ebay' };
    const lineasEbay = lineasDeCompra(compraEbay, 'lote-1', '2026-07-11T00:00:00Z');
    const lineaEnvioEbay = lineasEbay.find((l) => l.monto_estimado === 20);
    expect(lineaEnvioEbay?.tipo).toBe('envio_vzla');
    expect(filasLaptops(compraEbay, 'lote-1').every((f) => f.estado === 'comprada')).toBe(true);
  });
});

describe('badge §25', () => {
  const params = { ...PARAMETROS_DEFAULT, tarifaBarcoPorPie3: 20, comisionZinliEstimada: 0.05 };
  const entrada: EntradaEvaluacion = {
    precioSubasta: 100, envioUsa: 10, extrasPartes: 12, deducciones: 0,
    metodo: 'barco', volumenPie3: 0.6, pesoKg: 2.5, cantidadLaptops: 1,
    cpuTipo: 'i5', cpuGen: 8, ramGb: 16, ssdGb: 256, pantallaPulgadas: 14, pantallaTactil: false,
    bloqueado: false,
  };

  it('bloqueado ⇒ rojo, sin check', () => {
    const specs = parseListing('Dell Latitude 5420 i5-1135G7 16GB 256GB charger battery included', MODELOS);
    const r = evaluar({ ...entrada, bloqueado: true }, params, PRECIOS, AJUSTES);
    const b = badgeDeResultado(r, specs, params);
    expect(b.nivel).toBe('rojo');
    expect(b.check).toBe(false);
  });

  it('margen ≥ decente ⇒ verde con check', () => {
    const specs = parseListing('Lenovo ThinkPad T480 i5-8350U 16GB RAM 256GB SSD charger battery included', MODELOS);
    const r = evaluar(entrada, params, PRECIOS, AJUSTES);
    const b = badgeDeResultado(r, specs, params);
    expect(r.margen).not.toBeNull();
    expect(b.nivel).toBe(r.semaforo);
    if (r.margen! >= params.gananciaDecente) {
      expect(b.nivel).toBe('verde');
      expect(b.check).toBe(true);
    }
  });

  it('specs no confirmadas (RAM/SSD ausentes del título) ⇒ provisional', () => {
    const specs = parseListing('HP EliteBook 840 G5 i5-8250U', []);
    expect(specs.ramGb.confianza).not.toBe('confirmado');
    const r = evaluar(entrada, params, PRECIOS, AJUSTES);
    const b = badgeDeResultado(r, specs, params);
    expect(b.provisional).toBe(true);
  });

  it('specs todas confirmadas ⇒ no provisional', () => {
    const specs = parseListing('Dell Latitude 7490 i5-8350U 16GB RAM 512GB SSD charger included battery included', []);
    expect(specs.ramGb.confianza).toBe('confirmado');
    expect(specs.ssdGb.confianza).toBe('confirmado');
    expect(specs.cargadorIncluido.valor).toBe(true);
    expect(specs.bateriaIncluida.valor).toBe(true);
    const r = evaluar(entrada, params, PRECIOS, AJUSTES);
    const b = badgeDeResultado(r, specs, params);
    expect(b.provisional).toBe(false);
  });

  it('colorDeMargen es monótono creciente en hue con el margen', () => {
    const bajo = colorDeMargen(0.1, params);
    const medio = colorDeMargen(params.gananciaMinima, params);
    const alto = colorDeMargen(params.gananciaDecente + 0.1, params);
    const hue = (s: string) => Number(s.match(/hsl\((\d+)/)![1]);
    expect(hue(bajo)).toBeLessThan(hue(medio));
    expect(hue(medio)).toBeLessThan(hue(alto));
  });

  it('motivoDescarteDe lee la clave nueva y la legada, ignora vacíos', () => {
    expect(motivoDescarteDe({ motivoDescarte: 'bisagra dañada' })).toBe('bisagra dañada');
    expect(motivoDescarteDe({ bloqueoManual: 'pantalla rota' })).toBe('pantalla rota');
    expect(motivoDescarteDe({ motivoDescarte: '  ' })).toBeNull();
    expect(motivoDescarteDe(null)).toBeNull();
    expect(motivoDescarteDe({ entrada: {} })).toBeNull();
  });

  it('sin margen (sin precio ideal) ⇒ color gris neutro', () => {
    const specs = parseListing('Unknown Brand Weird Model', []);
    const r = evaluar({ ...entrada, cpuTipo: null, cpuGen: null }, params, PRECIOS, AJUSTES);
    const b = badgeDeResultado(r, specs, params);
    expect(r.margen).toBeNull();
    expect(b.color).toBe('hsl(0, 0%, 60%)');
  });
});
