// §22: adaptador LOCAL-FIRST sobre IndexedDB (Dexie) — la UI lee/escribe SIEMPRE aquí.
// El backend remoto (Nhost/Supabase) es espejo vía la capa de sync, nunca requisito.
import Dexie, { type Table } from 'dexie';
import {
  AJUSTES_SEMILLA, DETALLES_SEMILLA, MODELOS_SEMILLA, PARAMETROS_DEFAULT,
  PARTES_REF_SEMILLA, PRECIOS_IDEALES_SEMILLA, motivoDescarteDe,
  type Catalogo, type CompraDatos, type ConversionDatos, type Cuenta, type DataProvider,
  type AvisoModelo, type EstadoVisto, type ListingGuardar, type ModeloInfo, type Parametros, type PrecioIdeal,
} from '@tecnofal/core';

const TIPOS_AVISO_SEMILLA = [
  { clave: 'ram_soldada', nombre: 'RAM soldada' },
  { clave: 'ssd_soldado', nombre: 'SSD soldado' },
  { clave: 'carcasa_se_marca', nombre: 'Carcasa se marca fácil' },
  { clave: 'bisagras_fragiles', nombre: 'Bisagras frágiles' },
  { clave: 'bloqueado', nombre: 'Bloqueado (general)' },
  { clave: 'revisar', nombre: 'Revisar antes de pujar' },
];

export interface FilaTipoAviso { clave: string; nombre: string; origen: 'seed' | 'usuario'; dirty: number }
export interface FilaAvisoModelo {
  id: string; modeloId: string; tipoClave: string;
  severidad: AvisoModelo['severidad']; motivo: string | null;
  origen: 'seed' | 'usuario'; creado: number; dirty: number;
}

export interface MarcarModeloDatos {
  marca: string;
  modelos: string[]; // alcance: uno o la familia confirmada
  tipoClave: string | null;
  tipoNuevoNombre: string | null;
  severidad: AvisoModelo['severidad'];
  motivo: string;
}

export interface FilaListing {
  ebayItemId: string;
  datos: ListingGuardar;
  actualizado: number;
  dirty: number;  // 1 = pendiente de empujar al espejo
  manual: number; // 1 = tiene overrides del usuario → el remoto NUNCA lo pisa
  loteLocal: string | null;
}
export interface FilaCompra {
  id: string;
  datos: CompraDatos;
  creado: number;
  estado: 'pendiente' | 'sincronizada';
  loteRemoto: string | null;
}
interface FilaParametro { clave: string; valor: number | null; descripcion: string | null }
interface FilaPrecio { id?: number; cpuTipo: string; genDesde: number; genHasta: number; precioBase: number }
interface FilaAjuste { clave: string; delta: number; nota: string | null }
interface FilaDetalle { nombre: string; deduccionBase: number; categoria?: string }
interface FilaParteRef { nombre: string; precioReferencia: number; valorNominal: number | null }
interface FilaMeta { k: string; v: unknown }

/** chrome.runtime.sendMessage serializa `Date` a string ISO — cualquier valor que haya
 *  cruzado un mensaje content↔background puede llegar aquí como string aunque el tipo diga `Date`. */
function aFecha(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(v);
}

/** Backfill por patrón del nombre (espejo de la migración 0009) para detalles creados por el usuario */
function categoriaPorNombre(nombre: string): string {
  const n = nombre.toLowerCase();
  if (/^puerto/.test(n)) return 'Puerto';
  if (/^bater[ií]a/.test(n)) return 'Batería';
  if (/^carcasa|^bisagra/.test(n)) return 'Carcasa';
  if (/^pantalla/.test(n)) return 'Pantalla';
  if (/^tecla|touchpad/.test(n)) return 'Teclado';
  if (/^corneta|audio/.test(n)) return 'Audio';
  return 'Otro';
}

