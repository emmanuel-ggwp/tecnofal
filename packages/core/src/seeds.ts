import type { AjustesConfig, ModeloInfo, PrecioIdeal } from './types.js';

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

export const DETALLES_SEMILLA: { categoria: string; nombre: string; deduccionBase: number }[] = [
  // specs: items frecuentes que el picker muestra por defecto (sin expandir "ver otros")
  { categoria: 'specs', nombre: 'Tecla(s) faltante(s)', deduccionBase: 10 },
  { categoria: 'specs', nombre: 'Carcasa marcada', deduccionBase: 10 },
  { categoria: 'specs', nombre: 'Solo 4GB RAM', deduccionBase: 15 },
  { categoria: 'specs', nombre: 'Solo 128GB SSD', deduccionBase: 10 },
  { categoria: 'specs', nombre: 'Solo 128GB HDD', deduccionBase: 20 },
  { categoria: 'specs', nombre: 'RAM soldada', deduccionBase: 20 },
  { categoria: 'specs', nombre: 'SSD soldado', deduccionBase: 20 },
  // Otros: aparecen en "ver otros" del picker
  { categoria: 'carcasa', nombre: 'Carcasa rota/fisurada', deduccionBase: 25 },
  { categoria: 'carcasa', nombre: 'Bisagra floja', deduccionBase: 15 },
  { categoria: 'pantalla', nombre: 'Pantalla con manchas', deduccionBase: 20 },
  { categoria: 'pantalla', nombre: 'Pantalla con líneas', deduccionBase: 30 },
  { categoria: 'puertos', nombre: 'Puerto USB malo', deduccionBase: 10 },
  { categoria: 'puertos', nombre: 'Puerto HDMI malo', deduccionBase: 10 },
  { categoria: 'bateria', nombre: 'Batería < 3h', deduccionBase: 15 },
  { categoria: 'bateria', nombre: 'Batería < 1h', deduccionBase: 30 },
  { categoria: 'teclado', nombre: 'Falla botón touchpad', deduccionBase: 10 },
  { categoria: 'audio', nombre: 'Corneta dañada', deduccionBase: 10 },
];

/** Apéndice A (espejo de 0003_seeds) para modo degradado: reglas de modelos sin conexión */
const m = (
  marca: string, modelo: string, ram: ModeloInfo['ramSoldada'],
  regla: ModeloInfo['reglaCompra'] = 'normal', motivo: string | null = null,
): ModeloInfo => ({ marca, modelo, ramSoldada: ram, reglaCompra: regla, motivoRegla: motivo });

/** Referencia Dell 4ta–11va gen (espejo de 0010): CPU asumida cuando el título no la menciona
 *  (peor caso: rangos mixtos i3/i5/i7 → i5; modelos solo-i7 → i7) + upgradeabilidad */
const d = (
  modelo: string, cpuTipo: ModeloInfo['cpuTipo'], cpuGen: number, ram: ModeloInfo['ramSoldada'] = 'no',
  regla: ModeloInfo['reglaCompra'] = 'normal', motivo: string | null = null,
): ModeloInfo => ({ marca: 'Dell', modelo, cpuTipo, cpuGen, ramSoldada: ram, reglaCompra: regla, motivoRegla: motivo });

