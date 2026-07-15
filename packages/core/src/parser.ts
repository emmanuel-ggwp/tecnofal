import type { Confianza, CpuTipo, ModeloInfo, Spec, SpecsParseadas } from './types.js';

const spec = <T>(valor: T | null, confianza: Confianza): Spec<T> => ({ valor, confianza });

const norm = (s: string) => s.toLowerCase().replace(/[\s\-_/]+/g, ' ').trim();

// Slot/bahía/puerto/conector de disco dañado = placa dañada (no se arregla barato) → bloquea.
// El disco en sí dañado o ausente NO bloquea: se reemplaza, igual que "No SSD/No HDD" (alimenta faltantes).
// La ventana entre slot y daño no cruza , . ; · ( ) para no mezclar frases/campos del listado.
const SLOT_DISCO = String.raw`\b(?:ssd|hdd|m\.?2|nvme|sata|hard\s*(?:drive|disk)|storage)[\s()/-]{0,3}(?:slots?|bays?|cadd(?:y|ies)|connectors?|ports?|trays?)\b(?!\s*(?:covers?|doors?|lids?|screws?))`;
const DANO_SLOT_DISCO: RegExp[] = [
  // "SSD slot is broken", "M.2 slot damaged", "hard drive connector not working"
  new RegExp(SLOT_DISCO + String.raw`[^.,;:·|()!]{0,25}\b(?:broken|damaged?|crack(?:ed)?|faulty|defective|bad|dead|inoperable|non[- ]?working|not\s+working|do(?:es)?\s*n[o']?t\s+work|won'?t\s+work)`, 'i'),
  // "broken SSD slot", "damage to the M.2 port", "bad hdd caddy"
  new RegExp(String.raw`\b(?:broken|damaged?|crack(?:ed)?|faulty|defective|bad|dead)\s+(?:(?:to|on|in|the|a)\s+){0,2}` + SLOT_DISCO, 'i'),
  // locale español (eBay LATAM traduce los listados): "la ranura del SSD está rota/dañada"
  /(?<!(?:tapas?|cubiertas?)\s+de\s+(?:la|el)\s+)\b(?:ranuras?|puertos?|conectore?s?|bah[ií]as?|slots?)\s+(?:(?:de|del|para|el|la)\s+){0,2}(?:ssd|hdd|m\.?2|nvme|discos?(?:\s+duros?)?(?!\s+[óo]ptic)|almacenamiento)\b[^.,;:·|()!]{0,25}\b(?:rot[oa]s?|dañad[oa]s?|quebrad[oa]s?|partid[oa]s?|mal[oa]s?|muert[oa]s?|no\s+funcionan?|no\s+sirven?)/i,
];

// §5.1 cargador: en texto real (packing list de la descripción, item specifics) casi nunca
// aparece "charger included" tal cual — lo común es "1x Original Power Charger", "Charger:
// Genuine Dell 65W", "AC Adapter" como línea de contenido de la caja. Mencionar el cargador/
// adaptador casi siempre implica que se incluye; cuando falta, el vendedor SIEMPRE lo dice con
// una negación explícita — por eso se prioriza detectar esa negación primero, y cualquier otra
// mención se toma como confirmación (en vez de exigir la frase exacta "charger included").
const CARGADOR_KW = String.raw`(?:charger|adapter|ac\s*adapter|power\s*(?:cord|supply|adapter|brick)|ac\s+cord|cargador(?:es)?|adaptador(?:es)?)s?`;
const SIN_CARGADOR: RegExp[] = [
  new RegExp(String.raw`\bno\s+` + CARGADOR_KW + String.raw`\b`, 'i'),
  new RegExp(CARGADOR_KW + String.raw`\b[^.,;:·|()!]{0,20}\b(?:not\s+included|not\s+provided|missing|excluded|sold\s+separately)\b`, 'i'),
  new RegExp(String.raw`\bwithout\b[^.,;:·|()!]{0,20}\b(?:charger|adapter)\b`, 'i'),
  new RegExp(String.raw`\bsin\b[^.,;:·|()!]{0,20}` + CARGADOR_KW, 'i'),
];
const CON_CARGADOR = new RegExp(String.raw`\b` + CARGADOR_KW + String.raw`\b`, 'i');