const CLAVES_PARAM: Record<keyof Parametros, string> = {
  impuestoEbay: 'impuesto_ebay',
  seguroValorDeclarado: 'seguro_valor_declarado',
  seguroZoom: 'seguro_zoom',
  comisionZinliEstimada: 'comision_zinli_estimada',
  costoRevision: 'costo_revision',
  gananciaMinima: 'ganancia_minima',
  gananciaDecente: 'ganancia_decente',
  tarifaBarcoPorPie3: 'tarifa_barco_por_pie3',
  tarifaAvionZoomPorKg: 'tarifa_avion_zoom_por_kg',
  envioVzlaPorLaptop: 'envio_vzla_por_laptop',
};

class BD extends Dexie {
  listings!: Table<FilaListing, string>;
  compras!: Table<FilaCompra, string>;
  parametros!: Table<FilaParametro, string>;
  precios!: Table<FilaPrecio, number>;
  ajustes!: Table<FilaAjuste, string>;
  detalles!: Table<FilaDetalle, string>;
  modelos!: Table<ModeloInfo & { id: string }, string>;
  tiposAviso!: Table<FilaTipoAviso, string>;
  modeloAvisos!: Table<FilaAvisoModelo, string>;
  partesRef!: Table<FilaParteRef, string>;
  meta!: Table<FilaMeta, string>;

  constructor(nombre = 'tecnofal') {
    super(nombre);
    this.version(1).stores({
      listings: 'ebayItemId, dirty, actualizado',
      compras: 'id, estado',
      parametros: 'clave',
      precios: '++id',
      ajustes: 'clave',
      detalles: 'nombre',
      modelos: 'id, marca',
      partesRef: 'nombre',
      meta: 'k',
    });
    // §23: avisos de modelo creados por el usuario
    this.version(2).stores({
      tiposAviso: 'clave, dirty',
      modeloAvisos: 'id, modeloId, dirty',
    });
  }
}

export class ProveedorLocal implements DataProvider {
  db: BD;
  constructor(nombre?: string) { this.db = new BD(nombre); }