export const MODELOS_DELL_REF: ModeloInfo[] = [
  // Latitude — 2×SODIMM + M.2 (+2.5" en 5000): el perfil ideal de compra-mejora-venta
  d('Latitude E5450', 'i5', 5), d('Latitude E5470', 'i5', 6), d('Latitude E5570', 'i5', 6),
  d('Latitude E7440', 'i5', 4), d('Latitude E7450', 'i5', 5), d('Latitude E7470', 'i5', 6),
  d('Latitude 5480', 'i5', 7), d('Latitude 5490', 'i5', 8), d('Latitude 5580', 'i5', 7), d('Latitude 5590', 'i5', 8),
  d('Latitude 7480', 'i5', 7),
  d('Latitude 3410', 'i5', 10), d('Latitude 3510', 'i5', 10), d('Latitude 3500', 'i5', 8),
  // Inspiron — 5000/7000 bien; 3000 verificar config (slots/M.2)
  d('Inspiron 3541', 'i5', 5, 'no', 'condicional', '1 slot RAM y sin M.2 (solo 2.5" SATA) — verificar config'),
  d('Inspiron 3542', 'i5', 5, 'no', 'condicional', '1 slot RAM y sin M.2 (solo 2.5" SATA) — verificar config'),
  d('Inspiron 3543', 'i5', 5, 'no', 'condicional', '1 slot RAM y sin M.2 (solo 2.5" SATA) — verificar config'),
  d('Inspiron 3567', 'i5', 7, 'no', 'condicional', 'Sin M.2 (solo 2.5" SATA)'),
  d('Inspiron 3593', 'i5', 10),
  d('Inspiron 5570', 'i5', 8), d('Inspiron 5580', 'i5', 8), d('Inspiron 5593', 'i5', 10),
  d('Inspiron 7590', 'i5', 9),
  d('Inspiron 7501', 'i5', 10, 'parcial', 'condicional', '8GB soldados + 1 slot — máx 24GB'),
  // Vostro
  d('Vostro 3568', 'i5', 7), d('Vostro 3500', 'i5', 11), d('Vostro 5590', 'i5', 10),
  // XPS 13 — TODAS con RAM soldada (solo SSD); el 9310 2-in-1 ni eso
  d('XPS 13 9343', 'i5', 5, 'total'), d('XPS 13 9350', 'i5', 6, 'total'), d('XPS 13 9360', 'i5', 7, 'total'),
  d('XPS 13 9370', 'i5', 8, 'total'), d('XPS 13 9380', 'i5', 8, 'total'), d('XPS 13 9300', 'i5', 10, 'total'),
  d('XPS 13 9310', 'i5', 11, 'total'),
  { ...d('XPS 13 9310 2-in-1', 'i5', 11, 'total'), ssdSoldado: true },
  // XPS 15/17 — 2×SODIMM + M.2: comprar
  d('XPS 15 9530', 'i7', 4), d('XPS 15 9550', 'i5', 6), d('XPS 15 9560', 'i5', 7), d('XPS 15 9570', 'i5', 8),
  d('XPS 15 9500', 'i5', 10), d('XPS 15 9510', 'i5', 11), d('XPS 17 9700', 'i5', 10),
  // Precision — workstations: el mejor perfil de reventa (hasta 4 slots y 2-3 bahías)
  d('Precision M4800', 'i5', 4), d('Precision M6800', 'i7', 4),
  d('Precision 3510', 'i5', 6), d('Precision 3520', 'i5', 7), d('Precision 3530', 'i5', 8), d('Precision 3540', 'i5', 8),
  d('Precision 5510', 'i5', 6), d('Precision 5520', 'i5', 7), d('Precision 5530', 'i5', 8),
  d('Precision 5540', 'i7', 9), d('Precision 5550', 'i7', 10),
  d('Precision 7510', 'i5', 6), d('Precision 7520', 'i7', 7), d('Precision 7530', 'i5', 8),
  d('Precision 7540', 'i7', 9), d('Precision 7550', 'i7', 10),
  d('Precision 7710', 'i7', 6), d('Precision 7720', 'i7', 7),
  // --- v2: Latitude adicionales + trampas ---
  // 7370 Core M: LPDDR3 soldada (parece normal pero no lo es)
  d('Latitude 7370', 'i5', 6, 'total'),
  d('Latitude 7280', 'i5', 7), d('Latitude 7290', 'i5', 8), d('Latitude 7380', 'i5', 7),
  // 7390 clamshell OK; 2-in-1 trampa (override SEMILLA 'no' con cpu info)
  d('Latitude 7390', 'i5', 8),
  d('Latitude 7390 2-in-1', 'i5', 8, 'total'),
  // 5300/5310 confirmadas RAM/SSD (override SEMILLA 'revisar')
  d('Latitude 5300', 'i5', 8), d('Latitude 5310', 'i5', 10),
  d('Latitude 3480', 'i5', 7), d('Latitude 3580', 'i5', 7), d('Latitude 3400', 'i5', 8),
  // --- v2: Inspiron 13" 2-in-1 ---
  d('Inspiron 5368 2-in-1', 'i5', 6), d('Inspiron 5378 2-in-1', 'i5', 7), d('Inspiron 5379 2-in-1', 'i5', 8),
  d('Inspiron 7368 2-in-1', 'i5', 6), d('Inspiron 7378 2-in-1', 'i5', 7), d('Inspiron 7373 2-in-1', 'i5', 8),
  d('Inspiron 7386 2-in-1', 'i5', 8, 'total'),
  d('Inspiron 7391 2-in-1', 'i5', 10, 'total'),
  // --- v2: Inspiron 14" ---
  d('Inspiron 3467', 'i5', 7, 'no', 'condicional', 'Solo 1 slot SODIMM'),
  d('Inspiron 5480', 'i5', 8), d('Inspiron 5482 2-in-1', 'i5', 8),
  d('Inspiron 5488', 'i5', 8), d('Inspiron 5490', 'i5', 10),
  d('Inspiron 5493', 'i5', 10), d('Inspiron 5494', 'i5', 10),
  d('Inspiron 7460', 'i5', 7), d('Inspiron 7472', 'i5', 8),
  d('Inspiron 7490', 'i5', 8, 'total'),
  // --- v2: Inspiron 17" ---
  d('Inspiron 5770', 'i5', 8), d('Inspiron 3780', 'i5', 8),
  d('Inspiron 7773 2-in-1', 'i5', 8), d('Inspiron 7786 2-in-1', 'i5', 8), d('Inspiron 7791 2-in-1', 'i5', 10),
  // --- v2: Vostro adicionales ---
  d('Vostro 5370', 'i5', 8), d('Vostro 5391', 'i5', 10),
  d('Vostro 5471', 'i5', 8), d('Vostro 5481', 'i5', 8), d('Vostro 5490', 'i5', 10),
  d('Vostro 5401', 'i5', 10), d('Vostro 5402', 'i5', 11),
  d('Vostro 5568', 'i5', 7), d('Vostro 3583', 'i5', 8),
  d('Vostro 5501', 'i5', 10), d('Vostro 5502', 'i5', 11),
  // --- v2: XPS trampa — único XPS 15 con RAM soldada ---
  d('XPS 15 9575 2-in-1', 'i7', 8, 'total'),
  // --- v2: Precision adicionales ---
  d('Precision M2800', 'i5', 4), d('Precision M3800', 'i7', 4),
  d('Precision 3541', 'i5', 9), d('Precision 3550', 'i5', 10), d('Precision 3551', 'i5', 10),
  d('Precision 3560', 'i5', 11), d('Precision 5750', 'i7', 10),
];

