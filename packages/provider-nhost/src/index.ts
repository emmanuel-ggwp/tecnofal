// Adaptador Nhost/Hasura (§21): GraphQL para datos, nhost-js para auth.
// Permisos: Hasura filtra por user_id = X-Hasura-User-Id (metadata versionada);
// el trigger fn_set_user_id estampa user_id desde la sesión (stub auth.uid()).
import { NhostClient } from '@nhost/nhost-js';
import {
  PARAMETROS_DEFAULT, motivoDescarteDe, filasLaptops, lineasDeCompra, listingAFila, proyectadoDeCompra,
  type AjustesConfig, type AlmacenKV, type Catalogo, type CompraDatos, type ConversionDatos,
  type Cuenta, type EstadoVisto, type ListingGuardar, type ModeloInfo, type Parametros,
  type PrecioIdeal, type Proveedor, type SesionInfo,
} from '@tecnofal/core';

const Q_CATALOGO = `query Catalogo {
  parametros { clave valor }
  precios_ideales { cpu_tipo gen_desde gen_hasta precio_base }
  ajustes_config { clave delta }
  modelos { id marca modelo cpu_tipo cpu_gen ram_soldada ssd_soldado regla_compra motivo_regla }
  partes_catalogo { nombre precio_referencia }
  detalles_catalogo { id nombre deduccion_base categoria }
}`;

const COLS_LISTING_UPDATE = [
  'url', 'titulo', 'precio_visto', 'fecha_visto', 'semaforo', 'specs_parseadas',
  'precio_max_puja', 'precio_puja_decente', 'cantidad_laptops', 'costo_estimado_total',
  'valor_esperado_total', 'evaluacion_manual', 'estado', 'lote_id',
];

export class ProveedorNhost implements Proveedor {
  private nhost: NhostClient;

  constructor(subdominio: string, region: string, almacen: AlmacenKV) {
    this.nhost = new NhostClient({
      subdomain: subdominio,
      region,
      clientStorageType: 'custom',
      clientStorage: {
        getItem: (k: string) => almacen.getItem(k) as never,
        setItem: (k: string, v: string) => void almacen.setItem(k, v),
        removeItem: (k: string) => void almacen.removeItem(k),
      },
      autoRefreshToken: true,
      autoSignIn: false,
    });
  }

  private async gql<T>(doc: string, vars?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.nhost.graphql.request<T>(doc, vars);
    if (error) {
      const msg = Array.isArray(error) ? error.map((e) => e.message).join('; ') : (error as { message?: string }).message ?? 'Error GraphQL';
      throw new Error(msg);
    }
    return data as T;
  }

  async signIn(email: string, password: string): Promise<SesionInfo> {
    const { error, session } = await this.nhost.auth.signIn({ email, password });
    if (error) throw new Error(error.message);
    return { email: session?.user?.email ?? null };
  }

  async signOut(): Promise<void> {
    await this.nhost.auth.signOut();
  }

  async getSession(): Promise<SesionInfo> {
    await this.nhost.auth.isAuthenticatedAsync();
    return { email: this.nhost.auth.getUser()?.email ?? null };
  }