  /** Seeds empaquetados (§22): primera instalación funcional sin ningún backend */
  async inicializar(): Promise<void> {
    if ((await this.db.tiposAviso.count()) === 0) {
      await this.db.tiposAviso.bulkPut(TIPOS_AVISO_SEMILLA.map((t) => ({ ...t, origen: 'seed' as const, dirty: 0 })));
    }
    // top-up v2 (espejo de 0010): referencia Dell (CPU asumida + upgradeabilidad) sobre BDs ya inicializadas.
    // Solo agrega modelos faltantes o completa cpu en filas sin él — nunca pisa ediciones del usuario.
    const seedV = ((await this.db.meta.get('seedModelosV'))?.v as number | undefined) ?? 1;
    if (seedV < 2) {
      for (const s of MODELOS_SEMILLA) {
        const id = `${s.marca}|${s.modelo}`;
        const ex = await this.db.modelos.get(id);
        if (!ex) await this.db.modelos.put({ ...s, id });
        else if (ex.cpuTipo == null && s.cpuTipo) await this.db.modelos.update(id, { cpuTipo: s.cpuTipo, cpuGen: s.cpuGen ?? null });
      }
      await this.db.meta.put({ k: 'seedModelosV', v: 2 });
    }
    // top-up v3: nuevos modelos Dell v2 ref (43 entradas)
    if (seedV < 3) {
      for (const s of MODELOS_SEMILLA) {
        const id = `${s.marca}|${s.modelo}`;
        const ex = await this.db.modelos.get(id);
        if (!ex) await this.db.modelos.put({ ...s, id });
        else if (ex.cpuTipo == null && s.cpuTipo) await this.db.modelos.update(id, { cpuTipo: s.cpuTipo, cpuGen: s.cpuGen ?? null });
      }
      await this.db.meta.put({ k: 'seedModelosV', v: 3 });
    }
    // top-up: backfill de categoria en detalles sembrados antes de la migración 0009
    const detV = ((await this.db.meta.get('seedDetallesV'))?.v as number | undefined) ?? 1;
    if (detV < 2) {
      const porNombre = new Map(DETALLES_SEMILLA.map((d) => [d.nombre, d.categoria]));
      for (const f of await this.db.detalles.toArray()) {
        if (f.categoria) continue;
        await this.db.detalles.update(f.nombre, { categoria: porNombre.get(f.nombre) ?? categoriaPorNombre(f.nombre) });
      }
      await this.db.meta.put({ k: 'seedDetallesV', v: 2 });
    }
    if (detV < 3) {
      await this.db.detalles.bulkPut([
        { nombre: 'Tecla(s) faltante(s)',  deduccionBase: 10, categoria: 'specs' },
        { nombre: 'Carcasa marcada',        deduccionBase: 10, categoria: 'specs' },
        { nombre: 'Solo 4GB RAM',           deduccionBase: 15, categoria: 'specs' },
        { nombre: 'Solo 128GB SSD',         deduccionBase: 10, categoria: 'specs' },
        { nombre: 'Solo 128GB HDD',         deduccionBase: 20, categoria: 'specs' },
        { nombre: 'RAM soldada',            deduccionBase: 0,  categoria: 'specs' },
        { nombre: 'SSD soldado',            deduccionBase: 0,  categoria: 'specs' },
      ]);
      await this.db.meta.put({ k: 'seedDetallesV', v: 3 });
    }
    if ((await this.db.parametros.count()) > 0) {
      // BD ya inicializada — AUTO-RECUPERACIÓN: un pull del espejo podía dejar secciones
      // VACÍAS (remoto sin sembrar → clear local, bug corregido en aplicarConfigRemota).
      // Una sección de configuración vacía nunca es un estado válido: sin precios ideales
      // TODA evaluación sale "sin datos". Re-sembrar solo la sección vacía; jamás toca
      // filas existentes.
      if ((await this.db.precios.count()) === 0) {
        await this.db.precios.bulkAdd(PRECIOS_IDEALES_SEMILLA.map((p) => ({
          cpuTipo: p.cpuTipo, genDesde: p.genDesde, genHasta: p.genHasta, precioBase: p.precioBase,
        })));
      }
      if ((await this.db.ajustes.count()) === 0) {
        await this.db.ajustes.bulkPut(Object.entries(AJUSTES_SEMILLA).map(([clave, delta]) => ({ clave, delta, nota: null })));
      }
      if ((await this.db.detalles.count()) === 0) {
        await this.db.detalles.bulkPut(DETALLES_SEMILLA.map((d) => ({ nombre: d.nombre, deduccionBase: d.deduccionBase, categoria: d.categoria })));
      }
      return;
    }
    await this.db.transaction('rw', [this.db.parametros, this.db.precios, this.db.ajustes, this.db.detalles, this.db.modelos, this.db.partesRef], async () => {
      await this.db.parametros.bulkPut(
        (Object.keys(CLAVES_PARAM) as (keyof Parametros)[]).map((k) => ({
          clave: CLAVES_PARAM[k], valor: PARAMETROS_DEFAULT[k], descripcion: null,
        })),
      );
      await this.db.precios.bulkAdd(PRECIOS_IDEALES_SEMILLA.map((p) => ({
        cpuTipo: p.cpuTipo, genDesde: p.genDesde, genHasta: p.genHasta, precioBase: p.precioBase,
      })));
      await this.db.ajustes.bulkPut(Object.entries(AJUSTES_SEMILLA).map(([clave, delta]) => ({ clave, delta, nota: null })));
      await this.db.detalles.bulkPut(DETALLES_SEMILLA.map((d) => ({ nombre: d.nombre, deduccionBase: d.deduccionBase, categoria: d.categoria })));
      await this.db.modelos.bulkPut(MODELOS_SEMILLA.map((m) => ({ ...m, id: `${m.marca}|${m.modelo}` })));
      await this.db.partesRef.bulkPut([
        { nombre: 'Cargador 65W punta fina', precioReferencia: PARTES_REF_SEMILLA.cargador, valorNominal: 4 },
        { nombre: 'Batería (genérica por familia)', precioReferencia: PARTES_REF_SEMILLA.bateria, valorNominal: 3 },
        { nombre: 'SSD 256GB', precioReferencia: PARTES_REF_SEMILLA.ssd_256, valorNominal: 5 },
        { nombre: 'RAM 8GB DDR4', precioReferencia: PARTES_REF_SEMILLA.ram_8, valorNominal: 4 },
      ]);
    });
  }

