// Adaptador Supabase (§21): ÚNICO lugar (junto a provider-nhost) que toca un SDK de backend.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  PARAMETROS_DEFAULT, motivoDescarteDe, filasLaptops, lineasDeCompra, listingAFila, proyectadoDeCompra,
  type AjustesConfig, type AlmacenKV, type Catalogo, type CompraDatos, type ConversionDatos,
  type Cuenta, type EstadoVisto, type ListingGuardar, type ModeloInfo, type Parametros,
  type PrecioIdeal, type Proveedor, type SesionInfo,
} from '@tecnofal/core';

export class ProveedorSupabase implements Proveedor {
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string, almacen: AlmacenKV) {
    const storage = {
      getItem: (k: string) => almacen.getItem(k),
      setItem: async (k: string, v: string) => { await almacen.setItem(k, v); },
      removeItem: async (k: string) => { await almacen.removeItem(k); },
    };
    this.sb = createClient(url, anonKey, {
      auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }

  async signIn(email: string, password: string): Promise<SesionInfo> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return this.getSession();
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
  }

  async getSession(): Promise<SesionInfo> {
    const { data } = await this.sb.auth.getSession();
    return { email: data.session?.user.email ?? null };
  }

  async cargarCatalogo(): Promise<Catalogo | null> {
    try {
      // getSession() devuelve la sesión GUARDADA aunque el token esté vencido; con token
      // inválido RLS no da error — devuelve 0 filas, y un catálogo "vacío pero exitoso"
      // envenenaba el pull (barría la config local). getUser() valida el JWT contra el
      // servidor: sin sesión verificada no hay catálogo (null → el sync no trae nada).
      const { data: u, error: eAuth } = await this.sb.auth.getUser();
      if (eAuth || !u.user) return null;
      const [params, precios, ajustes, modelos, partes, detalles] = await Promise.all([
        this.sb.from('parametros').select('clave, valor'),
        this.sb.from('precios_ideales').select('cpu_tipo, gen_desde, gen_hasta, precio_base'),
        this.sb.from('ajustes_config').select('clave, delta'),
        this.sb.from('modelos').select('id, marca, modelo, cpu_tipo, cpu_gen, ram_soldada, ssd_soldado, regla_compra, motivo_regla'),
        this.sb.from('partes_catalogo').select('nombre, precio_referencia'),
        this.sb.from('detalles_catalogo').select('id, nombre, deduccion_base, categoria'),
      ]);
      if (params.error || precios.error || ajustes.error || modelos.error || partes.error || detalles.error) return null;
      const p: Record<string, number | null> = {};
      for (const r of params.data ?? []) p[r.clave] = r.valor;
      const parametros: Parametros = {
        impuestoEbay: p['impuesto_ebay'] ?? PARAMETROS_DEFAULT.impuestoEbay,
        seguroValorDeclarado: p['seguro_valor_declarado'] ?? PARAMETROS_DEFAULT.seguroValorDeclarado,
        seguroZoom: p['seguro_zoom'] ?? PARAMETROS_DEFAULT.seguroZoom,
        comisionZinliEstimada: p['comision_zinli_estimada'] ?? PARAMETROS_DEFAULT.comisionZinliEstimada,
        costoRevision: p['costo_revision'] ?? PARAMETROS_DEFAULT.costoRevision,
        gananciaMinima: p['ganancia_minima'] ?? PARAMETROS_DEFAULT.gananciaMinima,
        gananciaDecente: p['ganancia_decente'] ?? PARAMETROS_DEFAULT.gananciaDecente,
        tarifaBarcoPorPie3: p['tarifa_barco_por_pie3'] ?? null,
        tarifaAvionZoomPorKg: p['tarifa_avion_zoom_por_kg'] ?? null,
        envioVzlaPorLaptop: p['envio_vzla_por_laptop'] ?? PARAMETROS_DEFAULT.envioVzlaPorLaptop,
      };
      let tiposAviso: { clave: string; nombre: string }[] | undefined;
      const avisosPor = new Map<string, { tipo: string; severidad: 'bloquea' | 'condiciona' | 'advierte' | 'nota'; motivo: string | null }[]>();
      try {
        const [ta, ma] = await Promise.all([
          this.sb.from('tipos_aviso').select('id, clave, nombre'),
          this.sb.from('modelo_avisos').select('modelo_id, tipo_aviso_id, severidad, motivo'),
        ]);
        if (!ta.error && !ma.error) {
          tiposAviso = (ta.data ?? []).map((t) => ({ clave: t.clave, nombre: t.nombre }));
          const clavePor = new Map((ta.data ?? []).map((t) => [t.id, t.clave]));
          for (const a of ma.data ?? []) {
            const lista = avisosPor.get(a.modelo_id) ?? [];
            lista.push({ tipo: clavePor.get(a.tipo_aviso_id) ?? 'otro', severidad: a.severidad, motivo: a.motivo });
            avisosPor.set(a.modelo_id, lista);
          }
        }
      } catch { /* sin 0007 aún */ }
      return {
        parametros,
        tiposAviso,
        precios: (precios.data ?? []).map((r): PrecioIdeal => ({
          cpuTipo: r.cpu_tipo, genDesde: r.gen_desde, genHasta: r.gen_hasta, precioBase: Number(r.precio_base),
        })),
        ajustes: Object.fromEntries((ajustes.data ?? []).map((r) => [r.clave, Number(r.delta)])) as AjustesConfig,
        modelos: (modelos.data ?? []).map((r): ModeloInfo => ({
          id: r.id, marca: r.marca, modelo: r.modelo, cpuTipo: r.cpu_tipo, cpuGen: r.cpu_gen ?? null,
          ramSoldada: r.ram_soldada, ssdSoldado: r.ssd_soldado,
          reglaCompra: r.regla_compra, motivoRegla: r.motivo_regla,
          avisos: avisosPor.get(r.id) ?? [],
        })),
        partesRef: Object.fromEntries(
          (partes.data ?? []).filter((r) => r.precio_referencia != null).map((r) => [r.nombre, Number(r.precio_referencia)]),
        ),
        detalles: (detalles.data ?? []).map((r) => ({ id: r.id, nombre: r.nombre, deduccionBase: Number(r.deduccion_base), categoria: (r.categoria as string | null) ?? 'Otro' })),
        online: true,
      };
    } catch {
      return null;
    }
  }

  async checkListings(ids: string[]): Promise<EstadoVisto[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.sb
      .from('listings').select('ebay_item_id, semaforo, estado, costo_estimado_total, valor_esperado_total, evaluacion_manual').in('ebay_item_id', ids);
    if (error) return [];
    return (data ?? []).map((r) => {
      const costo = r.costo_estimado_total as number | null;
      const valor = r.valor_esperado_total as number | null;
      const margen = costo != null && valor != null && costo > 0 ? (valor - costo) / costo : null;
      return {
        ebayItemId: r.ebay_item_id, semaforo: r.semaforo, estado: r.estado,
        margen, ganancia: costo != null && valor != null ? valor - costo : null, costo: costo ?? null,
        motivoDescarte: motivoDescarteDe(r.evaluacion_manual),
      };
    });
  }

  async guardarListing(l: ListingGuardar): Promise<void> {
    const { error } = await this.sb.from('listings').upsert(listingAFila(l), { onConflict: 'user_id,ebay_item_id' });
    if (error) throw new Error(error.message);
  }

  /** El id local de modelo es "marca|modelo" (IndexedDB); el remoto usa uuid — traducir por (marca, modelo) */
  private async resolverModeloId(modeloId: string | null): Promise<string | null> {
    if (!modeloId || !modeloId.includes('|')) return modeloId;
    const [marca, ...resto] = modeloId.split('|');
    const { data, error } = await this.sb.from('modelos')
      .upsert({ marca, modelo: resto.join('|') }, { onConflict: 'marca,modelo' })
      .select('id').single();
    if (error) return null; // la laptop se registra sin modelo antes que fallar toda la compra
    return data.id;
  }

  async comprar(d: CompraDatos): Promise<{ loteId: string }> {
    const ahora = new Date().toISOString();
    const modeloId = await this.resolverModeloId(d.modeloId);
    const { data: lote, error: eLote } = await this.sb
      .from('lotes')
      .insert({
        origen: 'ebay',
        url_ebay: d.listing.url,
        precio_subasta: d.listing.precioVisto,
        envio_usa: d.envioUsa,
        costo_proyectado_total: proyectadoDeCompra(d),
        metodo_estimado: d.metodo,
      })
      .select('id').single();
    if (eLote) throw new Error(eLote.message);

    const { error: eLap } = await this.sb.from('laptops').insert(filasLaptops({ ...d, modeloId }, lote.id));
    if (eLap) throw new Error(eLap.message);

    const { error: eLineas } = await this.sb.from('costo_lineas').insert(lineasDeCompra(d, lote.id, ahora));
    if (eLineas) throw new Error(eLineas.message);

    // El reparto FIJO se congela al completar la revisión física (congelar_reparto_lote, §2.6)
    await this.sb.from('listings').upsert(
      { ...listingAFila({ ...d.listing, estado: 'comprado' }), lote_id: lote.id },
      { onConflict: 'user_id,ebay_item_id' },
    );
    return { loteId: lote.id };
  }

  async publicarAvisos(
    tipos: { clave: string; nombre: string }[],
    avisos: { marca: string; modelo: string; tipoClave: string; severidad: string; motivo: string | null }[],
  ): Promise<void> {
    if (tipos.length > 0) {
      const { error } = await this.sb.from('tipos_aviso')
        .upsert(tipos.map((t) => ({ clave: t.clave, nombre: t.nombre, origen: 'usuario' })), { onConflict: 'clave', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    for (const a of avisos) {
      const { data: mod, error: eM } = await this.sb.from('modelos')
        .upsert({ marca: a.marca, modelo: a.modelo }, { onConflict: 'marca,modelo' }).select('id').single();
      if (eM) throw new Error(eM.message);
      const { data: tipo, error: eT } = await this.sb.from('tipos_aviso').select('id').eq('clave', a.tipoClave).single();
      if (eT) throw new Error(eT.message);
      const { error: eA } = await this.sb.from('modelo_avisos')
        .insert({ modelo_id: mod.id, tipo_aviso_id: tipo.id, severidad: a.severidad, motivo: a.motivo, origen: 'usuario' });
      if (eA) throw new Error(eA.message);
    }
  }

  async listarCuentas(): Promise<Cuenta[]> {
    const { data, error } = await this.sb.from('cuentas').select('id, nombre, moneda').order('nombre');
    if (error) throw new Error(error.message);
    return (data ?? []) as Cuenta[];
  }

  async registrarConversion(d: ConversionDatos): Promise<{ tasaImplicita: number }> {
    const fecha = d.fecha ?? new Date().toISOString().slice(0, 10);
    const { data: movs, error: eMov } = await this.sb.from('movimientos').insert([
      { cuenta_id: d.cuentaOrigenId, fecha, tipo: 'egreso', monto: d.montoOrigen, concepto: d.nota ?? 'Conversión' },
      { cuenta_id: d.cuentaDestinoId, fecha, tipo: 'ingreso', monto: d.montoDestino, concepto: d.nota ?? 'Conversión' },
    ]).select('id');
    if (eMov) throw new Error(eMov.message);
    const { error: eConv } = await this.sb.from('conversiones').insert({
      fecha,
      movimiento_origen_id: movs![0].id,
      movimiento_destino_id: movs![1].id,
      monto_origen: d.montoOrigen,
      monto_destino: d.montoDestino,
      nota: d.nota ?? null,
    });
    if (eConv) throw new Error(eConv.message);
    return { tasaImplicita: d.montoOrigen / d.montoDestino };
  }
}
