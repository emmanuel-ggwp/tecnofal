import type { Confianza, CpuTipo, ModeloInfo, Spec, SpecsParseadas } from './types.js';

const spec = <T>(valor: T | null, confianza: Confianza): Spec<T> => ({ valor, confianza });

/** Normaliza para comparar modelos: minúsculas, sin separadores */
const norm = (s: string) => s.toLowerCase().replace(/[\s\-_/]+/g, ' ').trim();

/**
 * Parser con niveles de confianza (§5.1).
 * - confirmado: se usa tal cual
 * - posible: escenario PESIMISTA (se asume lo peor hasta confirmar)
 * - no_mencionado: se asume que FALTA y se suma su costo estimado
 */
export function parseListing(texto: string, modelos: ModeloInfo[] = []): SpecsParseadas {
  const t = texto;
  const alertas: string[] = [];
  const bloqueos: string[] = [];

  // ---- CPU tipo + generación ----
  let cpuTipo = spec<CpuTipo>(null, 'no_mencionado');
  let cpuGen = spec<number>(null, 'no_mencionado');

  const intel = t.match(/\bi([357])[- ]?(\d{4,5})[A-Za-z]{0,2}\b/i);
  if (intel) {
    cpuTipo = spec<CpuTipo>(`i${intel[1]}` as CpuTipo, 'confirmado');
    const num = intel[2];
    cpuGen = spec(num.length >= 5 ? parseInt(num.slice(0, 2), 10) : parseInt(num[0], 10), 'confirmado');
  } else {
    const intelSolo = t.match(/\b(?:core\s*)?i([357])\b/i);
    if (intelSolo) cpuTipo = spec<CpuTipo>(`i${intelSolo[1]}` as CpuTipo, 'confirmado');
    const ryzen = t.match(/\bryzen\s*([357])\b(?:[^0-9]{0,20}(\d)\d{3}\b)?/i);
    if (ryzen) {
      cpuTipo = spec<CpuTipo>(`ryzen${ryzen[1]}` as CpuTipo, 'confirmado');
      if (ryzen[2]) cpuGen = spec(parseInt(ryzen[2], 10), 'posible');
    }
  }
  if (cpuGen.valor === null) {
    const genTxt = t.match(/\b(\d{1,2})(?:st|nd|rd|th)\s*gen(?:eration)?\b/i);
    if (genTxt) cpuGen = spec(parseInt(genTxt[1], 10), 'confirmado');
  }

  // ---- Almacenamiento ----
  let ssdGb = spec<number>(null, 'no_mencionado');
  let esHdd = spec<boolean>(null, 'no_mencionado');
  const ssdM = t.match(/(\d+(?:\.\d+)?)\s*(GB|TB)\s*(?:SSD|NVMe|M\.2|PCIe|Solid)/i);
  if (ssdM) {
    const n = parseFloat(ssdM[1]) * (/tb/i.test(ssdM[2]) ? 1024 : 1);
    ssdGb = spec(Math.round(n), 'confirmado');
    esHdd = spec(false, 'confirmado');
  }
  if (/(\d+)\s*(?:GB|TB)\s*HDD|\bHDD\b|hard\s*drive/i.test(t) && ssdGb.valor === null) {
    esHdd = spec(true, 'confirmado'); // pesimista: falta SSD
  }
  if (/\bno\s+(?:ssd|hdd|hard\s*drive|storage|hard\s*disk)\b/i.test(t)) {
    ssdGb = spec<number>(null, 'confirmado'); // confirmado que falta
    esHdd = spec(false, 'confirmado');
  }

  // ---- RAM ----
  let ramGb = spec<number>(null, 'no_mencionado');
  const ramM = t.match(/(\d{1,3})\s*GB\s*(?:DDR[2345][A-Za-z0-9]*|RAM|memory)/i);
  if (ramM) ramGb = spec(parseInt(ramM[1], 10), 'confirmado');
  if (/\bno\s+(?:ram|memory)\b/i.test(t)) ramGb = spec<number>(null, 'confirmado');

  // ---- "N GB" sueltos → posible (pesimista) ----
  if (ramGb.valor === null || ssdGb.valor === null) {
    const sueltos = [...t.matchAll(/\b(\d{1,4})\s*GB\b/gi)]
      .map((m) => parseInt(m[1], 10))
      .filter((n) => (ramM ? n !== ramGb.valor : true))
      .filter((n) => (ssdM ? n !== ssdGb.valor : true));
    for (const n of sueltos) {
      if (n <= 64 && ramGb.confianza === 'no_mencionado') ramGb = spec(n, 'posible');
      else if (n >= 128 && ssdGb.confianza === 'no_mencionado') {
        // "512" sin la palabra SSD: podría ser HDD → pesimista: se asume que falta SSD
        ssdGb = spec(n, 'posible');
      }
    }
  }

  // ---- Pantalla ----
  let pantallaPulgadas = spec<number>(null, 'no_mencionado');
  const pulg = t.match(/\b(1[0-7](?:\.\d)?)\s*(?:"|”|''|-?\s*inch|in\b)/i);
  if (pulg) pantallaPulgadas = spec(parseFloat(pulg[1]), 'confirmado');
  let pantallaTactil = spec<boolean>(null, 'no_mencionado');
  if (/non[- ]?touch|no\s+touch/i.test(t)) pantallaTactil = spec(false, 'confirmado');
  else if (/touch\s*(?:screen)?/i.test(t)) pantallaTactil = spec(true, 'confirmado');

  // ---- Cargador / batería / OS ----
  let cargadorIncluido = spec<boolean>(null, 'no_mencionado'); // no dice nada → se asume que FALTA
  if (/no\s+(?:charger|adapter|ac\s*adapter|power\s*(?:cord|supply|adapter))/i.test(t)) cargadorIncluido = spec(false, 'confirmado');
  else if (/(?:charger|adapter)\s+(?:included|incl)/i.test(t) || /with\s+charger/i.test(t)) cargadorIncluido = spec(true, 'confirmado');

  let bateriaIncluida = spec<boolean>(null, 'no_mencionado');
  if (/no\s+battery|battery\s+(?:not\s+included|missing|removed|dead|bad)/i.test(t)) bateriaIncluida = spec(false, 'confirmado');
  else if (/battery\s+(?:included|good|great|holds|tested|health)/i.test(t)) bateriaIncluida = spec(true, 'confirmado');

  const sinOs = /no\s+(?:os|operating\s*system|windows)\b/i.test(t);

  // ---- Bloqueos por texto (§4.5) ----
  if (/for\s*parts|parts\s*only|not\s*working|no\s*power|does\s*n[o']t\s*(?:power|turn|boot)|won'?t\s*(?:power|turn|boot)/i.test(t))
    bloqueos.push('"No enciende / for parts" — bloqueada (salvo marcado manual como donante)');
  if (/\b(celeron|pentium|athlon)\b/i.test(t)) bloqueos.push('CPU Celeron/Pentium/Athlon — bloqueada');
  if (/chromebook/i.test(t)) bloqueos.push('Chromebook — bloqueada');
  if (/\bas[- ]is\b/i.test(t)) alertas.push('"As-is": revisar bien la descripción y fotos');
  if (/1366\s*x\s*768|\bTN\s+panel\b/i.test(t)) alertas.push('Pantalla 1366×768 TN — condicional (decide el precio)');

  // ---- Detección de modelo contra la tabla `modelos` ----
  const tn = norm(t.replace(/2[- ]?in[- ]?1/gi, '2-in-1'));
  const candidatos = modelos
    .filter((m) => tn.includes(norm(m.modelo.replace(/2[- ]?in[- ]?1/gi, '2-in-1'))))
    .sort((a, b) => b.modelo.length - a.modelo.length);
  const modeloDetectado = candidatos[0] ?? null;

  if (modeloDetectado) {
    if (modeloDetectado.reglaCompra === 'bloqueada')
      bloqueos.push(`${modeloDetectado.marca} ${modeloDetectado.modelo}: ${modeloDetectado.motivoRegla ?? 'regla bloqueada'}`);
    if (modeloDetectado.reglaCompra === 'condicional')
      alertas.push(`Condicional: ${modeloDetectado.motivoRegla ?? 'el semáforo decide por precio'}`);
    if (modeloDetectado.ramSoldada === 'total')
      bloqueos.push('RAM totalmente soldada — bloqueada');
    if (modeloDetectado.ramSoldada === 'revisar')
      alertas.push('⚠ RAM posiblemente soldada — VERIFICAR service manual o preguntar al vendedor ANTES de pujar');
    if (modeloDetectado.ramSoldada === 'parcial')
      alertas.push('RAM parcial: 1 soldada + 1 slot libre');
    if (modeloDetectado.ssdSoldado)
      alertas.push('⚠ SSD posiblemente soldado — revisar');
    if (modeloDetectado.marca.toLowerCase() === 'dell')
      alertas.push('Dell: preferencia blanda (repuestos fáciles)');
  }
  if (cpuTipo.valor === 'i3') alertas.push('i3: condicional — el semáforo decide por precio');

  return {
    cpuTipo, cpuGen, ramGb, ssdGb, esHdd,
    pantallaPulgadas, pantallaTactil, cargadorIncluido, bateriaIncluida,
    sinOs, modeloDetectado, alertas, bloqueos,
  };
}