  // ---------- DataProvider ----------
  async cargarCatalogo(): Promise<Catalogo> {
    await this.inicializar();
    const [params, precios, ajustes, modelos, partes, detalles] = await Promise.all([
      this.db.parametros.toArray(), this.db.precios.toArray(), this.db.ajustes.toArray(),
      this.db.modelos.toArray(), this.db.partesRef.toArray(), this.db.detalles.toArray(),
    ]);
    const avisosFilas = await this.db.modeloAvisos.toArray();
    const avisosPor = new Map<string, AvisoModelo[]>();
    for (const a of avisosFilas) {
      const lista = avisosPor.get(a.modeloId) ?? [];
      lista.push({ tipo: a.tipoClave, severidad: a.severidad, motivo: a.motivo });
      avisosPor.set(a.modeloId, lista);
    }
    const tipos = await this.db.tiposAviso.toArray();
    const vendedoresMeta = await this.db.meta.get('vendedoresConocidos');
    const kv = Object.fromEntries(params.map((p) => [p.clave, p.valor]));
    const parametros = Object.fromEntries(
      (Object.keys(CLAVES_PARAM) as (keyof Parametros)[]).map((k) => [k, kv[CLAVES_PARAM[k]] ?? PARAMETROS_DEFAULT[k]]),
    ) as unknown as Parametros;
    return {
      parametros,
      precios: precios.map((p): PrecioIdeal => ({ cpuTipo: p.cpuTipo as PrecioIdeal['cpuTipo'], genDesde: p.genDesde, genHasta: p.genHasta, precioBase: p.precioBase })),
      ajustes: Object.fromEntries(ajustes.map((a) => [a.clave, a.delta])),
      modelos: modelos.map((m) => ({ ...m, avisos: avisosPor.get(m.id) ?? [] })),
      tiposAviso: tipos.map((t) => ({ clave: t.clave, nombre: t.nombre })),
      vendedoresConocidos: (vendedoresMeta?.v as string[] | undefined) ?? [],
      partesRef: Object.fromEntries(partes.map((p) => [p.nombre, p.precioReferencia])),
      detalles: detalles.map((d) => ({ id: d.nombre, nombre: d.nombre, deduccionBase: d.deduccionBase, categoria: d.categoria ?? 'Otro' })),
      online: true, // local ES la fuente (§22); el estado del espejo se ve en el popup
    };
  }

  async checkListings(ids: string[]): Promise<EstadoVisto[]> {
    const filas = await this.db.listings.where('ebayItemId').anyOf(ids).toArray();
    return filas.map((f) => {
      const costo = f.datos.costoEstimadoTotal;
      const valor = f.datos.valorEsperadoTotal;
      const margen = costo != null && valor != null && costo > 0 ? (valor - costo) / costo : null;
      return {
        ebayItemId: f.ebayItemId, semaforo: f.datos.semaforo, estado: f.datos.estado,
        margen, ganancia: costo != null && valor != null ? valor - costo : null, costo: costo ?? null,
        motivoDescarte: motivoDescarteDe(f.datos.evaluacionManual),
        fechaFinSubasta: f.datos.fechaFinSubasta ?? null,
      };
    });
  }

  /** Evaluación completa guardada (para restaurar el panel al reabrir la página) */
  async obtenerListing(id: string): Promise<ListingGuardar | null> {
    return (await this.db.listings.get(id))?.datos ?? null;
  }

  async guardarListing(l: ListingGuardar): Promise<void> {
    const ex = await this.db.listings.get(l.ebayItemId);
    // 'comprado' es terminal: el auto-registro de 'visto' al abrir la página (o un check fallido)
    // NUNCA debe pisarlo — se perdería el vínculo con el lote y el candado del panel.
    if (ex?.datos.estado === 'comprado' && l.estado === 'visto') return;
    await this.db.listings.put({
      ebayItemId: l.ebayItemId,
      datos: { ...l, fechaFinSubasta: aFecha(l.fechaFinSubasta) },
      actualizado: Date.now(), dirty: 1, manual: 1,
      loteLocal: ex?.loteLocal ?? null,
    });
  }