/** Peor primero: bloqueada > RAM soldada total > condicional > revisar/parcial > normal; empate → gen más vieja */
const rangoPeor = (m: ModeloInfo): number =>
  m.reglaCompra === 'bloqueada' ? 0
  : m.ramSoldada === 'total' ? 1
  : m.reglaCompra === 'condicional' ? 2
  : m.ramSoldada === 'revisar' || m.ramSoldada === 'parcial' ? 3
  : 4;

export function parseListing(
  texto: string,
  modelos: ModeloInfo[] = [],
  textoDanos?: string,
  modeloForzado?: ModeloInfo | null,
  vendedor?: string | null,
  vendedoresConocidos?: string[],
  vendedoresBateria?: string[],
  bateriaPctUmbral = 70,
): SpecsParseadas {
  const t = texto;
  const td = textoDanos ?? texto;
  const alertas: string[] = [];
  const bloqueos: string[] = [];

  let cantidadLote: number | null = null;
  const lote = t.match(/\blote?\s*(?:of|de)?\s*\(?(\d{1,2})\)?\b/i) ?? t.match(/\b(\d{1,2})\s*(?:x\b|units?\b|pcs\b|laptops\b)/i);
  if (lote) {
    const n = parseInt(lote[1], 10);
    if (n >= 2 && n <= 30) cantidadLote = n;
  }

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

  let ssdGb = spec<number>(null, 'no_mencionado');
  let esHdd = spec<boolean>(null, 'no_mencionado');
  const ssdM = t.match(/(\d+(?:\.\d+)?)\s*(GB|TB)\s*(?:SSD|NVMe|M\.2|PCIe|Solid)/i);
  if (ssdM) {
    const n = parseFloat(ssdM[1]) * (/tb/i.test(ssdM[2]) ? 1024 : 1);
    ssdGb = spec(Math.round(n), 'confirmado');
    esHdd = spec(false, 'confirmado');
  }
  if (/(\d+)\s*(?:GB|TB)\s*HDD|\bHDD\b|hard\s*drive/i.test(t) && ssdGb.valor === null) {
    esHdd = spec(true, 'confirmado');
  }
  if (/\bno\s+(?:ssd|hdd|hard\s*drive|storage|hard\s*disk)\b/i.test(t)) {
    ssdGb = spec<number>(null, 'confirmado');
    esHdd = spec(false, 'confirmado');
  }

  let ramGb = spec<number>(null, 'no_mencionado');
  const ramM = t.match(/(\d{1,3})\s*GB\s*(?:DDR[2345][A-Za-z0-9]*|RAM|memory)/i);
  if (ramM) ramGb = spec(parseInt(ramM[1], 10), 'confirmado');
  if (/\bno\s+(?:ram|memory)\b/i.test(t)) ramGb = spec<number>(null, 'confirmado');

  if (ramGb.valor === null || ssdGb.valor === null) {
    const sueltos = [...t.matchAll(/\b(\d{1,4})\s*GB\b/gi)]
      .map((m) => parseInt(m[1], 10))
      .filter((n) => (ramM ? n !== ramGb.valor : true))
      .filter((n) => (ssdM ? n !== ssdGb.valor : true));
    for (const n of sueltos) {
      if (n <= 64 && ramGb.confianza === 'no_mencionado') ramGb = spec(n, 'posible');
      else if (n >= 128 && ssdGb.confianza === 'no_mencionado') ssdGb = spec(n, 'posible');
    }
  }

  let pantallaPulgadas = spec<number>(null, 'no_mencionado');
  const pulg = t.match(/\b(1[0-7](?:\.\d)?)\s*(?:"|”|''|-?\s*inch|in\b)/i);
  if (pulg) pantallaPulgadas = spec(parseFloat(pulg[1]), 'confirmado');
  let pantallaTactil = spec<boolean>(null, 'no_mencionado');
  if (/non[- ]?touch|no\s+touch/i.test(t)) pantallaTactil = spec(false, 'confirmado');
  else if (/touch\s*(?:screen)?/i.test(t)) pantallaTactil = spec(true, 'confirmado');

  let cargadorIncluido = spec<boolean>(null, 'no_mencionado');
  if (SIN_CARGADOR.some((re) => re.test(t))) cargadorIncluido = spec(false, 'confirmado');
  else if (CON_CARGADOR.test(t)) cargadorIncluido = spec(true, 'confirmado');

  let bateriaIncluida = spec<boolean>(null, 'no_mencionado');
  if (/no\s+batt(?:ery)?\b|battery\s+(?:not\s+included|missing|removed|dead|bad)/i.test(t)) bateriaIncluida = spec(false, 'confirmado');
  else if (/battery\s+(?:included|good|great|holds|tested|health)/i.test(t)) bateriaIncluida = spec(true, 'confirmado');

  // % de salud de batería (ej. "Battery Health 87%", "87% battery", "batería al 90%").
  // Ventana acotada de 20 caracteres sin cruzar , . ; · ( ) — mismo criterio que SLOT_DISCO.
  const BATERIA_PCT: RegExp[] = [
    /batt(?:ery)?\b[^.,;:·|()!]{0,20}?\b(\d{1,3})\s*%/i,
    /\b(\d{1,3})\s*%[^.,;:·|()!]{0,20}?\bbatt(?:ery)?\b/i,
    /bater[ií]a\b[^.,;:·|()!]{0,20}?\b(\d{1,3})\s*%/i,
    /\b(\d{1,3})\s*%[^.,;:·|()!]{0,20}?\bbater[ií]a\b/i,
  ];
  let bateriaPct = spec<number>(null, 'no_mencionado');
  for (const re of BATERIA_PCT) {
    const m = t.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 0 && n <= 100) { bateriaPct = spec(n, 'confirmado'); break; }
    }
  }
  // el % explícito manda sobre el keyword genérico "health"/"good"/etc.: por encima del
  // umbral no hace falta presupuestar batería nueva; por debajo, sí (aunque el título
  // suene positivo) — a menos que ya viniera "dead/bad/missing" (eso manda siempre).
  if (bateriaPct.valor != null && bateriaIncluida.valor !== false) {
    if (bateriaPct.valor > bateriaPctUmbral) {
      bateriaIncluida = spec(true, 'confirmado');
    } else {
      bateriaIncluida = spec(false, 'confirmado');
      alertas.push(`🔋 Batería al ${bateriaPct.valor}% — ≤${bateriaPctUmbral}%: probablemente haga falta comprar batería nueva`);
    }
  }

  const sinOs = /no\s+(?:os|operating\s*system|windows)\b/i.test(t);

  // Falla funcional real (siempre bloquea, con o sin "for parts")
  const fallaFuncional =
    /\bnot\s+working\b|\bnon[- ]?functional\b|\bnot\s+functional\b|\bdoa\b|\bno\s+power\b(?!\s*(?:cord|adapter|supply|cable|brick))|won'?t\s+(?:turn\s+on|power|boot)|does\s*n[o']?t\s+(?:turn\s+on|power|boot)/i.test(t)
    // locale español (títulos/condición de eBay LATAM)
    || /\bno\s+(?:enciende|funciona|prende)\b/i.test(t);
  // "For parts"/"as-is": solo es un disclaimer — NO bloquea por sí solo, solo si viene con falla funcional
  const paraRepuestos =
    /\bfor\s*parts\b|\bparts\s*only\b|\bas[- ]is\b/i.test(t)
    || /(?:para|solo|sólo)\s+(?:repuestos?|piezas?|partes?)\b|tal\s+como\s+est[aá]/i.test(t);
  if (fallaFuncional) {
    bloqueos.push('"No enciende / not working"');
  } else if (paraRepuestos) {
    alertas.push('⚠ "For parts / as-is": confirmar que enciende antes de pujar');
  }
  if (/\buntested\b/i.test(t)) alertas.push('⚠ "Untested": revisar/preguntar al vendedor antes de pujar');
  if (DANO_SLOT_DISCO.some((re) => re.test(t))) bloqueos.push('Slot/puerto de disco dañado ("SSD slot broken")');
  if (/\b(celeron|pentium|athlon)\b/i.test(t)) bloqueos.push('CPU Celeron/Pentium/Athlon');
  if (/chromebook/i.test(t)) bloqueos.push('Chromebook');
  if (/1366\s*x\s*768|\bTN\s+panel\b/i.test(t)) alertas.push('Pantalla 1366×768 TN — condicional (decide el precio)');

  const MAPA_DETALLES: [RegExp, string][] = [
    [/crack(?:ed)?\s*(?:screen|lcd|display)|screen\s*crack|broken\s*(?:screen|lcd|display)/i, 'Pantalla rota'],
    [/lines?\s+on\s+(?:the\s+)?(?:screen|lcd|display)/i, 'Pantalla con líneas'],
    [/spots?\s+on\s+(?:the\s+)?(?:screen|lcd)|pressure\s*marks?|dead\s*pixels?/i, 'Pantalla con manchas'],
    [/scratch(?:es|ed)?|scuffs?|dents?|dings?|heavy\s+wear|\bchips\b/i, 'Carcasa marcada'],
    [/broken\s+hinge|hinge\s+(?:broken|loose|damaged?)|loose\s+hinge/i, 'Bisagra floja'],
    [/missing\s+keys?|keys?\s+missing/i, 'Tecla(s) faltante(s)'],
    [/speakers?\s+(?:not\s+working|blown|bad|crackl)/i, 'Corneta dañada'],
  ];
  const detallesSugeridos = MAPA_DETALLES.filter(([re]) => re.test(td)).map(([, nombre]) => nombre);

  const tn = norm(t.replace(/2[- ]?in[- ]?1/gi, '2-in-1'));
  const candidatos = modelos
    .filter((m) => tn.includes(norm(m.modelo.replace(/2[- ]?in[- ]?1/gi, '2-in-1'))))
    .sort((a, b) => b.modelo.length - a.modelo.length);
  let modeloDetectado = modeloForzado ?? candidatos[0] ?? null;

  // Fallback por número: el título trae la marca y el número del modelo pero no el nombre completo
  // (ej. "Dell XPS 9360"). Si hay varios candidatos con ese número, se asume el PEOR.
  if (!modeloDetectado) {
    const porNumero = modelos.filter((m) => {
      const num = m.modelo.match(/(\d{3,4})/)?.[1];
      return !!num && tn.includes(norm(m.marca)) && new RegExp(`\\b${num}\\b`).test(tn);
    });
    if (porNumero.length > 0) {
      porNumero.sort((a, b) => rangoPeor(a) - rangoPeor(b) || (a.cpuGen ?? 99) - (b.cpuGen ?? 99));
      modeloDetectado = porNumero[0];
      alertas.push(
        porNumero.length > 1
          ? `⚠ Modelo asumido por número (peor de ${porNumero.length} candidatos): ${modeloDetectado.marca} ${modeloDetectado.modelo} — confirmar`
          : `⚠ Modelo asumido por número: ${modeloDetectado.marca} ${modeloDetectado.modelo} — confirmar`,
      );
    }
  }

  if (modeloDetectado) {
    // CPU asumida por modelo cuando el título no la trae (peor caso: rangos mixtos → i5)
    if (cpuTipo.valor === null && modeloDetectado.cpuTipo) {
      cpuTipo = spec(modeloDetectado.cpuTipo, 'posible');
      alertas.push(`⚠ CPU no mencionada — asumida ${modeloDetectado.cpuTipo} por el modelo; CONFIRMAR procesador exacto antes de pujar`);
    }
    if (cpuGen.valor === null && modeloDetectado.cpuGen != null) {
      cpuGen = spec(modeloDetectado.cpuGen, 'posible');
    }
    if (modeloDetectado.reglaCompra === 'bloqueada')
      bloqueos.push(`${modeloDetectado.marca} ${modeloDetectado.modelo}: ${modeloDetectado.motivoRegla ?? 'regla bloqueada'}`);
    if (modeloDetectado.reglaCompra === 'condicional')
      alertas.push(`Condicional: ${modeloDetectado.motivoRegla ?? 'el semáforo decide por precio'}`);
    // RAM/SSD soldada YA NO bloquean: son advertencia + deducción automática (ver eval.ts)
    if (modeloDetectado.ramSoldada === 'total')
      alertas.push('⚠ RAM totalmente soldada — no upgradeable (deducción aplicada automáticamente)');
    if (modeloDetectado.ramSoldada === 'revisar')
      alertas.push('⚠ RAM posiblemente soldada — VERIFICAR service manual o preguntar al vendedor ANTES de pujar');
    if (modeloDetectado.ramSoldada === 'parcial')
      alertas.push('RAM parcial: 1 soldada + 1 slot libre');
    if (modeloDetectado.ssdSoldado)
      alertas.push('⚠ SSD posiblemente soldado — deducción aplicada automáticamente');
    // §23: avisos creados por el usuario — se saltan los que ya cubre un campo legado (evita duplicados)
    const tiposLegado = new Set<string>();
    if (modeloDetectado.ramSoldada === 'total' || modeloDetectado.ramSoldada === 'parcial') tiposLegado.add('ram_soldada');
    if (modeloDetectado.ramSoldada === 'revisar') tiposLegado.add('revisar');
    if (modeloDetectado.ssdSoldado) tiposLegado.add('ssd_soldado');
    if (modeloDetectado.reglaCompra === 'bloqueada') tiposLegado.add('bloqueado');
    for (const av of modeloDetectado.avisos ?? []) {
      if (tiposLegado.has(av.tipo)) continue;
      const txt = av.motivo || av.tipo;
      if (av.severidad === 'bloquea') bloqueos.push(`${modeloDetectado.marca} ${modeloDetectado.modelo}: ${txt}`);
      else if (av.severidad === 'condiciona') alertas.push(`Condicional: ${txt}`);
      else if (av.severidad === 'advierte') alertas.push(`⚠ ${txt}`);
      else alertas.push(`Nota: ${txt}`);
    }
  }
  if (cpuTipo.valor === 'i3') alertas.push('i3: condicional — el semáforo decide por precio');

  // Vendedor nunca visto en el historial de compras (lotes.vendedor) — NO bloquea.
  // Sin catálogo de vendedores conocidos (offline / primera compra / sin sesión), se omite:
  // ausencia de datos no debe leerse como "vendedor nuevo".
  if (vendedor && vendedoresConocidos && vendedoresConocidos.length > 0) {
    const vNorm = vendedor.trim().toLowerCase();
    if (vNorm && !vendedoresConocidos.includes(vNorm)) {
      alertas.push('⚠ Vendedor nuevo — nunca le has comprado antes');
    }
  }

  // Vendedor conocido (global/compartido, ver Catalogo.vendedoresBateria) por indicar el
  // % de batería en sus publicaciones — señal de confianza, no se mezcla con `alertas`.
  let vendedorMuestraBateria = false;
  if (vendedor && vendedoresBateria && vendedoresBateria.length > 0) {
    const vNorm = vendedor.trim().toLowerCase();
    if (vNorm && vendedoresBateria.includes(vNorm)) vendedorMuestraBateria = true;
  }

  return {
    cpuTipo, cpuGen, ramGb, ssdGb, esHdd,
    pantallaPulgadas, pantallaTactil, cargadorIncluido, bateriaIncluida, bateriaPct, vendedorMuestraBateria,
    sinOs, cantidadLote, detallesSugeridos, modeloDetectado, alertas, bloqueos,
  };
}