  async cargarCatalogo(): Promise<Catalogo | null> {
    try {
      const d = await this.gql<{
        parametros: { clave: string; valor: number | null }[];
        precios_ideales: { cpu_tipo: string; gen_desde: number; gen_hasta: number; precio_base: number }[];
        ajustes_config: { clave: string; delta: number }[];
        modelos: Record<string, never>[];
        partes_catalogo: { nombre: string; precio_referencia: number | null }[];
        detalles_catalogo: { id: string; nombre: string; deduccion_base: number; categoria: string | null }[];
      }>(Q_CATALOGO);
      const p: Record<string, number | null> = {};
      for (const r of d.parametros) p[r.clave] = r.valor == null ? null : Number(r.valor);
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
        bateriaPctUmbral: p['bateria_pct_umbral'] ?? PARAMETROS_DEFAULT.bateriaPctUmbral,
      };
      const m = d.modelos as unknown as {
        id: string; marca: string; modelo: string; cpu_tipo: string | null; cpu_gen: number | null;
        ram_soldada: string; ssd_soldado: boolean; regla_compra: string; motivo_regla: string | null;
      }[];
      // §23: tipos y avisos (tablas pueden no existir aún → silencioso)
      let tiposAviso: { clave: string; nombre: string }[] | undefined;
      const avisosPor = new Map<string, { tipo: string; severidad: 'bloquea' | 'condiciona' | 'advierte' | 'nota'; motivo: string | null }[]>();
      try {
        const ex = await this.gql<{
          tipos_aviso: { id: string; clave: string; nombre: string }[];
          modelo_avisos: { modelo_id: string; tipo_aviso_id: string; severidad: string; motivo: string | null }[];
        }>(`query { tipos_aviso { id clave nombre } modelo_avisos { modelo_id tipo_aviso_id severidad motivo } }`);
        tiposAviso = ex.tipos_aviso.map((t) => ({ clave: t.clave, nombre: t.nombre }));
        const clavePor = new Map(ex.tipos_aviso.map((t) => [t.id, t.clave]));
        for (const a of ex.modelo_avisos) {
          const lista = avisosPor.get(a.modelo_id) ?? [];
          lista.push({ tipo: clavePor.get(a.tipo_aviso_id) ?? 'otro', severidad: a.severidad as never, motivo: a.motivo });
          avisosPor.set(a.modelo_id, lista);
        }
      } catch { /* aún sin migración 0007 en el espejo */ }
      return {
        parametros,
        tiposAviso,
        precios: d.precios_ideales.map((r): PrecioIdeal => ({
          cpuTipo: r.cpu_tipo as PrecioIdeal['cpuTipo'], genDesde: r.gen_desde, genHasta: r.gen_hasta, precioBase: Number(r.precio_base),
        })),
        ajustes: Object.fromEntries(d.ajustes_config.map((r) => [r.clave, Number(r.delta)])) as AjustesConfig,
        modelos: m.map((r): ModeloInfo => ({
          id: r.id, marca: r.marca, modelo: r.modelo, cpuTipo: r.cpu_tipo as ModeloInfo['cpuTipo'], cpuGen: r.cpu_gen ?? null,
          ramSoldada: r.ram_soldada as ModeloInfo['ramSoldada'], ssdSoldado: r.ssd_soldado,
          reglaCompra: r.regla_compra as ModeloInfo['reglaCompra'], motivoRegla: r.motivo_regla,
          avisos: avisosPor.get(r.id) ?? [],
        })),
        partesRef: Object.fromEntries(
          d.partes_catalogo.filter((r) => r.precio_referencia != null).map((r) => [r.nombre, Number(r.precio_referencia)]),
        ),
        detalles: d.detalles_catalogo.map((r) => ({ id: r.id, nombre: r.nombre, deduccionBase: Number(r.deduccion_base), categoria: r.categoria ?? 'Otro' })),
        online: true,
      };
    } catch {
      return null;
    }
  }

  async checkListings(ids: string[]): Promise<EstadoVisto[]> {
    if (ids.length === 0) return [];
    try {
      const d = await this.gql<{ listings: {
        ebay_item_id: string; semaforo: EstadoVisto['semaforo']; estado: string;
        costo_estimado_total: number | null; valor_esperado_total: number | null;
        evaluacion_manual: unknown;
      }[] }>(
        `query($ids: [String!]) { listings(where: { ebay_item_id: { _in: $ids } }) { ebay_item_id semaforo estado costo_estimado_total valor_esperado_total evaluacion_manual } }`,
        { ids },
      );
      return d.listings.map((r) => {
        const costo = r.costo_estimado_total;
        const valor = r.valor_esperado_total;
        const margen = costo != null && valor != null && costo > 0 ? (valor - costo) / costo : null;
        return {
          ebayItemId: r.ebay_item_id, semaforo: r.semaforo, estado: r.estado,
          margen, ganancia: costo != null && valor != null ? valor - costo : null, costo: costo ?? null,
          motivoDescarte: motivoDescarteDe(r.evaluacion_manual),
          // Nhost es respaldo/legacy (Supabase es el backend principal): su esquema Hasura no
          // tiene fecha_fin_subasta (migración 0028 solo se aplicó a Supabase) — no se consulta
          // para no romper este proveedor en runtime con una columna inexistente.
          fechaFinSubasta: null,
        };
      });
    } catch {
      return []; // sin sesión → los listings no se marcan (§8b)
    }
  }

  async guardarListing(l: ListingGuardar): Promise<void> {
    await this.gql(
      `mutation($o: listings_insert_input!, $cols: [listings_update_column!]!) {
        insert_listings_one(object: $o, on_conflict: { constraint: listings_user_id_ebay_item_id_key, update_columns: $cols }) { id }
      }`,
      { o: listingAFila(l), cols: COLS_LISTING_UPDATE.filter((c) => c !== 'lote_id') },
    );
  }

  /** El id local de modelo es "marca|modelo" (IndexedDB); el remoto usa uuid — traducir por (marca, modelo) */
  private async resolverModeloId(modeloId: string | null): Promise<string | null> {
    if (!modeloId || !modeloId.includes('|')) return modeloId;
    const [marca, ...resto] = modeloId.split('|');
    try {
      const mod = await this.gql<{ insert_modelos_one: { id: string } }>(
        `mutation($o: modelos_insert_input!) {
          insert_modelos_one(object: $o, on_conflict: { constraint: modelos_marca_modelo_key, update_columns: [marca] }) { id }
        }`,
        { o: { marca, modelo: resto.join('|') } },
      );
      return mod.insert_modelos_one.id;
    } catch { return null; } // la laptop se registra sin modelo antes que fallar toda la compra
  }

  async comprar(d: CompraDatos): Promise<{ loteId: string }> {
    const ahora = new Date().toISOString();
    const modeloId = await this.resolverModeloId(d.modeloId);
    const lote = await this.gql<{ insert_lotes_one: { id: string } }>(
      `mutation($o: lotes_insert_input!) { insert_lotes_one(object: $o) { id } }`,
      {
        o: {
          origen: 'ebay',
          url_ebay: d.listing.url,
          precio_subasta: d.listing.precioVisto,
          envio_usa: d.envioUsa,
          costo_proyectado_total: proyectadoDeCompra(d),
          metodo_estimado: d.metodo,
        },
      },
    );
    const loteId = lote.insert_lotes_one.id;

    await this.gql(
      `mutation($objs: [laptops_insert_input!]!) { insert_laptops(objects: $objs) { affected_rows } }`,
      { objs: filasLaptops({ ...d, modeloId }, loteId) },
    );
    await this.gql(
      `mutation($objs: [costo_lineas_insert_input!]!) { insert_costo_lineas(objects: $objs) { affected_rows } }`,
      { objs: lineasDeCompra(d, loteId, ahora) },
    );
    await this.gql(
      `mutation($o: listings_insert_input!, $cols: [listings_update_column!]!) {
        insert_listings_one(object: $o, on_conflict: { constraint: listings_user_id_ebay_item_id_key, update_columns: $cols }) { id }
      }`,
      { o: { ...listingAFila({ ...d.listing, estado: 'comprado' }), lote_id: loteId }, cols: COLS_LISTING_UPDATE },
    );
    return { loteId };
  }

  /** §23: publica tipos y avisos al espejo (globales) */
  async publicarAvisos(
    tipos: { clave: string; nombre: string }[],
    avisos: { marca: string; modelo: string; tipoClave: string; severidad: string; motivo: string | null }[],
  ): Promise<void> {
    if (tipos.length > 0) {
      await this.gql(
        `mutation($t: [tipos_aviso_insert_input!]!) {
          insert_tipos_aviso(objects: $t, on_conflict: { constraint: tipos_aviso_clave_key, update_columns: [] }) { affected_rows }
        }`,
        { t: tipos.map((t) => ({ clave: t.clave, nombre: t.nombre, origen: 'usuario' })) },
      );
    }
    for (const a of avisos) {
      const mod = await this.gql<{ insert_modelos_one: { id: string } }>(
        `mutation($o: modelos_insert_input!) {
          insert_modelos_one(object: $o, on_conflict: { constraint: modelos_marca_modelo_key, update_columns: [marca] }) { id }
        }`,
        { o: { marca: a.marca, modelo: a.modelo } },
      );
      const tid = await this.gql<{ tipos_aviso: { id: string }[] }>(
        `query($c: String!) { tipos_aviso(where: { clave: { _eq: $c } }) { id } }`,
        { c: a.tipoClave },
      );
      await this.gql(
        `mutation($o: modelo_avisos_insert_input!) { insert_modelo_avisos_one(object: $o) { id } }`,
        { o: { modelo_id: mod.insert_modelos_one.id, tipo_aviso_id: tid.tipos_aviso[0].id, severidad: a.severidad, motivo: a.motivo, origen: 'usuario' } },
      );
    }
  }

  async listarCuentas(): Promise<Cuenta[]> {
    const d = await this.gql<{ cuentas: Cuenta[] }>(
      `query { cuentas(order_by: { nombre: asc }) { id nombre moneda } }`,
    );
    return d.cuentas;
  }

  async registrarConversion(dd: ConversionDatos): Promise<{ tasaImplicita: number }> {
    const fecha = dd.fecha ?? new Date().toISOString().slice(0, 10);
    const movs = await this.gql<{ insert_movimientos: { returning: { id: string }[] } }>(
      `mutation($objs: [movimientos_insert_input!]!) { insert_movimientos(objects: $objs) { returning { id } } }`,
      {
        objs: [
          { cuenta_id: dd.cuentaOrigenId, fecha, tipo: 'egreso', monto: dd.montoOrigen, concepto: dd.nota ?? 'Conversión' },
          { cuenta_id: dd.cuentaDestinoId, fecha, tipo: 'ingreso', monto: dd.montoDestino, concepto: dd.nota ?? 'Conversión' },
        ],
      },
    );
    const [a, b] = movs.insert_movimientos.returning;
    await this.gql(
      `mutation($o: conversiones_insert_input!) { insert_conversiones_one(object: $o) { id } }`,
      {
        o: {
          fecha, movimiento_origen_id: a.id, movimiento_destino_id: b.id,
          monto_origen: dd.montoOrigen, monto_destino: dd.montoDestino, nota: dd.nota ?? null,
        },
      },
    );
    return { tasaImplicita: dd.montoOrigen / dd.montoDestino };
  }
}