  /** §26: actualiza SOLO fechaFinSubasta de un listing YA guardado (grilla de búsqueda detecta que el
   *  countdown guardado quedó desactualizado). No crea filas nuevas — si nunca se guardó, no hace nada. */
  async actualizarTiempoListing(ebayItemId: string, fechaFinSubasta: Date | null): Promise<void> {
    const ex = await this.db.listings.get(ebayItemId);
    if (!ex) return;
    await this.db.listings.put({
      ...ex,
      datos: { ...ex.datos, fechaFinSubasta: aFecha(fechaFinSubasta) },
      actualizado: Date.now(),
      dirty: 1,
    });
  }

  /** La compra queda en cola local; la capa de sync la empuja al espejo cuando pueda */
  async comprar(d: CompraDatos): Promise<{ loteId: string }> {
    const loteId = `local:${crypto.randomUUID()}`;
    await this.db.compras.put({ id: loteId, datos: d, creado: Date.now(), estado: 'pendiente', loteRemoto: null });
    await this.db.listings.put({
      ebayItemId: d.listing.ebayItemId, datos: { ...d.listing, estado: 'comprado' },
      actualizado: Date.now(), dirty: 1, manual: 1, loteLocal: loteId,
    });
    return { loteId };
  }

  async listarCuentas(): Promise<Cuenta[]> { return []; }
  async registrarConversion(_d: ConversionDatos): Promise<{ tasaImplicita: number }> {
    throw new Error('Las conversiones requieren el backend (espejo) con sesión');
  }

  // ---------- Configuración editable (§22: reemplaza a Supabase Studio en Fase 1) ----------
  async leerConfig() {
    await this.inicializar();
    return {
      parametros: await this.db.parametros.toArray(),
      precios: await this.db.precios.toArray(),
      ajustes: await this.db.ajustes.toArray(),
      detalles: await this.db.detalles.toArray(),
      modelos: await this.db.modelos.toArray(),
      partesRef: await this.db.partesRef.toArray(),
    };
  }

  private async marcarConfigDirty() { await this.db.meta.put({ k: 'configDirty', v: Date.now() }); }
  async configDirty(): Promise<boolean> { return (await this.db.meta.get('configDirty')) != null; }
  /** Tras un push de config exitoso al espejo: reabre el pull LWW (aplicarConfigRemota vuelve a fluir). */
  async marcarConfigLimpio(): Promise<void> { await this.db.meta.delete('configDirty'); }

  async guardarParametro(clave: string, valor: number | null): Promise<void> {
    await this.db.parametros.put({ clave, valor, descripcion: null });
    await this.marcarConfigDirty();
  }

  async reemplazarSeccion(seccion: 'precios' | 'ajustes' | 'detalles' | 'modelos' | 'partesRef', filas: unknown[]): Promise<void> {
    // Misma clase de bug que el pull-vacío: clear + replace con [] dejaría la sección
    // en cero y el motor sin datos. Vaciar una sección completa nunca es un caso de uso.
    if (filas.length === 0) {
      throw new Error(`Sección "${seccion}" vacía: no se reemplaza nada (edita o borra filas una a una si es intencional)`);
    }
    await this.db.transaction('rw', [this.db.precios, this.db.ajustes, this.db.detalles, this.db.modelos, this.db.partesRef], async () => {
      switch (seccion) {
        case 'precios': {
          await this.db.precios.clear();
          await this.db.precios.bulkAdd((filas as FilaPrecio[]).map(({ id: _id, ...f }) => f));
          break;
        }
        case 'ajustes': await this.db.ajustes.clear(); await this.db.ajustes.bulkPut(filas as FilaAjuste[]); break;
        case 'detalles': await this.db.detalles.clear(); await this.db.detalles.bulkPut(filas as FilaDetalle[]); break;
        case 'partesRef': await this.db.partesRef.clear(); await this.db.partesRef.bulkPut(filas as FilaParteRef[]); break;
        case 'modelos': {
          await this.db.modelos.clear();
          await this.db.modelos.bulkPut((filas as ModeloInfo[]).map((f) => ({ ...f, id: `${f.marca}|${f.modelo}` })));
          break;
        }
      }
    });
    await this.marcarConfigDirty();
  }