export const MODELOS_SEMILLA: ModeloInfo[] = [
  ...MODELOS_DELL_REF,
  m('Dell', 'Latitude 7390', 'no'), { ...m('Dell', 'Latitude 7490', 'no'), cpuTipo: 'i5', cpuGen: 8 }, m('Dell', 'Latitude 7400', 'no'),
  m('Dell', 'Latitude 7400 2-in-1', 'total'),
  m('Dell', 'Latitude 7410', 'total'), m('Dell', 'Latitude 7420', 'total'),
  m('Dell', 'Latitude 7430', 'total'), m('Dell', 'Latitude 7310', 'total'),
  m('Dell', 'Latitude 7320', 'total'), m('Dell', 'Latitude 7330', 'total'),
  m('Dell', 'Latitude 5320', 'total'),
  m('Dell', 'Latitude 5300', 'revisar'), m('Dell', 'Latitude 5310', 'revisar'),
  m('Dell', 'Latitude 5400', 'no'), m('Dell', 'Latitude 5500', 'no'), { ...m('Dell', 'Latitude 5510', 'no'), cpuTipo: 'i5', cpuGen: 10 },
  m('Dell', 'Latitude 5430', 'no'), m('Dell', 'Latitude 5440', 'no'),
  m('Dell', 'Latitude 5410', 'no', 'bloqueada', 'Carcasa se marca fácil'),
  m('Dell', 'Latitude 5420', 'no', 'bloqueada', 'Carcasa se marca fácil'),
  m('Dell', 'Latitude 3301', 'revisar'), m('Dell', 'Latitude 3310', 'revisar'),
  m('Dell', 'Latitude 9410', 'total'), m('Dell', 'Latitude 9420', 'total'),
  m('Dell', 'Latitude 9510', 'total'),
  m('Dell', 'XPS 13', 'total'), m('Dell', 'XPS 15', 'no'),
  m('Lenovo', 'ThinkPad T480', 'no'), m('Lenovo', 'ThinkPad T480s', 'parcial'),
  m('Lenovo', 'ThinkPad T490', 'parcial'), m('Lenovo', 'ThinkPad T14 Gen 1', 'parcial'), m('Lenovo', 'ThinkPad T14 Gen 2', 'parcial'),
  m('Lenovo', 'ThinkPad T490s', 'total'), m('Lenovo', 'ThinkPad T495s', 'total'),
  m('Lenovo', 'ThinkPad T14s', 'total'),
  m('Lenovo', 'ThinkPad X1 Carbon', 'total'),
  m('Lenovo', 'ThinkPad X1 Yoga', 'total'),
  m('Lenovo', 'ThinkPad X280', 'total'), m('Lenovo', 'ThinkPad X390', 'total'),
  m('Lenovo', 'ThinkPad X13', 'total'),
  m('Lenovo', 'ThinkPad E14', 'parcial'), m('Lenovo', 'ThinkPad E15', 'parcial'),
  m('Lenovo', 'ThinkPad L380', 'revisar'), m('Lenovo', 'ThinkPad L390', 'revisar'), m('Lenovo', 'ThinkPad L13', 'revisar'),
  m('Lenovo', 'ThinkPad L14', 'no'), m('Lenovo', 'ThinkPad L15', 'no'), m('Lenovo', 'ThinkPad T14 Gen 3', 'parcial'),
  ...['830', '840', '850'].flatMap((serie) => [5, 6, 7, 8].map((g) => m('HP', `EliteBook ${serie} G${g}`, 'no'))),
  m('HP', 'EliteBook 840 G1', 'no', 'condicional', 'Bisagras frágiles'),
  m('HP', 'EliteBook 840 G2', 'no', 'condicional', 'Bisagras frágiles'),
  m('HP', 'EliteBook 840 Aero G8', 'revisar'),
  m('HP', 'EliteBook x360 1030', 'total'), m('HP', 'EliteBook x360 1040', 'total'),
  m('HP', 'Elite Dragonfly', 'total'), m('HP', 'EliteBook 1040', 'total'),
  m('HP', 'ProBook 635 Aero', 'revisar'),
  ...['440', '450'].flatMap((serie) => [5, 6, 7, 8, 9].map((g) => m('HP', `ProBook ${serie} G${g}`, 'no'))),
];