  /** Alta de un detalle permanente desde el panel (§: detalles por categoría).
   *  Marca config dirty para que el pull LWW del espejo no lo pise. */
  async crearDetalle(d: { categoria: string; nombre: string; deduccionBase: number }): Promise<void> {
    await this.db.detalles.put({ nombre: d.nombre, deduccionBase: d.deduccionBase, categoria: d.categoria });
    await this.marcarConfigDirty();
  }

  async exportarJSON(): Promise<string> {
    const cfg = await this.leerConfig();
    const listings = await this.db.listings.toArray();
    const compras = await this.db.compras.toArray();
    return JSON.stringify({ version: 1, exportado: new Date().toISOString(), config: cfg, listings, compras }, null, 2);
  }

  async importarJSON(json: string): Promise<void> {
    const d = JSON.parse(json) as { config: Awaited<ReturnType<ProveedorLocal['leerConfig']>>; listings?: FilaListing[]; compras?: FilaCompra[] };
    // Validar ANTES de borrar nada: un respaldo truncado/ajeno con secciones vacías
    // dejaría la extensión sin config (misma clase de bug que el pull-vacío).
    const c = d?.config;
    const secciones = ['parametros', 'precios', 'ajustes', 'detalles', 'modelos', 'partesRef'] as const;
    if (!c || secciones.some((s) => !Array.isArray(c[s]))) {
      throw new Error('Respaldo inválido: falta config completa (parametros/precios/ajustes/detalles/modelos/partesRef) — no se importó nada');
    }
    if (c.parametros.length === 0 || c.precios.length === 0 || c.modelos.length === 0) {
      throw new Error('Respaldo incompleto: parametros/precios/modelos vacíos — no se importó nada');
    }
    await this.db.transaction('rw', this.db.tables, async () => {
      await this.db.parametros.clear(); await this.db.parametros.bulkPut(d.config.parametros);
      await this.db.precios.clear(); await this.db.precios.bulkAdd(d.config.precios.map(({ id: _id, ...f }) => f));
      await this.db.ajustes.clear(); await this.db.ajustes.bulkPut(d.config.ajustes);
      await this.db.detalles.clear(); await this.db.detalles.bulkPut(d.config.detalles);
      await this.db.modelos.clear(); await this.db.modelos.bulkPut(d.config.modelos);
      await this.db.partesRef.clear(); await this.db.partesRef.bulkPut(d.config.partesRef);
      if (d.listings) { await this.db.listings.clear(); await this.db.listings.bulkPut(d.listings); }
      if (d.compras) { await this.db.compras.clear(); await this.db.compras.bulkPut(d.compras); }
    });
    await this.marcarConfigDirty();
  }

  // ---------- §23: avisos de modelo ----------
  /** ⚑ marcar modelo/familia — crea modelos faltantes y sus avisos, local-first */
  async marcarModelo(d: MarcarModeloDatos): Promise<{ tipoClave: string; modelosAfectados: string[] }> {
    let clave = d.tipoClave;
    if (!clave) {
      const nombre = (d.tipoNuevoNombre ?? 'otro').trim();
      clave = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'otro';
      if (!(await this.db.tiposAviso.get(clave))) {
        await this.db.tiposAviso.put({ clave, nombre, origen: 'usuario', dirty: 1 });
      }
    }
    const afectados: string[] = [];
    for (const nombre of d.modelos.map((m) => m.trim()).filter(Boolean)) {
      const id = `${d.marca}|${nombre}`;
      if (!(await this.db.modelos.get(id))) {
        await this.db.modelos.put({ id, marca: d.marca, modelo: nombre, ramSoldada: 'no', reglaCompra: 'normal', motivoRegla: null });
      }
      await this.db.modeloAvisos.put({
        id: crypto.randomUUID(), modeloId: id, tipoClave: clave,
        severidad: d.severidad, motivo: d.motivo || null,
        origen: 'usuario', creado: Date.now(), dirty: 1,
      });
      afectados.push(nombre);
    }
    return { tipoClave: clave, modelosAfectados: afectados };
  }

  async avisosSucios(): Promise<FilaAvisoModelo[]> { return this.db.modeloAvisos.where('dirty').equals(1).toArray(); }
  async tiposSucios(): Promise<FilaTipoAviso[]> { return this.db.tiposAviso.where('dirty').equals(1).toArray(); }
  async marcarAvisoLimpio(id: string): Promise<void> { await this.db.modeloAvisos.update(id, { dirty: 0 }); }
  async marcarTipoLimpio(clave: string): Promise<void> { await this.db.tiposAviso.update(clave, { dirty: 0 }); }
  async todosListings(): Promise<FilaListing[]> { return this.db.listings.toArray(); }

  // ---------- Sync (§22) ----------
  async listingsSucios(): Promise<FilaListing[]> { return this.db.listings.where('dirty').equals(1).toArray(); }
  async comprasPendientes(): Promise<FilaCompra[]> { return this.db.compras.where('estado').equals('pendiente').toArray(); }
  async marcarListingLimpio(id: string): Promise<void> { await this.db.listings.update(id, { dirty: 0 }); }
  async marcarCompraSincronizada(id: string, loteRemoto: string): Promise<void> {
    await this.db.compras.update(id, { estado: 'sincronizada', loteRemoto });
  }
  async pendientes(): Promise<number> {
    return (await this.db.listings.where('dirty').equals(1).count())
      + (await this.db.compras.where('estado').equals('pendiente').count())
      + (await this.db.modeloAvisos.where('dirty').equals(1).count())
      + (await this.db.tiposAviso.where('dirty').equals(1).count())
      + ((await this.configDirty()) ? 1 : 0);
  }

  /** Pull del espejo: LWW para config SOLO si no hay ediciones locales; overrides jamás se pisan.
   *  Una sección remota VACÍA significa "espejo sin sembrar" (usuario nuevo en el backend,
   *  seeds no aplicados, permisos), NUNCA "borrar todo lo local": esa sección se salta —
   *  clear+replace con [] dejaba la extensión sin precios ideales y toda evaluación en
   *  "sin datos" hasta reinstalar. */
  async aplicarConfigRemota(cat: Catalogo): Promise<void> {
    if (await this.configDirty()) return; // lo local editado gana hasta que exista push de config
    await this.db.transaction('rw', [this.db.parametros, this.db.precios, this.db.ajustes, this.db.detalles, this.db.modelos, this.db.partesRef], async () => {
      const inverso = Object.fromEntries(Object.entries(CLAVES_PARAM).map(([k, v]) => [v, k])) as Record<string, keyof Parametros>;
      await this.db.parametros.clear();
      await this.db.parametros.bulkPut(Object.entries(inverso).map(([clave, k]) => ({ clave, valor: cat.parametros[k], descripcion: null })));
      if (cat.precios.length > 0) {
        await this.db.precios.clear();
        await this.db.precios.bulkAdd(cat.precios.map((p) => ({ cpuTipo: p.cpuTipo, genDesde: p.genDesde, genHasta: p.genHasta, precioBase: p.precioBase })));
      }
      if (Object.keys(cat.ajustes).length > 0) {
        await this.db.ajustes.clear();
        await this.db.ajustes.bulkPut(Object.entries(cat.ajustes).map(([clave, delta]) => ({ clave, delta, nota: null })));
      }
      if (cat.detalles.length > 0) {
        await this.db.detalles.clear();
        await this.db.detalles.bulkPut(cat.detalles.map((d) => ({ nombre: d.nombre, deduccionBase: d.deduccionBase, categoria: d.categoria ?? 'Otro' })));
      }
      if (cat.modelos.length > 0) {
        await this.db.modelos.clear();
        await this.db.modelos.bulkPut(cat.modelos.map((m) => ({ ...m, id: `${m.marca}|${m.modelo}` })));
      }
    });
    // vendedoresConocidos: igual criterio "vacío = espejo sin sembrar, no borrar lo local"
    if (cat.vendedoresConocidos && cat.vendedoresConocidos.length > 0) {
      await this.db.meta.put({ k: 'vendedoresConocidos', v: cat.vendedoresConocidos });
    }
  }
}
